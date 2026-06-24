import { Agent, Goal, Project, Ticket, BoardStep } from "../types";

export const INITIAL_PROJECTS: Project[] = [
  { id: "proj-1", name: "Core Platform", createdAt: new Date() },
  { id: "proj-2", name: "Frontend Revamp", createdAt: new Date() },
];

export const INITIAL_BOARD_STEPS: BoardStep[] = [
  {
    id: "queued",
    name: "Queued",
    instructions: "Analyze the task and wait for an agent to be assigned.",
    allowedNextSteps: ["in_progress"],
    allowedPreviousSteps: [],
  },
  {
    id: "in_progress",
    name: "In Progress",
    instructions: "Work on the task, generate code, and implement features.",
    allowedNextSteps: ["review", "resolved", "failed"],
    allowedPreviousSteps: ["queued"],
  },
  {
    id: "review",
    name: "Reviewing",
    instructions: "Review the code and check for bugs.",
    allowedNextSteps: ["resolved", "failed"],
    allowedPreviousSteps: ["in_progress"],
  },
  {
    id: "resolved",
    name: "Resolved",
    instructions: "Task is completed.",
    allowedNextSteps: [],
    allowedPreviousSteps: ["review", "in_progress"],
  },
  {
    id: "failed",
    name: "Failed",
    instructions: "Task failed to complete.",
    allowedNextSteps: ["queued"],
    allowedPreviousSteps: ["in_progress", "review"],
  }
];


export const INITIAL_GOALS: Goal[] = [
  {
    id: "goal-1",
    projectId: "proj-1",
    title: "Improve Authentication & Billing",
    createdAt: new Date(),
  },
  {
    id: "goal-2",
    projectId: "proj-1",
    title: "Performance Optimizations",
    createdAt: new Date(),
  },
  {
    id: "goal-3",
    projectId: "proj-2",
    title: "Fix UI Bugs",
    createdAt: new Date(),
  },
];

export const INITIAL_ORCHESTRATOR_PROMPT = `You are the Orchestrator. Your job is to manage the lifecycle of tickets and assign them to the most appropriate agent based on their specialized skills and current workload. When a ticket is blocked or requires input, notify the user.`;

export const INITIAL_AGENTS: Agent[] = [
  {
    id: "agent-1",
    name: "Ada (Analysis)",
    avatar: "A",
    role: "Triage & Scope",
    prompt:
      "You are an expert systems analyst. Your job is to break down complex tickets into actionable steps, identify potential risks, and outline scope.",
    harness: "claude",
    model: "claude-3-opus",
    status: "idle",
    completedCount: 42,
  },
  {
    id: "agent-2",
    name: "Turing (CodeGen)",
    avatar: "T",
    role: "Implementation",
    prompt:
      "You are a senior software engineer. Your task is to write clean, efficient, and well-documented code that fulfills the requirements of the ticket.",
    harness: "codex",
    model: "gpt-4-turbo",
    status: "idle",
    completedCount: 128,
  },
  {
    id: "agent-3",
    name: "Grace (Review)",
    avatar: "G",
    role: "QA & Review",
    prompt:
      "You are a strict code reviewer and QA engineer. Review pull requests and code changes for bugs, security vulnerabilities, and adherence to style guides.",
    harness: "gemini",
    model: "gemini-1.5-pro",
    status: "working",
    currentTicketId: "tick-2",
    completedCount: 89,
  },
  {
    id: "agent-4",
    name: "Linus (Ops)",
    avatar: "L",
    role: "Deployment",
    prompt:
      "You are a DevOps specialist. You handle deployments, infrastructure configuration, and resolving production incidents safely.",
    harness: "opencode",
    model: "llama-3-70b",
    status: "offline",
    completedCount: 310,
  },
];

export const INITIAL_TICKETS: Ticket[] = [
  {
    id: "tick-1",
    goalId: "goal-1",
    title: "Update payment gateway webhook",
    description:
      "Ensure Stripe webhook handles the new subscription_updated event correctly.",
    priority: "High",
    status: "queued",
    progress: 0,
    logs: [],
    linkedTickets: ["tick-2"],
    affectedFiles: ["src/routes/api/webhooks.ts", "src/services/stripe.ts"],
    estimatedCompletionTime: "4 hours",
    createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 mins ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 30),
  },
  {
    id: "tick-2",
    goalId: "goal-1",
    title: "Migrate user auth to new JWT format",
    description: "Update the token generation and validation middleware.",
    priority: "Critical",
    status: "in_progress",
    progress: 45,
    assignedAgentId: "agent-3",
    requiresInput: true,
    logs: [
      {
        id: "log-1",
        timestamp: new Date(Date.now() - 1000 * 60 * 5),
        message: "Started reviewing auth middleware.",
        type: "info",
      },
      {
        id: "log-2",
        timestamp: new Date(Date.now() - 1000 * 60 * 2),
        message: "Found edge case in token expiry handling.",
        type: "action",
      },
    ],
    linkedTickets: ["tick-1"],
    affectedFiles: ["src/middleware/auth.ts", "src/utils/jwt.ts", "src/routes/api/users.ts"],
    estimatedCompletionTime: "2 hours",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 2),
  },
  {
    id: "tick-3",
    goalId: "goal-3",
    title: "Fix typo in settings page",
    description: 'Change "Recieve Notifications" to "Receive Notifications".',
    priority: "Low",
    status: "queued",
    progress: 0,
    logs: [],
    affectedFiles: ["src/components/Settings.tsx", "src/locales/en.json"],
    estimatedCompletionTime: "15 mins",
    createdAt: new Date(Date.now() - 1000 * 60 * 15),
    updatedAt: new Date(Date.now() - 1000 * 60 * 15),
  },
  {
    id: "tick-4",
    goalId: "goal-2",
    title: "Optimize dashboard database queries",
    description: "N+1 query problem detected on the main dashboard load.",
    priority: "Medium",
    status: "queued",
    progress: 0,
    logs: [],
    affectedFiles: ["src/routes/api/dashboard.ts", "src/queries/dashboard.sql"],
    estimatedCompletionTime: "1 day",
    createdAt: new Date(Date.now() - 1000 * 60 * 45),
    updatedAt: new Date(Date.now() - 1000 * 60 * 45),
  },
];
