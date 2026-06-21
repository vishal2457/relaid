import type { Ticket, Goal, AgentRun } from "../models/domain.js";
import { validateTicketTransition } from "../models/domain.js";
import { getStore, createId, now, markDirty } from "../server/store.js";
import { broadcastOrchestration } from "../server/sse-orchestration.js";
import {
  createWorktree,
  commitChanges,
  getDiff,
  removeWorktree,
  createBranchName,
  createWorktreePath,
} from "../git/worktree.js";
import type { SsePayload } from "../events/event-types.js";
import type { ClaudeAgent } from "../agents/claude-agent.js";
import type { CodexAgent } from "../agents/codex-agent.js";
import type { OpencodeAgent } from "../agents/opencode-agent.js";
import { broadcast } from "../server/sse-bus.js";

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

// Checks if all dependencies of a ticket are completed
function isTicketReady(ticket: Ticket, allTickets: Map<string, Ticket>): boolean {
  if (ticket.status !== "ready" && ticket.status !== "backlog") return false;
  return ticket.dependencyIds.every(depId => {
    const dep = allTickets.get(depId);
    return dep?.status === "completed";
  });
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

  // Auto-advance ready tickets from backlog
  for (const ticket of goalTickets) {
    if (ticket.status === "backlog" && isTicketReady(ticket, store.tickets)) {
      ticket.status = "ready";
      ticket.updatedAt = now();
      markDirty();
      broadcastOrchestration({
        id: createId(), projectId: goal.projectId, goalId: goal.id, ticketId: ticket.id,
        type: "ticket.status_changed", payload: { status: "ready" }, sequence: 0, occurredAt: now(),
      });
    }
  }

  const ready = goalTickets.filter(t => isTicketReady(t, store.tickets));
  if (ready.length === 0) {
    // Check if all tickets done
    const allDone = goalTickets.every(t => t.status === "completed" || t.status === "cancelled" || t.status === "failed");
    if (allDone && goal.status === "running") {
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

  for (const ticket of toStart) {
    await executeTicket(goal, ticket);
  }
}

async function executeTicket(goal: Goal, ticket: Ticket): Promise<void> {
  const store = getStore();
  const provider = goal.provider;

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

  const wtResult = await createWorktree(
    project.location,
    project.baseBranch,
    goal.id,
    ticket.id,
  );

  if (!wtResult.ok) {
    ticket.status = "failed";
    ticket.updatedAt = now();
    markDirty();
    broadcastOrchestration({
      id: createId(), projectId: goal.projectId, goalId: goal.id, ticketId: ticket.id,
      type: "ticket.status_changed", payload: { status: "failed", reason: wtResult.error },
      sequence: 0, occurredAt: now(),
    });
    return;
  }

  ticket.worktreePath = wtPath;
  ticket.branchName = branch;
  markDirty();

  // Create agent run record
  const agentRun: AgentRun = {
    id: createId(),
    goalId: goal.id,
    ticketId: ticket.id,
    provider,
    status: "running",
    worktreePath: wtPath,
    branchName: branch,
    startedAt: now(),
  };
  ticket.assignedAgentId = agentRun.id;
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
  const testCmd = project.testCommand || "npm test";

  try {
    let result;
    const broadcastFn = (payload: SsePayload) => {
      broadcast(payload);
    };

    if (provider === "claude") {
      result = await (agent as ClaudeAgent).run({
        requestId: agentRun.id,
        cwd: wtPath,
        provider: "claude",
        sessionId: ticket.id,
        prompt,
        systemPrompt: buildSystemPrompt(goal, project),
      }, broadcastFn);
    } else if (provider === "codex") {
      result = await (agent as CodexAgent).run({
        requestId: agentRun.id,
        cwd: wtPath,
        provider: "codex",
        sessionId: ticket.id,
        prompt,
      }, broadcastFn);
    } else {
      // opencode
      result = await (agent as OpencodeAgent).run({
        requestId: agentRun.id,
        cwd: wtPath,
        provider: "opencode",
        sessionId: ticket.id,
        prompt: prompt + "\n\n" + buildSystemPrompt(goal, project),
      }, broadcastFn);
    }

    agentRun.output = result.output;
    agentRun.completedAt = now();

    if (result.success) {
      // TDD: commit changes
      const commitResult = await commitChanges(wtPath, `feat: ${ticket.title}\n\nCloses #${ticket.id}`);
      if (commitResult.ok) {
        const diffResult = getDiff(wtPath);
        agentRun.status = "completed";

        ticket.status = "review";
        ticket.updatedAt = now();
        markDirty();

        broadcastOrchestration({
          id: createId(), projectId: goal.projectId, goalId: goal.id,
          ticketId: ticket.id, agentId: agentRun.id,
          type: "ticket.status_changed",
          payload: { status: ticket.status, diff: diffResult.output },
          sequence: 0, occurredAt: now(),
        });

        // Auto-approve if review not required
        if (!goal.requireReview) {
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

function buildSystemPrompt(goal: Goal, project: Project): string {
  return `You are a coding agent working on: ${goal.title}

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

import type { Project } from "../models/domain.js";
