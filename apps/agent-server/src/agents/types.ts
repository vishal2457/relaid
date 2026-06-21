import type { AgentProvider } from "../events/event-types.js";
import type { PermissionMode } from "@anthropic-ai/claude-agent-sdk";

export interface AgentRunInput {
  requestId: string;
  cwd: string;
  provider: AgentProvider;
  sessionId?: string;
  prompt: string;
  systemPrompt?: string;
  model?: string;
  permissionMode?: PermissionMode;
}

export interface AgentRunResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  durationMs: number;
  sessionId: string;
}

export interface PermissionResponse {
  requestId: string;
  behavior: "allow" | "deny";
  message?: string;
}

export interface AgentSession {
  id: string;
  provider: AgentProvider;
  cwd: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  status: "pending" | "running" | "completed" | "failed" | "aborted";
}
