import React from "react";
import { Pressable, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FormattedText } from "./FormattedText";
import { ThinkingPanel } from "./ThinkingPanel";
import { ToolPart } from "./ToolPart";
import { ContextToolGroup } from "./ContextToolGroup";
import {
  processMessageParts,
  type ProcessedPart,
} from "@/lib/api/message-parts";
import type { SessionMessage } from "@/lib/api/messages";

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

interface MessageBubbleProps {
  message: SessionMessage;
  isThinkingExpanded: boolean;
  onToggleThinking: (messageId: string) => void;
  isStreaming?: boolean;
  borderColor: string;
  metaColor: string;
  userBubble: string;
  assistantBubble: string;
  systemBubble: string;
  thinkingSurface: string;
  surfaceColor: string;
  textColor: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(
  ({
    message,
    isThinkingExpanded,
    onToggleThinking,
    isStreaming = false,
    borderColor,
    metaColor,
    userBubble,
    assistantBubble,
    systemBubble,
    thinkingSurface,
    surfaceColor,
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

    const thinkingParts = message.parts.filter((part) => part.type !== "text");

    const processedParts: ProcessedPart[] = React.useMemo(() => {
      if (isAssistant && message.parts && message.parts.length > 0) {
        return processMessageParts(message.parts);
      }
      return [];
    }, [isAssistant, message.parts]);

    const hasToolParts = processedParts.some(
      (p) => p.type === "tool" || p.type === "context-group",
    );

    const hasVisibleText = mainContent.trim().length > 0;

    const showThinkingInline =
      isAssistant &&
      Boolean(message.thinkingContent?.trim()) &&
      !hasVisibleText &&
      !hasToolParts;

    if (showThinkingInline) {
      return (
        <View style={{ marginBottom: 12 }}>
          <ThinkingPanel
            isVisible={true}
            thinkingContent={message.thinkingContent}
            thinkingDurationSeconds={message.thinkingDurationSeconds}
            thinkingParts={thinkingParts}
            isExpanded={isThinkingExpanded}
            onToggle={() => onToggleThinking(message.id)}
            metaColor={metaColor}
            borderColor={borderColor}
            thinkingSurface={thinkingSurface}
            textColor={textColor}
          />
        </View>
      );
    }

    return (
      <View
        style={{
          marginBottom: 12,
          alignItems: isUser ? "flex-end" : "flex-start",
        }}
      >
        <View
          style={{
            maxWidth: "85%",
            backgroundColor: bubbleColor,
            borderWidth: 1,
            borderColor,
            borderRadius: 12,
            padding: 12,
            alignSelf: isUser ? "flex-end" : "flex-start",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <Text variant="labelMedium" style={{ color: metaColor }}>
              {roleLabelMap[message.role]}
            </Text>
            <Text variant="labelSmall" style={{ color: metaColor }}>
              {formatDateTime(message.createdAt)}
            </Text>
          </View>

          {hasVisibleText && (
            <FormattedText
              text={mainContent}
              baseStyle={{ color: textColor }}
            />
          )}

          {isAssistant && message.thinkingContent?.trim() && (
            <Pressable
              onPress={() => onToggleThinking(message.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                marginTop: hasVisibleText ? 8 : 0,
              }}
            >
              <MaterialCommunityIcons
                name="brain"
                size={14}
                color={metaColor}
              />
              <Text variant="labelSmall" style={{ color: metaColor }}>
                {message.thinkingDurationSeconds
                  ? `Thought for ${message.thinkingDurationSeconds}s`
                  : "Thinking..."}
              </Text>
            </Pressable>
          )}

          {isThinkingExpanded &&
            isAssistant &&
            message.thinkingContent?.trim() && (
              <View
                style={{
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor,
                  backgroundColor: thinkingSurface,
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <Text
                  variant="labelSmall"
                  style={{ color: metaColor, marginBottom: 8 }}
                >
                  Reasoning
                </Text>
                {thinkingParts.map((part, index) => (
                  <View
                    key={`${message.id}-${part.type}-${index}`}
                    style={{ marginBottom: 4 }}
                  >
                    {part.type !== "reasoning" && (
                      <Text variant="labelSmall" style={{ color: metaColor }}>
                        {part.type}
                      </Text>
                    )}
                    <FormattedText
                      text={part.content}
                      baseStyle={{ color: textColor }}
                    />
                  </View>
                ))}
              </View>
            )}

          {isAssistant && message.tokens && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
              }}
            >
              <Text variant="labelSmall" style={{ color: metaColor }}>
                💭{" "}
                {message.tokens.reasoning > 0
                  ? `${message.tokens.reasoning}r `
                  : ""}
                🔢 {message.tokens.input}i / {message.tokens.output}o
              </Text>
              {message.tokens.cache.read > 0 && (
                <Text variant="labelSmall" style={{ color: metaColor }}>
                  📦 {message.tokens.cache.read}
                </Text>
              )}
            </View>
          )}
        </View>

        {isAssistant && processedParts.length > 0 && (
          <View style={{ width: "100%", marginTop: 8 }}>
            {processedParts.map((processedPart, index) => {
              if (processedPart.type === "tool" && processedPart.part) {
                const toolPart = processedPart.part;
                if (toolPart.type === "tool") {
                  return (
                    <ToolPart
                      key={`${message.id}-tool-${index}`}
                      tool={toolPart.tool}
                      input={toolPart.state.input}
                      output={toolPart.state.output}
                      status={toolPart.state.status}
                      metadata={toolPart.state.metadata}
                      metaColor={metaColor}
                      borderColor={borderColor}
                      surfaceColor={surfaceColor}
                    />
                  );
                }
              }

              if (
                processedPart.type === "context-group" &&
                processedPart.parts &&
                processedPart.parts.length > 0
              ) {
                return (
                  <ContextToolGroup
                    key={`${message.id}-context-${index}`}
                    tools={processedPart.parts}
                    metaColor={metaColor}
                    borderColor={borderColor}
                    surfaceColor={surfaceColor}
                  />
                );
              }

              return null;
            })}
          </View>
        )}
      </View>
    );
  },
);

MessageBubble.displayName = "MessageBubble";
