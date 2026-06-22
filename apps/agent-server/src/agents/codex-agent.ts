import { randomUUID } from "node:crypto";
import { Codex } from "@openai/codex-sdk";
import type { SsePayload } from "../events/event-types.js";
import type { AgentRunInput, AgentRunResult } from "./types.js";

interface ActiveRun {
  abortController: AbortController;
  startedAt: number;
}

type EmitFn = (payload: SsePayload) => void;

export class CodexAgent {
  private readonly codex = new Codex();
  private readonly activeRuns = new Map<string, ActiveRun>();

  async run(input: AgentRunInput, emit: EmitFn): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const sessionId = input.sessionId?.trim() || randomUUID();

    const abortController = new AbortController();
    const active: ActiveRun = {
      abortController,
      startedAt,
    };
    this.activeRuns.set(sessionId, active);

    let output = "";
    const commandOutputLengths = new Map<string, number>();
    try {
      const thread = this.codex.startThread({
        workingDirectory: input.cwd,
        skipGitRepoCheck: true,
        model: input.model,
      });

      const prompt = input.systemPrompt?.trim()
        ? `${input.systemPrompt.trim()}\n\n${input.prompt.trim()}`
        : input.prompt;
      const { events } = await thread.runStreamed(prompt, { signal: abortController.signal });

      for await (const event of events) {
        const evt = event as unknown as Record<string, unknown>;

        if (evt.type === "item.completed") {
          const item = evt.item as Record<string, unknown> | undefined;
          if (!item) continue;

          const itemType = String(item.type ?? "");

          if (itemType === "agent_message") {
            const text = item.text;
            if (typeof text === "string") {
              output = text;
              emit({
                type: "text_delta",
                provider: "codex",
                data: { sessionId, content: text },
              });
            }
          }

          if (itemType === "reasoning" && typeof item.text === "string") {
            emit({
              type: "reasoning_delta",
              provider: "codex",
              data: { sessionId, content: item.text, messageId: String(item.id ?? "reasoning") },
            });
          }

          if (itemType === "command_execution") {
            emitRemainingCommandOutput(item, sessionId, emit, commandOutputLengths);
          }

          if (itemType === "mcp_tool_call") {
            emit({
              type: "tool_result",
              provider: "codex",
              data: {
                sessionId,
                toolName: `${String(item.server ?? "mcp")}/${String(item.tool ?? "tool")}`,
                content: JSON.stringify(item.result ?? item.error ?? {}),
                isError: String(item.status ?? "") === "failed",
              },
            });
          }

          if (itemType === "file_change") {
            emit({
              type: "tool_result",
              provider: "codex",
              data: {
                sessionId,
                toolName: "file_change",
                content: JSON.stringify(item.changes ?? []),
                isError: String(item.status ?? "") === "failed",
              },
            });
          }

          if (itemType === "tool_result") {
            emit({
              type: "tool_result",
              provider: "codex",
              data: {
                sessionId,
                toolName: String(item.tool_name ?? "tool"),
                content: JSON.stringify(item.output),
                isError: Boolean(item.is_error),
              },
            });
          }
        }

        if (evt.type === "item.started") {
          const item = evt.item as Record<string, unknown> | undefined;
          if (!item) continue;
          const itemType = String(item.type ?? "");
          if (itemType === "command_execution") {
            commandOutputLengths.set(String(item.id ?? "command"), 0);
            emit({
              type: "tool_use",
              provider: "codex",
              data: {
                sessionId,
                toolName: "command_execution",
                toolInput: { command: String(item.command ?? "") },
              },
            });
          } else if (itemType === "mcp_tool_call") {
            emit({
              type: "tool_use",
              provider: "codex",
              data: {
                sessionId,
                toolName: `${String(item.server ?? "mcp")}/${String(item.tool ?? "tool")}`,
                toolInput: isRecord(item.arguments) ? item.arguments : { arguments: item.arguments },
              },
            });
          } else if (itemType === "web_search") {
            emit({
              type: "tool_use",
              provider: "codex",
              data: { sessionId, toolName: "web_search", toolInput: { query: String(item.query ?? "") } },
            });
          }
        }

        if (evt.type === "item.updated") {
          const item = evt.item as Record<string, unknown> | undefined;
          if (item && String(item.type ?? "") === "command_execution") {
            emitRemainingCommandOutput(item, sessionId, emit, commandOutputLengths);
          }
        }

        if (evt.type === "turn.completed") {
          const durationMs = Date.now() - startedAt;
          emit({
            type: "turn_complete",
            provider: "codex",
            data: {
              sessionId,
              success: true,
              output,
              durationMs,
              exitCode: 0,
            },
          });
          return {
            success: true,
            output,
            exitCode: 0,
            durationMs,
            sessionId,
          };
        }

        if (evt.type === "turn.failed" || evt.type === "error") {
          const error = evt.error as Record<string, unknown> | undefined;
          const message = String(error?.message ?? evt.message ?? "Codex run failed");
          emit({ type: "error", provider: "codex", data: { sessionId, message } });
          return {
            success: false,
            output,
            error: message,
            exitCode: -1,
            durationMs: Date.now() - startedAt,
            sessionId,
          };
        }
      }

      const durationMs = Date.now() - startedAt;
      const success = !abortController.signal.aborted;
      const error = success ? undefined : "Codex run aborted";
      emit({
        type: "turn_complete",
        provider: "codex",
        data: { sessionId, success, output, error, durationMs, exitCode: success ? 0 : -1 },
      });
      return { success, output, error, exitCode: success ? 0 : -1, durationMs, sessionId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      emit({
        type: "error",
        provider: "codex",
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
    }
  }

  abort(sessionId: string): boolean {
    const active = this.activeRuns.get(sessionId);
    if (!active) return false;
    active.abortController.abort();
    return true;
  }

  getActiveSessionIds(): string[] {
    return [...this.activeRuns.keys()];
  }
}

function emitRemainingCommandOutput(
  item: Record<string, unknown>,
  sessionId: string,
  emit: EmitFn,
  outputLengths: Map<string, number>,
): void {
  const id = String(item.id ?? "command");
  const output = String(item.aggregated_output ?? "");
  const previousLength = outputLengths.get(id) ?? 0;
  if (output.length <= previousLength) return;
  outputLengths.set(id, output.length);
  emit({
    type: "tool_result",
    provider: "codex",
    data: {
      sessionId,
      toolName: "command_execution",
      content: output.slice(previousLength),
      isError: String(item.status ?? "") === "failed",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
