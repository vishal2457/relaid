import type { SessionMessage } from "@/src/lib/api/messages";
import type { StreamChunkType } from "@/src/lib/opencode-types";

export type SessionPromptResponseEvent = {
  requestId: string;
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
  projectId: string;
  sessionId: string;
  messageId?: string;
  partId?: string;
  chunk: string;
  type: StreamChunkType;
  isComplete?: boolean;
};
