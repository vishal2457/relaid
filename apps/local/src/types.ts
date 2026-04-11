import type { Project, Session, Message } from "@opencode-ai/sdk/v2" with {
  "resolution-mode": "import",
};
import type { FileDiff } from "@opencode-ai/sdk/v2" with {
  "resolution-mode": "import",
};

export type { Project, Session, Message };

export interface OpenCodeResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  duration: number;
  sessionId?: string;
}

export interface MessageJob {
  projectId: string;
  channelId: string;
  threadId: string;
  sessionId?: string;
  prompt: string;
  authorTag: string;
  isLinearChannel: boolean;
}

export type ChatServerEventType =
  | "run_request"
  | "run_response"
  | "run_stream_chunk"
  | "session_abort"
  | "session_aborted"
  | "session_prompt_request"
  | "session_prompt_started"
  | "session_prompt_response"
  | "session_stream_chunk"
  | "projects_list_request"
  | "projects_list_response"
  | "project_get_request"
  | "project_get_response"
  | "project_directory_request"
  | "project_directory_response"
  | "project_file_search_request"
  | "project_file_search_response"
  | "project_create_request"
  | "project_create_response"
  | "project_update_request"
  | "project_update_response"
  | "project_delete_request"
  | "project_delete_response"
  | "sessions_list_request"
  | "sessions_list_response"
  | "session_get_request"
  | "session_get_response"
  | "session_diff_request"
  | "session_diff_response"
  | "session_messages_request"
  | "session_messages_response"
  | "session_create_request"
  | "session_create_response"
  | "session_update_request"
  | "session_update_response"
  | "providers_list_request"
  | "providers_list_response"
  | "ping"
  | "pong"
  | "error_response";

export interface ChatServerMessage<T = unknown> {
  type: ChatServerEventType;
  id: string;
  timestamp: number;
  payload: T;
}

export interface RunRequestPayload {
  requestId: string;
  projectId: string;
  prompt: string;
  sessionId?: string;
  userId: string;
  workspacePath?: string;
}

export interface RunResponsePayload {
  requestId: string;
  projectId: string;
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  duration: number;
  sessionId?: string;
}

export interface SessionAbortPayload {
  sessionId: string;
  requestId: string;
  projectId: string;
}

export interface SessionAbortedPayload {
  sessionId: string;
  success: boolean;
  error?: string;
}

export interface SessionPromptRequestPayload {
  requestId: string;
  projectId: string;
  sessionId: string;
  prompt: string;
  userId?: string;
  model?: {
    providerId: string;
    modelId: string;
  };
}

export interface SessionPromptStartedPayload {
  requestId: string;
  projectId: string;
  sessionId: string;
}

export interface SessionPromptResponsePayload {
  requestId: string;
  projectId: string;
  sessionId: string;
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  duration: number;
  messages?: MessagePayload[];
}

export interface SessionStreamChunkPayload {
  requestId: string;
  projectId: string;
  sessionId: string;
  messageId?: string;
  chunk: string;
  type: "text" | "reasoning" | "tool" | "step" | "status" | "complete";
  isComplete?: boolean;
}

export interface RunStreamChunkPayload {
  requestId: string;
  projectId: string;
  sessionId?: string;
  messageId?: string;
  chunk: string;
  type: "text" | "reasoning" | "tool" | "step" | "status" | "complete";
  isComplete?: boolean;
}

export interface ErrorPayload {
  code: string;
  message: string;
  requestId?: string;
}

export interface ProjectPayload {
  id: string;
  name: string;
  description: string;
  folder: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDirectoryNodePayload {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: ProjectDirectoryNodePayload[];
}

export interface ProjectFileMatchPayload {
  name: string;
  path: string;
  type: "file" | "directory";
}

export interface SessionPayload {
  id: string;
  projectId: string;
  userId?: string | null;
  status: string;
  prompt: string;
  output?: string | null;
  error?: string | null;
  exitCode?: number | null;
  duration?: number | null;
  sessionId?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface MessagePayload {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  visibleContent: string;
  thinkingContent: string | null;
  thinkingDurationSeconds: number | null;
  parts: MessagePartPayload[];
  createdAt: string;
}

export interface MessagePartPayload {
  type: "text" | "reasoning" | "tool" | "step" | "other";
  content: string;
  durationSeconds: number | null;
}

export type ProjectsListRequestPayload = Record<string, never>;
export type ProjectsListResponsePayload = { projects: ProjectPayload[] };

export type ProjectGetRequestPayload = { projectId: string };
export type ProjectGetResponsePayload = { project: ProjectPayload | null };

export type ProjectDirectoryRequestPayload = { projectId: string };
export type ProjectDirectoryResponsePayload = {
  tree: ProjectDirectoryNodePayload[] | null;
};

export type ProjectFileSearchRequestPayload = {
  projectId: string;
  query?: string;
  limit?: number;
};
export type ProjectFileSearchResponsePayload = {
  results: ProjectFileMatchPayload[] | null;
};

export type ProjectCreateRequestPayload = {
  name: string;
  description: string;
  folder: string;
};
export type ProjectCreateResponsePayload = { project: ProjectPayload };

export type ProjectUpdateRequestPayload = {
  projectId: string;
  name?: string;
  description?: string;
  folder?: string;
};
export type ProjectUpdateResponsePayload = { project: ProjectPayload | null };

export type ProjectDeleteRequestPayload = { projectId: string };
export type ProjectDeleteResponsePayload = { success: boolean };

export type ProjectBranchesRequestPayload = { projectId: string };
export type ProjectBranchesResponsePayload = {
  branches: Array<{ name: string; isCurrent: boolean }>;
};

export type ProjectBranchSwitchRequestPayload = {
  projectId: string;
  branch: string;
};
export type ProjectBranchSwitchResponsePayload = { branch: string };

export type SessionsListRequestPayload = {
  projectId?: string;
  userId?: string;
  status?: string;
  limit?: number;
};
export type SessionsListResponsePayload = { sessions: SessionPayload[] };

export type SessionGetRequestPayload = { sessionId: string };
export type SessionGetResponsePayload = { session: SessionPayload | null };

export type SessionDiffRequestPayload = {
  sessionId: string;
  messageId?: string;
};
export type SessionDiffResponsePayload = { diff: FileDiff[] };

export type SessionMessagesRequestPayload = {
  sessionId: string;
  limit?: number;
};
export type SessionMessagesResponsePayload = { messages: MessagePayload[] };

export type SessionCreateRequestPayload = {
  projectId: string;
  prompt: string;
  sessionId?: string;
  userId?: string;
};
export type SessionCreateResponsePayload = {
  session: SessionPayload;
  requestId: string;
};

export type SessionUpdateRequestPayload = {
  sessionId: string;
  status: string;
  output?: string;
  error?: string;
  exitCode?: number;
  duration?: number;
  sessionId_data?: string;
};
export type SessionUpdateResponsePayload = { session: SessionPayload | null };

export interface ProviderModelPayload {
  id: string;
  name: string;
}

export interface ProviderPayload {
  id: string;
  name: string;
  models: ProviderModelPayload[];
}

export type ProvidersListRequestPayload = Record<string, never>;
export type ProvidersListResponsePayload = { providers: ProviderPayload[] };

export type PermissionReply = "once" | "always" | "reject";

export interface PermissionRequestPayload {
  requestId: string;
  projectId: string;
  sessionId: string;
  jobId: string;
  threadId: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
}

export interface PermissionResponsePayload {
  requestId: string;
  sessionId: string;
  jobId: string;
  reply: PermissionReply;
}

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionPayload {
  header: string;
  question: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}

export interface QuestionRequestPayload {
  requestId: string;
  projectId: string;
  sessionId: string;
  jobId: string;
  threadId: string;
  questions: QuestionPayload[];
}

export interface QuestionResponsePayload {
  requestId: string;
  sessionId: string;
  jobId: string;
  answers: string[][];
}

// Message Queue types

export interface QueueItemPayload {
  id: string;
  projectId: string;
  prompt: string;
  status: "pending" | "running" | "completed" | "failed" | "aborted";
  sessionId: string | null;
  error: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export type MessageQueueListRequestPayload = { projectId: string };
export type MessageQueueListResponsePayload = {
  requestId: string;
  items: QueueItemPayload[];
};

export type MessageQueueAddRequestPayload = {
  projectId: string;
  prompt: string;
};
export type MessageQueueAddResponsePayload = {
  requestId: string;
  item: QueueItemPayload;
};

export type MessageQueueRemoveRequestPayload = {
  queueItemId: string;
};
export type MessageQueueRemoveResponsePayload = {
  requestId: string;
  success: boolean;
  error?: string;
};

export type MessageQueueUpdateRequestPayload = {
  queueItemId: string;
  prompt?: string;
  position?: number;
};
export type MessageQueueUpdateResponsePayload = {
  requestId: string;
  item: QueueItemPayload | null;
  error?: string;
};

export type MessageQueueExecuteRequestPayload = {
  queueItemId: string;
  sessionId?: string;
  createNewSession?: boolean;
  projectId: string;
};
export type MessageQueueExecuteResponsePayload = {
  requestId: string;
  success: boolean;
  sessionId?: string;
  error?: string;
};
