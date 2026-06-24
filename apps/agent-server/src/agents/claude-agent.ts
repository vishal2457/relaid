import { randomUUID } from "node:crypto";
import {
  type CanUseTool,
  type PermissionResult,
  type Query,
  query,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  PermissionRequestPayload,
  SsePayload,
} from "../events/event-types.js";
import type {
  AgentRunInput,
  AgentRunResult,
  PermissionResponse,
} from "./types.js";

interface PendingPermission {
  resolve: (value: PermissionResult) => void;
  reject: (reason?: unknown) => void;
}

interface ActiveRun {
  query: Query;
  startedAt: number;
}

type EmitFn = (payload: SsePayload) => void;

export class ClaudeAgent {
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly pendingPermissions = new Map<
    string,
    PendingPermission
  >();

  async run(input: AgentRunInput, emit: EmitFn): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const sessionId = input.sessionId?.trim() || randomUUID();

    const canUseTool: CanUseTool = async (toolName, _toolInput, options) => {
      const requestId = randomUUID();
      const permissionPayload: PermissionRequestPayload = {
        sessionId,
        requestId,
        toolName,
        title: options.title || toolName,
        description: options.description || options.displayName || toolName,
      };
      emit({
        type: "permission_request",
        provider: "claude",
        data: permissionPayload,
      });

      return new Promise<PermissionResult>((resolve, reject) => {
        this.pendingPermissions.set(requestId, { resolve, reject });
        options.signal.addEventListener(
          "abort",
          () => {
            this.pendingPermissions.delete(requestId);
            reject(new Error("permission request aborted"));
          },
          { once: true },
        );
      });
    };

    const q = query({
      prompt: buildPrompt(input.prompt, input.systemPrompt),
      options: {
        cwd: input.cwd,
        model: input.model,
        permissionMode: input.readOnly ? "plan" : input.permissionMode,
        allowDangerouslySkipPermissions: input.permissionMode === "bypassPermissions",
        sessionId,
        persistSession: true,
        includePartialMessages: true,
        canUseTool,
        outputFormat: input.outputSchema ? { type: "json_schema", schema: input.outputSchema } : undefined,
      },
    });

    this.activeRuns.set(sessionId, { query: q, startedAt });

    let output = "";
    try {
      for await (const message of q) {
        if (message.type === "stream_event") {
          const event = message.event as unknown as Record<string, unknown> | undefined;
          if (event?.type === "content_block_delta") {
            const delta = event.delta as Record<string, unknown> | undefined;
            if (delta?.type === "text_delta" && typeof delta.text === "string") {
              output += delta.text;
              emit({
                type: "text_delta",
                provider: "claude",
                data: { sessionId, content: delta.text, messageId: message.uuid },
              });
            }
            if (delta?.type === "thinking_delta" && typeof delta.thinking === "string") {
              emit({
                type: "reasoning_delta",
                provider: "claude",
                data: { sessionId, content: delta.thinking, messageId: message.uuid },
              });
            }
          }
          if (event?.type === "content_block_start") {
            const block = event.content_block as Record<string, unknown> | undefined;
            if (block?.type === "tool_use") {
              emit({
                type: "tool_use",
                provider: "claude",
                data: {
                  sessionId,
                  toolName: String(block.name ?? "tool"),
                  toolInput: (block.input as Record<string, unknown>) ?? {},
                  messageId: message.uuid,
                },
              });
            }
          }
        }

        if (message.type === "system") {
          const statusText = getSystemStatusText(message as unknown as Record<string, unknown>);
          if (statusText) {
            emit({
              type: "status",
              provider: "claude",
              data: { sessionId, content: statusText, messageId: message.uuid },
            });
          }
        }

        if (message.type === "tool_progress") {
          emit({
            type: "status",
            provider: "claude",
            data: {
              sessionId,
              content: `${message.tool_name} running`,
              messageId: message.uuid,
            },
          });
        }

        if (message.type === "result") {
          const durationMs = message.duration_ms ?? Date.now() - startedAt;
          const success = message.subtype === "success";
          const resultOutput = success && message.structured_output !== undefined
            ? JSON.stringify(message.structured_output)
            : success ? (message.result || output) : output;
          emit({
            type: "turn_complete",
            provider: "claude",
            data: {
              sessionId,
              success,
              output: resultOutput,
              error: success ? undefined : (message.errors?.join("\n") || "Claude run failed"),
              durationMs,
              exitCode: success ? 0 : -1,
            },
          });
          return {
            success,
            output: resultOutput,
            error: success ? undefined : (message.errors?.join("\n") || "Claude run failed"),
            exitCode: success ? 0 : -1,
            durationMs,
            sessionId,
          };
        }
      }

      const durationMs = Date.now() - startedAt;
      emit({
        type: "turn_complete",
        provider: "claude",
        data: { sessionId, success: true, output, durationMs, exitCode: 0 },
      });
      return { success: true, output, exitCode: 0, durationMs, sessionId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit({
        type: "error",
        provider: "claude",
        data: { sessionId, message },
      });
      return {
        success: false,
        output,
        error: message,
        exitCode: -1,
        durationMs: Date.now() - startedAt,
        sessionId,
      };
    } finally {
      this.activeRuns.delete(sessionId);
      q.close();
    }
  }

  async abort(sessionId: string): Promise<boolean> {
    const active = this.activeRuns.get(sessionId);
    if (!active) return false;
    await active.query.interrupt();
    return true;
  }

  respondToPermission(response: PermissionResponse): boolean {
    const pending = this.pendingPermissions.get(response.requestId);
    if (!pending) return false;
    this.pendingPermissions.delete(response.requestId);
    if (response.behavior === "allow") {
      pending.resolve({ behavior: "allow" });
    } else {
      pending.resolve({
        behavior: "deny",
        message: response.message || "Permission denied",
      });
    }
    return true;
  }

  getActiveSessionIds(): string[] {
    return [...this.activeRuns.keys()];
  }
}

function buildPrompt(prompt: string, systemPrompt?: string): string {
  const trimmedSystem = systemPrompt?.trim();
  const trimmedPrompt = prompt.trim();
  if (!trimmedSystem) return trimmedPrompt;
  return `${trimmedSystem}\n\n${trimmedPrompt}`;
}

function getSystemStatusText(message: Record<string, unknown>): string | null {
  switch (message.subtype) {
    case "status":
      return typeof message.status === "string" ? message.status : null;
    case "task_progress":
      return typeof message.description === "string" ? message.description : null;
    case "task_notification":
      return typeof message.summary === "string" ? message.summary : null;
    case "local_command_output":
      return typeof message.content === "string" ? message.content : null;
    case "notification":
      return typeof message.text === "string" ? message.text : null;
    case "permission_denied":
      return typeof message.message === "string" ? message.message : null;
    default:
      return null;
  }
}
