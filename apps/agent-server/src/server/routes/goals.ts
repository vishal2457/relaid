import { Router } from "express";
import { z } from "zod";
import type { Goal, Ticket } from "../../models/domain.js";
import { validateGoalTransition, validateTicketTransition } from "../../models/domain.js";
import { broadcastOrchestration } from "../sse-orchestration.js";
import { getStore, createId, now, markDirty } from "../store.js";
import { recoverInterruptedGoal, scheduleAndExecute } from "../../orchestrator/scheduler.js";
import { planAndExecuteGoal } from "../../orchestrator/scheduler.js";
import { ensureOrchestrator } from "../../orchestrator/orchestrator-profile.js";

const router = Router();

const createGoalSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  constraints: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).default([]),
  relevantFiles: z.array(z.string()).default([]),
  technicalInstructions: z.string().optional(),
  outOfScopeItems: z.array(z.string()).default([]),
  maxAgents: z.number().min(1).max(10).default(3),
  maxRetries: z.number().min(0).max(10).default(3),
  autoRetry: z.boolean().default(true),
  autoMerge: z.boolean().default(false),
  requireReview: z.boolean().default(true),
});

const updateStatusSchema = z.object({
  status: z.string().min(1),
});

const executeSchema = z.object({
  maxAgents: z.number().min(1).max(10).default(3),
  maxRetries: z.number().min(0).max(10).default(3),
  autoRetry: z.boolean().default(true),
  autoMerge: z.boolean().default(false),
  requireReview: z.boolean().default(true),
});

export function createGoalRoutes(): Router {
  const store = getStore();

  router.get("/", (_req, res) => {
    res.json([...store.goals.values()]);
  });

  router.get("/:id", (req, res) => {
    const goal = store.goals.get(req.params.id);
    if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
    res.json(goal);
  });

  router.post("/", (req, res) => {
    const parsed = createGoalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() }); return;
    }
    const id = createId();
    const timestamp = now();
    const manager = ensureOrchestrator();
    if (!manager.enabled) { res.status(400).json({ error: "Enable the orchestrator before creating a goal" }); return; }
    const goal: Goal = {
      ...parsed.data, id, managerAgentId: manager.id, status: "draft", ticketIds: [],
      createdAt: timestamp, updatedAt: timestamp,
    };
    store.goals.set(id, goal);
    markDirty();
    broadcastOrchestration({
      id: createId(), projectId: goal.projectId, goalId: id,
      type: "goal.created", payload: goal, sequence: 0, occurredAt: timestamp,
    });
    res.status(201).json(goal);
  });

  router.patch("/:id/status", (req, res) => {
    const goal = store.goals.get(req.params.id);
    if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    if (!validateGoalTransition(goal.status, parsed.data.status as Goal["status"])) {
      res.status(400).json({ error: `Invalid transition: ${goal.status} -> ${parsed.data.status}` }); return;
    }
    const timestamp = now();
    goal.status = parsed.data.status as Goal["status"];
    goal.updatedAt = timestamp;
    if (parsed.data.status === "running" && !goal.startedAt) goal.startedAt = timestamp;
    if (parsed.data.status === "completed" || parsed.data.status === "failed") goal.completedAt = timestamp;
    markDirty();

    broadcastOrchestration({
      id: createId(), projectId: goal.projectId, goalId: goal.id,
      type: "goal.status_changed", payload: { status: goal.status }, sequence: 0, occurredAt: timestamp,
    });
    res.json(goal);
  });

  router.post("/:id/execute", (req, res) => {
    const goal = store.goals.get(req.params.id);
    if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
    const parsed = executeSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    const timestamp = now();
    goal.maxAgents = parsed.data.maxAgents;
    goal.maxRetries = parsed.data.maxRetries;
    goal.autoRetry = parsed.data.autoRetry;
    goal.autoMerge = parsed.data.autoMerge;
    goal.requireReview = parsed.data.requireReview;
    goal.lastError = undefined;
    goal.completedAt = undefined;
    const manager = store.agents.get(goal.managerAgentId);
    if (!manager || !manager.enabled) { res.status(400).json({ error: "Goal manager is missing or disabled" }); return; }
    goal.status = goal.ticketIds.length === 0 ? "planning" : "running";
    goal.startedAt = timestamp;
    goal.updatedAt = timestamp;
    markDirty();

    broadcastOrchestration({
      id: createId(), projectId: goal.projectId, goalId: goal.id,
      type: "goal.execution_started", payload: { maxAgents: goal.maxAgents }, sequence: 0, occurredAt: timestamp,
    });

    // Kick off the scheduler
    setImmediate(() => goal.ticketIds.length === 0 ? planAndExecuteGoal(goal) : scheduleAndExecute(goal));

    res.json({ goalId: goal.id, status: goal.status });
  });

  router.post("/:id/pause", (req, res) => {
    const goal = store.goals.get(req.params.id);
    if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
    if (goal.status !== "running") { res.status(400).json({ error: "Goal is not running" }); return; }
    goal.status = "paused"; goal.updatedAt = now(); markDirty();
    broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, type: "goal.paused", payload: {}, sequence: 0, occurredAt: now() });
    res.json({ status: goal.status });
  });

  router.post("/:id/resume", (req, res) => {
    const goal = store.goals.get(req.params.id);
    if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
    if (goal.status !== "paused" && goal.status !== "cancelled") { res.status(400).json({ error: "Goal is not paused or cancelled" }); return; }
    const wasCancelled = goal.status === "cancelled";
    const recoveredRuns = recoverInterruptedGoal(goal);
    goal.status = "running";
    goal.updatedAt = now();
    if (wasCancelled) goal.completedAt = undefined;
    markDirty();
    broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, type: "goal.resumed", payload: { recoveredRuns }, sequence: 0, occurredAt: now() });
    setImmediate(() => scheduleAndExecute(goal));
    res.json({ status: goal.status });
  });

  router.post("/:id/cancel", (req, res) => {
    const goal = store.goals.get(req.params.id);
    if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
    goal.status = "cancelled"; goal.updatedAt = now(); goal.completedAt = now(); markDirty();
    broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, type: "goal.cancelled", payload: {}, sequence: 0, occurredAt: now() });
    res.json({ status: goal.status });
  });

  router.post("/:id/reset", (req, res) => {
    const goal = store.goals.get(req.params.id);
    if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
    const ticketIds = new Set(goal.ticketIds);
    for (const ticketId of ticketIds) store.tickets.delete(ticketId);
    for (const [runId, run] of store.agentRuns) {
      if (run.goalId === goal.id) store.agentRuns.delete(runId);
    }
    for (const [ticketId, evidence] of store.tddEvidence) {
      if (ticketIds.has(ticketId) || evidence.ticketId && ticketIds.has(evidence.ticketId)) store.tddEvidence.delete(ticketId);
    }
    const timestamp = now();
    goal.ticketIds = [];
    goal.status = "draft";
    goal.startedAt = undefined;
    goal.completedAt = undefined;
    goal.lastError = undefined;
    goal.updatedAt = timestamp;
    markDirty();
    broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, type: "goal.reset", payload: {}, sequence: 0, occurredAt: timestamp });
    res.json(goal);
  });

  router.get("/:id/tickets", (req, res) => {
    const goalTickets = [...store.tickets.values()].filter((t) => t.goalId === req.params.id);
    res.json(goalTickets);
  });

  router.get("/:goalId/tickets/:ticketId", (req, res) => {
    const ticket = store.tickets.get(req.params.ticketId);
    if (!ticket || ticket.goalId !== req.params.goalId) {
      res.status(404).json({ error: "Ticket not found" }); return;
    }
    res.json(ticket);
  });

  router.patch("/:goalId/tickets/:ticketId/status", (req, res) => {
    const ticket = store.tickets.get(req.params.ticketId);
    if (!ticket || ticket.goalId !== req.params.goalId) {
      res.status(404).json({ error: "Ticket not found" }); return;
    }
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    if (!validateTicketTransition(ticket.status, parsed.data.status as Ticket["status"])) {
      res.status(400).json({ error: `Invalid transition: ${ticket.status} -> ${parsed.data.status}` }); return;
    }
    const timestamp = now();
    ticket.status = parsed.data.status as Ticket["status"];
    ticket.updatedAt = timestamp;
    if (parsed.data.status === "in_progress" && !ticket.startedAt) ticket.startedAt = timestamp;
    if (parsed.data.status === "completed" || parsed.data.status === "failed") ticket.completedAt = timestamp;
    markDirty();

    broadcastOrchestration({
      id: createId(), projectId: ticket.projectId, goalId: ticket.goalId, ticketId: ticket.id,
      type: "ticket.status_changed", payload: { status: ticket.status }, sequence: 0, occurredAt: timestamp,
    });
    const goal = store.goals.get(ticket.goalId);
    if (goal?.status === "running") setImmediate(() => scheduleAndExecute(goal));
    res.json(ticket);
  });

  router.get("/:id/agents", (req, res) => {
    const runs = [...store.agentRuns.values()].filter((r) => r.goalId === req.params.id);
    res.json(runs);
  });

  return router;
}
