import type { SessionMessage } from "@/src/lib/api/messages";
import type { StreamChunkType } from "@/src/lib/opencode-types";

export type SessionPromptStartedEvent = {
  requestId: string;
  agentProviderId?: string;
  projectId: string;
  sessionId: string;
};

export type SessionPromptResponseEvent = {
  requestId: string;
  agentProviderId?: string;
  projectId: string;
  sessionId: string;
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  duration: number;
  messages?: SessionMessage[];
};

export type SessionStreamChunkEvent = {
  requestId: string;
  agentProviderId?: string;
  projectId: string;
  sessionId: string;
  messageId?: string;
  partId?: string;
  chunk: string;
  type: StreamChunkType;
  isComplete?: boolean;
};
