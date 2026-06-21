import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import type { SsePayload } from "../events/event-types.js";
import type { AgentRunInput, AgentRunResult } from "./types.js";

interface ActiveRun {
  child: ChildProcess;
  startedAt: number;
}

type EmitFn = (payload: SsePayload) => void;

function ensureOpencode(): string {
  const path = process.env.OPENCODE_BIN || "opencode";
  return path;
}

export class OpencodeAgent {
  private readonly activeRuns = new Map<string, ActiveRun>();

  async run(input: AgentRunInput, emit: EmitFn): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const sessionId = input.sessionId?.trim() || randomUUID();
    const opencodeBin = ensureOpencode();

    let output = "";
    let hadError = false;
    let errorMessage = "";

    const args = [
      "run",
      input.prompt,
      "--format", "json",
      "--dir", input.cwd,
    ];

    if (input.model) {
      args.push("--model", input.model);
    }

    if (input.permissionMode === "bypassPermissions") {
      args.push("--dangerously-skip-permissions");
    }

    const child = spawn(opencodeBin, args, {
      cwd: input.cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const active: ActiveRun = { child, startedAt };
    this.activeRuns.set(sessionId, active);

    const stdoutBuf: string[] = [];
    let stderrBuf = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBuf.push(chunk.toString());
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    return new Promise<AgentRunResult>((resolve) => {
      child.on("close", (exitCode) => {
        this.activeRuns.delete(sessionId);

        const stdoutText = stdoutBuf.join("");

        // Parse JSON events from stdout
        const lines = stdoutText.split("\n").filter((l) => l.trim());
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            const type = event?.type as string | undefined;

            if (type === "assistant" && event.message) {
              const msg = event.message;
              if (msg.content && Array.isArray(msg.content)) {
                for (const block of msg.content) {
                  if (block.type === "text" && typeof block.text === "string") {
                    output += block.text;
                    emit({
                      type: "text_delta",
                      provider: "opencode",
                      data: { sessionId, content: block.text },
                    });
                  }
                  if (block.type === "tool_use") {
                    emit({
                      type: "tool_use",
                      provider: "opencode",
                      data: {
                        sessionId,
                        toolName: block.name ?? "tool",
                        toolInput: block.input ?? {},
                      },
                    });
                  }
                }
              }
            } else if (type === "user" || type === "result") {
              // Handle user/result events
            } else if (type === "system") {
              const subtype = event.subtype as string | undefined;
              if (subtype === "status" && typeof event.message === "string") {
                emit({
                  type: "status",
                  provider: "opencode",
                  data: { sessionId, content: event.message },
                });
              }
            }
          } catch {
            // Non-JSON line, treat as text delta
            if (line.trim()) {
              output += line + "\n";
              emit({
                type: "text_delta",
                provider: "opencode",
                data: { sessionId, content: line },
              });
            }
          }
        }

        if (exitCode !== 0 && !output.trim()) {
          output = stderrBuf || stdoutText || "Opencode run failed";
        }

        const durationMs = Date.now() - startedAt;
        const success = exitCode === 0 || (exitCode !== null && hadError === false);

        if (!success && !errorMessage) {
          errorMessage = stderrBuf || `Opencode exited with code ${exitCode}`;
        }

        emit({
          type: "turn_complete",
          provider: "opencode",
          data: {
            sessionId,
            success,
            output: output || stdoutText,
            error: success ? undefined : errorMessage,
            durationMs,
            exitCode: exitCode ?? -1,
          },
        });

        resolve({
          success,
          output: output || stdoutText,
          error: success ? undefined : errorMessage,
          exitCode: exitCode ?? -1,
          durationMs,
          sessionId,
        });
      });

      child.on("error", (err) => {
        this.activeRuns.delete(sessionId);
        const message = err.message;
        emit({
          type: "error",
          provider: "opencode",
          data: { sessionId, message },
        });
        resolve({
          success: false,
          output: "",
          error: message,
          exitCode: -1,
          durationMs: Date.now() - startedAt,
          sessionId,
        });
      });
    });
  }

  abort(sessionId: string): boolean {
    const active = this.activeRuns.get(sessionId);
    if (!active) return false;
    active.child.kill("SIGTERM");
    return true;
  }

  getActiveSessionIds(): string[] {
    return [...this.activeRuns.keys()];
  }
}
