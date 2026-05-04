import type { MessageSummary, SessionMessage } from "@/src/lib/api/messages";

export interface AssistantResponseSummaryContext {
  messageID: string;
  summary: MessageSummary;
}

function hasFileChangeActivity(message: SessionMessage | undefined): boolean {
  if (!message || message.role !== "assistant") {
    return false;
  }

  return (message.assistant?.activities ?? []).some(
    (activity) =>
      (activity.kind === "edit" || activity.kind === "write") &&
      ((activity.items?.length ?? 0) > 0 ||
        activity.patch !== null ||
        activity.oldContent !== null ||
        activity.newContent !== null ||
        activity.additions !== null ||
        activity.deletions !== null),
  );
}

export function getAssistantResponseSummaryContext(
  messages: SessionMessage[],
  index: number,
): AssistantResponseSummaryContext | undefined {
  const currentMessage = messages[index];

  if (!currentMessage || currentMessage.role !== "assistant") {
    return undefined;
  }

  let segmentEnd = index;
  while (messages[segmentEnd + 1]?.role === "assistant") {
    segmentEnd += 1;
  }

  let segmentStart = index;
  while (messages[segmentStart - 1]?.role === "assistant") {
    segmentStart -= 1;
  }

  let preferredAssistantIndex = -1;
  for (let cursor = segmentEnd; cursor >= segmentStart; cursor -= 1) {
    if (hasFileChangeActivity(messages[cursor])) {
      preferredAssistantIndex = cursor;
      break;
    }
  }

  const eligibleIndex =
    preferredAssistantIndex >= 0 ? preferredAssistantIndex : segmentEnd;

  if (index !== eligibleIndex) {
    return undefined;
  }

  for (let cursor = segmentStart; cursor >= 0; cursor -= 1) {
    const candidate = messages[cursor];

    if (!candidate) {
      return undefined;
    }

    if (candidate.role === "assistant") {
      continue;
    }

    if (candidate.role === "user" && candidate.summary) {
      return {
        messageID: candidate.id,
        summary: candidate.summary,
      };
    }

    return undefined;
  }

  return undefined;
}
