import React from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, useTheme } from "react-native-paper";
import { AssistantBlockSequence } from "./AssistantBlockSequence";
import { FormattedText } from "./FormattedText";
import type {
  SessionAssistantActivity,
  SessionAssistantBlock,
} from "@/src/lib/api/messages";
import type { LiveAssistantPhase } from "@/src/lib/live-assistant-stream";

const JumpingDot = ({ delay }: { delay: number }) => {
  const translateY = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: -4,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.delay(500),
      ])
    );
    const timeout = setTimeout(() => {
      animation.start();
    }, delay);
    return () => {
      clearTimeout(timeout);
      animation.stop();
    };
  }, [translateY, delay]);

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          transform: [{ translateY }],
        },
      ]}
    />
  );
};

const JumpingDots = () => {
  return (
    <View style={styles.dotsContainer}>
      <JumpingDot delay={0} />
      <JumpingDot delay={150} />
      <JumpingDot delay={300} />
    </View>
  );
};

interface TypingIndicatorProps {
  thinkingContent: string | null;
  blocks: SessionAssistantBlock[];
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
    thinkingContent,
    blocks,
    phase,
    borderColor,
    assistantBubble,
    metaColor,
  }) => {
    const theme = useTheme();
    const [isThinkingExpanded, setIsThinkingExpanded] = React.useState(false);
    const blinkOpacity = React.useRef(new Animated.Value(1)).current;
    const visibleText = React.useMemo(
      () =>
        blocks
          .filter(
            (
              block,
            ): block is Extract<SessionAssistantBlock, { type: "text" }> =>
              block.type === "text",
          )
          .map((block) => block.content)
          .join(""),
      [blocks],
    );
    const activities = React.useMemo(
      () =>
        blocks
          .filter(
            (
              block,
            ): block is Extract<SessionAssistantBlock, { type: "tool" }> =>
              block.type === "tool",
          )
          .map((block) => block.activity),
      [blocks],
    );
    const isThinking =
      phase === "thinking" && visibleText.trim().length === 0;
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
                <JumpingDots />
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
            <AssistantBlockSequence
              blocks={blocks}
              assistantBubble={assistantBubble}
              textColor={theme.colors.onSurface}
              metaColor={metaColor}
              borderColor={borderColor}
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
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#60A5FA",
  },
});
