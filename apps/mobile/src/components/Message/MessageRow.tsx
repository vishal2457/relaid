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
        const hasDiff =
          item.patch ||
          item.oldContent !== null ||
          item.newContent !== null ||
          item.additions !== null ||
          item.deletions !== null;

        if (!hasDiff) {
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

    const hasDiff =
      activity.patch ||
      activity.oldContent !== null ||
      activity.newContent !== null ||
      activity.additions !== null ||
      activity.deletions !== null;

    if (!hasDiff) {
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
    borderColor,
    metaColor,
    userBubble,
    assistantBubble,
    systemBubble,
    textColor,
  }) => {
    const summary =
      responseSummary?.summary ?? getDerivedAssistantSummary(message);
    const showResponseSummary =
      message.role === "assistant" &&
      !!summary &&
      (Boolean(summary.title) ||
        Boolean(summary.body) ||
        summary.diffs.length > 0);

    return (
      <View>
        <MessageBubble
          message={message}
          borderColor={borderColor}
          metaColor={metaColor}
          userBubble={userBubble}
          assistantBubble={assistantBubble}
          systemBubble={systemBubble}
          textColor={textColor}
        />

        {showResponseSummary && summary ? (
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
