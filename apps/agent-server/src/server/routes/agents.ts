import { Router } from "express";
import { z } from "zod";
import type { AgentProfile } from "../../models/domain.js";
import { broadcastOrchestration } from "../sse-orchestration.js";
import { createId, getStore, markDirty, now } from "../store.js";

const provider = z.enum(["claude", "codex", "opencode"]);
const permissionMode = z.enum(["default", "acceptEdits", "plan", "bypassPermissions", "dontAsk", "auto"]);
const createSchema = z.object({
  name: z.string().min(1), description: z.string().optional(),
  provider,
  model: z.string().min(1), systemPrompt: z.string().min(1),
  permissionMode: permissionMode.optional(), enabled: z.boolean().default(true),
}).strict();
const updateSchema = createSchema.partial();

export function createAgentRoutes(): Router {
  const router = Router();
  const store = getStore();

  router.get("/", (req, res) => {
    res.json([...store.agents.values()].filter((agent) => agent.role === "worker"));
  });

  router.post("/", (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const timestamp = now();
    const agent: AgentProfile = { id: createId(), ...parsed.data, role: "worker", createdAt: timestamp, updatedAt: timestamp };
    store.agents.set(agent.id, agent); markDirty();
    broadcastOrchestration({ id: createId(), projectId: "global", agentId: agent.id, type: "agent.created", payload: agent, sequence: 0, occurredAt: timestamp });
    res.status(201).json(agent);
  });

  router.patch("/:id", (req, res) => {
    const agent = store.agents.get(req.params.id);
    if (!agent || agent.role !== "worker") { res.status(404).json({ error: "Agent not found" }); return; }
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    Object.assign(agent, parsed.data, { updatedAt: now() }); markDirty();
    res.json(agent);
  });

  router.delete("/:id", (req, res) => {
    const agent = store.agents.get(req.params.id);
    if (!agent || agent.role !== "worker") { res.status(404).json({ error: "Agent not found" }); return; }
    store.agents.delete(agent.id); markDirty(); res.status(204).end();
  });

  return router;
}
