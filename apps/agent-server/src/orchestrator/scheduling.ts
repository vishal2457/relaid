import type { AgentProfile, AgentRun, Ticket } from "../models/domain.js";

export function resolveDependencyStatus(ticket: Ticket, tickets: Map<string, Ticket>) {
  const blockingTicketIds: string[] = [];
  const invalidDependencyIds: string[] = [];
  for (const id of ticket.dependencyIds) {
    const dependency = tickets.get(id);
    if (!dependency || dependency.goalId !== ticket.goalId) invalidDependencyIds.push(id);
    // Review is a speculative handoff point. Downstream work can start while the
    // manager reviews, and the scheduler will abort it if that review is rejected.
    else if (dependency.status !== "review" && dependency.status !== "completed") blockingTicketIds.push(id);
  }
  return {
    ready: blockingTicketIds.length === 0 && invalidDependencyIds.length === 0,
    blockingTicketIds,
    invalidDependencyIds,
  };
}

type SchedulableAgent = Pick<AgentProfile, "id" | "role" | "enabled">;

export function selectAgentForTicket<T extends SchedulableAgent>(agents: T[], busyAgentIds: Set<string>): T | undefined {
  return agents.find((agent) => agent.role === "worker" && agent.enabled && !busyAgentIds.has(agent.id));
}

type RecoverableRun = Pick<AgentRun, "status" | "sessionId" | "ticketId">;

export function isInterruptedRun(run: RecoverableRun, activeSessionIds: Set<string>): boolean {
  if (run.status !== "starting" && run.status !== "running") return false;
  return !activeSessionIds.has(run.sessionId || run.ticketId);
}
