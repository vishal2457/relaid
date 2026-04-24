import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { FormattedText } from "./FormattedText";
import { ToolPart } from "./ToolPart";
import type { SessionMessage } from "@/src/lib/api/messages";

const roleLabelMap: Record<SessionMessage["role"], string> = {
  assistant: "Assistant",
  user: "You",
  system: "System",
};

const formatDateTime = (value: string | number | null | undefined) => {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const formatAssistantMode = (mode: string | null | undefined) => {
  if (!mode) return null;
  return mode.charAt(0).toUpperCase() + mode.slice(1);
};

const formatAssistantDuration = (durationMs: number | null | undefined) => {
  if (
    typeof durationMs !== "number" ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return null;
  }

  if (durationMs >= 60_000) {
    const minutes = Math.floor(durationMs / 60_000);
    const seconds = Math.round((durationMs % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
};

interface MessageBubbleProps {
  message: SessionMessage;
  borderColor: string;
  metaColor: string;
  userBubble: string;
  assistantBubble: string;
  systemBubble: string;
  textColor: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(
  ({
    message,
    borderColor,
    metaColor,
    userBubble,
    assistantBubble,
    systemBubble,
    textColor,
  }) => {
    const isUser = message.role === "user";
    const isSystem = message.role === "system";
    const isAssistant = message.role === "assistant";

    const bubbleColor = isSystem
      ? systemBubble
      : isUser
        ? userBubble
        : assistantBubble;

    const mainContent =
      message.role === "assistant" ? message.visibleContent : message.content;
    const hasVisibleText = mainContent.trim().length > 0;
    const assistantActivities = message.assistant?.activities ?? [];
    const assistantMeta = [
      formatAssistantMode(message.assistant?.mode),
      message.assistant?.model,
      formatAssistantDuration(message.assistant?.durationMs),
    ]
      .filter(Boolean)
      .join(" • ");
    const showBubble = !isAssistant || hasVisibleText;
    const showAssistantDetails = isAssistant && assistantActivities.length > 0;
    const showAssistantMeta =
      isAssistant && hasVisibleText && assistantMeta.length > 0;

    return (
      <View
        style={{
          marginVertical: showBubble && !showAssistantDetails ? 12 : 0,
          alignItems: isUser ? "flex-end" : "flex-start",
        }}
      >
        {showBubble ? (
          <View
            style={{
              maxWidth: "85%",
              backgroundColor: bubbleColor,
              borderRadius: 5,
              padding: 12,
              alignSelf: isUser ? "flex-end" : "flex-start",
            }}
          >
            {/* <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
                alignSelf: "flex-end"
              }}
            >
              <Text variant="labelSmall" style={{ color: metaColor }}>
                {formatDateTime(message.createdAt)}
              </Text>
            </View> */}

            {hasVisibleText ? (
              <>
                <FormattedText
                  text={mainContent}
                  baseStyle={{ color: textColor }}
                />
                {showAssistantMeta ? (
                  <Text
                    variant="labelSmall"
                    style={{ color: metaColor, marginTop: 10 }}
                  >
                    {assistantMeta}
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}

        {showAssistantDetails ? (
          <View
            style={{
              width: "85%",
              marginTop: showBubble ? 10 : 0,
              flexDirection: 'column',
              gap: 5,
            }}
          >
            {assistantActivities.map((activity) => (
              <ToolPart
                key={activity.id}
                activity={activity}
                metaColor={metaColor}
                borderColor={borderColor}
                textColor={textColor}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  },
);

MessageBubble.displayName = "MessageBubble";
