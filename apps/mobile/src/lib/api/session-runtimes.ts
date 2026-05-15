import { useQuery } from "@tanstack/react-query";
import type { PermissionRequest, QuestionRequest } from "@/src/components/PermissionCard";
import { decryptFromServer, type EncryptedEnvelope } from "@/src/lib/e2ee";
import type { SessionStreamChunkEvent } from "@/src/lib/sse/events";
import baseApi from "../axios/base";
import { getCurrentPairingSession } from "../pairing/session";
import {
  makeSessionKey,
  type SessionRuntime,
  type SessionRuntimePhase,
} from "../active-session-stream";

export type SessionRuntimeDetail = SessionRuntime & {
  bufferedChunks: SessionStreamChunkEvent[];
};

type RelayRuntimeSummary = {
  sessionKey: string;
  sessionId: string;
  agentProviderId?: string;
  projectId: string;
  requestId: string;
  phase: SessionRuntimePhase;
  lastActivityAt: number;
  updatedAt: number;
  lastStatusText: string | null;
  lastToolLabel: string | null;
  baselineMessageId?: string | null;
  pendingPermission?: PermissionRequest;
  pendingQuestion?: QuestionRequest;
};

type RelayRuntimeDetail = RelayRuntimeSummary & {
  bufferedChunks: SessionStreamChunkEvent[];
};

function adaptRuntime(runtime: RelayRuntimeSummary): SessionRuntime {
  const session = getCurrentPairingSession();
  const pendingPermission =
    session && (runtime.pendingPermission as any)?.sealedPayload
      ? ({
          ...(runtime.pendingPermission as any),
          ...decryptFromServer<Record<string, unknown>>(
            session,
            (runtime.pendingPermission as any).sealedPayload as EncryptedEnvelope,
          ),
        } as PermissionRequest)
      : runtime.pendingPermission;
  const pendingQuestion =
    session && (runtime.pendingQuestion as any)?.sealedPayload
      ? ({
          ...(runtime.pendingQuestion as any),
          ...decryptFromServer<Record<string, unknown>>(
            session,
            (runtime.pendingQuestion as any).sealedPayload as EncryptedEnvelope,
          ),
        } as QuestionRequest)
      : runtime.pendingQuestion;
  return {
    sessionKey:
      runtime.sessionKey ||
      makeSessionKey(runtime.sessionId, runtime.agentProviderId),
    sessionId: runtime.sessionId,
    agentProviderId: runtime.agentProviderId,
    projectId: runtime.projectId,
    requestId: runtime.requestId,
    phase: runtime.phase,
    updatedAt: runtime.updatedAt,
    lastActivityAt: runtime.lastActivityAt,
    lastStatusText: runtime.lastStatusText,
    lastToolLabel: runtime.lastToolLabel,
    baselineMessageId: runtime.baselineMessageId ?? null,
    pendingPermission,
    pendingQuestion,
  };
}

function adaptRuntimeDetail(runtime: RelayRuntimeDetail): SessionRuntimeDetail {
  const session = getCurrentPairingSession();
  const bufferedChunks = (runtime.bufferedChunks ?? []).map((chunk) => {
    if (!session || !(chunk as any).sealedPayload) {
      return chunk;
    }
    return {
      ...chunk,
      chunk: decryptFromServer<{ chunk: string }>(
        session,
        (chunk as any).sealedPayload as EncryptedEnvelope,
      ).chunk,
    };
  });
  return {
    ...adaptRuntime(runtime),
    bufferedChunks,
  };
}

export const sessionRuntimeKeys = {
  all: ["session-runtimes"] as const,
  lists: () => [...sessionRuntimeKeys.all, "list"] as const,
  list: () => [...sessionRuntimeKeys.lists()] as const,
  details: () => [...sessionRuntimeKeys.all, "detail"] as const,
  detail: (sessionId: string, agentProviderId?: string) =>
    [...sessionRuntimeKeys.details(), sessionId, agentProviderId ?? "opencode"] as const,
};

export async function fetchSessionRuntimes(): Promise<SessionRuntime[]> {
  const response = await baseApi.get<{ runtimes: RelayRuntimeSummary[] }>(
    "/mobile/session-runtimes",
    { suppressErrorToast: true },
  );
  return (response.data.runtimes ?? []).map(adaptRuntime);
}

export async function fetchSessionRuntimeDetail(
  sessionId: string,
  agentProviderId?: string,
): Promise<SessionRuntimeDetail | null> {
  const response = await baseApi.get<{ runtime: RelayRuntimeDetail | null }>(
    `/mobile/sessions/${sessionId}/runtime`,
    {
      params: { agentProviderId },
      suppressErrorToast: true,
    },
  );
  return response.data.runtime ? adaptRuntimeDetail(response.data.runtime) : null;
}

export function useSessionRuntimes(enabled = true) {
  return useQuery<SessionRuntime[]>({
    queryKey: sessionRuntimeKeys.list(),
    enabled,
    staleTime: 0,
    queryFn: fetchSessionRuntimes,
  });
}
