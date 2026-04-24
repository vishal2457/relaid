import React from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, useTheme } from "react-native-paper";
import { FormattedText } from "./FormattedText";
import type { SessionAssistantActivity } from "@/src/lib/api/messages";
import type { LiveAssistantPhase } from "@/src/lib/live-assistant-stream";

interface TypingIndicatorProps {
  streamingContent: string;
  thinkingContent: string | null;
  activities: SessionAssistantActivity[];
  phase: LiveAssistantPhase;
  borderColor: string;
  assistantBubble: string;
  metaColor: string;
}

function getCurrentActivityDetail(
  activity: SessionAssistantActivity | null,
): string | null {
  if (!activity) {
    return null;
  }

  if (activity.filename || activity.directory) {
    return `${activity.directory ?? ""}${activity.filename ?? ""}` || null;
  }

  return activity.detail?.trim() || null;
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
    const currentActivity = activities[activities.length - 1] ?? null;
    const currentActivityDetail = getCurrentActivityDetail(currentActivity);

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
            <View style={styles.loaderContent}>
              <Animated.View style={{ opacity: blinkOpacity }}>
                <Text
                  variant="labelMedium"
                  style={{ color: "#60A5FA", fontWeight: "600" }}
                >
                  Thinking...
                </Text>
              </Animated.View>

              {currentActivity ? (
                <View style={styles.activityStatus}>
                  <Text
                    variant="labelSmall"
                    style={{ color: theme.colors.onSurface, fontWeight: "600" }}
                  >
                    Using {currentActivity.label}
                  </Text>
                  {currentActivityDetail ? (
                    <Text
                      variant="bodySmall"
                      numberOfLines={1}
                      style={{ color: metaColor, flexShrink: 1 }}
                    >
                      {currentActivityDetail}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
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
  loaderContent: {
    gap: 6,
  },
  activityStatus: {
    gap: 2,
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
});
