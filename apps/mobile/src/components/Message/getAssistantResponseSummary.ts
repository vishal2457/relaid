import type { MessageSummary, SessionMessage } from "@/src/lib/api/messages";

export interface AssistantResponseSummaryContext {
  messageID: string;
  summary: MessageSummary;
}

function hasVisibleDiffData({
  additions,
  deletions,
  patch,
  oldContent,
  newContent,
}: {
  additions?: number | null;
  deletions?: number | null;
  patch?: string | null;
  oldContent?: string | null;
  newContent?: string | null;
}): boolean {
  return Boolean(
    patch ||
      (oldContent !== null && oldContent !== undefined) ||
      (newContent !== null && newContent !== undefined) ||
      (typeof additions === "number" && additions > 0) ||
      (typeof deletions === "number" && deletions > 0),
  );
}

function hasFileChangeActivity(message: SessionMessage | undefined): boolean {
  if (!message || message.role !== "assistant") {
    return false;
  }

  return (message.assistant?.activities ?? []).some(
    (activity) =>
      (activity.kind === "edit" || activity.kind === "write") &&
      ((activity.items?.some((item) => hasVisibleDiffData(item)) ?? false) ||
        hasVisibleDiffData(activity)),
  );
}

function segmentHasFileChangeActivity(
  messages: SessionMessage[],
  start: number,
  end: number,
): boolean {
  for (let cursor = start; cursor <= end; cursor += 1) {
    if (hasFileChangeActivity(messages[cursor])) {
      return true;
    }
  }

  return false;
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

  const hasFileChangeSummary = segmentHasFileChangeActivity(
    messages,
    segmentStart,
    segmentEnd,
  );

  if (index !== segmentEnd) {
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
      if (candidate.summary.diffs.length > 0 && !hasFileChangeSummary) {
        return undefined;
      }

      return {
        messageID: candidate.id,
        summary: candidate.summary,
      };
    }

    return undefined;
  }

  return undefined;
}
