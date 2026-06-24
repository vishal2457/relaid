import { Router } from "express";
import { z } from "zod";
import type { BoardStep } from "../../models/domain.js";
import { createId, getStore, markDirty, now } from "../store.js";
import { DEFAULT_BOARD_STEPS } from "../../orchestrator/workflow-constants.js";

const color = z.enum(["slate", "blue", "amber", "green", "red"]);
const stepFields = z.object({
  name: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
  allowedNextStepIds: z.array(z.string()).default([]),
  allowedPreviousStepIds: z.array(z.string()).default([]),
  isTerminal: z.boolean().default(false),
  color: color.default("slate"),
});

export function ensureSeedSteps(): BoardStep[] {
  const store = getStore();
  const legacy = [...store.boardSteps.values()].some((step) => !("instructions" in step));
  const legacyDefault = store.boardSteps.size === 3
    && ["implementation", "review", "done"].every((id) => store.boardSteps.has(id));
  if (store.boardSteps.size === 0 || legacy || legacyDefault) {
    if (legacy || legacyDefault) store.boardSteps.clear();
    const timestamp = now();
    for (const step of DEFAULT_BOARD_STEPS) store.boardSteps.set(step.id, { ...step, createdAt: timestamp, updatedAt: timestamp });
    markDirty();
  }
  return [...store.boardSteps.values()].sort((a, b) => a.position - b.position);
}

export function createBoardStepRoutes(): Router {
  const router = Router();
  const store = getStore();

  router.get("/", (_req, res) => res.json(ensureSeedSteps()));

  router.post("/", (req, res) => {
    const parsed = stepFields.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    if ([...parsed.data.allowedNextStepIds, ...parsed.data.allowedPreviousStepIds].some((id) => !store.boardSteps.has(id))) {
      res.status(400).json({ error: "Step transitions must reference existing steps" }); return;
    }
    const timestamp = now();
    const step: BoardStep = { id: createId(), ...parsed.data, position: store.boardSteps.size, createdAt: timestamp, updatedAt: timestamp };
    store.boardSteps.set(step.id, step); markDirty(); res.status(201).json(step);
  });

  router.patch("/:id", (req, res) => {
    const step = store.boardSteps.get(req.params.id);
    if (!step) { res.status(404).json({ error: "Board step not found" }); return; }
    const parsed = stepFields.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const next = parsed.data.allowedNextStepIds || step.allowedNextStepIds;
    const previous = parsed.data.allowedPreviousStepIds || step.allowedPreviousStepIds;
    if ([...next, ...previous].some((id) => id === step.id || !store.boardSteps.has(id))) {
      res.status(400).json({ error: "Step transitions must reference other existing steps" }); return;
    }
    if (step.isTerminal && parsed.data.isTerminal === false && ![...store.boardSteps.values()].some((candidate) => candidate.id !== step.id && candidate.isTerminal)) {
      res.status(400).json({ error: "The board must have at least one terminal step" }); return;
    }
    Object.assign(step, parsed.data, { updatedAt: now() }); markDirty(); res.json(step);
  });

  router.put("/order", (req, res) => {
    const parsed = z.object({ ids: z.array(z.string()) }).safeParse(req.body);
    if (!parsed.success || parsed.data.ids.length !== store.boardSteps.size || parsed.data.ids.some((id) => !store.boardSteps.has(id))) {
      res.status(400).json({ error: "Order must contain every board step exactly once" }); return;
    }
    parsed.data.ids.forEach((id, position) => { const step = store.boardSteps.get(id)!; step.position = position; step.updatedAt = now(); });
    markDirty(); res.json(ensureSeedSteps());
  });

  router.delete("/:id", (req, res) => {
    const step = store.boardSteps.get(req.params.id);
    if (!step) { res.status(404).json({ error: "Board step not found" }); return; }
    if ([...store.tickets.values()].some((ticket) => ticket.currentStepId === step.id)) { res.status(409).json({ error: "Cannot delete a step containing tickets" }); return; }
    if ([...store.boardSteps.values()].some((candidate) => candidate.allowedNextStepIds.includes(step.id) || candidate.allowedPreviousStepIds.includes(step.id))) { res.status(409).json({ error: "Remove transitions to this step before deleting it" }); return; }
    if (step.isTerminal && ![...store.boardSteps.values()].some((candidate) => candidate.id !== step.id && candidate.isTerminal)) { res.status(409).json({ error: "The board must have at least one terminal step" }); return; }
    store.boardSteps.delete(step.id);
    [...store.boardSteps.values()].sort((a, b) => a.position - b.position).forEach((step, position) => { step.position = position; });
    markDirty(); res.status(204).end();
  });

  return router;
}
