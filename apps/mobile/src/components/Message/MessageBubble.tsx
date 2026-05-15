import React from "react";
import { Pressable, View } from "react-native";
import { Text } from "react-native-paper";
import { FormattedText } from "./FormattedText";
import { AssistantBlockSequence } from "./AssistantBlockSequence";
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
  showAssistantMeta?: boolean;
  onLongPress?: (() => void) | undefined;
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
    showAssistantMeta = true,
    onLongPress,
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
    const assistantBlocks = message.assistant?.blocks ?? [];
    const assistantMeta = [
      formatAssistantMode(message.assistant?.mode),
      message.assistant?.model,
      formatAssistantDuration(message.assistant?.durationMs),
    ]
      .filter(Boolean)
      .join(" • ");
    const showBubble =
      !isAssistant || (hasVisibleText && assistantBlocks.length === 0);
    const showAssistantBlocks = isAssistant && assistantBlocks.length > 0;
    const shouldShowAssistantMeta =
      isAssistant &&
      showAssistantMeta &&
      hasVisibleText &&
      assistantMeta.length > 0 &&
      assistantBlocks.length === 0;

    const bubbleContent = (
      <>
        {hasVisibleText ? (
          <>
            <FormattedText
              text={mainContent}
              baseStyle={{ color: textColor }}
            />
            {shouldShowAssistantMeta ? (
              <Text
                variant="labelSmall"
                style={{ color: metaColor, marginTop: 10 }}
              >
                {assistantMeta}
              </Text>
            ) : null}
          </>
        ) : null}
      </>
    );
    const BubbleContainer = isAssistant && onLongPress ? Pressable : View;

    return (
      <View
        style={{
          marginVertical: showBubble && !showAssistantBlocks ? 12 : 0,
          alignItems: isUser ? "flex-end" : "flex-start",
        }}
      >
        {showBubble ? (
          <BubbleContainer
            {...(isAssistant && onLongPress
              ? { onLongPress, delayLongPress: 250 }
              : {})}
            style={{
              maxWidth: "85%",
              backgroundColor: bubbleColor,
              borderRadius: 5,
              padding: 12,
              alignSelf: isUser ? "flex-end" : "flex-start",
            }}
          >
            {bubbleContent}
          </BubbleContainer>
        ) : null}

        {showAssistantBlocks ? (
          <View style={{ marginTop: showBubble ? 10 : 0 }}>
            <AssistantBlockSequence
              blocks={assistantBlocks}
              metaText={assistantMeta.length > 0 ? assistantMeta : null}
              showMetaText={showAssistantMeta}
              onTextBlockLongPress={onLongPress}
              assistantBubble={assistantBubble}
              textColor={textColor}
              metaColor={metaColor}
              borderColor={borderColor}
            />
          </View>
        ) : null}
      </View>
    );
  },
);

MessageBubble.displayName = "MessageBubble";
