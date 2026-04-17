import React from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, useTheme } from "react-native-paper";
import { ToolPart } from "./ToolPart";
import { FormattedText } from "./FormattedText";
import type { SessionAssistantActivity } from "@/lib/api/messages";
import type { LiveAssistantPhase } from "@/lib/live-assistant-stream";

interface TypingIndicatorProps {
  streamingContent: string;
  thinkingContent: string | null;
  activities: SessionAssistantActivity[];
  phase: LiveAssistantPhase;
  borderColor: string;
  assistantBubble: string;
  metaColor: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = React.memo(
  ({
    streamingContent,
    thinkingContent,
    activities,
    phase,
    borderColor,
    assistantBubble,
    metaColor,
  }) => {
    const theme = useTheme();
    const [isThinkingExpanded, setIsThinkingExpanded] = React.useState(false);
    const blinkOpacity = React.useRef(new Animated.Value(1)).current;
    const isThinking =
      phase === "thinking" && streamingContent.trim().length === 0;
    const hasThinkingContent = Boolean(thinkingContent?.trim());

    React.useEffect(() => {
      if (!isThinking) {
        blinkOpacity.setValue(1);
        return;
      }

      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkOpacity, {
            toValue: 0.35,
            duration: 700,
            useNativeDriver: true,
          }),
          Animated.timing(blinkOpacity, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
      );

      animation.start();
      return () => animation.stop();
    }, [blinkOpacity, isThinking]);

    return (
      <View style={styles.container}>
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: assistantBubble,
              borderColor,
            },
          ]}
        >
          {isThinking ? (
            <Animated.View style={{ opacity: blinkOpacity }}>
              <Text
                variant="labelMedium"
                style={{ color: "#60A5FA", fontWeight: "600" }}
              >
                Thinking...
              </Text>
            </Animated.View>
          ) : (
            <FormattedText
              text={streamingContent}
              baseStyle={{ color: theme.colors.onSurface }}
            />
          )}
        </View>

        {hasThinkingContent ? (
          <View
            style={[
              styles.thinkingCard,
              {
                borderColor,
                backgroundColor: assistantBubble,
              },
            ]}
          >
            <Pressable
              onPress={() => setIsThinkingExpanded((current) => !current)}
              style={styles.thinkingHeader}
            >
              <Text
                variant="labelSmall"
                style={{ color: metaColor, fontWeight: "600" }}
              >
                Thinking
              </Text>
              <MaterialCommunityIcons
                name={isThinkingExpanded ? "chevron-down" : "chevron-right"}
                size={16}
                color={metaColor}
              />
            </Pressable>

            {isThinkingExpanded ? (
              <FormattedText
                text={thinkingContent ?? ""}
                baseStyle={{ color: theme.colors.onSurface }}
              />
            ) : null}
          </View>
        ) : null}

        {activities.length > 0 ? (
          <View style={styles.activities}>
            {activities.map((activity) => (
              <ToolPart
                key={activity.id}
                activity={activity}
                metaColor={metaColor}
                borderColor={borderColor}
                textColor={theme.colors.onSurface}
              />
            ))}
          </View>
        ) : null}
      </View>
    );
  },
);

TypingIndicator.displayName = "TypingIndicator";

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    gap: 10,
  },
  bubble: {
    maxWidth: "85%",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignSelf: "flex-start",
  },
  thinkingCard: {
    maxWidth: "85%",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: "flex-start",
    gap: 8,
  },
  thinkingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  activities: {
    width: "85%",
    gap: 5,
  },
});
