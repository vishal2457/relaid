import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Ticket, Goal, AgentRun, AgentProfile, Project } from "../models/domain.js";
import { validateTicketTransition } from "../models/domain.js";
import { getStore, createId, now, markDirty } from "../server/store.js";
import { broadcastOrchestration } from "../server/sse-orchestration.js";
import {
  createWorktree,
  commitChanges,
  getDiff,
  createBranchName,
  createWorktreePath,
  ensureGitRepository,
} from "../git/worktree.js";
import { isInterruptedRun, resolveDependencyStatus, selectAgentForTicket } from "./scheduling.js";
import type { AgentStreamContext, SsePayload } from "../events/event-types.js";
import type { ClaudeAgent } from "../agents/claude-agent.js";
import type { CodexAgent } from "../agents/codex-agent.js";
import type { OpencodeAgent } from "../agents/opencode-agent.js";
import { broadcast } from "../server/sse-bus.js";
import { detectHarnesses } from "../server/routes/harnesses.js";

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
  agentName: z.string().default(""),
  provider: z.enum(["claude", "codex", "opencode"]).optional(),
  model: z.string().optional(),
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
          "verificationCommands", "agentName", "provider", "model",
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
          agentName: { type: "string" },
          provider: { type: "string", enum: ["claude", "codex", "opencode"] },
          model: { type: "string" },
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
  const manager = store.agents.get(goal.managerAgentId);
  const agent = manager ? getAgent(manager.provider) : null;
  if (!project || !manager || !agent) {
    failPlanning(goal, "Project, orchestrator, or harness is unavailable"); return;
  }
  const git = await ensureGitRepository(project.location, project.baseBranch);
  if (!git.ok) {
    failPlanning(goal, `Could not initialize project repository: ${git.error}`); return;
  }
  const verification = [project.testCommand, project.lintCommand, project.typeCheckCommand, project.buildCommand].filter(Boolean).join("\n") || "Infer the repository's real test and type-check commands.";
  const harnesses = detectHarnesses().filter((harness) => harness.available && harness.models.length > 0);
  const harnessCatalog = harnesses.map((harness) => `${harness.id}: ${harness.models.join(", ")}`).join("\n");
  let planningOutput = "";
  try {
    const result = await agent.run({
      requestId: `plan-${goal.id}`, cwd: project.location, provider: manager.provider,
      sessionId: `plan-${goal.id}`, model: manager.model, permissionMode: "plan",
      outputSchema: ticketPlanOutputSchema,
      systemPrompt: `${manager.systemPrompt}\n\nYou are the only orchestrator. Inspect the repository without editing it. Produce the complete execution plan as valid JSON only.`,
      prompt: `Plan this goal into small dependency-aware tickets. Prioritize useful parallel work and keep dependencies only where an actual review gate is required. A dependent ticket may begin when its dependency enters review; it will be stopped automatically if that review fails. Every implementation ticket must require a failing test first and every ticket must have concrete verification commands.\n\nAvailable harnesses and models:\n${harnessCatalog || "No available harnesses were detected; omit provider and model."}\n\nChoose the best available provider and model for every ticket and give its agent a short, meaningful role-based name (for example, API Contract Reviewer or Mobile Auth Engineer).\n\nGoal: ${goal.title}\n${goal.description}\n\nAcceptance criteria:\n${goal.acceptanceCriteria.join("\n") || "Infer them from the goal."}\n\nConstraints:\n${goal.constraints.join("\n") || "None"}\n\nProject verification commands:\n${verification}\n\nReturn a JSON object with a tickets array. Each item must contain: key, title, description, type, priority, acceptanceCriteria, technicalNotes, relevantFiles, dependencyKeys, testPlan, verificationCommands, agentName, provider, model. All list fields must be JSON arrays, even when they contain one item. dependencyKeys must reference keys in the same array.`,
    }, (payload) => broadcastAgentStream(payload, {
      runId: `plan-${goal.id}`,
      goalId: goal.id,
      agentProfileId: manager.id,
    }));
    planningOutput = result.output;
    if (!result.success) throw new Error(result.error || "Orchestrator planning failed");
    let plan: z.infer<typeof plannedTicketSchema>[];
    try {
      plan = await parseTicketPlanWithArtifact(result.output, project.location);
    } catch (firstError) {
      const validationMessage = firstError instanceof Error ? firstError.message : String(firstError);
      const retry = await agent.run({
        requestId: `plan-${goal.id}-repair`, cwd: project.location, provider: manager.provider,
        sessionId: `plan-${goal.id}-repair`, model: manager.model, permissionMode: "plan",
        outputSchema: ticketPlanOutputSchema,
        systemPrompt: `${manager.systemPrompt}\n\nYour response is machine-consumed. Return only JSON matching the supplied schema, with no Markdown or commentary.`,
        prompt: `Regenerate the complete ticket plan for this goal. The previous response failed validation with: ${validationMessage}\n\nGoal: ${goal.title}\n${goal.description}\n\nAcceptance criteria:\n${goal.acceptanceCriteria.join("\n") || "Infer them from the goal."}\n\nConstraints:\n${goal.constraints.join("\n") || "None"}\n\nAvailable harnesses and models:\n${harnessCatalog || "No available harnesses were detected."}\n\nProject verification commands:\n${verification}`,
      }, (payload) => broadcastAgentStream(payload, {
        runId: `plan-${goal.id}`,
        goalId: goal.id,
        agentProfileId: manager.id,
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
    const availableModels = new Map(harnesses.map((harness) => [harness.id, new Set(harness.models)]));
    for (const item of plan) {
      if (!item.provider || !item.model) continue;
      if (!availableModels.get(item.provider)?.has(item.model)) {
        throw new Error(`Orchestrator selected unavailable harness/model for ${item.key}: ${item.provider}/${item.model}`);
      }
    }
    const timestamp = now();
    const ids = new Map(plan.map((ticket) => [ticket.key, createId()]));
    for (const item of plan) {
      const id = ids.get(item.key)!;
      const dependencyIds = item.dependencyKeys.map((key) => ids.get(key)!);
      const ticket: Ticket = {
        id, projectId: goal.projectId, goalId: goal.id, title: item.title, description: item.description,
        type: item.type, status: dependencyIds.length ? "blocked" : "ready", priority: item.priority,
        acceptanceCriteria: item.acceptanceCriteria, technicalNotes: item.technicalNotes,
        relevantFiles: item.relevantFiles, dependencyIds, blockingTicketIds: [...dependencyIds],
        requestedAgentName: item.agentName.trim() || `${item.title} ${item.type} agent`,
        requestedProvider: item.provider, requestedModel: item.model,
        testPlan: item.testPlan, verificationCommands: item.verificationCommands,
        retryCount: 0, maximumRetries: goal.maxRetries, createdAt: timestamp, updatedAt: timestamp,
      };
      store.tickets.set(id, ticket); goal.ticketIds.push(id);
    }
    goal.status = "running"; goal.updatedAt = timestamp; markDirty();
    broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, type: "goal.tickets_created", payload: { count: plan.length, source: "orchestrator" }, sequence: 0, occurredAt: timestamp });
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

// Checks if all dependencies of a ticket are completed
function isTicketReady(ticket: Ticket, allTickets: Map<string, Ticket>): boolean {
  if (ticket.status !== "ready" && ticket.status !== "backlog") return false;
  return resolveDependencyStatus(ticket, allTickets).ready;
}

// Sort tickets by priority + dependency impact
function sortTickets(tickets: Ticket[], allTickets: Map<string, Ticket>): Ticket[] {
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  const blockingCount = new Map<string, number>();
  for (const t of tickets) {
    for (const depId of t.dependencyIds) {
      blockingCount.set(depId, (blockingCount.get(depId) ?? 0) + 1);
    }
  }

  return [...tickets].sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 4;
    const pb = priorityOrder[b.priority] ?? 4;
    if (pa !== pb) return pa - pb;

    const ba = blockingCount.get(a.id) ?? 0;
    const bb = blockingCount.get(b.id) ?? 0;
    return bb - ba;
  });
}

export async function scheduleAndExecute(goal: Goal): Promise<void> {
  const store = getStore();
  const goalTickets = [...store.tickets.values()].filter(t => t.goalId === goal.id);

  // Keep dependency flags and board state current before assigning work.
  for (const ticket of goalTickets) {
    if (!["backlog", "ready", "blocked"].includes(ticket.status)) continue;
    const dependency = resolveDependencyStatus(ticket, store.tickets);
    ticket.blockingTicketIds = [...dependency.blockingTicketIds, ...dependency.invalidDependencyIds];
    const nextStatus = dependency.ready ? "ready" : "blocked";
    if (ticket.status !== nextStatus) {
      ticket.status = nextStatus;
      ticket.updatedAt = now();
      markDirty();
      broadcastOrchestration({
        id: createId(), projectId: goal.projectId, goalId: goal.id, ticketId: ticket.id,
        type: "ticket.status_changed", payload: { status: nextStatus, blockingTicketIds: ticket.blockingTicketIds }, sequence: 0, occurredAt: now(),
      });
    }
  }

  const ready = goalTickets.filter(t => isTicketReady(t, store.tickets));
  if (ready.length === 0) {
    // Check if all tickets done
    const allDone = goalTickets.every(t => t.status === "completed" || t.status === "cancelled" || t.status === "failed");
    const terminalFailure = goalTickets.some((ticket) => ticket.status === "failed");
    if ((allDone || terminalFailure) && goal.status === "running") {
      goal.status = "verifying";
      goal.updatedAt = now();
      markDirty();
      broadcastOrchestration({
        id: createId(), projectId: goal.projectId, goalId: goal.id,
        type: "goal.status_changed", payload: { status: "verifying" }, sequence: 0, occurredAt: now(),
      });

      // Auto-verify
      const hasFailures = goalTickets.some(t => t.status === "failed");
      goal.status = hasFailures ? "failed" : "completed";
      goal.lastError = hasFailures ? {
        phase: "execution",
        message: "One or more tickets failed and exhausted their retries.",
        details: goalTickets.filter((ticket) => ticket.status === "failed").map((ticket) => {
          const run = [...store.agentRuns.values()].reverse().find((candidate) => candidate.ticketId === ticket.id && candidate.status === "failed");
          return `${ticket.id} ${ticket.title}: ${run?.error || ticket.technicalNotes.at(-1) || "No agent error was recorded"}`;
        }).join("\n"),
        occurredAt: now(),
      } : undefined;
      goal.completedAt = now();
      goal.updatedAt = now();
      markDirty();
      broadcastOrchestration({
        id: createId(), projectId: goal.projectId, goalId: goal.id,
        type: hasFailures ? "goal.failed" : "goal.completed",
        payload: { status: goal.status },
        sequence: 0, occurredAt: now(),
      });
    }
    return;
  }

  const runningAgents = [...store.agentRuns.values()].filter(
    r => r.goalId === goal.id && (r.status === "starting" || r.status === "running"),
  );

  const available = goal.maxAgents - runningAgents.length;
  if (available <= 0) return;

  const sorted = sortTickets(ready, store.tickets);
  const toStart = sorted.slice(0, available);
  const projectAgents = [...store.agents.values()];
  const busyAgentIds = new Set(runningAgents.map((run) => run.agentProfileId));

  for (const ticket of toStart) {
    let profile = selectAgentForTicket(
      projectAgents.filter((agent) =>
        (!ticket.requestedProvider || agent.provider === ticket.requestedProvider)
        && (!ticket.requestedModel || agent.model === ticket.requestedModel)),
      busyAgentIds,
    );
    if (!profile) {
      profile = createManagerDelegatedWorker(goal, ticket, projectAgents);
      projectAgents.push(profile);
    }
    busyAgentIds.add(profile.id);
    void executeTicket(goal, ticket, profile);
  }
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
      ticket.status = "ready";
      ticket.assignedAgentId = undefined;
      ticket.updatedAt = now();
    }
    recovered++;
  }
  if (recovered > 0) markDirty();
  return recovered;
}

function createManagerDelegatedWorker(goal: Goal, ticket: Ticket, profiles: AgentProfile[]): AgentProfile {
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
    systemPrompt: `${manager.systemPrompt}\n\nYou are a worker delegated by the manager. Implement only your assigned ticket using strict TDD.`,
    createdAt: timestamp, updatedAt: timestamp,
  };
  store.agents.set(worker.id, worker); markDirty();
  broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, agentId: worker.id, type: "agent.created", payload: worker, sequence: 0, occurredAt: timestamp });
  return worker;
}

async function executeTicket(goal: Goal, ticket: Ticket, profile: AgentProfile): Promise<void> {
  const store = getStore();
  const provider = profile.provider;

  const agent = getAgent(provider);
  if (!agent) return;

  // Locate project
  const project = store.projects.get(goal.projectId);
  if (!project) return;

  // Transition ticket to in_progress
  if (!validateTicketTransition(ticket.status, "in_progress")) return;
  ticket.status = "in_progress";
  ticket.startedAt = now();
  ticket.updatedAt = now();
  markDirty();

  broadcastOrchestration({
    id: createId(), projectId: goal.projectId, goalId: goal.id, ticketId: ticket.id,
    type: "ticket.status_changed", payload: { status: ticket.status }, sequence: 0, occurredAt: now(),
  });

  // Create worktree
  const branch = createBranchName(goal.id, ticket.id);
  const wtPath = createWorktreePath(goal.id, ticket.id);
  const directExecution = project.executionMode !== "worktree";
  const executionPath = directExecution ? project.location : wtPath;

  const wtResult = directExecution
    ? { ok: true, output: project.location }
    : ticket.worktreePath
    ? { ok: true, output: ticket.worktreePath }
    : await createWorktree(project.location, project.baseBranch, goal.id, ticket.id);

  if (!wtResult.ok) {
    const reason = `Worktree setup failed: ${wtResult.error || "unknown git error"}`;
    ticket.status = "failed";
    ticket.technicalNotes.push(reason);
    ticket.updatedAt = now();
    markDirty();
    broadcastOrchestration({
      id: createId(), projectId: goal.projectId, goalId: goal.id, ticketId: ticket.id,
      type: "ticket.failed", payload: { status: "failed", error: reason },
      sequence: 0, occurredAt: now(),
    });
    setImmediate(() => {
      const updatedGoal = store.goals.get(goal.id);
      if (updatedGoal?.status === "running") void scheduleAndExecute(updatedGoal);
    });
    return;
  }

  ticket.worktreePath = executionPath;
  ticket.branchName = directExecution ? project.baseBranch : branch;
  markDirty();

  // Create agent run record
  const agentRun: AgentRun = {
    id: createId(),
    goalId: goal.id,
    ticketId: ticket.id,
    agentProfileId: profile.id,
    provider,
    model: profile.model,
    status: "running",
    sessionId: ticket.id,
    worktreePath: executionPath,
    branchName: ticket.branchName,
    startedAt: now(),
  };
  ticket.assignedAgentId = profile.id;
  store.agentRuns.set(agentRun.id, agentRun);
  markDirty();

  broadcastOrchestration({
    id: createId(), projectId: goal.projectId, goalId: goal.id, ticketId: ticket.id,
    agentId: agentRun.id,
    type: "agent.started", payload: { agentId: agentRun.id, ticketId: ticket.id },
    sequence: 0, occurredAt: now(),
  });

  // Build prompt
  const prompt = buildTicketPrompt(ticket, goal, project);
  try {
    let result;
    const broadcastFn = (payload: SsePayload) => broadcastAgentStream(payload, {
      runId: agentRun.id,
      goalId: goal.id,
      ticketId: ticket.id,
      agentProfileId: profile.id,
    });

    if (provider === "claude") {
      result = await (agent as ClaudeAgent).run({
        requestId: agentRun.id,
        cwd: executionPath,
        provider: "claude",
        sessionId: ticket.id,
        prompt,
        systemPrompt: buildSystemPrompt(goal, project, profile),
        model: profile.model,
        permissionMode: profile.permissionMode,
      }, broadcastFn);
    } else if (provider === "codex") {
      result = await (agent as CodexAgent).run({
        requestId: agentRun.id,
        cwd: executionPath,
        provider: "codex",
        sessionId: ticket.id,
        prompt,
        systemPrompt: buildSystemPrompt(goal, project, profile),
        model: profile.model,
      }, broadcastFn);
    } else {
      // opencode
      result = await (agent as OpencodeAgent).run({
        requestId: agentRun.id,
        cwd: executionPath,
        provider: "opencode",
        sessionId: ticket.id,
        prompt,
        systemPrompt: buildSystemPrompt(goal, project, profile),
        model: profile.model,
        permissionMode: profile.permissionMode,
      }, broadcastFn);
    }

    agentRun.output = result.output;
    agentRun.sessionId = result.sessionId;
    agentRun.completedAt = now();

    if (speculativeStops.delete(ticket.id)) {
      agentRun.status = "aborted";
      agentRun.error ||= "Speculative work stopped after a dependency review failed";
      markDirty();
      return;
    }

    if (result.success) {
      const verification = runVerification(ticket, project, executionPath);
      agentRun.output = `${agentRun.output || ""}\n\nVerification:\n${verification.output}`.trim();
      if (!verification.success) {
        throw new Error(verification.error);
      }
      const commitResult = directExecution
        ? { ok: true, output: "Direct execution mode: changes remain in the configured project directory" }
        : await commitChanges(executionPath, `feat: ${ticket.title}\n\nCloses #${ticket.id}`);
      if (commitResult.ok) {
        const diffResult = getDiff(executionPath);
        const changeSummary = diffResult.ok ? diffResult.output : (agentRun.output || commitResult.output);
        agentRun.status = "completed";

        ticket.status = "review";
        ticket.updatedAt = now();
        markDirty();

        broadcastOrchestration({
          id: createId(), projectId: goal.projectId, goalId: goal.id,
          ticketId: ticket.id, agentId: agentRun.id,
          type: "ticket.status_changed",
          payload: { status: ticket.status, diff: changeSummary },
          sequence: 0, occurredAt: now(),
        });

        // Let downstream tickets start while this manager review is running.
        // A rejected review aborts those speculative runs below.
        void scheduleAndExecute(goal);

        const review = goal.requireReview ? await runManagerReview(goal, ticket, project, executionPath, changeSummary) : { approved: true, output: "Review not required" };
        if (speculativeStops.delete(ticket.id)) {
          // An upstream review failed while this ticket was itself being
          // reviewed. Keep it blocked; a fresh run will resume after re-review.
          ticket.status = "blocked";
          ticket.updatedAt = now();
          markDirty();
          return;
        }
        if (review.approved) {
          ticket.status = "completed";
          ticket.completedAt = now();
          ticket.updatedAt = now();
          markDirty();

          broadcastOrchestration({
            id: createId(), projectId: goal.projectId, goalId: goal.id,
            ticketId: ticket.id,
            type: "ticket.status_changed",
            payload: { status: "completed" },
            sequence: 0, occurredAt: now(),
          });
        } else {
          await stopSpeculativeDependents(goal, ticket);
          ticket.technicalNotes.push(`Manager review: ${review.output}`);
          ticket.retryCount++;
          ticket.status = goal.autoRetry && ticket.retryCount <= ticket.maximumRetries ? "ready" : "failed";
          ticket.updatedAt = now();
          markDirty();
          broadcastOrchestration({
            id: createId(), projectId: goal.projectId, goalId: goal.id, ticketId: ticket.id,
            type: "ticket.review_rejected", payload: { status: ticket.status, review: review.output }, sequence: 0, occurredAt: now(),
          });
        }
      } else {
        agentRun.status = "failed";
        agentRun.error = "Commit failed: " + (commitResult.error || "unknown");
        agentRun.status = "failed";

        ticket.status = "failed";
        ticket.updatedAt = now();
        markDirty();
      }
    } else {
      agentRun.status = "failed";
      agentRun.error = result.error || "Agent failed";
      agentRun.status = "failed";

      ticket.status = "failed";
      ticket.retryCount++;
      ticket.updatedAt = now();

      // Auto-retry if configured
      if (goal.autoRetry && ticket.retryCount <= ticket.maximumRetries) {
        ticket.status = "ready";
      }

      markDirty();
      broadcastOrchestration({
        id: createId(), projectId: goal.projectId, goalId: goal.id,
        ticketId: ticket.id, agentId: agentRun.id,
        type: "ticket.failed",
        payload: { status: ticket.status, error: agentRun.error, retryCount: ticket.retryCount },
        sequence: 0, occurredAt: now(),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (speculativeStops.delete(ticket.id)) {
      agentRun.status = "aborted";
      agentRun.error = message;
      agentRun.completedAt = now();
      markDirty();
      return;
    }
    agentRun.status = "failed";
    agentRun.error = message;
    agentRun.completedAt = now();

    ticket.status = "failed";
    ticket.retryCount++;
    ticket.updatedAt = now();
    if (goal.autoRetry && ticket.retryCount <= ticket.maximumRetries) {
      ticket.status = "ready";
    }
    markDirty();

    broadcastOrchestration({
      id: createId(), projectId: goal.projectId, goalId: goal.id,
      ticketId: ticket.id, agentId: agentRun.id,
      type: "ticket.failed",
      payload: { error: message, retryCount: ticket.retryCount },
      sequence: 0, occurredAt: now(),
    });
  }

  // Schedule next round
  setImmediate(() => {
    const updatedGoal = store.goals.get(goal.id);
    if (updatedGoal && updatedGoal.status === "running") {
      scheduleAndExecute(updatedGoal);
    }
  });
}

const speculativeStops = new Set<string>();

async function stopSpeculativeDependents(goal: Goal, rejected: Ticket): Promise<void> {
  const store = getStore();
  const descendants = new Set<string>([rejected.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of store.tickets.values()) {
      if (candidate.goalId !== goal.id || descendants.has(candidate.id)) continue;
      if (candidate.dependencyIds.some((id) => descendants.has(id))) {
        descendants.add(candidate.id);
        changed = true;
      }
    }
  }

  const activeDependents = [...store.tickets.values()].filter((candidate) =>
    descendants.has(candidate.id) && candidate.id !== rejected.id
    && (candidate.status === "in_progress" || candidate.status === "review"));
  for (const dependent of activeDependents) {
    speculativeStops.add(dependent.id);
    const run = [...store.agentRuns.values()].reverse().find((candidate) =>
      candidate.ticketId === dependent.id && (candidate.status === "starting" || candidate.status === "running"));
    if (run) {
      const sessionId = run.agentProfileId === goal.managerAgentId
        ? `review-${dependent.id}-${run.id}`
        : dependent.id;
      await getAgent(run.provider)?.abort(sessionId);
      run.status = "aborted";
      run.error = `Stopped because review failed for dependency ${rejected.title}`;
      run.completedAt = now();
    }
    dependent.status = "blocked";
    dependent.blockingTicketIds = [...new Set([...dependent.blockingTicketIds, rejected.id])];
    dependent.updatedAt = now();
    broadcastOrchestration({
      id: createId(), projectId: goal.projectId, goalId: goal.id, ticketId: dependent.id,
      type: "ticket.speculative_work_stopped",
      payload: { status: "blocked", rejectedDependencyId: rejected.id }, sequence: 0, occurredAt: now(),
    });
  }
  markDirty();
}

function buildTicketPrompt(ticket: Ticket, goal: Goal, project: Project): string {
  return `## Ticket: ${ticket.title}

**Type:** ${ticket.type}
**Priority:** ${ticket.priority}

### Description
${ticket.description}

### Acceptance Criteria
${ticket.acceptanceCriteria.map((ac, i) => `${i + 1}. ${ac}`).join("\n")}

### Relevant Files
${ticket.relevantFiles.length > 0 ? ticket.relevantFiles.join("\n") : "Explore the codebase to find relevant files."}

### Test Plan
${ticket.testPlan.length > 0 ? ticket.testPlan.map((s, i) => `${i + 1}. ${s}`).join("\n") : "Write and run tests to verify the changes."}

### Verification Commands
${ticket.verificationCommands.length > 0 ? ticket.verificationCommands.join("\n") : "Run the project test suite."}

### Instructions
1. Follow strict TDD: write a failing test first, then implement
2. Make minimal changes - do not refactor unrelated code
3. Do not modify files outside the scope of this ticket
4. Do not disable existing tests
5. Do not use --force git operations
6. Summarize your changes when done`;
}

function buildSystemPrompt(goal: Goal, project: Project, profile: AgentProfile): string {
  return `${profile.systemPrompt}\n\nYou are a coding agent working on: ${goal.title}

Project: ${project.name} at ${project.location}
Base branch: ${project.baseBranch}

Goal: ${goal.description}

Follow strict Test-Driven Development:
- RED: Write a failing test that proves the missing behavior
- GREEN: Write the minimum implementation to pass the test
- REFACTOR: Clean up without changing behavior

Run ${project.testCommand || "the test suite"} after each phase.
Run ${project.lintCommand || "the linter"} and ${project.typeCheckCommand || "type checker"} during refactor.

Acceptance Criteria:
${goal.acceptanceCriteria.map((ac, i) => `${i + 1}. ${ac}`).join("\n")}
${goal.technicalInstructions ? `\nTechnical Notes:\n${goal.technicalInstructions}` : ""}
${goal.outOfScopeItems.length > 0 ? `\nDo NOT modify:\n${goal.outOfScopeItems.map(s => `- ${s}`).join("\n")}` : ""}`;
}

function runVerification(ticket: Ticket, project: Project, cwd: string): { success: boolean; output: string; error?: string } {
  const commands = [...ticket.verificationCommands];
  if (commands.length === 0 && project.testCommand) commands.push(project.testCommand);
  if (project.lintCommand) commands.push(project.lintCommand);
  if (project.typeCheckCommand) commands.push(project.typeCheckCommand);
  if (commands.length === 0) return { success: false, output: "", error: "No verification command configured for this ticket or project" };
  const output: string[] = [];
  for (const command of [...new Set(commands)]) {
    try {
      const result = execSync(command, { cwd, encoding: "utf8", timeout: 120_000, maxBuffer: 5 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
      output.push(`$ ${command}\n${result.trim()}`);
    } catch (error) {
      const result = error as { stdout?: string; stderr?: string; message?: string };
      const detail = [result.stdout, result.stderr, result.message].filter(Boolean).join("\n");
      output.push(`$ ${command}\n${detail}`);
      return { success: false, output: output.join("\n\n"), error: `Verification failed: ${command}` };
    }
  }
  return { success: true, output: output.join("\n\n") };
}

async function runManagerReview(goal: Goal, ticket: Ticket, project: Project, cwd: string, diff: string): Promise<{ approved: boolean; output: string }> {
  const store = getStore();
  const manager = store.agents.get(goal.managerAgentId);
  if (!manager) return { approved: false, output: "Manager profile not found" };
  const agent = getAgent(manager.provider);
  if (!agent) return { approved: false, output: "Manager harness not available" };
  const run: AgentRun = {
    id: createId(), goalId: goal.id, ticketId: ticket.id, agentProfileId: manager.id,
    provider: manager.provider, model: manager.model, status: "running", worktreePath: cwd,
    branchName: ticket.branchName || "", startedAt: now(),
  };
  run.sessionId = `review-${ticket.id}-${run.id}`;
  store.agentRuns.set(run.id, run); markDirty();
  broadcastOrchestration({ id: createId(), projectId: goal.projectId, goalId: goal.id, ticketId: ticket.id, agentId: manager.id, type: "manager.review_started", payload: { runId: run.id }, sequence: 0, occurredAt: now() });
  const result = await agent.run({
    requestId: run.id, cwd, provider: manager.provider, sessionId: run.sessionId,
    model: manager.model, permissionMode: "plan",
    systemPrompt: `${manager.systemPrompt}\n\nYou are the goal manager. Review only; do not edit files. Confirm TDD coverage, acceptance criteria, and verification evidence. End with exactly APPROVED or CHANGES_REQUESTED.`,
    prompt: `Review ticket ${ticket.title}.\n\nAcceptance criteria:\n${ticket.acceptanceCriteria.join("\n")}\n\nCommitted diff summary:\n${diff}`,
  }, (payload) => broadcastAgentStream(payload, {
    runId: run.id,
    goalId: goal.id,
    ticketId: ticket.id,
    agentProfileId: manager.id,
  }));
  if (run.status !== "aborted") run.status = result.success ? "completed" : "failed";
  run.output = result.output; run.error ??= result.error; run.completedAt = now(); markDirty();
  const approved = result.success && /\bAPPROVED\b/i.test(result.output) && !/CHANGES[_ ]REQUESTED/i.test(result.output);
  return { approved, output: result.output || result.error || "Manager returned no review decision" };
}
