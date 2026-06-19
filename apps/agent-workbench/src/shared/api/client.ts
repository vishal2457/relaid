import type { Project, Goal, Ticket, AgentRun, ExecutionEvent } from "../../models/domain";

const API_BASE = "/api";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// Project API
export async function listProjects(): Promise<Project[]> {
  return request("/projects");
}

export async function createProject(data: Partial<Project>): Promise<Project> {
  return request("/projects", { method: "POST", body: JSON.stringify(data) });
}

export async function getProject(id: string): Promise<Project> {
  return request(`/projects/${id}`);
}

// Goal API
export async function createGoal(data: Partial<Goal>): Promise<Goal> {
  return request("/goals", { method: "POST", body: JSON.stringify(data) });
}

export async function getGoal(id: string): Promise<Goal> {
  return request(`/goals/${id}`);
}

export async function updateGoalStatus(id: string, status: string): Promise<Goal> {
  return request(`/goals/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

// Ticket API
export async function listTickets(goalId: string): Promise<Ticket[]> {
  return request(`/goals/${goalId}/tickets`);
}

export async function getTicket(goalId: string, ticketId: string): Promise<Ticket> {
  return request(`/goals/${goalId}/tickets/${ticketId}`);
}

export async function createTickets(goalId: string, tickets: Partial<Ticket>[]): Promise<Ticket[]> {
  return request(`/goals/${goalId}/tickets`, {
    method: "POST",
    body: JSON.stringify({ tickets }),
  });
}

export async function updateTicketStatus(
  goalId: string,
  ticketId: string,
  status: string,
): Promise<Ticket> {
  return request(`/goals/${goalId}/tickets/${ticketId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

// Execution API
export async function startExecution(goalId: string, config: {
  maxAgents: number;
  provider: "claude" | "codex";
  maxRetries: number;
  autoRetry: boolean;
  autoMerge: boolean;
  requireReview: boolean;
}): Promise<{ goalId: string; status: string }> {
  return request(`/goals/${goalId}/execute`, {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function pauseExecution(goalId: string): Promise<void> {
  return request(`/goals/${goalId}/pause`, { method: "POST" });
}

export async function resumeExecution(goalId: string): Promise<void> {
  return request(`/goals/${goalId}/resume`, { method: "POST" });
}

export async function cancelExecution(goalId: string): Promise<void> {
  return request(`/goals/${goalId}/cancel`, { method: "POST" });
}

// Agent API
export async function listAgentRuns(goalId: string): Promise<AgentRun[]> {
  return request(`/goals/${goalId}/agents`);
}

// Events
export function connectSse(): EventSource {
  return new EventSource(`${API_BASE}/sse/stream`);
}
