import { randomUUID } from "node:crypto";

export type TicketType =
  | "research" | "test" | "implementation" | "refactor"
  | "integration" | "verification" | "documentation";

export type TicketStatus =
  | "backlog" | "ready" | "blocked" | "in_progress"
  | "review" | "failed" | "completed" | "cancelled";

export type GoalStatus =
  | "draft" | "planning" | "ready" | "running" | "paused"
  | "blocked" | "verifying" | "completed" | "failed" | "cancelled";

export type TicketPriority = "low" | "medium" | "high" | "critical";

export interface Project {
  id: string;
  name: string;
  location: string;
  description?: string;
  techPreferences: string[];
  baseBranch: string;
  testCommand?: string;
  lintCommand?: string;
  typeCheckCommand?: string;
  buildCommand?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: GoalStatus;
  constraints: string[];
  acceptanceCriteria: string[];
  relevantFiles: string[];
  technicalInstructions?: string;
  outOfScopeItems: string[];
  ticketIds: string[];
  maxAgents: number;
  provider: "claude" | "codex";
  maxRetries: number;
  autoRetry: boolean;
  autoMerge: boolean;
  requireReview: boolean;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface Ticket {
  id: string;
  projectId: string;
  goalId: string;
  title: string;
  description: string;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  acceptanceCriteria: string[];
  technicalNotes: string[];
  relevantFiles: string[];
  dependencyIds: string[];
  blockingTicketIds: string[];
  assignedAgentId?: string;
  worktreePath?: string;
  branchName?: string;
  testPlan: string[];
  verificationCommands: string[];
  retryCount: number;
  maximumRetries: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AgentRun {
  id: string;
  goalId: string;
  ticketId: string;
  provider: "claude" | "codex";
  sessionId?: string;
  status: "starting" | "running" | "waiting" | "completed" | "failed" | "aborted";
  worktreePath: string;
  branchName: string;
  startedAt: string;
  completedAt?: string;
  output?: string;
  error?: string;
}

export interface TddEvidence {
  ticketId: string;
  red: { command: string; exitCode: number; output: string; recordedAt: string };
  green: { command: string; exitCode: number; output: string; recordedAt: string };
  refactor: { commands: string[]; results: { command: string; exitCode: number; output: string }[]; recordedAt: string };
}

export interface OrchestrationEvent {
  id: string;
  projectId: string;
  goalId?: string;
  ticketId?: string;
  agentId?: string;
  type: string;
  payload: unknown;
  sequence: number;
  occurredAt: string;
}

const VALID_TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  backlog: ["ready", "blocked", "cancelled"],
  ready: ["in_progress", "cancelled"],
  blocked: ["ready", "cancelled"],
  in_progress: ["review", "failed", "cancelled"],
  review: ["completed", "ready", "failed", "cancelled"],
  failed: ["ready", "cancelled"],
  completed: [],
  cancelled: [],
};

const VALID_GOAL_TRANSITIONS: Record<GoalStatus, GoalStatus[]> = {
  draft: ["planning", "cancelled"],
  planning: ["ready", "cancelled"],
  ready: ["running", "cancelled"],
  running: ["paused", "verifying", "failed", "cancelled"],
  paused: ["running", "cancelled"],
  blocked: ["running", "cancelled"],
  verifying: ["completed", "running", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export function validateTicketTransition(from: TicketStatus, to: TicketStatus): boolean {
  const allowed = VALID_TICKET_TRANSITIONS[from];
  return allowed?.includes(to) ?? false;
}

export function validateGoalTransition(from: GoalStatus, to: GoalStatus): boolean {
  const allowed = VALID_GOAL_TRANSITIONS[from];
  return allowed?.includes(to) ?? false;
}
