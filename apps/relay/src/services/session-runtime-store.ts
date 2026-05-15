import type {
  PermissionRequestEvent,
  QuestionRequestEvent,
  SessionAbortedEvent,
  SessionPromptResponseEvent,
  SessionStreamChunkEvent,
} from "../shared/types";

const ACTIVE_PHASES = new Set([
  "pending",
  "streaming",
  "awaiting_permission",
  "awaiting_question",
]);
const TERMINAL_PHASES = new Set(["completed", "failed", "aborted"]);
const ACTIVE_RUNTIME_EXPIRY_MS = 30 * 60 * 1000;
const TERMINAL_RUNTIME_EXPIRY_MS = 15 * 1000;
const MAX_CHUNKS_PER_RUNTIME = 400;
const MAX_CHUNK_BYTES_PER_RUNTIME = 256 * 1024;

export type SessionRuntimePhase =
  | "pending"
  | "streaming"
  | "awaiting_permission"
  | "awaiting_question"
  | "completed"
  | "failed"
  | "aborted";

export type SessionRuntimeSnapshot = {
  sessionKey: string;
  sessionId: string;
  agentProviderId?: string;
  projectId: string;
  requestId: string;
  serverId: string;
  phase: SessionRuntimePhase;
  lastActivityAt: number;
  updatedAt: number;
  lastStatusText: string | null;
  lastToolLabel: string | null;
  baselineMessageId?: string | null;
  pendingPermission?: PermissionRequestEvent;
  pendingQuestion?: QuestionRequestEvent;
};

export type SessionRuntimeDetail = SessionRuntimeSnapshot & {
  bufferedChunks: SessionStreamChunkEvent[];
};

type SessionRuntimeEntry = SessionRuntimeSnapshot & {
  bufferedChunks: SessionStreamChunkEvent[];
  bufferedChunkBytes: number;
  expiresAt: number;
};

const runtimeByUser = new Map<string, Map<string, SessionRuntimeEntry>>();

export function buildSessionKey(
  sessionId: string,
  agentProviderId?: string | null,
): string {
  return `${agentProviderId || "opencode"}:${sessionId}`;
}

function getUserRuntimes(userId: string): Map<string, SessionRuntimeEntry> {
  let runtimes = runtimeByUser.get(userId);
  if (!runtimes) {
    runtimes = new Map();
    runtimeByUser.set(userId, runtimes);
  }
  return runtimes;
}

function chunkSize(chunk: SessionStreamChunkEvent): number {
  return Buffer.byteLength(JSON.stringify(chunk), "utf8");
}

function isExpired(entry: SessionRuntimeEntry, now: number): boolean {
  return entry.expiresAt <= now;
}

function touchEntry(
  entry: SessionRuntimeEntry,
  phase = entry.phase,
): SessionRuntimeEntry {
  const now = Date.now();
  entry.phase = phase;
  entry.updatedAt = now;
  entry.lastActivityAt = now;
  entry.expiresAt =
    now +
    (TERMINAL_PHASES.has(phase)
      ? TERMINAL_RUNTIME_EXPIRY_MS
      : ACTIVE_RUNTIME_EXPIRY_MS);
  return entry;
}

function cleanupUserRuntimes(userId: string): void {
  const runtimes = runtimeByUser.get(userId);
  if (!runtimes) {
    return;
  }

  const now = Date.now();
  for (const [sessionKey, entry] of runtimes.entries()) {
    if (isExpired(entry, now)) {
      runtimes.delete(sessionKey);
    }
  }

  if (runtimes.size === 0) {
    runtimeByUser.delete(userId);
  }
}

function getEntryByRequestId(
  userId: string,
  requestId: string,
): SessionRuntimeEntry | null {
  cleanupUserRuntimes(userId);
  const runtimes = runtimeByUser.get(userId);
  if (!runtimes) {
    return null;
  }

  for (const entry of runtimes.values()) {
    if (entry.requestId === requestId) {
      return entry;
    }
  }
  return null;
}

function trimBufferedChunks(entry: SessionRuntimeEntry): void {
  while (
    entry.bufferedChunks.length > MAX_CHUNKS_PER_RUNTIME ||
    entry.bufferedChunkBytes > MAX_CHUNK_BYTES_PER_RUNTIME
  ) {
    const removed = entry.bufferedChunks.shift();
    if (!removed) {
      break;
    }
    entry.bufferedChunkBytes -= chunkSize(removed);
  }
}

function snapshotEntry(entry: SessionRuntimeEntry): SessionRuntimeSnapshot {
  return {
    sessionKey: entry.sessionKey,
    sessionId: entry.sessionId,
    agentProviderId: entry.agentProviderId,
    projectId: entry.projectId,
    requestId: entry.requestId,
    serverId: entry.serverId,
    phase: entry.phase,
    lastActivityAt: entry.lastActivityAt,
    updatedAt: entry.updatedAt,
    lastStatusText: entry.lastStatusText,
    lastToolLabel: entry.lastToolLabel,
    baselineMessageId: entry.baselineMessageId,
    pendingPermission: entry.pendingPermission,
    pendingQuestion: entry.pendingQuestion,
  };
}

export function upsertPendingSessionRuntime(input: {
  userId: string;
  serverId: string;
  sessionId: string;
  agentProviderId?: string;
  projectId: string;
  requestId: string;
  baselineMessageId?: string | null;
}): SessionRuntimeSnapshot {
  cleanupUserRuntimes(input.userId);
  const runtimes = getUserRuntimes(input.userId);
  const sessionKey = buildSessionKey(input.sessionId, input.agentProviderId);
  const current = runtimes.get(sessionKey);
  const entry: SessionRuntimeEntry = touchEntry(
    current ?? {
      sessionKey,
      sessionId: input.sessionId,
      agentProviderId: input.agentProviderId,
      projectId: input.projectId,
      requestId: input.requestId,
      serverId: input.serverId,
      phase: "pending",
      lastActivityAt: Date.now(),
      updatedAt: Date.now(),
      lastStatusText: null,
      lastToolLabel: null,
      baselineMessageId: input.baselineMessageId ?? null,
      pendingPermission: undefined,
      pendingQuestion: undefined,
      bufferedChunks: [],
      bufferedChunkBytes: 0,
      expiresAt: 0,
    },
    "pending",
  );

  entry.sessionId = input.sessionId;
  entry.agentProviderId = input.agentProviderId;
  entry.projectId = input.projectId;
  entry.requestId = input.requestId;
  entry.serverId = input.serverId;
  entry.baselineMessageId = input.baselineMessageId ?? entry.baselineMessageId;
  runtimes.set(sessionKey, entry);
  return snapshotEntry(entry);
}

export function markSessionPromptStarted(input: {
  userId: string;
  serverId: string;
  sessionId: string;
  agentProviderId?: string;
  projectId: string;
  requestId: string;
}): SessionRuntimeSnapshot {
  return upsertPendingSessionRuntime(input);
}

export function appendSessionStreamChunk(
  userId: string,
  payload: SessionStreamChunkEvent & { serverId: string },
): SessionRuntimeSnapshot {
  let current = getEntryByRequestId(userId, payload.requestId);
  if (!current) {
    upsertPendingSessionRuntime({
      userId,
      serverId: payload.serverId,
      sessionId: payload.sessionId,
      agentProviderId: payload.agentProviderId,
      projectId: payload.projectId,
      requestId: payload.requestId,
    });
    current = getSessionRuntimeEntry(
      userId,
      payload.sessionId,
      payload.agentProviderId,
    );
  }

  if (!current) {
    throw new Error(`Missing runtime entry for ${payload.sessionId}`);
  }

  if (payload.type === "status") {
    current.lastStatusText = payload.chunk || current.lastStatusText;
  } else if (payload.type === "tool" || payload.type === "step") {
    current.lastToolLabel = payload.chunk || current.lastToolLabel;
  }

  current.pendingPermission = undefined;
  current.pendingQuestion = undefined;
  touchEntry(current, payload.isComplete ? "completed" : "streaming");
  current.bufferedChunks.push(payload);
  current.bufferedChunkBytes += chunkSize(payload);
  trimBufferedChunks(current);
  return snapshotEntry(current);
}

function getSessionRuntimeEntry(
  userId: string,
  sessionId: string,
  agentProviderId?: string,
): SessionRuntimeEntry | null {
  const runtimes = runtimeByUser.get(userId);
  if (!runtimes) {
    return null;
  }
  return runtimes.get(buildSessionKey(sessionId, agentProviderId)) ?? null;
}

export function markSessionPermissionRequest(
  userId: string,
  serverId: string,
  payload: PermissionRequestEvent,
): SessionRuntimeSnapshot {
  upsertPendingSessionRuntime({
    userId,
    serverId,
    sessionId: payload.sessionId,
    agentProviderId: payload.agentProviderId,
    projectId: payload.projectId,
    requestId: payload.requestId,
  });
  const runtimes = getUserRuntimes(userId);
  const entry = runtimes.get(
    buildSessionKey(payload.sessionId, payload.agentProviderId),
  );
  if (!entry) {
    throw new Error("Failed to store permission runtime");
  }
  entry.pendingPermission = payload;
  entry.pendingQuestion = undefined;
  touchEntry(entry, "awaiting_permission");
  return snapshotEntry(entry);
}

export function markSessionQuestionRequest(
  userId: string,
  serverId: string,
  payload: QuestionRequestEvent,
): SessionRuntimeSnapshot {
  upsertPendingSessionRuntime({
    userId,
    serverId,
    sessionId: payload.sessionId,
    agentProviderId: payload.agentProviderId,
    projectId: payload.projectId,
    requestId: payload.requestId,
  });
  const runtimes = getUserRuntimes(userId);
  const entry = runtimes.get(
    buildSessionKey(payload.sessionId, payload.agentProviderId),
  );
  if (!entry) {
    throw new Error("Failed to store question runtime");
  }
  entry.pendingPermission = undefined;
  entry.pendingQuestion = payload;
  touchEntry(entry, "awaiting_question");
  return snapshotEntry(entry);
}

export function clearSessionInteractionRuntime(
  userId: string,
  requestId: string,
): SessionRuntimeSnapshot | null {
  const entry = getEntryByRequestId(userId, requestId);
  if (!entry) {
    return null;
  }
  entry.pendingPermission = undefined;
  entry.pendingQuestion = undefined;
  touchEntry(entry, ACTIVE_PHASES.has(entry.phase) ? "streaming" : "pending");
  return snapshotEntry(entry);
}

export function markSessionPromptResponse(
  userId: string,
  payload: SessionPromptResponseEvent,
): SessionRuntimeSnapshot | null {
  cleanupUserRuntimes(userId);
  const runtimes = getUserRuntimes(userId);
  let previousKey: string | null = null;
  let entry: SessionRuntimeEntry | null = null;

  for (const [sessionKey, candidate] of runtimes.entries()) {
    if (candidate.requestId === payload.requestId) {
      previousKey = sessionKey;
      entry = candidate;
      break;
    }
  }

  if (!entry) {
    return null;
  }

  const nextSessionKey = buildSessionKey(
    payload.sessionId,
    payload.agentProviderId ?? entry.agentProviderId,
  );
  entry.sessionId = payload.sessionId;
  entry.agentProviderId = payload.agentProviderId ?? entry.agentProviderId;
  entry.projectId = payload.projectId;
  entry.pendingPermission = undefined;
  entry.pendingQuestion = undefined;
  entry.lastStatusText = payload.success ? entry.lastStatusText : payload.error ?? null;
  touchEntry(entry, payload.success ? "completed" : "failed");

  if (previousKey && previousKey !== nextSessionKey) {
    runtimes.delete(previousKey);
    entry.sessionKey = nextSessionKey;
    runtimes.set(nextSessionKey, entry);
  }

  return snapshotEntry(entry);
}

export function markSessionAborted(
  userId: string,
  payload: SessionAbortedEvent,
): SessionRuntimeSnapshot | null {
  const entry =
    getEntryByRequestId(userId, payload.requestId ?? "") ??
    getSessionRuntimeEntry(userId, payload.sessionId, payload.agentProviderId);
  if (!entry) {
    return null;
  }
  entry.pendingPermission = undefined;
  entry.pendingQuestion = undefined;
  entry.projectId = payload.projectId ?? entry.projectId;
  touchEntry(entry, "aborted");
  return snapshotEntry(entry);
}

export function getSessionRuntimeByKey(
  userId: string,
  sessionId: string,
  agentProviderId?: string,
): SessionRuntimeDetail | null {
  cleanupUserRuntimes(userId);
  const runtimes = runtimeByUser.get(userId);
  if (!runtimes) {
    return null;
  }
  const entry = runtimes.get(buildSessionKey(sessionId, agentProviderId));
  if (!entry) {
    return null;
  }
  return {
    ...snapshotEntry(entry),
    bufferedChunks: [...entry.bufferedChunks],
  };
}

export function listSessionRuntimes(
  userId: string,
  options?: { activeOnly?: boolean },
): SessionRuntimeSnapshot[] {
  cleanupUserRuntimes(userId);
  const runtimes = runtimeByUser.get(userId);
  if (!runtimes) {
    return [];
  }

  const activeOnly = options?.activeOnly ?? true;

  return [...runtimes.values()]
    .filter((entry) => (activeOnly ? ACTIVE_PHASES.has(entry.phase) : true))
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map(snapshotEntry);
}
