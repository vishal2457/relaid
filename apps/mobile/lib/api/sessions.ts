import { useMutation, useQuery } from "@tanstack/react-query";
import baseApi from "../axios/base";
import { queryClient } from "../query-client";
import type { Session as OpenCodeSession } from "../opencode-types";

export type SessionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "aborted";

// Mobile app representation of a session
// Adapts from OpenCode Session type to what the mobile UI expects
export interface Session {
  id: string;
  projectID: string;
  projectName?: string;
  status: SessionStatus;
  title: string;
  directory: string;
  createdAt: number;
  updatedAt: number;
  summary?: OpenCodeSession["summary"];
  share?: OpenCodeSession["share"];
  // Legacy fields for backward compatibility with UI
  // These come from session execution messages, not the session definition
  prompt?: string;
  output?: string | null;
  error?: string | null;
  exitCode?: number | null;
  duration?: number | null;
  startedAt?: number | null;
  completedAt?: number | null;
}

// Convert OpenCode Session to mobile Session
export function adaptSession(openCodeSession: OpenCodeSession): Session {
  // Use title as prompt for display (or fallback to "Untitled")
  const prompt = openCodeSession.title || "Untitled session";

  // completedAt can be derived from time.updated (or we could get messages to find completion)
  const completedAt = openCodeSession.time.updated;

  return {
    id: openCodeSession.id,
    projectID: openCodeSession.projectID,
    title: openCodeSession.title,
    directory: openCodeSession.directory,
    createdAt: openCodeSession.time.created,
    updatedAt: openCodeSession.time.updated,
    summary: openCodeSession.summary,
    share: openCodeSession.share,
    // Map title to prompt for backward compatibility with UI
    prompt,
    completedAt,
    // Status needs to be fetched separately or inferred
    status: "completed" as SessionStatus,
  };
}

export const sessionsKeys = {
  all: ["sessions"] as const,
  lists: () => [...sessionsKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...sessionsKeys.lists(), filters] as const,
  details: () => [...sessionsKeys.all, "detail"] as const,
  detail: (id: string) => [...sessionsKeys.details(), id] as const,
};

export function useSessions(projectId: string) {
  return useQuery<Session[]>({
    queryKey: sessionsKeys.list({ projectId }),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const response = await baseApi.get<{ sessions: OpenCodeSession[] }>(
        "/sessions",
        {
          params: { projectId },
        },
      );
      return (response.data.sessions ?? []).map(adaptSession);
    },
  });
}

export function useSession(sessionId: string) {
  return useQuery<Session | null>({
    queryKey: sessionsKeys.detail(sessionId),
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const response = await baseApi.get<{ session: OpenCodeSession | null }>(
        `/sessions/${sessionId}`,
      );
      return response.data.session ? adaptSession(response.data.session) : null;
    },
  });
}

export async function createSession(projectId: string) {
  const response = await baseApi.post<{ session: OpenCodeSession }>(
    "/sessions",
    {
      projectId,
      prompt: "",
    },
  );

  return adaptSession(response.data.session);
}

export function useCreateSession() {
  return useMutation({
    mutationFn: createSession,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionsKeys.all });
    },
  });
}
