import type { MessageSummary, SessionMessage } from "@/lib/api/messages";

export interface AssistantResponseSummaryContext {
  messageID: string;
  summary: MessageSummary;
}

export function getAssistantResponseSummaryContext(
  messages: SessionMessage[],
  index: number,
): AssistantResponseSummaryContext | undefined {
  const currentMessage = messages[index];

  if (!currentMessage || currentMessage.role !== "assistant") {
    return undefined;
  }

  if (messages[index + 1]?.role === "assistant") {
    return undefined;
  }

  for (let cursor = index; cursor >= 0; cursor -= 1) {
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
