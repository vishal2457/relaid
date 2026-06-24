import { Router } from "express";
import { z } from "zod";
import { ensurePlanningAgent } from "../../orchestrator/orchestrator-profile.js";
import { broadcastOrchestration } from "../sse-orchestration.js";
import { createId, markDirty, now } from "../store.js";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  provider: z.enum(["claude", "codex", "opencode"]).optional(),
  model: z.string().min(1).optional(),
  systemPrompt: z.string().min(1).optional(),
  permissionMode: z.enum(["default", "acceptEdits", "plan", "bypassPermissions", "dontAsk", "auto"]).optional(),
  enabled: z.boolean().optional(),
});

export function createPlanningAgentRoutes(): Router {
  const router = Router();
  router.get("/", (_req, res) => res.json(ensurePlanningAgent()));
  router.put("/", (req, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const planner = ensurePlanningAgent();
    Object.assign(planner, parsed.data, { role: "planner" as const, updatedAt: now() });
    markDirty();
    broadcastOrchestration({ id: createId(), projectId: "global", agentId: planner.id, type: "planning_agent.updated", payload: planner, sequence: 0, occurredAt: now() });
    res.json(planner);
  });
  return router;
}
