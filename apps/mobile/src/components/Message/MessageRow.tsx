import React from "react";
import { View } from "react-native";
import { MessageBubble } from "./MessageBubble";
import { MessageSummaryDiffs } from "./MessageSummaryDiffs";
import {
  type SessionMessage,
} from "@/src/lib/api/messages";
import type { AssistantResponseSummaryContext } from "./getAssistantResponseSummary";

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
    const showResponseSummary =
      message.role === "assistant" &&
      !!responseSummary &&
      (Boolean(responseSummary.summary.title) ||
        Boolean(responseSummary.summary.body) ||
        responseSummary.summary.diffs.length > 0);

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

        {showResponseSummary && responseSummary ? (
          <MessageSummaryDiffs
            summary={responseSummary.summary}
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
