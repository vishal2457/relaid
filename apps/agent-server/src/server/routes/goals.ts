import { Router } from "express";
import { z } from "zod";
import type { Goal, Ticket } from "../../models/domain.js";
import { validateGoalTransition, validateTicketTransition } from "../../models/domain.js";
import { broadcastOrchestration } from "../sse-orchestration.js";
import { getStore, createId, now, markDirty } from "../store.js";
import { scheduleAndExecute } from "../../orchestrator/scheduler.js";

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
  provider: z.enum(["claude", "codex"]).default("claude"),
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
  provider: z.enum(["claude", "codex"]).default("claude"),
  maxRetries: z.number().min(0).max(10).default(3),
  autoRetry: z.boolean().default(true),
  autoMerge: z.boolean().default(false),
  requireReview: z.boolean().default(true),
});

const createTicketSchema = z.object({
  tickets: z.array(z.object({
    title: z.string().min(1),
    description: z.string().default(""),
    type: z.enum(["research", "test", "implementation", "refactor", "integration", "verification", "documentation"]),
    priority: z.enum(["low", "medium", "high", "critical"]),
    acceptanceCriteria: z.array(z.string()).default([]),
    technicalNotes: z.array(z.string()).default([]),
    relevantFiles: z.array(z.string()).default([]),
    dependencyIds: z.array(z.string()).default([]),
    testPlan: z.array(z.string()).default([]),
    verificationCommands: z.array(z.string()).default([]),
  })),
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
    const goal: Goal = {
      ...parsed.data, id, status: "draft", ticketIds: [],
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
    goal.provider = parsed.data.provider;
    goal.maxRetries = parsed.data.maxRetries;
    goal.autoRetry = parsed.data.autoRetry;
    goal.autoMerge = parsed.data.autoMerge;
    goal.requireReview = parsed.data.requireReview;
    goal.status = "running";
    goal.startedAt = timestamp;
    goal.updatedAt = timestamp;
    markDirty();

    broadcastOrchestration({
      id: createId(), projectId: goal.projectId, goalId: goal.id,
      type: "goal.execution_started", payload: { maxAgents: goal.maxAgents }, sequence: 0, occurredAt: timestamp,
    });

    // Kick off the scheduler
    setImmediate(() => scheduleAndExecute(goal));

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
    if (goal.status !== "paused") { res.status(400).json({ error: "Goal is not paused" }); return; }
    goal.status = "running"; goal.updatedAt = now(); markDirty();
    broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, type: "goal.resumed", payload: {}, sequence: 0, occurredAt: now() });
    res.json({ status: goal.status });
  });

  router.post("/:id/cancel", (req, res) => {
    const goal = store.goals.get(req.params.id);
    if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
    goal.status = "cancelled"; goal.updatedAt = now(); goal.completedAt = now(); markDirty();
    broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, type: "goal.cancelled", payload: {}, sequence: 0, occurredAt: now() });
    res.json({ status: goal.status });
  });

  router.get("/:id/tickets", (req, res) => {
    const goalTickets = [...store.tickets.values()].filter((t) => t.goalId === req.params.id);
    res.json(goalTickets);
  });

  router.post("/:id/tickets", (req, res) => {
    const goal = store.goals.get(req.params.id);
    if (!goal) { res.status(404).json({ error: "Goal not found" }); return; }
    const parsed = createTicketSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

    const timestamp = now();
    const created: Ticket[] = [];

    for (const t of parsed.data.tickets) {
      const id = createId();
      const ticket: Ticket = {
        id, projectId: goal.projectId, goalId: goal.id,
        title: t.title, description: t.description, type: t.type,
        status: "backlog", priority: t.priority,
        acceptanceCriteria: t.acceptanceCriteria, technicalNotes: t.technicalNotes,
        relevantFiles: t.relevantFiles, dependencyIds: t.dependencyIds,
        blockingTicketIds: [], testPlan: t.testPlan,
        verificationCommands: t.verificationCommands,
        retryCount: 0, maximumRetries: goal.maxRetries,
        createdAt: timestamp, updatedAt: timestamp,
      };
      store.tickets.set(id, ticket);
      created.push(ticket);
      goal.ticketIds.push(id);
    }

    goal.status = "ready";
    goal.updatedAt = timestamp;
    markDirty();

    broadcastOrchestration({
      id: createId(), projectId: goal.projectId, goalId: goal.id,
      type: "goal.tickets_created", payload: { count: created.length }, sequence: 0, occurredAt: timestamp,
    });
    res.status(201).json(created);
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
    res.json(ticket);
  });

  router.get("/:id/agents", (req, res) => {
    const runs = [...store.agentRuns.values()].filter((r) => r.goalId === req.params.id);
    res.json(runs);
  });

  return router;
}
