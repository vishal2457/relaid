import { Router } from "express";
import { z } from "zod";
import type { ClaudeAgent } from "../../agents/claude-agent.js";
import type { CodexAgent } from "../../agents/codex-agent.js";
import type { OpencodeAgent } from "../../agents/opencode-agent.js";
import type { AgentRunInput, PermissionResponse } from "../../agents/types.js";
import { broadcast } from "../sse-bus.js";

const runSchema = z.object({
  requestId: z.string().min(1),
  cwd: z.string().min(1),
  provider: z.enum(["claude", "codex", "opencode"]),
  sessionId: z.string().optional(),
  prompt: z.string().min(1),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
  permissionMode: z
    .enum(["default", "acceptEdits", "plan", "bypassPermissions", "dontAsk", "auto"])
    .optional(),
});

const abortSchema = z.object({
  sessionId: z.string().min(1),
  provider: z.enum(["claude", "codex", "opencode"]),
});

const permissionSchema = z.object({
  requestId: z.string().min(1),
  behavior: z.enum(["allow", "deny"]),
  message: z.string().optional(),
});

export function createApiRouter(
  claude: ClaudeAgent,
  codex: CodexAgent,
  opencode: OpencodeAgent,
): Router {
  const router = Router();

  router.post("/run", async (req, res) => {
    const parsed = runSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const input: AgentRunInput = parsed.data;

    try {
      if (input.provider === "claude") {
        const result = await claude.run(input, broadcast);
        res.json(result);
      } else if (input.provider === "codex") {
        const result = await codex.run(input, broadcast);
        res.json(result);
      } else {
        const result = await opencode.run(input, broadcast);
        res.json(result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  router.post("/abort", async (req, res) => {
    const parsed = abortSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { sessionId, provider } = parsed.data;
    let ok: boolean;
    if (provider === "claude") {
      ok = await claude.abort(sessionId);
    } else if (provider === "codex") {
      ok = codex.abort(sessionId);
    } else {
      ok = opencode.abort(sessionId);
    }

    res.json({ aborted: ok });
  });

  router.post("/permission", (req, res) => {
    const parsed = permissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const response: PermissionResponse = parsed.data;
    const ok = claude.respondToPermission(response);
    res.json({ handled: ok });
  });

  router.get("/sessions", (_req, res) => {
    const claudeSessions = claude.getActiveSessionIds().map((id: string) => ({
      id,
      provider: "claude" as const,
      status: "running" as const,
    }));
    const codexSessions = codex.getActiveSessionIds().map((id: string) => ({
      id,
      provider: "codex" as const,
      status: "running" as const,
    }));
    const opencodeSessions = opencode.getActiveSessionIds().map((id: string) => ({
      id,
      provider: "opencode" as const,
      status: "running" as const,
    }));
    res.json({ sessions: [...claudeSessions, ...codexSessions, ...opencodeSessions] });
  });

  return router;
}
