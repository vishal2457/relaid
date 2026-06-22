export type AgentProvider = "claude" | "codex" | "opencode";

export interface AgentStreamContext {
  runId?: string;
  goalId?: string;
  ticketId?: string;
  agentProfileId?: string;
}

export type SseEventType =
  | `${AgentProvider}:text_delta`
  | `${AgentProvider}:reasoning_delta`
  | `${AgentProvider}:tool_use`
  | `${AgentProvider}:tool_result`
  | `${AgentProvider}:permission_request`
  | `${AgentProvider}:status`
  | `${AgentProvider}:turn_complete`
  | `${AgentProvider}:error`;

export interface TextDeltaPayload extends AgentStreamContext {
  sessionId: string;
  content: string;
  messageId?: string;
}

export interface ReasoningDeltaPayload extends AgentStreamContext {
  sessionId: string;
  content: string;
  messageId?: string;
}

export interface ToolUsePayload extends AgentStreamContext {
  sessionId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  messageId?: string;
}

export interface ToolResultPayload extends AgentStreamContext {
  sessionId: string;
  toolName: string;
  content: string;
  isError?: boolean;
}

export interface PermissionRequestPayload extends AgentStreamContext {
  sessionId: string;
  requestId: string;
  toolName: string;
  title: string;
  description: string;
}

export interface StatusPayload extends AgentStreamContext {
  sessionId: string;
  content: string;
  messageId?: string;
}

export interface TurnCompletePayload extends AgentStreamContext {
  sessionId: string;
  success: boolean;
  output: string;
  error?: string;
  durationMs: number;
  exitCode: number;
}

export interface ErrorPayload extends AgentStreamContext {
  sessionId: string;
  message: string;
  code?: string;
}

export type SsePayload =
  | { type: "text_delta"; provider: AgentProvider; data: TextDeltaPayload }
  | { type: "reasoning_delta"; provider: AgentProvider; data: ReasoningDeltaPayload }
  | { type: "tool_use"; provider: AgentProvider; data: ToolUsePayload }
  | { type: "tool_result"; provider: AgentProvider; data: ToolResultPayload }
  | { type: "permission_request"; provider: AgentProvider; data: PermissionRequestPayload }
  | { type: "status"; provider: AgentProvider; data: StatusPayload }
  | { type: "turn_complete"; provider: AgentProvider; data: TurnCompletePayload }
  | { type: "error"; provider: AgentProvider; data: ErrorPayload };

export function sseEventName(payload: SsePayload): SseEventType {
  return `${payload.provider}:${payload.type}`;
}
