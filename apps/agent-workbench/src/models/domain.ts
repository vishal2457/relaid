export type TicketType =
  | "research"
  | "test"
  | "implementation"
  | "refactor"
  | "integration"
  | "verification"
  | "documentation";

export type TicketStatus =
  | "backlog"
  | "ready"
  | "blocked"
  | "in_progress"
  | "review"
  | "failed"
  | "completed"
  | "cancelled";

export type GoalStatus =
  | "draft"
  | "planning"
  | "ready"
  | "running"
  | "paused"
  | "blocked"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type TicketPriority = "low" | "medium" | "high" | "critical";

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

export interface AgentRun {
  id: string;
  goalId: string;
  ticketId: string;
  provider: "claude" | "codex";
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
  red: {
    command: string;
    exitCode: number;
    output: string;
    recordedAt: string;
  };
  green: {
    command: string;
    exitCode: number;
    output: string;
    recordedAt: string;
  };
  refactor: {
    commands: string[];
    results: { command: string; exitCode: number; output: string }[];
    recordedAt: string;
  };
}

export interface ExecutionEvent<T = unknown> {
  id: string;
  projectId: string;
  goalId?: string;
  ticketId?: string;
  agentId?: string;
  type: string;
  payload: T;
  sequence: number;
  occurredAt: string;
}

export const KANBAN_COLUMNS: { status: TicketStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "ready", label: "Ready" },
  { status: "blocked", label: "Blocked" },
  { status: "in_progress", label: "In Progress" },
  { status: "review", label: "Review" },
  { status: "failed", label: "Failed" },
  { status: "completed", label: "Completed" },
  { status: "cancelled", label: "Cancelled" },
];

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  research: "Research",
  test: "Test",
  implementation: "Implementation",
  refactor: "Refactor",
  integration: "Integration",
  verification: "Verification",
  documentation: "Documentation",
};

export const TICKET_TYPE_COLORS: Record<TicketType, string> = {
  research: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  test: "bg-green-500/10 text-green-400 border-green-500/30",
  implementation: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  refactor: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  integration: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  verification: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  documentation: "bg-gray-500/10 text-gray-400 border-gray-500/30",
};

export const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: "text-muted-foreground",
  medium: "text-blue-400",
  high: "text-yellow-400",
  critical: "text-red-400",
};

export const STATUS_COLORS: Record<TicketStatus, string> = {
  backlog: "bg-gray-500/10 text-gray-400 border-gray-500/30",
  ready: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  blocked: "bg-red-500/10 text-red-400 border-red-500/30",
  in_progress: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  review: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  failed: "bg-red-500/10 text-red-400 border-red-500/30",
  completed: "bg-green-500/10 text-green-400 border-green-500/30",
  cancelled: "bg-gray-500/10 text-gray-400 border-gray-500/30",
};

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  draft: "Draft",
  planning: "Planning",
  ready: "Ready",
  running: "Running",
  paused: "Paused",
  blocked: "Blocked",
  verifying: "Verifying",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};
