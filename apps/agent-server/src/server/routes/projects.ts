import { Router } from "express";
import { z } from "zod";
import { getStore, createId, now, markDirty } from "../store.js";
import { broadcastOrchestration } from "../sse-orchestration.js";
import type { OrchestrationEvent } from "../../models/domain.js";
import { ensureGitRepository } from "../../git/worktree.js";

const router = Router();

const createProjectSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  description: z.string().optional(),
  techPreferences: z.array(z.string()).default([]),
  baseBranch: z.string().default("main"),
  executionMode: z.enum(["direct", "worktree"]).default("direct"),
  testCommand: z.string().optional(),
  lintCommand: z.string().optional(),
  typeCheckCommand: z.string().optional(),
  buildCommand: z.string().optional(),
});

const updateProjectSchema = createProjectSchema.partial();

export function createProjectRoutes(): Router {
  const store = getStore();

  router.get("/", (_req, res) => {
    res.json([...store.projects.values()]);
  });

  router.get("/:id", (req, res) => {
    const project = store.projects.get(req.params.id);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    res.json(project);
  });

  router.patch("/:id", async (req, res) => {
    const project = store.projects.get(req.params.id);
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const location = parsed.data.location || project.location;
    const baseBranch = parsed.data.baseBranch || project.baseBranch;
    const git = await ensureGitRepository(location, baseBranch);
    if (!git.ok) { res.status(400).json({ error: `Could not initialize project repository: ${git.error}` }); return; }
    Object.assign(project, parsed.data, { location, updatedAt: now() });
    markDirty();
    broadcastOrchestration({ id: createId(), projectId: project.id, type: "project.updated", payload: project, sequence: 0, occurredAt: project.updatedAt });
    res.json(project);
  });

  router.post("/", async (req, res) => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const location = parsed.data.location;
    const git = await ensureGitRepository(location, parsed.data.baseBranch);
    if (!git.ok) { res.status(400).json({ error: `Could not initialize project repository: ${git.error}` }); return; }
    const id = createId();
    const timestamp = now();
    const project = { id, ...parsed.data, location, createdAt: timestamp, updatedAt: timestamp };
    store.projects.set(id, project);
    markDirty();

    const event: OrchestrationEvent = {
      id: createId(), projectId: id, type: "project.created",
      payload: project, sequence: 0, occurredAt: timestamp,
    };
    broadcastOrchestration(event);
    res.status(201).json(project);
  });

  return router;
}
