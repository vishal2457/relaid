import { randomUUID } from "node:crypto";
import { Codex } from "@openai/codex-sdk";
import type { SsePayload } from "../events/event-types.js";
import type { AgentRunInput, AgentRunResult } from "./types.js";

interface ActiveRun {
  abort: () => void;
  startedAt: number;
}

type EmitFn = (payload: SsePayload) => void;

export class CodexAgent {
  private readonly codex = new Codex();
  private readonly activeRuns = new Map<string, ActiveRun>();

  async run(input: AgentRunInput, emit: EmitFn): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const sessionId = input.sessionId?.trim() || randomUUID();

    let aborted = false;
    const active: ActiveRun = {
      abort: () => {
        aborted = true;
      },
      startedAt,
    };
    this.activeRuns.set(sessionId, active);

    let output = "";
    try {
      const thread = this.codex.startThread({
        workingDirectory: input.cwd,
        skipGitRepoCheck: true,
      });

      const { events } = await thread.runStreamed(input.prompt);

      for await (const event of events) {
        if (aborted) break;

        const evt = event as unknown as Record<string, unknown>;

        if (evt.type === "item.completed") {
          const item = evt.item as Record<string, unknown> | undefined;
          if (!item) continue;

          const itemType = String(item.type ?? "");

          if (itemType === "agent_message") {
            const parts = item.parts as Array<Record<string, unknown>> | undefined;
            if (parts) {
              for (const part of parts) {
                if (part.type === "text" && typeof part.text === "string") {
                  output += part.text;
                  emit({
                    type: "text_delta",
                    provider: "codex",
                    data: { sessionId, content: part.text },
                  });
                }
                if (part.type === "tool_call") {
                  emit({
                    type: "tool_use",
                    provider: "codex",
                    data: {
                      sessionId,
                      toolName: String(part.name ?? "tool"),
                      toolInput: (part.arguments as Record<string, unknown>) ?? {},
                    },
                  });
                }
              }
            }
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
          if (item && String(item.type ?? "") === "tool_call") {
            emit({
              type: "status",
              provider: "codex",
              data: {
                sessionId,
                content: `Running ${String(item.name ?? "tool")}...`,
              },
            });
          }
        }

        if (evt.type === "turn.completed") {
          const durationMs = Date.now() - startedAt;
          const success = evt.status !== "error";
          emit({
            type: "turn_complete",
            provider: "codex",
            data: {
              sessionId,
              success,
              output,
              error: success ? undefined : (String(evt.message || "Codex run failed")),
              durationMs,
              exitCode: success ? 0 : -1,
            },
          });
          return {
            success,
            output,
            error: success ? undefined : String(evt.message || "Codex run failed"),
            exitCode: success ? 0 : -1,
            durationMs,
            sessionId,
          };
        }
      }

      const durationMs = Date.now() - startedAt;
      emit({
        type: "turn_complete",
        provider: "codex",
        data: { sessionId, success: true, output, durationMs, exitCode: 0 },
      });
      return { success: true, output, exitCode: 0, durationMs, sessionId };
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
    active.abort();
    return true;
  }

  getActiveSessionIds(): string[] {
    return [...this.activeRuns.keys()];
  }
}
