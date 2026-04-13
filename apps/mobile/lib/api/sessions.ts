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

type SessionLike = OpenCodeSession & Record<string, unknown>;

function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeSessionStatus(value: unknown): SessionStatus {
  switch (value) {
    case "pending":
    case "running":
    case "completed":
    case "aborted":
      return value;
    case "error":
    case "failed":
      return "failed";
    default:
      return "completed";
  }
}

// Convert OpenCode Session to mobile Session
export function adaptSession(openCodeSession: OpenCodeSession): Session {
  const raw = openCodeSession as SessionLike;
  const prompt =
    (typeof raw.prompt === "string" && raw.prompt.trim()) ||
    openCodeSession.title ||
    "Untitled session";
  const createdAt =
    parseTimestamp(openCodeSession.time?.created) ??
    parseTimestamp(raw.createdAt) ??
    Date.now();
  const updatedAt =
    parseTimestamp(openCodeSession.time?.updated) ??
    parseTimestamp(raw.updatedAt) ??
    createdAt;
  const completedAt =
    parseTimestamp(raw.completedAt) ??
    (normalizeSessionStatus(raw.status) === "running" ? null : updatedAt);

  return {
    id: openCodeSession.id,
    projectID:
      (typeof raw.projectID === "string" && raw.projectID) ||
      (typeof raw.projectId === "string" && raw.projectId) ||
      openCodeSession.projectID,
    title: openCodeSession.title,
    directory: openCodeSession.directory,
    createdAt,
    updatedAt,
    summary: openCodeSession.summary,
    share: openCodeSession.share,
    prompt,
    completedAt,
    status: normalizeSessionStatus(raw.status),
    output:
      typeof raw.output === "string" || raw.output === null
        ? (raw.output as string | null)
        : null,
    error:
      typeof raw.error === "string" || raw.error === null
        ? (raw.error as string | null)
        : null,
    exitCode:
      typeof raw.exitCode === "number" || raw.exitCode === null
        ? (raw.exitCode as number | null)
        : null,
    duration:
      typeof raw.duration === "number" || raw.duration === null
        ? (raw.duration as number | null)
        : null,
    startedAt: parseTimestamp(raw.startedAt),
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

export function useSessions(cwd: string) {
  return useQuery<Session[]>({
    queryKey: sessionsKeys.list({ cwd }),
    enabled: Boolean(cwd),
    queryFn: async () => {
      const response = await baseApi.get<{ sessions: OpenCodeSession[] }>(
        "/sessions",
        {
          params: { cwd },
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
