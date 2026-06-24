import { randomUUID } from "node:crypto";
import net from "node:net";
import {
  createOpencode,
  type OpencodeClient,
} from "@opencode-ai/sdk";
import type {
  TextPart,
  ReasoningPart,
  ToolPart,
  StepFinishPart,
  EventMessagePartUpdated,
  EventMessageUpdated,
} from "@opencode-ai/sdk";
import type { SsePayload } from "../events/event-types.js";
import type { AgentRunInput, AgentRunResult } from "./types.js";

interface ActiveRun {
  sessionId: string;
  startedAt: number;
  abortController: AbortController;
}

type EmitFn = (payload: SsePayload) => void;

const streamTokens = new Map<string, symbol>();

function getStreamToken(sessionId: string): symbol {
  let token = streamTokens.get(sessionId);
  if (!token) {
    token = Symbol(sessionId);
    streamTokens.set(sessionId, token);
  }
  return token;
}

function clearStreamToken(sessionId: string): void {
  streamTokens.delete(sessionId);
}

export class OpencodeAgent {
  private client: OpencodeClient | null = null;
  private clientPromise: Promise<OpencodeClient> | null = null;
  private serverClose: (() => void) | null = null;
  private readonly activeRuns = new Map<string, ActiveRun>();

  private async getClient(): Promise<OpencodeClient> {
    if (this.client) return this.client;
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const port = await getAvailablePort();
        const { client, server } = await createOpencode({ hostname: "127.0.0.1", port, timeout: 15_000 });
        this.client = client;
        this.serverClose = server.close;
        return client;
      })();
    }
    try {
      return await this.clientPromise;
    } catch (error) {
      this.clientPromise = null;
      throw error;
    }
  }

  async run(input: AgentRunInput, emit: EmitFn): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const requestSessionId = input.sessionId?.trim() || randomUUID();
    const client = await this.getClient();

    const model = parseModel(input.model);

    const sessionRes = await client.session.create({
      query: { directory: input.cwd },
      body: { title: input.prompt.slice(0, 80) },
    });

    if (!sessionRes.data) {
      const err = "Failed to create opencode session";
      emit({ type: "error", provider: "opencode", data: { sessionId: requestSessionId, message: err } });
      return {
        success: false, output: "", error: err, exitCode: -1,
        durationMs: Date.now() - startedAt, sessionId: requestSessionId,
      };
    }

    const actualSessionId = sessionRes.data.id;
    const abortController = new AbortController();
    const streamToken = getStreamToken(actualSessionId);
    const activeRun = { sessionId: actualSessionId, startedAt, abortController };
    this.activeRuns.set(actualSessionId, activeRun);
    // Keep the caller's stable session id as an alias so the orchestrator can
    // abort a speculative run before the SDK returns its generated session id.
    this.activeRuns.set(requestSessionId, activeRun);

    let output = "";
    const toolCallsEmitted = new Set<string>();
    const assistantMessageIds = new Set<string>();

    try {
      const eventsResult = await client.event.subscribe({
        query: { directory: input.cwd },
        signal: abortController.signal,
      });

      await client.session.promptAsync({
        path: { id: actualSessionId },
        query: { directory: input.cwd },
        body: {
          system: input.systemPrompt || undefined,
          model: model ?? undefined,
          agent: input.readOnly ? "plan" : "build",
          parts: [{ type: "text", text: input.prompt }],
        },
      });

      if (input.permissionMode === "bypassPermissions") {
        this.handlePermissionsAuto(actualSessionId, abortController.signal, streamToken);
      }

      for await (const event of eventsResult.stream) {
        if (this.isStreamCancelled(actualSessionId, streamToken) || abortController.signal.aborted) break;

        switch (event?.type) {
          case "message.part.updated": {
            const { part, delta } = (event as EventMessagePartUpdated).properties;
            if (assistantMessageIds.has(part.messageID)) {
              handlePartUpdate(part, delta, actualSessionId, emit, (s) => { output += s; }, toolCallsEmitted);
            }
            break;
          }
          case "session.idle": {
            if (event.properties.sessionID === actualSessionId) {
              const finalOutput = await readFinalAssistantOutput(client, actualSessionId, input.cwd).catch(() => output);
              return this.complete(actualSessionId, emit, finalOutput || output, startedAt, true, 0);
            }
            break;
          }
          case "session.error": {
            const props = event.properties;
            if (!props.sessionID || props.sessionID === actualSessionId) {
              const errData = props.error?.data as { message?: string } | undefined;
              const errMsg = typeof errData?.message === "string" ? errData.message : "Opencode session error";
              emit({ type: "error", provider: "opencode", data: { sessionId: actualSessionId, message: errMsg } });
              return this.complete(actualSessionId, emit, output, startedAt, false, -1, errMsg);
            }
            break;
          }
          case "message.updated": {
            const info = (event as EventMessageUpdated).properties.info;
            if (info.role === "assistant") assistantMessageIds.add(info.id);
            if (info && "error" in info && info.error) {
              const errData = info.error.data as { message?: string } | undefined;
              const errMsg = typeof errData?.message === "string" ? errData.message : "Opencode message error";
              emit({ type: "error", provider: "opencode", data: { sessionId: actualSessionId, message: errMsg } });
              return this.complete(actualSessionId, emit, output, startedAt, false, -1, errMsg);
            }
            break;
          }
          case "message.removed": {
            break;
          }
          case "session.status": {
            const { sessionID, status } = event.properties;
            if (sessionID === actualSessionId) {
              const statusText = status.type === "busy" ? "running" : status.type;
              emit({ type: "status", provider: "opencode", data: { sessionId: actualSessionId, content: statusText } });
            }
            break;
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!abortController.signal.aborted) {
        emit({ type: "error", provider: "opencode", data: { sessionId: actualSessionId, message } });
      }
      return this.complete(actualSessionId, emit, output, startedAt, false, -1, message);
    } finally {
      this.activeRuns.delete(actualSessionId);
      this.activeRuns.delete(requestSessionId);
      clearStreamToken(actualSessionId);
    }

    const durationMs = Date.now() - startedAt;
    emit({
      type: "turn_complete", provider: "opencode",
      data: { sessionId: actualSessionId, success: true, output, durationMs, exitCode: 0 },
    });
    return { success: true, output, exitCode: 0, durationMs, sessionId: actualSessionId };
  }

  async abort(sessionId: string): Promise<boolean> {
    const active = this.activeRuns.get(sessionId);
    if (!active) return false;
    active.abortController.abort();
    try {
      await this.client?.session.abort({ path: { id: active.sessionId } });
    } catch {
      // Ignore abort errors
    }
    return true;
  }

  getActiveSessionIds(): string[] {
    return [...this.activeRuns.keys()];
  }

  destroy(): void {
    for (const [id, active] of this.activeRuns) {
      active.abortController.abort();
      this.activeRuns.delete(id);
    }
    this.serverClose?.();
    this.client = null;
    this.clientPromise = null;
    this.serverClose = null;
  }

  private complete(
    sessionId: string,
    emit: EmitFn,
    output: string,
    startedAt: number,
    success: boolean,
    exitCode: number,
    error?: string,
  ): AgentRunResult {
    const durationMs = Date.now() - startedAt;
    emit({
      type: "turn_complete", provider: "opencode",
      data: { sessionId, success, output, error, durationMs, exitCode },
    });
    return { success, output, error, exitCode, durationMs, sessionId };
  }

  private isStreamCancelled(sessionId: string, streamToken: symbol): boolean {
    return streamTokens.get(sessionId) !== streamToken;
  }

  private async handlePermissionsAuto(
    sessionId: string,
    signal: AbortSignal,
    streamToken: symbol,
  ): Promise<void> {
    try {
      while (!signal.aborted && !this.isStreamCancelled(sessionId, streamToken)) {
        await new Promise((r) => setTimeout(r, 100));
        // The permission responses happen in the event stream
        // This is handled by the event loop
        break;
      }
    } catch {
      // Silently stop
    }
  }
}

async function readFinalAssistantOutput(client: OpencodeClient, sessionId: string, directory: string): Promise<string> {
  const response = await client.session.messages({
    path: { id: sessionId },
    query: { directory },
  });
  const messages = response.data || [];
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.info.role !== "assistant") continue;
    const text = message.parts
      .filter((part): part is TextPart => part.type === "text")
      .map((part) => part.text)
      .join("");
    if (text.trim()) return text;
  }
  return "";
}

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a port for the OpenCode server"));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function handlePartUpdate(
  part: unknown,
  delta: string | undefined,
  sessionId: string,
  emit: EmitFn,
  onText: (s: string) => void,
  toolCallsEmitted: Set<string>,
): void {
  const p = part as Record<string, unknown>;
  if (!p || typeof p !== "object") return;

  switch (p.type) {
    case "text": {
      const textPart = part as TextPart;
      if (delta) {
        onText(delta);
        emit({ type: "text_delta", provider: "opencode", data: { sessionId, content: delta, messageId: textPart.messageID } });
      } else if (textPart.text) {
        onText(textPart.text);
        emit({ type: "text_delta", provider: "opencode", data: { sessionId, content: textPart.text, messageId: textPart.messageID } });
      }
      break;
    }
    case "reasoning": {
      const reasonPart = part as ReasoningPart;
      if (reasonPart.text) {
        emit({ type: "reasoning_delta", provider: "opencode", data: { sessionId, content: reasonPart.text, messageId: reasonPart.messageID } });
      }
      break;
    }
    case "tool": {
      const toolPart = part as ToolPart;
      const state = toolPart.state;
      if (state.status === "pending" || state.status === "running") {
        const key = `${toolPart.callID}-start`;
        if (!toolCallsEmitted.has(key)) {
          toolCallsEmitted.add(key);
          emit({
            type: "tool_use", provider: "opencode",
            data: { sessionId, toolName: toolPart.tool, toolInput: (state.input as Record<string, unknown>) ?? {}, messageId: toolPart.messageID },
          });
        }
      }
      if (state.status === "completed" || state.status === "error") {
        const output = state.status === "completed" ? state.output : state.error;
        emit({
          type: "tool_result", provider: "opencode",
          data: { sessionId, toolName: toolPart.tool, content: output, isError: state.status === "error" },
        });
      }
      break;
    }
    case "step-start": {
      emit({ type: "status", provider: "opencode", data: { sessionId, content: "step started" } });
      break;
    }
    case "step-finish": {
      const sf = part as StepFinishPart;
      emit({ type: "status", provider: "opencode", data: { sessionId, content: `step finished: ${sf.reason}`, messageId: sf.messageID } });
      break;
    }
  }
}

function parseModel(model?: string): { providerID: string; modelID: string } | undefined {
  if (!model?.trim()) return undefined;
  const trimmed = model.trim();
  const slashIdx = trimmed.indexOf("/");
  if (slashIdx === -1) {
    return { providerID: trimmed, modelID: trimmed };
  }
  return {
    providerID: trimmed.slice(0, slashIdx),
    modelID: trimmed.slice(slashIdx + 1),
  };
}
