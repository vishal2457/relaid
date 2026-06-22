import type {
  Project,
  Goal,
  Ticket,
  AgentRun,
  Harness,
  OrchestrationEvent,
  AgentProfile,
  AgentStreamEvent,
  AgentStreamEventType,
} from "../types";

const API_BASE = import.meta.env.VITE_AGENT_SERVER_URL || "http://localhost:3090";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

export const api = {
  projects: {
    list: () => fetchJson<Project[]>("/api/projects"),
    get: (id: string) => fetchJson<Project>(`/api/projects/${id}`),
    create: (data: {
      name: string;
      location: string;
      description?: string;
      techPreferences?: string[];
      baseBranch?: string;
      executionMode?: "direct" | "worktree";
      testCommand?: string;
      lintCommand?: string;
      typeCheckCommand?: string;
      buildCommand?: string;
    }) =>
      fetchJson<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ ...data, techPreferences: data.techPreferences || [], baseBranch: data.baseBranch || "main", executionMode: data.executionMode || "direct" }),
      }),
    update: (id: string, data: Partial<Pick<Project, "name" | "location" | "description" | "techPreferences" | "baseBranch" | "executionMode" | "testCommand" | "lintCommand" | "typeCheckCommand" | "buildCommand">>) =>
      fetchJson<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },

  goals: {
    list: () => fetchJson<Goal[]>("/api/goals"),
    get: (id: string) => fetchJson<Goal>(`/api/goals/${id}`),
    create: (data: {
      projectId: string;
      title: string;
      description?: string;
      maxAgents?: number;
      constraints?: string[];
      acceptanceCriteria?: string[];
      relevantFiles?: string[];
      technicalInstructions?: string;
      outOfScopeItems?: string[];
      maxRetries?: number;
      autoRetry?: boolean;
      autoMerge?: boolean;
      requireReview?: boolean;
    }) =>
      fetchJson<Goal>("/api/goals", {
        method: "POST",
        body: JSON.stringify({
          projectId: data.projectId,
          title: data.title,
          description: data.description || "",
          constraints: data.constraints || [],
          acceptanceCriteria: data.acceptanceCriteria || [],
          relevantFiles: data.relevantFiles || [],
          technicalInstructions: data.technicalInstructions,
          outOfScopeItems: data.outOfScopeItems || [],
          maxAgents: data.maxAgents ?? 3,
          maxRetries: data.maxRetries ?? 3,
          autoRetry: data.autoRetry ?? true,
          autoMerge: data.autoMerge ?? false,
          requireReview: data.requireReview ?? true,
        }),
      }),
    updateStatus: (id: string, status: string) =>
      fetchJson<Goal>(`/api/goals/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    execute: (id: string, overrides?: {
      maxAgents?: number;
      maxRetries?: number;
      autoRetry?: boolean;
      autoMerge?: boolean;
      requireReview?: boolean;
    }) =>
      fetchJson<{ goalId: string; status: string }>(`/api/goals/${id}/execute`, {
        method: "POST",
        body: JSON.stringify(overrides || {}),
      }),
    pause: (id: string) =>
      fetchJson<{ status: string }>(`/api/goals/${id}/pause`, { method: "POST" }),
    resume: (id: string) =>
      fetchJson<{ status: string }>(`/api/goals/${id}/resume`, { method: "POST" }),
    cancel: (id: string) =>
      fetchJson<{ status: string }>(`/api/goals/${id}/cancel`, { method: "POST" }),
    reset: (id: string) =>
      fetchJson<Goal>(`/api/goals/${id}/reset`, { method: "POST" }),
    tickets: {
      list: (goalId: string) => fetchJson<Ticket[]>(`/api/goals/${goalId}/tickets`),
      updateStatus: (goalId: string, ticketId: string, status: string) =>
        fetchJson<Ticket>(`/api/goals/${goalId}/tickets/${ticketId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }),
    },
    agents: {
      list: (goalId: string) => fetchJson<AgentRun[]>(`/api/goals/${goalId}/agents`),
    },
  },

  harnesses: {
    list: () => fetchJson<{ harnesses: Harness[] }>("/api/harnesses"),
  },

  agents: {
    list: () => fetchJson<AgentProfile[]>("/api/agents"),
    create: (data: Omit<AgentProfile, "id" | "role" | "createdAt" | "updatedAt">) =>
      fetchJson<AgentProfile>("/api/agents", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<AgentProfile>) =>
      fetchJson<AgentProfile>(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => fetch(`${API_BASE}/api/agents/${id}`, { method: "DELETE" }),
  },

  orchestrator: {
    get: () => fetchJson<AgentProfile>("/api/orchestrator"),
    update: (data: Partial<Pick<AgentProfile, "name" | "provider" | "model" | "systemPrompt" | "permissionMode" | "enabled">>) =>
      fetchJson<AgentProfile>("/api/orchestrator", { method: "PUT", body: JSON.stringify(data) }),
  },

  agent: {
    run: (data: {
      requestId: string;
      cwd: string;
      provider: string;
      sessionId?: string;
      prompt: string;
      systemPrompt?: string;
      model?: string;
      permissionMode?: string;
    }) =>
      fetchJson<{ success: boolean; output: string; error?: string; exitCode: number; durationMs: number; sessionId: string }>(
        "/api/agent/run",
        { method: "POST", body: JSON.stringify(data) }
      ),
    abort: (sessionId: string, provider: string) =>
      fetchJson<{ aborted: boolean }>("/api/agent/abort", {
        method: "POST",
        body: JSON.stringify({ sessionId, provider }),
      }),
    sessions: () =>
      fetchJson<{ sessions: Array<{ id: string; provider: string; cwd: string; title: string; createdAt: number; updatedAt: number; status: string }> }>(
        "/api/agent/sessions"
      ),
  },
};

export function connectSse(
  onEvent: (event: OrchestrationEvent) => void,
  onAgentEvent?: (event: AgentStreamEvent) => void,
): () => void {
  const eventSource = new EventSource(`${API_BASE}/api/sse/stream`);

  const handler = (e: MessageEvent) => {
    try {
      const payload: OrchestrationEvent = JSON.parse(e.data);
      onEvent(payload);
    } catch {
      // ignore unparseable events
    }
  };

  const orchestrationTypes = [
    "orchestration:project.created",
    "orchestration:goal.created",
    "orchestration:goal.status_changed",
    "orchestration:goal.execution_started",
    "orchestration:goal.paused",
    "orchestration:goal.resumed",
    "orchestration:goal.cancelled",
    "orchestration:goal.tickets_created",
    "orchestration:goal.completed",
    "orchestration:goal.failed",
    "orchestration:ticket.status_changed",
    "orchestration:agent.started",
    "orchestration:agent.created",
    "orchestration:orchestrator.updated",
    "orchestration:ticket.failed",
    "orchestration:ticket.review_rejected",
    "orchestration:manager.review_started",
  ];

  orchestrationTypes.forEach((type) => {
    eventSource.addEventListener(type, handler);
  });

  const agentEventTypes: AgentStreamEventType[] = [
    "text_delta",
    "reasoning_delta",
    "tool_use",
    "tool_result",
    "permission_request",
    "status",
    "turn_complete",
    "error",
  ];
  for (const provider of ["codex", "opencode"] as const) {
    for (const type of agentEventTypes) {
      eventSource.addEventListener(`${provider}:${type}`, (event) => {
        if (!onAgentEvent) return;
        try {
          onAgentEvent({
            provider,
            type,
            data: JSON.parse((event as MessageEvent).data),
            receivedAt: new Date().toISOString(),
          });
        } catch {
          // Ignore malformed stream events while leaving the connection active.
        }
      });
    }
  }

  eventSource.onerror = () => {
    // EventSource auto-reconnects, no action needed
  };

  return () => eventSource.close();
}
