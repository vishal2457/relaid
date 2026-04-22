// OpenCode Type Definitions
// These types mirror the OpenCode SDK types for use in the mobile app
// Reference: /Users/vishalacharya/Documents/derived/relaid/packages/opencode-types/opencode.types.ts

// ===== Session Types =====

export interface FileDiff {
  file: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export type SessionStatus =
  | { type: "idle" }
  | { type: "retry"; attempt: number; message: string; next: number }
  | { type: "busy" };

export interface Session {
  id: string;
  projectID: string;
  directory: string;
  parentID?: string;
  summary?: {
    additions: number;
    deletions: number;
    files: number;
    diffs?: FileDiff[];
  };
  share?: {
    url: string;
  };
  title: string;
  version: string;
  time: {
    created: number;
    updated: number;
    compacting?: number;
  };
  revert?: {
    messageID: string;
    partID?: string;
    snapshot?: string;
    diff?: string;
  };
}

// ===== Message Types =====

export interface UserMessage {
  id: string;
  sessionID: string;
  role: "user";
  time: {
    created: number;
  };
  summary?: {
    title?: string;
    body?: string;
    diffs: FileDiff[];
  };
  agent: string;
  model: {
    providerID: string;
    modelID: string;
  };
  system?: string;
  tools?: {
    [key: string]: boolean;
  };
}

export interface ProviderAuthError {
  name: "ProviderAuthError";
  data: {
    providerID: string;
    message: string;
  };
}

export interface UnknownError {
  name: "UnknownError";
  data: {
    message: string;
  };
}

export interface MessageOutputLengthError {
  name: "MessageOutputLengthError";
  data: {
    [key: string]: unknown;
  };
}

export interface MessageAbortedError {
  name: "MessageAbortedError";
  data: {
    message: string;
  };
}

export interface ApiError {
  name: "APIError";
  data: {
    message: string;
    statusCode?: number;
    isRetryable: boolean;
    responseHeaders?: {
      [key: string]: string;
    };
    responseBody?: string;
  };
}

export type MessageError =
  | ProviderAuthError
  | UnknownError
  | MessageOutputLengthError
  | MessageAbortedError
  | ApiError;

export interface AssistantMessage {
  id: string;
  sessionID: string;
  role: "assistant";
  time: {
    created: number;
    completed?: number;
  };
  error?: MessageError;
  parentID: string;
  modelID: string;
  providerID: string;
  mode: string;
  path: {
    cwd: string;
    root: string;
  };
  summary?: boolean;
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
  finish?: string;
}

export type Message = UserMessage | AssistantMessage;

export interface Agent {
  name: string;
  description?: string;
  mode: "subagent" | "primary" | "all";
  builtIn: boolean;
  model?: {
    providerID: string;
    modelID: string;
  };
  prompt?: string;
  maxSteps?: number;
}

// ===== Part Types =====

export interface TextPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "text";
  text: string;
  synthetic?: boolean;
  ignored?: boolean;
  time?: {
    start: number;
    end?: number;
  };
  metadata?: {
    [key: string]: unknown;
  };
}

export interface ReasoningPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "reasoning";
  text: string;
  metadata?: {
    [key: string]: unknown;
  };
  time: {
    start: number;
    end?: number;
  };
}

export interface FilePartSourceText {
  value: string;
  start: number;
  end: number;
}

export interface FileSource {
  text: FilePartSourceText;
  type: "file";
  path: string;
}

export interface Range {
  start: {
    line: number;
    character: number;
  };
  end: {
    line: number;
    character: number;
  };
}

export interface SymbolSource {
  text: FilePartSourceText;
  type: "symbol";
  path: string;
  range: Range;
  name: string;
  kind: number;
}

export type FilePartSource = FileSource | SymbolSource;

export interface FilePart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "file";
  mime: string;
  filename?: string;
  url: string;
  source?: FilePartSource;
}

export type ToolStatus = "pending" | "running" | "completed" | "error";

export interface ToolStatePending {
  status: "pending";
  input: {
    [key: string]: unknown;
  };
  raw: string;
}

export interface ToolStateRunning {
  status: "running";
  input: {
    [key: string]: unknown;
  };
  title?: string;
  metadata?: {
    [key: string]: unknown;
  };
  time: {
    start: number;
  };
}

export interface ToolStateCompleted {
  status: "completed";
  input: {
    [key: string]: unknown;
  };
  output: string;
  title: string;
  metadata: {
    [key: string]: unknown;
  };
  time: {
    start: number;
    end: number;
    compacted?: number;
  };
  attachments?: FilePart[];
}

export interface ToolStateError {
  status: "error";
  input: {
    [key: string]: unknown;
  };
  error: string;
  metadata?: {
    [key: string]: unknown;
  };
  time: {
    start: number;
    end: number;
  };
}

export type ToolState =
  | ToolStatePending
  | ToolStateRunning
  | ToolStateCompleted
  | ToolStateError;

export interface ToolPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "tool";
  callID: string;
  tool: string;
  state: ToolState;
  metadata?: {
    [key: string]: unknown;
  };
}

export interface StepStartPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "step-start";
  snapshot?: string;
}

export interface StepFinishPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "step-finish";
  reason: string;
  snapshot?: string;
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: {
      read: number;
      write: number;
    };
  };
}

export interface SnapshotPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "snapshot";
  snapshot: string;
}

export interface PatchPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "patch";
  hash: string;
  files: string[];
}

export interface AgentPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "agent";
  name: string;
  source?: {
    value: string;
    start: number;
    end: number;
  };
}

export interface RetryPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "retry";
  attempt: number;
  error: ApiError;
  time: {
    created: number;
  };
}

export interface CompactionPart {
  id: string;
  sessionID: string;
  messageID: string;
  type: "compaction";
  auto: boolean;
}

export type Part =
  | TextPart
  | ReasoningPart
  | FilePart
  | ToolPart
  | StepStartPart
  | StepFinishPart
  | SnapshotPart
  | PatchPart
  | AgentPart
  | RetryPart
  | CompactionPart
  | {
      id: string;
      sessionID: string;
      messageID: string;
      type: "subtask";
      prompt: string;
      description: string;
      agent: string;
    };

// ===== Project Types =====

export interface Project {
  id: string;
  worktree: string;
  folder?: string;
  name?: string;
  description?: string;
  localServerId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  vcsDir?: string;
  vcs?: "git";
  time?: {
    created: number;
    initialized?: number;
  };
}

export interface ProjectDirectoryNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: ProjectDirectoryNode[];
}

export interface ProjectFileMatch {
  name: string;
  path: string;
  type: "file" | "directory";
}

// ===== Provider Types =====

export interface ProviderModel {
  id: string;
  name: string;
}

export interface Provider {
  id: string;
  name: string;
  source: "env" | "config" | "custom" | "api";
  env: string[];
  key?: string;
  options: {
    [key: string]: unknown;
  };
  models: {
    [key: string]: ProviderModel;
  };
}

// ===== Permission Types =====

export interface Permission {
  id: string;
  type: string;
  pattern?: string | string[];
  sessionID: string;
  messageID: string;
  callID?: string;
  title: string;
  metadata: {
    [key: string]: unknown;
  };
  time: {
    created: number;
  };
}

// ===== Helper Types =====

export type MessageInfo = {
  id: string;
  sessionID: string;
  role: "user" | "assistant";
  time: {
    created: number;
    completed?: number;
  };
  error?: MessageError;
};

export type StreamChunkType =
  | "text"
  | "reasoning"
  | "tool"
  | "step"
  | "status"
  | "complete";

// API Response types (what the server actually returns)

export interface SessionMessageResponse {
  info: Message;
  parts: Part[];
}
