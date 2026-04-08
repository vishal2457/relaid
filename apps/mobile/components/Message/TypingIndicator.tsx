import React from "react";
import { View } from "react-native";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import { FormattedText } from "./FormattedText";

interface TypingIndicatorProps {
  streamingContent: string;
  borderColor: string;
  assistantBubble: string;
  isThinking?: boolean;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = React.memo(
  ({ streamingContent, borderColor, assistantBubble, isThinking = false }) => {
    const theme = useTheme();

    const showThinkingIndicator = isThinking || !streamingContent;

    return (
      <View style={{ marginBottom: 12 }}>
        <View
          style={{
            maxWidth: "85%",
            backgroundColor: assistantBubble,
            borderWidth: 1,
            borderColor,
            borderRadius: 12,
            padding: 12,
            alignSelf: "flex-start",
          }}
        >
          {showThinkingIndicator ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text
                variant="labelMedium"
                style={{
                  fontWeight: "600",
                  color: "#60A5FA",
                }}
              >
                Responding...
              </Text>
            </View>
          ) : (
            <FormattedText
              text={streamingContent}
              baseStyle={{ color: theme.colors.onSurface }}
            />
          )}
        </View>
      </View>
    );
  },
);

TypingIndicator.displayName = "TypingIndicator";
