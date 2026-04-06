import { useQuery } from "@tanstack/react-query";
import baseApi from "../axios/base";
import type {
  Message as OpenCodeMessage,
  Part as OpenCodePart,
  TextPart,
  ReasoningPart,
  ToolPart,
  SessionMessageResponse,
} from "../opencode-types";

export type SessionMessageRole = "user" | "assistant" | "system";

export type SessionMessagePart = {
  type: "text" | "reasoning" | "tool" | "step" | "other";
  content: string;
  durationSeconds: number | null;
};

// Token usage information
export interface SessionMessageTokens {
  input: number;
  output: number;
  reasoning: number;
  cache: {
    read: number;
    write: number;
  };
}

// Mobile app representation of a session message
export interface SessionMessage {
  id: string;
  sessionID: string;
  role: SessionMessageRole;
  content: string;
  visibleContent: string;
  thinkingContent: string | null;
  thinkingDurationSeconds: number | null;
  parts: SessionMessagePart[];
  createdAt: number;
  time?: {
    created: number;
    completed?: number;
  };
  // Token usage (only for assistant messages)
  tokens?: SessionMessageTokens;
  // Cost information (only for assistant messages)
  cost?: number;
}

// Convert OpenCode MessageResponse to mobile SessionMessage
export function adaptMessage(
  messageResponse: SessionMessageResponse,
): SessionMessage {
  const message = messageResponse.info;
  const parts = messageResponse.parts ?? [];

  // Extract text parts
  const textParts = parts.filter((p): p is TextPart => p.type === "text");
  const reasoningParts = parts.filter(
    (p): p is ReasoningPart => p.type === "reasoning",
  );
  const toolParts = parts.filter((p): p is ToolPart => p.type === "tool");

  // Build content from text parts
  const content = textParts.map((p) => p.text).join("");

  // Build visible content (same as content for now)
  const visibleContent = content;

  // Build thinking content from reasoning parts
  const thinkingContent =
    reasoningParts.length > 0
      ? reasoningParts.map((p) => p.text).join("")
      : null;

  // Calculate thinking duration
  const thinkingDurationSeconds =
    reasoningParts.length > 0 && reasoningParts[0]?.time
      ? (reasoningParts[0].time.end ?? 0) - reasoningParts[0].time.start
      : null;

  // Convert tool parts to simple format
  const convertedParts: SessionMessagePart[] = [
    ...textParts.map((p) => ({
      type: "text" as const,
      content: p.text,
      durationSeconds: p.time?.end ? p.time.end - p.time.start : null,
    })),
    ...reasoningParts.map((p) => ({
      type: "reasoning" as const,
      content: p.text,
      durationSeconds: p.time?.end ? p.time.end - p.time.start : null,
    })),
    ...toolParts.map((p) => ({
      type: "tool" as const,
      content: JSON.stringify({
        id: p.id,
        tool: p.tool,
        state: p.state,
      }),
      durationSeconds:
        p.state && "time" in p.state && p.state.time
          ? "end" in p.state.time
            ? p.state.time.end - p.state.time.start
            : null
          : null,
    })),
  ];

  // Extract token info from assistant message
  const assistantMessage =
    message as import("../opencode-types").AssistantMessage;
  const tokens = assistantMessage.tokens
    ? {
        input: assistantMessage.tokens.input,
        output: assistantMessage.tokens.output,
        reasoning: assistantMessage.tokens.reasoning,
        cache: {
          read: assistantMessage.tokens.cache.read,
          write: assistantMessage.tokens.cache.write,
        },
      }
    : undefined;

  return {
    id: message.id,
    sessionID: message.sessionID,
    role: message.role,
    content,
    visibleContent,
    thinkingContent,
    thinkingDurationSeconds,
    parts: convertedParts,
    createdAt: message.time.created,
    time: message.time,
    tokens,
    cost: assistantMessage.cost,
  };
}

export const messageKeys = {
  all: ["messages"] as const,
  lists: () => [...messageKeys.all, "list"] as const,
  list: (sessionId: string) => [...messageKeys.lists(), sessionId] as const,
};

export function useSessionMessages(sessionId: string, limit = 100) {
  return useQuery<SessionMessage[]>({
    queryKey: messageKeys.list(sessionId),
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const response = await baseApi.get<{
        messages: SessionMessageResponse[];
      }>(`/sessions/${sessionId}/messages`, {
        params: { limit },
      });

      return (response.data.messages ?? []).map(adaptMessage);
    },
  });
}
