import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Ticket, Goal, AgentRun, AgentProfile, BoardStep, TicketStepExecution } from "../models/domain.js";
import { getStore, createId, now, markDirty } from "../server/store.js";
import { broadcastOrchestration } from "../server/sse-orchestration.js";
import {
  createWorktree,
  commitChanges,
  createBranchName,
  ensureGitRepository,
} from "../git/worktree.js";
import { isInterruptedRun, selectAgentForTicket } from "./scheduling.js";
import type { AgentStreamContext, SsePayload } from "../events/event-types.js";
import type { ClaudeAgent } from "../agents/claude-agent.js";
import type { CodexAgent } from "../agents/codex-agent.js";
import type { OpencodeAgent } from "../agents/opencode-agent.js";
import { broadcast } from "../server/sse-bus.js";
import { ensureSeedSteps } from "../server/routes/board-steps.js";
import { ensurePlanningAgent } from "./orchestrator-profile.js";
import {
  BOARD_STATE_CHANGED_TRIGGER,
  DELEGATED_WORKER_SYSTEM_INSTRUCTIONS,
  ORCHESTRATOR_ANALYSIS_FAILED_MESSAGE,
  ORCHESTRATOR_BOARD_REPAIR_SYSTEM_INSTRUCTIONS,
  ORCHESTRATOR_BOARD_SYSTEM_INSTRUCTIONS,
  PLANNING_REPAIR_SYSTEM_INSTRUCTIONS,
  PLANNING_SYSTEM_INSTRUCTIONS,
  WORKFLOW_ACTIONS,
  WORKFLOW_EVENTS,
  buildAgentSystemPrompt,
  buildBoardAnalysisPrompt,
  buildBoardRepairPrompt,
  buildPlanningPrompt,
  buildPlanningRepairPrompt,
  buildStepExecutionPrompt,
} from "./workflow-constants.js";

let claudeAgent: ClaudeAgent | null = null;
let codexAgent: CodexAgent | null = null;
let opencodeAgent: OpencodeAgent | null = null;

export function setAgentInstances(
  claude: ClaudeAgent,
  codex: CodexAgent,
  opencode: OpencodeAgent,
): void {
  claudeAgent = claude;
  codexAgent = codex;
  opencodeAgent = opencode;
}

function getAgent(provider: "claude" | "codex" | "opencode"): ClaudeAgent | CodexAgent | OpencodeAgent | null {
  if (provider === "claude") return claudeAgent;
  if (provider === "codex") return codexAgent;
  return opencodeAgent;
}

function broadcastAgentStream(payload: SsePayload, context: AgentStreamContext): void {
  broadcast({
    ...payload,
    data: { ...payload.data, ...context },
  } as SsePayload);
}

const ticketTypeSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.toLowerCase().trim();
  const aliases: Record<string, string> = {
    feature: "implementation", bug: "implementation", bugfix: "implementation",
    infrastructure: "integration", chore: "refactor", testing: "test", docs: "documentation",
  };
  return aliases[normalized] || normalized;
}, z.enum(["research", "test", "implementation", "refactor", "integration", "verification", "documentation"]));

const ticketPrioritySchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.toLowerCase().trim();
  const aliases: Record<string, string> = {
    p0: "critical", p1: "high", p2: "medium", p3: "low", urgent: "critical",
  };
  return aliases[normalized] || normalized;
}, z.enum(["low", "medium", "high", "critical"]));

const stringListSchema = z.preprocess(
  (value) => typeof value === "string" ? [value] : value,
  z.array(z.string()),
);
const nonEmptyStringListSchema = z.preprocess(
  (value) => typeof value === "string" ? [value] : value,
  z.array(z.string()).min(1),
);

const plannedTicketSchema = z.object({
  key: z.string().min(1), title: z.string().min(1), description: z.string().min(1),
  type: ticketTypeSchema,
  priority: ticketPrioritySchema,
  acceptanceCriteria: nonEmptyStringListSchema, technicalNotes: stringListSchema.default([]),
  relevantFiles: stringListSchema.default([]), dependencyKeys: stringListSchema.default([]),
  testPlan: nonEmptyStringListSchema,
  verificationCommands: nonEmptyStringListSchema,
});

const ticketPlanOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["tickets"],
  properties: {
    tickets: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "key", "title", "description", "type", "priority", "acceptanceCriteria",
          "technicalNotes", "relevantFiles", "dependencyKeys", "testPlan",
          "verificationCommands",
        ],
        properties: {
          key: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          description: { type: "string", minLength: 1 },
          type: { type: "string", enum: ["research", "test", "implementation", "refactor", "integration", "verification", "documentation"] },
          priority: { type: "string", enum: ["low", "medium", "high", "critical"] },
          acceptanceCriteria: { type: "array", minItems: 1, items: { type: "string" } },
          technicalNotes: { type: "array", items: { type: "string" } },
          relevantFiles: { type: "array", items: { type: "string" } },
          dependencyKeys: { type: "array", items: { type: "string" } },
          testPlan: { type: "array", minItems: 1, items: { type: "string" } },
          verificationCommands: { type: "array", minItems: 1, items: { type: "string" } },
        },
      },
    },
  },
} as const;

export function parseTicketPlan(output: string): z.infer<typeof plannedTicketSchema>[] {
  const candidates = [output.trim()];
  for (const match of output.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start >= 0 && end > start) candidates.push(output.slice(start, end + 1));

  let tickets: z.infer<typeof plannedTicketSchema>[] | undefined;
  let validationError: z.ZodError | undefined;
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      const value = parsed && typeof parsed === "object" && !Array.isArray(parsed) && "tickets" in parsed
        ? (parsed as { tickets: unknown }).tickets
        : parsed;
      const validated = z.array(plannedTicketSchema).min(1).safeParse(value);
      if (validated.success) {
        tickets = validated.data;
        break;
      }
      validationError = validated.error;
    } catch {
      // Try the next candidate so fenced or prefixed JSON remains supported.
    }
  }
  if (!tickets) {
    const issue = validationError?.issues[0];
    const detail = issue ? `: ${issue.path.join(".") || "plan"} ${issue.message}` : "";
    throw new Error(`Orchestrator did not return a valid JSON ticket array${detail}`);
  }
  const keys = new Set(tickets.map((ticket) => ticket.key));
  if (keys.size !== tickets.length) throw new Error("Orchestrator returned duplicate ticket keys");
  for (const ticket of tickets) {
    const invalid = ticket.dependencyKeys.filter((key) => !keys.has(key) || key === ticket.key);
    if (invalid.length) throw new Error(`Invalid dependencies for ${ticket.key}: ${invalid.join(", ")}`);
  }
  return tickets;
}

async function parseTicketPlanWithArtifact(output: string, projectLocation: string): Promise<z.infer<typeof plannedTicketSchema>[]> {
  try {
    return parseTicketPlan(output);
  } catch (outputError) {
    const match = output.match(/plan (?:written|saved) to\s+[`'"]?([^`'"\n]+\.json)/i);
    if (!match?.[1]) throw outputError;
    const artifactPath = path.resolve(projectLocation, match[1].trim());
    const relative = path.relative(projectLocation, artifactPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw outputError;
    try {
      const artifact = await fs.readFile(artifactPath, "utf8");
      const plan = parseTicketPlan(artifact);
      await fs.unlink(artifactPath).catch(() => undefined);
      return plan;
    } catch {
      throw outputError;
    }
  }
}

export async function planAndExecuteGoal(goal: Goal): Promise<void> {
  const store = getStore();
  const project = store.projects.get(goal.projectId);
  const planner = store.agents.get(goal.plannerAgentId) || ensurePlanningAgent();
  goal.plannerAgentId = planner.id;
  const agent = getAgent(planner.provider);
  if (!project || !planner.enabled || !agent) {
    failPlanning(goal, "Project, planning agent, or planning harness is unavailable"); return;
  }
  const git = await ensureGitRepository(project.location, project.baseBranch);
  if (!git.ok) {
    failPlanning(goal, `Could not initialize project repository: ${git.error}`); return;
  }
  const verification = [project.testCommand, project.lintCommand, project.typeCheckCommand, project.buildCommand].filter(Boolean).join("\n") || "Infer the repository's real test and type-check commands.";
  let planningOutput = "";
  try {
    const result = await agent.run({
      requestId: `plan-${goal.id}`, cwd: project.location, provider: planner.provider,
      sessionId: `plan-${goal.id}`, model: planner.model, permissionMode: "plan",
      readOnly: true,
      outputSchema: ticketPlanOutputSchema,
      systemPrompt: `${planner.systemPrompt}\n\n${PLANNING_SYSTEM_INSTRUCTIONS}`,
      prompt: buildPlanningPrompt(goal, verification),
    }, (payload) => broadcastAgentStream(payload, {
      runId: `plan-${goal.id}`,
      goalId: goal.id,
      agentProfileId: planner.id,
    }));
    planningOutput = result.output;
    if (!result.success) throw new Error(result.error || "Orchestrator planning failed");
    let plan: z.infer<typeof plannedTicketSchema>[];
    try {
      plan = await parseTicketPlanWithArtifact(result.output, project.location);
    } catch (firstError) {
      const validationMessage = firstError instanceof Error ? firstError.message : String(firstError);
      const retry = await agent.run({
        requestId: `plan-${goal.id}-repair`, cwd: project.location, provider: planner.provider,
        sessionId: `plan-${goal.id}-repair`, model: planner.model, permissionMode: "plan",
        readOnly: true,
        outputSchema: ticketPlanOutputSchema,
        systemPrompt: `${planner.systemPrompt}\n\n${PLANNING_REPAIR_SYSTEM_INSTRUCTIONS}`,
        prompt: buildPlanningRepairPrompt(goal, verification, validationMessage),
      }, (payload) => broadcastAgentStream(payload, {
        runId: `plan-${goal.id}`,
        goalId: goal.id,
        agentProfileId: planner.id,
      }));
      planningOutput = `Automatic retry output:\n${retry.output}\n\nInitial output:\n${result.output}`;
      if (!retry.success) throw new Error(retry.error || "Orchestrator JSON repair attempt failed");
      try {
        plan = await parseTicketPlanWithArtifact(retry.output, project.location);
      } catch (retryError) {
        const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
        throw new Error(`${retryMessage} (automatic regeneration also failed)`);
      }
    }
    const timestamp = now();
    const steps = ensureSeedSteps();
    const firstStep = steps.find((step) => !step.isTerminal) || steps[0];
    if (!firstStep) throw new Error("No workflow steps are configured");
    const ids = new Map(plan.map((ticket) => [ticket.key, createId()]));
    for (const item of plan) {
      const id = ids.get(item.key)!;
      const dependencyIds = item.dependencyKeys.map((key) => ids.get(key)!);
      const ticket: Ticket = {
        id, projectId: goal.projectId, goalId: goal.id, title: item.title, description: item.description,
        type: item.type, status: dependencyIds.length ? "blocked" : "ready", priority: item.priority,
        currentStepId: firstStep.id, stepStatus: null, stepHistory: [],
        acceptanceCriteria: item.acceptanceCriteria, technicalNotes: item.technicalNotes,
        relevantFiles: item.relevantFiles, dependencyIds,
        testPlan: item.testPlan, verificationCommands: item.verificationCommands,
        retryCount: 0, maximumRetries: goal.maxRetries, createdAt: timestamp, updatedAt: timestamp,
      };
      store.tickets.set(id, ticket); goal.ticketIds.push(id);
    }
    goal.status = "running"; goal.updatedAt = timestamp; markDirty();
    broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, type: "goal.tickets_created", payload: { count: plan.length, source: "planning-agent" }, sequence: 0, occurredAt: timestamp });
    await scheduleAndExecute(goal);
  } catch (error) {
    failPlanning(goal, error instanceof Error ? error.message : String(error), planningOutput);
  }
}

function failPlanning(goal: Goal, error: string, output?: string): void {
  const timestamp = now();
  goal.status = "failed"; goal.updatedAt = timestamp; goal.completedAt = timestamp;
  goal.lastError = { phase: "planning", message: error, details: output ? output.slice(0, 8000) : undefined, occurredAt: timestamp };
  markDirty();
  broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, type: "goal.failed", payload: goal.lastError, sequence: 0, occurredAt: timestamp });
}

export async function scheduleAndExecute(goal: Goal): Promise<void> {
  if (orchestrationLocks.has(goal.id)) {
    orchestrationPending.add(goal.id);
    return;
  }
  orchestrationLocks.add(goal.id);
  try {
    do {
      orchestrationPending.delete(goal.id);
      await analyzeBoard(goal, BOARD_STATE_CHANGED_TRIGGER);
    } while (orchestrationPending.has(goal.id) && goal.status === "running");
  } finally {
    orchestrationLocks.delete(goal.id);
  }
}

const orchestrationLocks = new Set<string>();
const orchestrationPending = new Set<string>();

const decisionActionSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const action = { ...(value as Record<string, unknown>) };
  if (action.action === "dispatch" || action.action === "start") action.action = "run";
  if (action.action == null && (action.agentId != null || action.agentName != null || action.agentProvider != null)) action.action = "run";
  action.provider ??= action.agentProvider;
  action.model ??= action.agentModel;
  action.targetStepId ??= "";
  action.agentId ??= "";
  action.agentName ??= "";
  action.model ??= "";
  action.reason ??= action.instructions ?? "Orchestrator requested this action";
  return action;
}, z.object({
  action: z.enum(WORKFLOW_ACTIONS),
  ticketId: z.string().min(1),
  targetStepId: z.string().default(""),
  agentId: z.string().default(""),
  agentName: z.string().default(""),
  provider: z.enum(["claude", "codex", "opencode"]).optional(),
  model: z.string().default(""),
  reason: z.string().min(1),
}));

const boardDecisionOutputSchema = {
  type: "object", additionalProperties: false, required: ["actions"],
  properties: { actions: { type: "array", items: { type: "object", additionalProperties: false,
    required: ["action", "ticketId", "targetStepId", "agentId", "agentName", "provider", "model", "reason"],
    properties: {
      action: { type: "string", enum: WORKFLOW_ACTIONS },
      ticketId: { type: "string" }, targetStepId: { type: "string" }, agentId: { type: "string" },
      agentName: { type: "string" }, provider: { type: "string", enum: ["claude", "codex", "opencode"] },
      model: { type: "string" }, reason: { type: "string" },
    },
  } } },
} as const;

export function parseBoardDecision(output: string) {
  const candidates = [output.trim()];
  for (const match of output.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  let parseError: unknown;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { actions?: unknown; moves?: unknown; reasoning?: unknown };
      let actions = parsed.actions;
      if (actions == null && Array.isArray(parsed.moves)) {
        actions = parsed.moves.map((value) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return value;
          const move = value as Record<string, unknown>;
          const sameStep = move.fromStepId === move.toStepId;
          return {
            ...move,
            action: sameStep && move.stepStatus === "in_progress" ? "run" : "move",
            targetStepId: move.toStepId,
            reason: parsed.reasoning || "Orchestrator requested this move",
          };
        });
      }
      return z.array(decisionActionSchema).parse(actions);
    } catch (error) {
      parseError = error;
    }
  }
  throw parseError instanceof Error ? parseError : new Error("Orchestrator did not return valid board actions");
}

async function analyzeBoard(goal: Goal, trigger: string): Promise<void> {
  const store = getStore();
  const project = store.projects.get(goal.projectId);
  const orchestrator = store.agents.get(goal.managerAgentId);
  const agent = orchestrator ? getAgent(orchestrator.provider) : null;
  if (!project || !orchestrator?.enabled || !agent || goal.status !== "running") return;
  const steps = ensureSeedSteps();
  migrateGoalTickets(goal, steps);
  syncDependencyStatuses(goal, steps);
  finishGoalIfComplete(goal, steps);
  if (goal.status !== "running") return;
  const tickets = [...store.tickets.values()].filter((ticket) => ticket.goalId === goal.id);
  const running = [...store.agentRuns.values()].filter((run) => run.goalId === goal.id && run.kind === "step" && (run.status === "starting" || run.status === "running"));
  const agents = [...store.agents.values()].filter((profile) => profile.role === "worker" && profile.enabled);
  const run: AgentRun = {
    id: createId(), goalId: goal.id, ticketId: "", agentProfileId: orchestrator.id,
    provider: orchestrator.provider, model: orchestrator.model, kind: "orchestration", status: "running",
    worktreePath: project.location, branchName: project.baseBranch, startedAt: now(),
  };
  run.sessionId = `orchestrate-${goal.id}-${run.id}`;
  store.agentRuns.set(run.id, run); markDirty();
  broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, agentId: orchestrator.id, type: WORKFLOW_EVENTS.orchestratorAnalysisStarted, payload: { runId: run.id, trigger }, sequence: 0, occurredAt: now() });
  const board = {
    trigger,
    capacity: { maxAgents: goal.maxAgents, runningStepRuns: running.length, available: Math.max(0, goal.maxAgents - running.length) },
    steps: steps.map((step) => ({ id: step.id, position: step.position, name: step.name, instructions: step.instructions, allowedNextStepIds: step.allowedNextStepIds, allowedPreviousStepIds: step.allowedPreviousStepIds, isTerminal: step.isTerminal })),
    tickets: tickets.map((ticket) => ({ id: ticket.id, title: ticket.title, description: ticket.description, type: ticket.type, priority: ticket.priority, acceptanceCriteria: ticket.acceptanceCriteria, relevantFiles: ticket.relevantFiles, currentStepId: ticket.currentStepId, stepStatus: ticket.stepStatus, retryCount: ticket.retryCount, maximumRetries: ticket.maximumRetries, dependencies: ticket.dependencyIds.map((id) => { const dependency = store.tickets.get(id); return { id, stepId: dependency?.currentStepId, stepStatus: dependency?.stepStatus, ticketStatus: dependency?.status }; }), assignedAgentId: ticket.assignedAgentId, lastStepResult: ticket.stepHistory.at(-1) })),
    running: running.map((active) => ({ runId: active.id, ticketId: active.ticketId, stepId: active.stepId, agentProfileId: active.agentProfileId })),
    agents: agents.map((profile) => ({ id: profile.id, name: profile.name, provider: profile.provider, model: profile.model })),
  };
  try {
    const result = await agent.run({
      requestId: run.id, cwd: project.location, provider: orchestrator.provider, sessionId: run.sessionId,
      model: orchestrator.model, permissionMode: "plan", outputSchema: boardDecisionOutputSchema,
      readOnly: true,
      systemPrompt: `${orchestrator.systemPrompt}\n\n${ORCHESTRATOR_BOARD_SYSTEM_INSTRUCTIONS}`,
      prompt: buildBoardAnalysisPrompt(board),
    }, (payload) => broadcastAgentStream(payload, { runId: run.id, goalId: goal.id, agentProfileId: orchestrator.id }));
    run.output = result.output; run.error = result.error; run.status = result.success ? "completed" : "failed"; run.completedAt = now(); markDirty();
    if (!result.success) throw new Error(result.error || "Orchestrator analysis failed");
    let actions: ReturnType<typeof parseBoardDecision>;
    try {
      actions = parseBoardDecision(result.output);
    } catch (firstError) {
      const validationMessage = firstError instanceof Error ? firstError.message : String(firstError);
      const retry = await agent.run({
        requestId: `${run.id}-repair`, cwd: project.location, provider: orchestrator.provider,
        sessionId: `${run.sessionId}-repair`, model: orchestrator.model, permissionMode: "plan",
        readOnly: true,
        outputSchema: boardDecisionOutputSchema,
        systemPrompt: `${orchestrator.systemPrompt}\n\n${ORCHESTRATOR_BOARD_REPAIR_SYSTEM_INSTRUCTIONS}`,
        prompt: buildBoardRepairPrompt(board, validationMessage, result.output),
      }, (payload) => broadcastAgentStream(payload, { runId: run.id, goalId: goal.id, agentProfileId: orchestrator.id }));
      run.output = `Automatic retry output:\n${retry.output}\n\nInitial output:\n${result.output}`;
      if (!retry.success) throw new Error(retry.error || "Orchestrator JSON repair attempt failed");
      actions = parseBoardDecision(retry.output);
    }
    await applyBoardActions(goal, actions, steps);
    finishGoalIfComplete(goal, steps);
    broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, agentId: orchestrator.id, type: WORKFLOW_EVENTS.orchestratorAnalysisCompleted, payload: { runId: run.id, actions }, sequence: 0, occurredAt: now() });
  } catch (error) {
    run.status = "failed"; run.error = error instanceof Error ? error.message : String(error); run.completedAt = now();
    goal.status = "blocked"; goal.updatedAt = now();
    goal.lastError = { phase: "execution", message: ORCHESTRATOR_ANALYSIS_FAILED_MESSAGE, details: run.error, occurredAt: now() };
    markDirty();
    broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, agentId: orchestrator.id, type: WORKFLOW_EVENTS.orchestratorAnalysisFailed, payload: { runId: run.id, error: run.error }, sequence: 0, occurredAt: now() });
  }
}

function migrateGoalTickets(goal: Goal, steps: BoardStep[]): void {
  const store = getStore();
  const first = steps.find((step) => !step.isTerminal) || steps[0];
  if (!first) return;
  for (const ticket of store.tickets.values()) {
    if (ticket.goalId !== goal.id) continue;
    ticket.currentStepId ||= first.id;
    ticket.stepHistory ||= [];
    if ((ticket as unknown as { stepStatus?: string }).stepStatus === undefined) ticket.stepStatus = ticket.status === "failed" ? "failed" : ticket.status === "in_progress" ? "in_progress" : null;
  }
  markDirty();
}

function dependenciesComplete(ticket: Ticket, steps: BoardStep[]): boolean {
  const store = getStore();
  const terminalIds = new Set(steps.filter((step) => step.isTerminal).map((step) => step.id));
  return ticket.dependencyIds.every((id) => {
    const dependency = store.tickets.get(id);
    return dependency && terminalIds.has(dependency.currentStepId) && dependency.stepStatus === "completed";
  });
}

function syncDependencyStatuses(goal: Goal, steps: BoardStep[]): void {
  const store = getStore();
  for (const ticket of store.tickets.values()) {
    if (ticket.goalId !== goal.id || ticket.status === "completed" || ticket.status === "failed" || ticket.status === "cancelled" || ticket.stepStatus === "in_progress") continue;
    const ready = dependenciesComplete(ticket, steps);
    if (!ready && ticket.stepStatus == null) ticket.status = "blocked";
    if (ready && ticket.status === "blocked" && ticket.stepStatus == null) ticket.status = "ready";
  }
  markDirty();
}

async function applyBoardActions(goal: Goal, actions: z.infer<typeof decisionActionSchema>[], steps: BoardStep[]): Promise<void> {
  const store = getStore();
  const stepMap = new Map(steps.map((step) => [step.id, step]));
  const activeRuns = [...store.agentRuns.values()].filter((run) => run.goalId === goal.id && run.kind === "step" && (run.status === "starting" || run.status === "running"));
  let capacity = Math.max(0, goal.maxAgents - activeRuns.length);
  const busyAgentIds = new Set(activeRuns.map((run) => run.agentProfileId));
  const actedTicketIds = new Set<string>();
  for (const action of actions) {
    const ticket = store.tickets.get(action.ticketId);
    if (!ticket || ticket.goalId !== goal.id || ticket.stepStatus === "in_progress" || actedTicketIds.has(ticket.id)) continue;
    actedTicketIds.add(ticket.id);
    const current = stepMap.get(ticket.currentStepId);
    if (!current) continue;
    if ((action.action === "run" || action.action === "retry" || action.action === "move") && !dependenciesComplete(ticket, steps)) {
      ticket.status = "blocked";
      ticket.updatedAt = now();
      continue;
    }
    if (action.action === "block") {
      ticket.stepStatus = "blocked"; ticket.status = "blocked"; ticket.technicalNotes.push(`Orchestrator: ${action.reason}`); ticket.updatedAt = now();
      broadcastTicketStep(goal, ticket, WORKFLOW_EVENTS.ticketStepBlocked, { reason: action.reason });
      continue;
    }
    if (action.action === "complete") {
      if (!current.isTerminal) continue;
      ticket.stepStatus = "completed"; ticket.status = "completed"; ticket.completedAt = now(); ticket.updatedAt = now();
      broadcastTicketStep(goal, ticket, WORKFLOW_EVENTS.ticketCompleted, { reason: action.reason });
      continue;
    }
    if (action.action === "move") {
      const target = stepMap.get(action.targetStepId);
      if (!target || (!current.allowedNextStepIds.includes(target.id) && !current.allowedPreviousStepIds.includes(target.id))) continue;
      if (!target.isTerminal && capacity <= 0) continue;
      ticket.currentStepId = target.id; ticket.stepStatus = null; ticket.status = target.isTerminal ? "completed" : "ready"; ticket.updatedAt = now();
      if (target.isTerminal) { ticket.stepStatus = "completed"; ticket.completedAt = now(); }
      broadcastTicketStep(goal, ticket, WORKFLOW_EVENTS.ticketStepChanged, { fromStepId: current.id, toStepId: target.id, reason: action.reason });
      if (target.isTerminal) continue;
    } else if (action.action !== "run" && action.action !== "retry") {
      continue;
    }
    if (capacity <= 0) continue;
    const profile = resolveActionAgent(goal, ticket, action, busyAgentIds);
    if (!profile) continue;
    capacity--; busyAgentIds.add(profile.id);
    void executeTicketStep(goal, ticket, stepMap.get(ticket.currentStepId)!, profile);
  }
  markDirty();
}

function resolveActionAgent(goal: Goal, ticket: Ticket, action: z.infer<typeof decisionActionSchema>, busyAgentIds: Set<string>): AgentProfile | undefined {
  const store = getStore();
  const assigned = ticket.assignedAgentId ? store.agents.get(ticket.assignedAgentId) : undefined;
  if (assigned?.role === "worker" && assigned.enabled && !busyAgentIds.has(assigned.id)) return assigned;
  ticket.requestedAgentName = action.agentName || ticket.requestedAgentName;
  ticket.requestedProvider = action.provider || ticket.requestedProvider;
  ticket.requestedModel = action.model || ticket.requestedModel;
  if (!ticket.assignedAgentId) return createManagerDelegatedWorker(goal, ticket);
  const requested = action.agentId ? store.agents.get(action.agentId) : undefined;
  if (requested?.role === "worker" && requested.enabled && !busyAgentIds.has(requested.id)) return requested;
  const profiles = [...store.agents.values()];
  const matching = selectAgentForTicket(profiles.filter((profile) =>
    (!action.provider || profile.provider === action.provider) && (!action.model || profile.model === action.model)), busyAgentIds);
  if (matching) return matching;
  return createManagerDelegatedWorker(goal, ticket);
}

function finishGoalIfComplete(goal: Goal, steps: BoardStep[]): void {
  const store = getStore();
  const terminalIds = new Set(steps.filter((step) => step.isTerminal).map((step) => step.id));
  const tickets = [...store.tickets.values()].filter((ticket) => ticket.goalId === goal.id);
  if (!tickets.length || !tickets.every((ticket) => terminalIds.has(ticket.currentStepId) && ticket.stepStatus === "completed")) return;
  goal.status = "completed"; goal.completedAt = now(); goal.updatedAt = now(); markDirty();
  broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, type: WORKFLOW_EVENTS.goalCompleted, payload: { status: goal.status }, sequence: 0, occurredAt: now() });
}

function broadcastTicketStep(goal: Goal, ticket: Ticket, type: string, payload: Record<string, unknown>): void {
  broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, ticketId: ticket.id, type, payload: { currentStepId: ticket.currentStepId, stepStatus: ticket.stepStatus, ...payload }, sequence: 0, occurredAt: now() });
}

/** Reconcile persisted runs with the harness processes before resuming a goal. */
export function recoverInterruptedGoal(goal: Goal): number {
  const store = getStore();
  let recovered = 0;
  for (const run of store.agentRuns.values()) {
    if (run.goalId !== goal.id) continue;
    const agent = getAgent(run.provider);
    if (!isInterruptedRun(run, new Set(agent?.getActiveSessionIds() || []))) continue;

    run.status = "aborted";
    run.error = "Recovered after the agent process was interrupted";
    run.completedAt = now();
    const ticket = store.tickets.get(run.ticketId);
    if (ticket && (ticket.status === "in_progress" || ticket.status === "review")) {
      ticket.status = run.kind === "step" ? "failed" : "ready";
      if (run.kind === "step") {
        ticket.stepStatus = "failed";
        const execution = ticket.stepHistory?.find((item) => item.agentRunId === run.id);
        if (execution) { execution.status = "failed"; execution.error = run.error; execution.completedAt = run.completedAt; }
      }
      ticket.assignedAgentId = undefined;
      ticket.updatedAt = now();
    }
    recovered++;
  }
  if (recovered > 0) markDirty();
  return recovered;
}

function createManagerDelegatedWorker(goal: Goal, ticket: Ticket): AgentProfile {
  const store = getStore();
  const manager = store.agents.get(goal.managerAgentId);
  if (!manager) throw new Error("Goal manager not found");
  const timestamp = now();
  const worker: AgentProfile = {
    ...manager, id: createId(), role: "worker",
    name: ticket.requestedAgentName?.trim() || `${ticket.title} ${ticket.type} agent`,
    provider: ticket.requestedProvider || manager.provider,
    model: ticket.requestedModel || manager.model,
    description: `Delegated to ${ticket.title} for goal ${goal.id}`,
    systemPrompt: DELEGATED_WORKER_SYSTEM_INSTRUCTIONS,
    permissionMode: "acceptEdits",
    createdAt: timestamp, updatedAt: timestamp,
  };
  store.agents.set(worker.id, worker); markDirty();
  broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, agentId: worker.id, type: WORKFLOW_EVENTS.agentCreated, payload: worker, sequence: 0, occurredAt: timestamp });
  return worker;
}

async function executeTicketStep(goal: Goal, ticket: Ticket, step: BoardStep, profile: AgentProfile): Promise<void> {
  const store = getStore();
  const project = store.projects.get(goal.projectId);
  const agent = getAgent(profile.provider);
  if (!project || !agent || step.isTerminal || ticket.stepStatus === "in_progress") return;

  const branch = createBranchName(goal.id, ticket.id);
  const directExecution = project.executionMode !== "worktree";
  const wtResult = directExecution
    ? { ok: true, output: project.location }
    : ticket.worktreePath
      ? { ok: true, output: ticket.worktreePath }
      : await createWorktree(project.location, project.baseBranch, goal.id, ticket.id);
  if (!wtResult.ok) {
    ticket.stepStatus = "failed"; ticket.status = "failed"; ticket.updatedAt = now();
    ticket.technicalNotes.push(`Worktree setup failed: ${wtResult.error || "unknown git error"}`); markDirty();
    broadcastTicketStep(goal, ticket, WORKFLOW_EVENTS.ticketStepFailed, { error: ticket.technicalNotes.at(-1) });
    setImmediate(() => void scheduleAndExecute(goal));
    return;
  }
  const executionPath = directExecution ? project.location : wtResult.output;
  ticket.worktreePath = executionPath;
  ticket.branchName = directExecution ? project.baseBranch : branch;
  ticket.stepStatus = "in_progress"; ticket.status = "in_progress"; ticket.assignedAgentId = profile.id;
  ticket.startedAt ||= now(); ticket.updatedAt = now();

  const run: AgentRun = {
    id: createId(), goalId: goal.id, ticketId: ticket.id, stepId: step.id, kind: "step",
    agentProfileId: profile.id, provider: profile.provider, model: profile.model, status: "running",
    worktreePath: executionPath, branchName: ticket.branchName, startedAt: now(),
  };
  run.sessionId = `${ticket.id}-${step.id}-${run.id}`;
  const execution: TicketStepExecution = {
    id: createId(), stepId: step.id, status: "in_progress", agentRunId: run.id,
    agentProfileId: profile.id, startedAt: run.startedAt,
  };
  ticket.stepHistory.push(execution); store.agentRuns.set(run.id, run); markDirty();
  broadcastTicketStep(goal, ticket, WORKFLOW_EVENTS.ticketStepStarted, { runId: run.id, agentProfileId: profile.id });

  try {
    const result = await agent.run({
      requestId: run.id, cwd: executionPath, provider: profile.provider, sessionId: run.sessionId,
      model: profile.model, permissionMode: profile.permissionMode,
      readOnly: false,
      systemPrompt: buildAgentSystemPrompt(goal, project, profile),
      prompt: buildStepExecutionPrompt(ticket, step),
    }, (payload) => broadcastAgentStream(payload, { runId: run.id, goalId: goal.id, ticketId: ticket.id, stepId: step.id, agentProfileId: profile.id }));
    run.output = result.output; run.error = result.error; run.completedAt = now();
    if (result.success) {
      if (!directExecution) {
        const commit = await commitChanges(executionPath, `${step.name.toLowerCase()}: ${ticket.title}\n\nTicket ${ticket.id}`);
        if (!commit.ok) throw new Error(`Commit failed: ${commit.error || "unknown error"}`);
      }
      run.status = "completed"; execution.status = "completed"; execution.output = result.output;
      ticket.stepStatus = "completed"; ticket.status = "review"; ticket.updatedAt = now(); execution.completedAt = run.completedAt;
      broadcastTicketStep(goal, ticket, WORKFLOW_EVENTS.ticketStepCompleted, { runId: run.id, output: result.output.slice(0, 2000) });
      advanceTicketAfterSuccessfulStep(goal, ticket, step);
    } else {
      throw new Error(result.error || "Agent step failed");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    run.status = "failed"; run.error = message; run.completedAt = now();
    execution.status = "failed"; execution.error = message; execution.completedAt = run.completedAt;
    ticket.stepStatus = "failed"; ticket.status = "failed"; ticket.retryCount++; ticket.updatedAt = now();
    broadcastTicketStep(goal, ticket, WORKFLOW_EVENTS.ticketStepFailed, { runId: run.id, error: message });
  }
  markDirty();
  setImmediate(() => { const updated = store.goals.get(goal.id); if (updated?.status === "running") void scheduleAndExecute(updated); });
}

function advanceTicketAfterSuccessfulStep(goal: Goal, ticket: Ticket, step: BoardStep): void {
  if (step.allowedNextStepIds.length !== 1) return;
  const store = getStore();
  const next = store.boardSteps.get(step.allowedNextStepIds[0]!);
  if (!next) return;
  const fromStepId = ticket.currentStepId;
  ticket.currentStepId = next.id;
  ticket.updatedAt = now();
  if (next.isTerminal) {
    ticket.stepStatus = "completed";
    ticket.status = "completed";
    ticket.completedAt = ticket.updatedAt;
  } else {
    ticket.stepStatus = null;
    ticket.status = "ready";
  }
  broadcastTicketStep(goal, ticket, WORKFLOW_EVENTS.ticketStepChanged, {
    fromStepId,
    toStepId: next.id,
    reason: `Worker completed ${step.name}`,
  });
  if (next.isTerminal) {
    broadcastTicketStep(goal, ticket, WORKFLOW_EVENTS.ticketCompleted, { reason: "Completed every workflow step" });
    syncDependencyStatuses(goal, ensureSeedSteps());
    finishGoalIfComplete(goal, ensureSeedSteps());
  }
}
