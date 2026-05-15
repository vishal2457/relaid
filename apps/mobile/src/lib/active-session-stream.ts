import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PermissionRequest, QuestionRequest } from "@/src/components/PermissionCard";
import type { SessionMessage } from "@/src/lib/api/messages";

const ACTIVE_SESSION_RUNTIMES_KEY = "active_session_runtimes";

export const FOLLOW_UP_SESSION_REFRESH_DELAY_MS = 750;

export type SessionRuntimePhase =
  | "pending"
  | "streaming"
  | "awaiting_permission"
  | "awaiting_question"
  | "completed"
  | "failed"
  | "aborted";

export type SessionRuntime = {
  sessionKey: string;
  sessionId: string;
  agentProviderId?: string;
  projectId: string;
  requestId: string;
  phase: SessionRuntimePhase;
  updatedAt: number;
  lastActivityAt: number;
  lastStatusText: string | null;
  lastToolLabel: string | null;
  baselineMessageId?: string | null;
  pendingPermission?: PermissionRequest;
  pendingQuestion?: QuestionRequest;
};

export type SessionRuntimeMap = Record<string, SessionRuntime>;

export function makeSessionKey(
  sessionId: string,
  agentProviderId?: string | null,
): string {
  return `${agentProviderId || "opencode"}:${sessionId}`;
}

export function isActiveRuntimePhase(phase: SessionRuntimePhase): boolean {
  return (
    phase === "pending" ||
    phase === "streaming" ||
    phase === "awaiting_permission" ||
    phase === "awaiting_question"
  );
}

export function isStreamingSessionStatus(status?: string | null): boolean {
  return status === "pending" || status === "running";
}

function isSessionRuntime(value: unknown): value is SessionRuntime {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sessionKey === "string" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.projectId === "string" &&
    typeof candidate.requestId === "string" &&
    typeof candidate.updatedAt === "number" &&
    typeof candidate.lastActivityAt === "number" &&
    (typeof candidate.agentProviderId === "string" ||
      candidate.agentProviderId == null)
  );
}

function normalizeRuntimeMap(value: unknown): SessionRuntimeMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  const next: SessionRuntimeMap = {};
  for (const [sessionKey, runtime] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (isSessionRuntime(runtime)) {
      next[sessionKey] = runtime;
    }
  }
  return next;
}

export async function getActiveSessionRuntimeMap(): Promise<SessionRuntimeMap> {
  try {
    const stored = await AsyncStorage.getItem(ACTIVE_SESSION_RUNTIMES_KEY);
    if (!stored) {
      return {};
    }

    return normalizeRuntimeMap(JSON.parse(stored));
  } catch {
    return {};
  }
}

export async function saveActiveSessionRuntimeMap(
  runtimes: SessionRuntimeMap,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      ACTIVE_SESSION_RUNTIMES_KEY,
      JSON.stringify(runtimes),
    );
  } catch {
    // Best-effort persistence for reconnect recovery.
  }
}

export async function upsertActiveSessionRuntime(
  runtime: SessionRuntime,
): Promise<void> {
  const current = await getActiveSessionRuntimeMap();
  current[runtime.sessionKey] = runtime;
  await saveActiveSessionRuntimeMap(current);
}

export async function removeActiveSessionRuntime(
  sessionKey: string,
): Promise<void> {
  const current = await getActiveSessionRuntimeMap();
  delete current[sessionKey];
  await saveActiveSessionRuntimeMap(current);
}

export async function clearActiveSessionStream(
  requestId?: string,
): Promise<void> {
  if (!requestId) {
    await saveActiveSessionRuntimeMap({});
    return;
  }

  const current = await getActiveSessionRuntimeMap();
  for (const [sessionKey, runtime] of Object.entries(current)) {
    if (runtime.requestId === requestId) {
      delete current[sessionKey];
    }
  }
  await saveActiveSessionRuntimeMap(current);
}

export async function getActiveSessionStream(): Promise<SessionRuntime | null> {
  const runtimes = await getActiveSessionRuntimeMap();
  const latest = Object.values(runtimes)
    .filter((runtime) => isActiveRuntimePhase(runtime.phase))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  return latest ?? null;
}

function hasRecoveredAssistantMessage(message: SessionMessage): boolean {
  if (message.role !== "assistant") {
    return false;
  }

  if (message.visibleContent.trim()) {
    return true;
  }

  if (message.parts.some((part) => part.type === "tool" || part.type === "step")) {
    return true;
  }

  return Boolean(message.time?.completed);
}

export function shouldScheduleSessionRefresh(
  messages: SessionMessage[] | undefined,
  output: string,
): boolean {
  if (!messages) {
    return true;
  }

  if (!output.trim()) {
    const lastMessage = messages[messages.length - 1];
    return !lastMessage || !hasRecoveredAssistantMessage(lastMessage);
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) {
    return true;
  }

  if (lastMessage.role !== "assistant") {
    return true;
  }

  return !hasRecoveredAssistantMessage(lastMessage);
}

export function hasRecoveredAssistantResponse(
  messages: SessionMessage[] | undefined,
  baselineMessageId?: string | null,
): boolean {
  if (!messages?.length) {
    return false;
  }

  const baselineIndex = baselineMessageId
    ? messages.findIndex((message) => message.id === baselineMessageId)
    : -1;
  const candidateMessages =
    baselineIndex >= 0 ? messages.slice(baselineIndex + 1) : messages;

  return candidateMessages.some(hasRecoveredAssistantMessage);
}
