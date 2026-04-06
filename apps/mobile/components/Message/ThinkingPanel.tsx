import React from "react";
import { Pressable, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FormattedText } from "./FormattedText";
import type { SessionMessagePart } from "@/lib/api/messages";

const formatThinkingLabel = (seconds: number | null) => {
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    return `Thought for ${seconds}s`;
  }
  return "Thinking...";
};

interface ThinkingPanelProps {
  isVisible: boolean;
  thinkingContent: string | null;
  thinkingDurationSeconds: number | null;
  thinkingParts: SessionMessagePart[];
  isExpanded: boolean;
  onToggle: () => void;
  metaColor: string;
  borderColor: string;
  thinkingSurface: string;
  textColor: string;
}

export const ThinkingPanel: React.FC<ThinkingPanelProps> = React.memo(
  ({
    isVisible,
    thinkingContent,
    thinkingDurationSeconds,
    thinkingParts,
    isExpanded,
    onToggle,
    metaColor,
    borderColor,
    thinkingSurface,
    textColor,
  }) => {
    if (!isVisible) return null;

    return (
      <View style={{ marginBottom: 12 }}>
        <Pressable
          onPress={onToggle}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginLeft: 4,
          }}
        >
          <MaterialCommunityIcons name="brain" size={16} color={metaColor} />
          <Text variant="bodyMedium" style={{ color: metaColor }}>
            {formatThinkingLabel(thinkingDurationSeconds)}
          </Text>
        </Pressable>

        {isExpanded && thinkingContent?.trim() && (
          <View
            style={{
              marginTop: 8,
              marginLeft: 4,
              paddingLeft: 12,
              borderLeftWidth: 2,
              borderLeftColor: borderColor,
            }}
          >
            <Text
              variant="labelSmall"
              style={{ color: metaColor, marginBottom: 8 }}
            >
              Reasoning
            </Text>
            <FormattedText
              text={thinkingContent}
              baseStyle={{ color: textColor, fontSize: 13, lineHeight: 18 }}
            />
          </View>
        )}

        {isExpanded && thinkingParts.length > 0 && !thinkingContent?.trim() && (
          <View
            style={{
              marginTop: 8,
              marginLeft: 4,
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
              <View key={`${part.type}-${index}`} style={{ marginBottom: 4 }}>
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
      </View>
    );
  },
);

ThinkingPanel.displayName = "ThinkingPanel";
