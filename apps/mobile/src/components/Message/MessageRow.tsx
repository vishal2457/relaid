import React from "react";
import { View } from "react-native";
import { MessageBubble } from "./MessageBubble";
import { MessageSummaryDiffs } from "./MessageSummaryDiffs";
import {
  type FileDiff,
  type MessageSummary,
  type SessionMessage,
} from "@/src/lib/api/messages";
import type { AssistantResponseSummaryContext } from "./getAssistantResponseSummary";

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

function getDerivedAssistantSummary(
  message: SessionMessage,
): MessageSummary | undefined {
  if (message.role !== "assistant") {
    return undefined;
  }

  const diffs: FileDiff[] = [];

  for (const activity of message.assistant?.activities ?? []) {
    if (activity.kind !== "edit" && activity.kind !== "write") {
      continue;
    }

    if (activity.items && activity.items.length > 0) {
      for (const item of activity.items) {
        if (!hasVisibleDiffData(item)) {
          continue;
        }

        diffs.push({
          file: item.filename ?? item.label,
          before: item.oldContent ?? "",
          after: item.newContent ?? "",
          additions: item.additions ?? 0,
          deletions: item.deletions ?? 0,
          patch: item.patch ?? undefined,
        });
      }
      continue;
    }

    if (!hasVisibleDiffData(activity)) {
      continue;
    }

    diffs.push({
      file: activity.filename ?? activity.label,
      before: activity.oldContent ?? "",
      after: activity.newContent ?? "",
      additions: activity.additions ?? 0,
      deletions: activity.deletions ?? 0,
      patch: activity.patch ?? undefined,
    });
  }

  if (diffs.length === 0) {
    return undefined;
  }

  return {
    diffs,
  };
}

interface MessageRowProps {
  message: SessionMessage;
  responseSummary?: AssistantResponseSummaryContext;
  showAssistantMeta?: boolean;
  showResponseSummary?: boolean;
  onCopyAssistantResponse?: ((message: SessionMessage) => void) | undefined;
  borderColor: string;
  metaColor: string;
  userBubble: string;
  assistantBubble: string;
  systemBubble: string;
  textColor: string;
}

export const MessageRow: React.FC<MessageRowProps> = React.memo(
  ({
    message,
    responseSummary,
    showAssistantMeta = true,
    showResponseSummary = true,
    onCopyAssistantResponse,
    borderColor,
    metaColor,
    userBubble,
    assistantBubble,
    systemBubble,
    textColor,
  }) => {
    const summary =
      showResponseSummary
        ? responseSummary?.summary ?? getDerivedAssistantSummary(message)
        : undefined;
    const shouldShowResponseSummary =
      message.role === "assistant" &&
      !!summary &&
      (Boolean(summary.title) ||
        Boolean(summary.body) ||
        summary.diffs.length > 0);

    return (
      <View>
        <MessageBubble
          message={message}
          showAssistantMeta={showAssistantMeta}
          onLongPress={
            message.role === "assistant" && onCopyAssistantResponse
              ? () => onCopyAssistantResponse(message)
              : undefined
          }
          borderColor={borderColor}
          metaColor={metaColor}
          userBubble={userBubble}
          assistantBubble={assistantBubble}
          systemBubble={systemBubble}
          textColor={textColor}
        />

        {shouldShowResponseSummary && summary ? (
          <MessageSummaryDiffs
            summary={summary}
            borderColor={borderColor}
            metaColor={metaColor}
            textColor={textColor}
          />
        ) : null}
      </View>
    );
  },
);

MessageRow.displayName = "MessageRow";
