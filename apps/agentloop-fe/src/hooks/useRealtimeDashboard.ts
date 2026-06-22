import { useState, useEffect, useCallback, useRef } from "react";
import { api, connectSse } from "../lib/api";
import type {
  Project,
  Goal,
  Ticket,
  AgentRun,
  Harness,
  OrchestrationEvent,
  AgentProfile,
  AgentStreamEvent,
} from "../types";

const REFRESH_INTERVAL = 5000;

export function useRealtimeDashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [harnesses, setHarnesses] = useState<Harness[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [orchestrator, setOrchestrator] = useState<AgentProfile | null>(null);
  const [agentStreams, setAgentStreams] = useState<Record<string, AgentStreamEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  const dataVersionRef = useRef(0);

  const fetchAll = useCallback(async () => {
    try {
      const [projs, gls, harn, profiles, manager] = await Promise.all([
        api.projects.list(),
        api.goals.list(),
        api.harnesses.list(),
        api.agents.list(),
        api.orchestrator.get(),
      ]);
      setProjects(projs);
      setGoals(gls);
      setHarnesses(harn.harnesses);
      setAgents(profiles);
      setOrchestrator(manager);

      if (gls.length > 0) {
        const allTickets: Ticket[] = [];
        const allAgentRuns: AgentRun[] = [];
        await Promise.all(
          gls.map(async (goal) => {
            try {
              const [tix, runs] = await Promise.all([
                api.goals.tickets.list(goal.id),
                api.goals.agents.list(goal.id),
              ]);
              allTickets.push(...tix);
              allAgentRuns.push(...runs);
            } catch {
              // skip goals that fail to load
            }
          })
        );
        setTickets(allTickets);
        setAgentRuns(allAgentRuns);
      }

      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [projs, gls, profiles, manager] = await Promise.all([
        api.projects.list(),
        api.goals.list(),
        api.agents.list(),
        api.orchestrator.get(),
      ]);
      setProjects(projs);
      setGoals(gls);
      setAgents(profiles);
      setOrchestrator(manager);

      if (gls.length > 0) {
        const allTickets: Ticket[] = [];
        const allAgentRuns: AgentRun[] = [];
        await Promise.all(
          gls.map(async (goal) => {
            try {
              const [tix, runs] = await Promise.all([
                api.goals.tickets.list(goal.id),
                api.goals.agents.list(goal.id),
              ]);
              allTickets.push(...tix);
              allAgentRuns.push(...runs);
            } catch {
              // skip
            }
          })
        );
        setTickets(allTickets);
        setAgentRuns(allAgentRuns);
      }

      setError(null);
    } catch (e) {
      // non-critical on refresh
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // SSE connection
  useEffect(() => {
    const cleanup = connectSse((event: OrchestrationEvent) => {
      dataVersionRef.current += 1;
      // On relevant events, trigger a refresh
      if (
        event.type === "project.created" ||
        event.type === "goal.created" ||
        event.type === "goal.status_changed" ||
        event.type === "goal.tickets_created" ||
        event.type === "goal.completed" ||
        event.type === "goal.failed" ||
        event.type === "ticket.status_changed" ||
        event.type === "agent.started" ||
        event.type === "agent.created" ||
        event.type === "orchestrator.updated" ||
        event.type === "manager.review_started" ||
        event.type === "ticket.review_rejected" ||
        event.type === "ticket.speculative_work_stopped" ||
        event.type === "ticket.failed"
      ) {
        refresh();
      }
    }, (event) => {
      const streamKey = event.data.runId || event.data.ticketId;
      if (!streamKey) return;
      setAgentStreams((current) => {
        const previous = current[streamKey] || [];
        const last = previous.at(-1);
        const content = typeof event.data.content === "string" ? event.data.content : "";
        const canMerge = content && last?.type === event.type
          && last.provider === event.provider
          && last.data.messageId === event.data.messageId
          && (event.type === "text_delta" || event.type === "reasoning_delta");
        const next = canMerge
          ? [...previous.slice(0, -1), { ...last, data: { ...last.data, content: `${last.data.content || ""}${content}` }, receivedAt: event.receivedAt }]
          : [...previous, event];
        return { ...current, [streamKey]: next.slice(-500) };
      });
    });
    return cleanup;
  }, [refresh]);

  // Periodic refresh
  useEffect(() => {
    const interval = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  const addProject = useCallback(
    async (name: string, location: string, executionMode: "direct" | "worktree" = "direct"): Promise<Project | null> => {
      try {
        const project = await api.projects.create({ name, location, executionMode });
        setProjects((prev) => [...prev, project]);
        return project;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create project");
        return null;
      }
    },
    []
  );

  const addGoal = useCallback(
    async (projectId: string, title: string, description: string): Promise<Goal | null> => {
      try {
        const goal = await api.goals.create({ projectId, title, description });
        setGoals((prev) => [...prev, goal]);
        return goal;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create goal");
        return null;
      }
    },
    []
  );

  const addAgent = useCallback(async (data: Omit<AgentProfile, "id" | "role" | "createdAt" | "updatedAt">) => {
    try {
      const agent = await api.agents.create(data);
      setAgents((previous) => [...previous, agent]);
      return agent;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create agent");
      return null;
    }
  }, []);

  const updateOrchestrator = useCallback(async (data: Parameters<typeof api.orchestrator.update>[0]) => {
    const updated = await api.orchestrator.update(data);
    setOrchestrator(updated);
    return updated;
  }, []);

  const executeGoal = useCallback(async (goalId: string) => {
    try {
      await api.goals.execute(goalId);
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to execute goal");
    }
  }, [refresh]);

  const pauseGoal = useCallback(async (goalId: string) => {
    await api.goals.pause(goalId);
    refresh();
  }, [refresh]);

  const resumeGoal = useCallback(async (goalId: string) => {
    await api.goals.resume(goalId);
    refresh();
  }, [refresh]);

  const cancelGoal = useCallback(async (goalId: string) => {
    await api.goals.cancel(goalId);
    refresh();
  }, [refresh]);

  return {
    projects,
    goals,
    tickets,
    agentRuns,
    agentStreams,
    harnesses,
    agents,
    orchestrator,
    loading,
    error,
    selectedProjectId,
    setSelectedProjectId,
    selectedGoalId,
    setSelectedGoalId,
    addProject,
    addGoal,
    addAgent,
    updateOrchestrator,
    executeGoal,
    pauseGoal,
    resumeGoal,
    cancelGoal,
    refresh,
  };
}
