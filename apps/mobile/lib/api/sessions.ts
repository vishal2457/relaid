import { useMutation, useQuery } from "@tanstack/react-query";
import baseApi from "../axios/base";
import { queryClient } from "../query-client";

export type SessionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "aborted";

export type Session = {
  id: string;
  projectId: string;
  projectName?: string;
  status: SessionStatus;
  prompt: string;
  output: string | null;
  error: string | null;
  exitCode: number | null;
  duration: number | null;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

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
      const response = await baseApi.get<{ sessions: Session[] }>("/sessions", {
        params: { projectId },
      });
      return response.data.sessions ?? [];
    },
  });
}

export async function createSession(projectId: string) {
  const response = await baseApi.post<{ session: Session }>("/sessions", {
    projectId,
    prompt: "",
  });

  return response.data.session;
}

export function useCreateSession() {
  return useMutation({
    mutationFn: createSession,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sessionsKeys.all });
    },
  });
}
