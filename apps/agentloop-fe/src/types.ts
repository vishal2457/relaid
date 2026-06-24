export type AgentProvider = "claude" | "codex" | "opencode";

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

export type TicketPriority = "low" | "medium" | "high" | "critical";

export type AgentRunStatus =
  | "starting"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "aborted";

export interface BoardStep {
  id: string;
  name: string;
  instructions: string;
  allowedNextStepIds: string[];
  allowedPreviousStepIds: string[];
  isTerminal: boolean;
  color: "slate" | "blue" | "amber" | "green" | "red";
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  location: string;
  description?: string;
  techPreferences: string[];
  baseBranch: string;
  executionMode?: "direct" | "worktree";
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
  managerAgentId: string;
  plannerAgentId: string;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  lastError?: {
    phase: "planning" | "execution" | "verification" | "review";
    message: string;
    details?: string;
    occurredAt: string;
  };
}

export interface Ticket {
  id: string;
  projectId: string;
  goalId: string;
  title: string;
  description: string;
  type: TicketType;
  status: TicketStatus;
  currentStepId: string;
  stepStatus: "in_progress" | "completed" | "failed" | "blocked" | null;
  stepHistory: TicketStepExecution[];
  priority: TicketPriority;
  acceptanceCriteria: string[];
  technicalNotes: string[];
  relevantFiles: string[];
  dependencyIds: string[];
  requestedAgentName?: string;
  requestedProvider?: AgentProvider;
  requestedModel?: string;
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
  stepId?: string;
  kind?: "planning" | "orchestration" | "step";
  agentProfileId: string;
  provider: AgentProvider;
  model: string;
  sessionId?: string;
  status: AgentRunStatus;
  worktreePath: string;
  branchName: string;
  startedAt: string;
  completedAt?: string;
  output?: string;
  error?: string;
}

export interface Harness {
  id: string;
  name: string;
  label: string;
  available: boolean;
  version?: string;
  models: string[];
  modelSource: "sdk" | "app-server" | "environment" | "fallback";
  modelError?: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  description?: string;
  role: "manager" | "planner" | "worker";
  provider: AgentProvider;
  model: string;
  systemPrompt: string;
  permissionMode?: "default" | "acceptEdits" | "plan" | "bypassPermissions" | "dontAsk" | "auto";
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TicketStepExecution {
  id: string;
  stepId: string;
  status: "in_progress" | "completed" | "failed" | "blocked";
  agentRunId?: string;
  agentProfileId?: string;
  startedAt: string;
  completedAt?: string;
  output?: string;
  error?: string;
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

export interface SsePayload {
  type: string;
  provider?: AgentProvider;
  data: Record<string, unknown>;
}

export type AgentStreamEventType =
  | "text_delta"
  | "reasoning_delta"
  | "tool_use"
  | "tool_result"
  | "permission_request"
  | "status"
  | "turn_complete"
  | "error";

export interface AgentStreamEvent {
  provider: "codex" | "opencode";
  type: AgentStreamEventType;
  data: {
    runId?: string;
    goalId?: string;
    ticketId?: string;
    stepId?: string;
    agentProfileId?: string;
    sessionId?: string;
    content?: string;
    message?: string;
    toolName?: string;
    toolInput?: Record<string, unknown>;
    isError?: boolean;
    success?: boolean;
    output?: string;
    error?: string;
    [key: string]: unknown;
  };
  receivedAt: string;
}
