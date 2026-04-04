import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SessionMessage } from "@/lib/api/messages";

const ACTIVE_SESSION_STREAM_KEY = "active_session_stream";

export const FOLLOW_UP_SESSION_REFRESH_DELAY_MS = 750;

export type ActiveSessionStream = {
  requestId: string;
  sessionId: string;
  projectId: string;
  baselineMessageId?: string | null;
};

function isActiveSessionStream(value: unknown): value is ActiveSessionStream {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.requestId === "string" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.projectId === "string" &&
    (typeof candidate.baselineMessageId === "string" ||
      candidate.baselineMessageId == null)
  );
}

export function isStreamingSessionStatus(status?: string | null): boolean {
  return status === "pending" || status === "running";
}

export async function getActiveSessionStream(): Promise<ActiveSessionStream | null> {
  try {
    const stored = await AsyncStorage.getItem(ACTIVE_SESSION_STREAM_KEY);
    if (!stored) {
      return null;
    }

    const parsed: unknown = JSON.parse(stored);
    return isActiveSessionStream(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveActiveSessionStream(
  stream: ActiveSessionStream,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      ACTIVE_SESSION_STREAM_KEY,
      JSON.stringify(stream),
    );
  } catch {
    // Best-effort persistence for reconnect recovery.
  }
}

export async function clearActiveSessionStream(
  requestId?: string,
): Promise<void> {
  try {
    if (!requestId) {
      await AsyncStorage.removeItem(ACTIVE_SESSION_STREAM_KEY);
      return;
    }

    const current = await getActiveSessionStream();
    if (!current || current.requestId === requestId) {
      await AsyncStorage.removeItem(ACTIVE_SESSION_STREAM_KEY);
    }
  } catch {
    // Best-effort cleanup for reconnect recovery.
  }
}

export function shouldScheduleSessionRefresh(
  messages: SessionMessage[] | undefined,
  output: string,
): boolean {
  if (!output.trim()) {
    return false;
  }

  const lastMessage = messages?.[messages.length - 1];
  if (!lastMessage) {
    return true;
  }

  if (lastMessage.role !== "assistant") {
    return true;
  }

  return !lastMessage.visibleContent.trim();
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

  return candidateMessages.some(
    (message) =>
      message.role === "assistant" && Boolean(message.visibleContent.trim()),
  );
}
