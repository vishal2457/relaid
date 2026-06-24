import type { AgentProfile, AgentRun } from "../models/domain.js";

type SchedulableAgent = Pick<AgentProfile, "id" | "role" | "enabled">;

export function selectAgentForTicket<T extends SchedulableAgent>(agents: T[], busyAgentIds: Set<string>): T | undefined {
  return agents.find((agent) => agent.role === "worker" && agent.enabled && !busyAgentIds.has(agent.id));
}

type RecoverableRun = Pick<AgentRun, "status" | "sessionId" | "ticketId">;

export function isInterruptedRun(run: RecoverableRun, activeSessionIds: Set<string>): boolean {
  if (run.status !== "starting" && run.status !== "running") return false;
  return !activeSessionIds.has(run.sessionId || run.ticketId);
}
