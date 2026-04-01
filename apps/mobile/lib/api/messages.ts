import { useQuery } from "@tanstack/react-query";
import baseApi from "../axios/base";

export type SessionMessageRole = "user" | "assistant" | "system";

export type SessionMessagePart = {
  type: "text" | "reasoning" | "tool" | "step" | "other";
  content: string;
  durationSeconds: number | null;
};

export type SessionMessage = {
  id: string;
  sessionId: string;
  role: SessionMessageRole;
  content: string;
  visibleContent: string;
  thinkingContent: string | null;
  thinkingDurationSeconds: number | null;
  parts: SessionMessagePart[];
  createdAt: string;
};

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
      const response = await baseApi.get<{ messages: SessionMessage[] }>(
        `/sessions/${sessionId}/messages`,
        {
          params: { limit },
        },
      );

      return response.data.messages ?? [];
    },
  });
}
