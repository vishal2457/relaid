import { useState, useEffect, useCallback, useRef } from "react";
import { api, connectSse, ORCHESTRATION_EVENT_TYPES } from "../lib/api";
import type {
  Project,
  Goal,
  Ticket,
  AgentRun,
  Harness,
  OrchestrationEvent,
  AgentProfile,
  AgentStreamEvent,
  BoardStep,
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
  const [planningAgent, setPlanningAgent] = useState<AgentProfile | null>(null);
  const [boardSteps, setBoardSteps] = useState<BoardStep[]>([]);
  const [agentStreams, setAgentStreams] = useState<Record<string, AgentStreamEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  const dataVersionRef = useRef(0);

  const fetchAll = useCallback(async () => {
    try {
      const [projs, gls, harn, profiles, manager, planner, steps] = await Promise.all([
        api.projects.list(),
        api.goals.list(),
        api.harnesses.list(),
        api.agents.list(),
        api.orchestrator.get(),
        api.planningAgent.get(),
        api.boardSteps.list(),
      ]);
      setProjects(projs);
      setGoals(gls);
      setHarnesses(harn.harnesses);
      setAgents(profiles);
      setOrchestrator(manager);
      setPlanningAgent(planner);
      setBoardSteps(steps);

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
      const [projs, gls, profiles, manager, planner, steps] = await Promise.all([
        api.projects.list(),
        api.goals.list(),
        api.agents.list(),
        api.orchestrator.get(),
        api.planningAgent.get(),
        api.boardSteps.list(),
      ]);
      setProjects(projs);
      setGoals(gls);
      setAgents(profiles);
      setOrchestrator(manager);
      setPlanningAgent(planner);
      setBoardSteps(steps);

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
      if ((ORCHESTRATION_EVENT_TYPES as readonly string[]).includes(event.type)) {
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

  const updateAgent = useCallback(async (id: string, data: Partial<AgentProfile>) => {
    const updated = await api.agents.update(id, data);
    setAgents((previous) => previous.map((agent) => agent.id === id ? updated : agent));
    return updated;
  }, []);

  const deleteAgent = useCallback(async (id: string) => {
    const response = await api.agents.remove(id);
    if (!response.ok) throw new Error(`Failed to delete agent (${response.status})`);
    setAgents((previous) => previous.filter((agent) => agent.id !== id));
  }, []);

  const addBoardStep = useCallback(async (data: Pick<BoardStep, "name" | "instructions" | "allowedNextStepIds" | "allowedPreviousStepIds" | "isTerminal" | "color">) => {
    const step = await api.boardSteps.create(data);
    setBoardSteps((previous) => [...previous, step]);
    return step;
  }, []);

  const updateBoardStep = useCallback(async (id: string, data: Partial<Pick<BoardStep, "name" | "instructions" | "allowedNextStepIds" | "allowedPreviousStepIds" | "isTerminal" | "color">>) => {
    const updated = await api.boardSteps.update(id, data);
    setBoardSteps((previous) => previous.map((step) => step.id === id ? updated : step));
    return updated;
  }, []);

  const deleteBoardStep = useCallback(async (id: string) => {
    const response = await api.boardSteps.remove(id);
    if (!response.ok) throw new Error(`Failed to delete step (${response.status})`);
    setBoardSteps((previous) => previous.filter((step) => step.id !== id).map((step, position) => ({ ...step, position })));
  }, []);

  const reorderBoardSteps = useCallback(async (ids: string[]) => {
    const ordered = await api.boardSteps.reorder(ids);
    setBoardSteps(ordered);
  }, []);

  const updateOrchestrator = useCallback(async (data: Parameters<typeof api.orchestrator.update>[0]) => {
    const updated = await api.orchestrator.update(data);
    setOrchestrator(updated);
    return updated;
  }, []);

  const updatePlanningAgent = useCallback(async (data: Parameters<typeof api.planningAgent.update>[0]) => {
    const updated = await api.planningAgent.update(data);
    setPlanningAgent(updated);
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
    planningAgent,
    boardSteps,
    loading,
    error,
    selectedProjectId,
    setSelectedProjectId,
    selectedGoalId,
    setSelectedGoalId,
    addProject,
    addGoal,
    addAgent,
    updateAgent,
    deleteAgent,
    addBoardStep,
    updateBoardStep,
    deleteBoardStep,
    reorderBoardSteps,
    updateOrchestrator,
    updatePlanningAgent,
    executeGoal,
    pauseGoal,
    resumeGoal,
    cancelGoal,
    refresh,
  };
}
