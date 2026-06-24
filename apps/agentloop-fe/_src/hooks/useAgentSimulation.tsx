import React, { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";
import { Agent, Ticket, TicketLog, Project, Goal, BoardStep } from "../types";
import {
  INITIAL_AGENTS,
  INITIAL_TICKETS,
  INITIAL_PROJECTS,
  INITIAL_GOALS,
  INITIAL_ORCHESTRATOR_PROMPT,
  INITIAL_BOARD_STEPS,
} from "../lib/mock-data";

const LOG_MESSAGES = [
  "Analyzing requirements...",
  "Generating AST...",
  "Running pre-flight checks.",
  "Compiling module...",
  "Running test suite...",
  "Fixing syntax error...",
  "Refactoring function...",
  "Updating documentation.",
  "Committing changes.",
  "Deploying to staging.",
];

function randomLogMessage(): string {
  return LOG_MESSAGES[Math.floor(Math.random() * LOG_MESSAGES.length)];
}

export function useAgentSimulationInternal() {
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [goals, setGoals] = useState<Goal[]>(INITIAL_GOALS);
  const [orchestratorPrompt, setOrchestratorPrompt] = useState<string>(
    INITIAL_ORCHESTRATOR_PROMPT,
  );
  const [orchestratorHarness, setOrchestratorHarness] = useState<string>("claude");
  const [orchestratorModel, setOrchestratorModel] = useState<string>("claude-3-5-sonnet");
  
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [tickets, setTickets] = useState<Ticket[]>(INITIAL_TICKETS);
  const [boardSteps, setBoardSteps] = useState<BoardStep[]>(INITIAL_BOARD_STEPS);

  const addBoardStep = (step: Omit<BoardStep, "id">) => {
    const newStep = {
      ...step,
      id: `step-${Math.random().toString(36).substring(7)}`,
    };
    setBoardSteps((prev) => [...prev, newStep]);
    return newStep;
  };

  const updateBoardStep = (id: string, updates: Partial<BoardStep>) => {
    setBoardSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const deleteBoardStep = (id: string) => {
    setBoardSteps((prev) => prev.filter((s) => s.id !== id));
  };


  const addAgent = (
    name: string,
    role: string,
    prompt: string,
    harness: string,
    model: string,
  ) => {
    const newAgent: Agent = {
      id: `agent-${Math.random().toString(36).substring(7)}`,
      name,
      avatar: name.charAt(0).toUpperCase(),
      role,
      prompt,
      harness,
      model,
      status: "idle",
      completedCount: 0,
    };
    setAgents((a) => [...a, newAgent]);
    return newAgent;
  };

  const updateAgent = (
    id: string,
    updates: Partial<Pick<Agent, "name" | "role" | "prompt" | "harness" | "model">>
  ) => {
    setAgents((a) =>
      a.map((agent) => (agent.id === id ? { ...agent, ...updates } : agent))
    );
  };

  const deleteAgent = (id: string) => {
    setAgents((a) => a.filter((agent) => agent.id !== id));
  };

  const addProject = (name: string) => {
    const newProject: Project = {
      id: `proj-${Math.random().toString(36).substring(7)}`,
      name,
      createdAt: new Date(),
    };
    setProjects((p) => [...p, newProject]);
    return newProject;
  };

  const addGoal = (projectId: string, title: string) => {
    const newGoal: Goal = {
      id: `goal-${Math.random().toString(36).substring(7)}`,
      projectId,
      title,
      createdAt: new Date(),
    };
    setGoals((g) => [...g, newGoal]);
    return newGoal;
  };

  const addTicket = (
    goalId: string,
    title: string,
    priority: "Low" | "Medium" | "High" | "Critical" = "Medium",
  ) => {
    setTickets((t) => [
      ...t,
      {
        id: `tick-${Math.random().toString(36).substring(7)}`,
        goalId,
        title,
        description: "Manually created ticket.",
        priority,
        status: "queued",
        progress: 0,
        logs: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  };

  const deleteProject = (id: string) => {
    setProjects((p) => p.filter((proj) => proj.id !== id));
    // optionally delete associated goals and tickets, but we can just filter out
  };

  const deleteGoal = (id: string) => {
    setGoals((g) => g.filter((goal) => goal.id !== id));
  };

  const resolveInput = useCallback(
    (ticketId: string, resolutionMessage: string) => {
      setTickets((prev) =>
        prev.map((t) => {
          if (t.id === ticketId) {
            return {
              ...t,
              requiresInput: false,
              logs: [
                ...t.logs,
                {
                  id: Math.random().toString(),
                  message: `Input provided: ${resolutionMessage}`,
                  timestamp: new Date(),
                  type: "info" as const,
                },
              ],
            };
          }
          return t;
        }),
      );
    },
    [],
  );

  const simulateStep = useCallback(() => {
    setTickets((prevTickets) => {
      let nextTickets = [...prevTickets];

      // Random chance to spawn a new ticket if the queue is low
      if (
        Math.random() < 0.2 &&
        nextTickets.filter((t) => t.status === "queued").length < 3
      ) {
        // Automatically assign to a random goal if any exists
        // (Just to keep the simulation running smoothly)
        const adjectives = ["Fix", "Update", "Refactor", "Optimize", "Deploy"];
        const subjects = [
          "database",
          "API router",
          "auth flow",
          "cache layer",
          "frontend component",
        ];

        // This is safe because goals state is captured in closure if we pass it, but wait: simulateStep doesn't have current goals!
        // To fix: we can use a hardcoded goalId or just a dummy one, or rely on the caller to not care about auto-tickets for now.
        // Or we can grab the goalId from existing tickets to pick a valid one.
        const existingGoalIds = Array.from(
          new Set(nextTickets.map((t) => t.goalId)),
        );
        if (existingGoalIds.length > 0) {
          const randomGoalId =
            existingGoalIds[Math.floor(Math.random() * existingGoalIds.length)];
          nextTickets.push({
            id: `tick-${Math.random().toString(36).substring(7)}`,
            goalId: randomGoalId,
            title: `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${subjects[Math.floor(Math.random() * subjects.length)]}`,
            description: "Auto-generated ticket by the system.",
            priority: Math.random() > 0.8 ? "High" : "Medium",
            status: "queued",
            progress: 0,
            logs: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      let agentUpdates: Record<string, Partial<Agent>> = {};

      setAgents((prevAgents) => {
        let nextAgents = [...prevAgents];

        nextAgents = nextAgents.map((agent) => {
          if (agent.status === "offline") return agent;

          // If agent is idle, look for a queued ticket
          if (agent.status === "idle") {
            const queuedTicketIndex = nextTickets.findIndex(
              (t) => t.status === "queued",
            );
            if (queuedTicketIndex !== -1) {
              const ticket = nextTickets[queuedTicketIndex];
              nextTickets[queuedTicketIndex] = {
                ...ticket,
                status: "in_progress",
                assignedAgentId: agent.id,
                updatedAt: new Date(),
                logs: [
                  ...ticket.logs,
                  {
                    id: Math.random().toString(),
                    message: `Agent ${agent.name} assigned. Starting work.`,
                    timestamp: new Date(),
                    type: "info",
                  },
                ],
              };
              return {
                ...agent,
                status: "working",
                currentTicketId: ticket.id,
              };
            }
          }

          // If agent is working, progress the ticket
          if (agent.status === "working" && agent.currentTicketId) {
            const ticketIndex = nextTickets.findIndex(
              (t) => t.id === agent.currentTicketId,
            );
            if (ticketIndex !== -1) {
              const ticket = nextTickets[ticketIndex];
              const newLogs = [...ticket.logs];
              let newStatus = ticket.status;
              let newRequiresInput = ticket.requiresInput;

              if (newRequiresInput) {
                // If it needs input, 10% chance it auto-resolves, otherwise just wait
                if (Math.random() < 0.1) {
                  newRequiresInput = false;
                  newLogs.push({
                    id: Math.random().toString(),
                    message: "Input resolved automatically.",
                    timestamp: new Date(),
                    type: "info",
                  });
                } else {
                  // Just wait
                  return agent;
                }
              }

              // Advance progress by 5 to 20 percent
              const progressGain = Math.floor(Math.random() * 15) + 5;
              const newProgress = Math.min(ticket.progress + progressGain, 100);

              if (newProgress < 100) {
                if (newProgress >= 70 && ticket.status !== "review") {
                  newStatus = "review";
                  newLogs.push({
                    id: Math.random().toString(),
                    message: "Code complete. Entering review phase...",
                    timestamp: new Date(),
                    type: "action",
                  });
                }
                // Randomly trigger an input request (5% chance per tick)
                else if (Math.random() < 0.05 && ticket.status !== "queued") {
                  newRequiresInput = true;

                  const questions = [
                    "Waiting for user permission to execute destructive database changes.",
                    "Question: Should I update all affected downstream services as well?",
                    "Permission required to create a new production API key.",
                    "I need clarification: do we want the new UI to be dark mode only?",
                    "Warning: This requires an update to the billing module. Proceed?",
                    "Ambiguity detected: should 'users' include deactivated accounts?",
                  ];
                  const q =
                    questions[Math.floor(Math.random() * questions.length)];

                  newLogs.push({
                    id: Math.random().toString(),
                    message: q,
                    timestamp: new Date(),
                    type: "error",
                  });
                }
                // Add random log
                else if (Math.random() > 0.3) {
                  newLogs.push({
                    id: Math.random().toString(),
                    message: randomLogMessage(),
                    timestamp: new Date(),
                    type: "action",
                  });
                }
              }

              if (newProgress >= 100) {
                newLogs.push({
                  id: Math.random().toString(),
                  message: `Task completed successfully.`,
                  timestamp: new Date(),
                  type: "success",
                });

                nextTickets[ticketIndex] = {
                  ...ticket,
                  status: "resolved",
                  progress: 100,
                  requiresInput: false,
                  updatedAt: new Date(),
                  logs: newLogs,
                };
                return {
                  ...agent,
                  status: "idle",
                  currentTicketId: undefined,
                  completedCount: agent.completedCount + 1,
                };
              } else {
                nextTickets[ticketIndex] = {
                  ...ticket,
                  status: newStatus,
                  progress: newProgress,
                  requiresInput: newRequiresInput,
                  updatedAt: new Date(),
                  logs: newLogs,
                };
                return agent;
              }
            } else {
              // Ticket not found, shouldn't happen but fallback
              return { ...agent, status: "idle", currentTicketId: undefined };
            }
          }

          return agent;
        });

        return nextAgents;
      });

      return nextTickets;
    });
  }, []);

  useEffect(() => {
    const interval = setInterval(simulateStep, 2500); // Step every 2.5s
    return () => clearInterval(interval);
  }, [simulateStep]);

  return {
    projects,
    goals,
    agents,
    tickets,
    orchestratorPrompt,
    setOrchestratorPrompt,
    orchestratorHarness,
    setOrchestratorHarness,
    orchestratorModel,
    setOrchestratorModel,
    addProject,
    deleteProject,
    addGoal,
    deleteGoal,
    addTicket,
    addAgent,
    updateAgent,
    deleteAgent,
    resolveInput,
    boardSteps,
    setBoardSteps,
    addBoardStep,
    updateBoardStep,
    deleteBoardStep,
  };
}

export type AgentSimulationContextType = ReturnType<typeof useAgentSimulationInternal>;

const AgentSimulationContext = createContext<AgentSimulationContextType | null>(null);

export function AgentSimulationProvider({ children }: { children: ReactNode }) {
  const value = useAgentSimulationInternal();
  return <AgentSimulationContext.Provider value={value}>{children}</AgentSimulationContext.Provider>;
}

export function useAgentSimulation() {
  const ctx = useContext(AgentSimulationContext);
  if (!ctx) {
    throw new Error("useAgentSimulation must be used within AgentSimulationProvider");
  }
  return ctx;
}
