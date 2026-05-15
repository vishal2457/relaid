import React from "react";
import { Pressable, View } from "react-native";
import { Text } from "react-native-paper";
import { FormattedText } from "./FormattedText";
import { ToolPart } from "./ToolPart";
import type { SessionAssistantBlock } from "@/src/lib/api/messages";

interface AssistantBlockSequenceProps {
  blocks: SessionAssistantBlock[];
  metaText?: string | null;
  showMetaText?: boolean;
  onTextBlockLongPress?: (() => void) | undefined;
  assistantBubble: string;
  textColor: string;
  metaColor: string;
  borderColor: string;
}

export const AssistantBlockSequence: React.FC<AssistantBlockSequenceProps> =
  React.memo(
    ({
      blocks,
      metaText,
      showMetaText = true,
      onTextBlockLongPress,
      assistantBubble,
      textColor,
      metaColor,
      borderColor,
    }) => {
      return (
        <View style={{ width: "85%", gap: 10, alignSelf: "flex-start" }}>
          {blocks.map((block, index) => {
            if (block.type === "text") {
              const isLastTextBlock =
                !blocks.slice(index + 1).some((candidate) => candidate.type === "text");

              return (
                <Pressable
                  key={block.id}
                  onLongPress={onTextBlockLongPress}
                  delayLongPress={250}
                  style={{
                    backgroundColor: assistantBubble,
                    borderRadius: 5,
                    padding: 12,
                    alignSelf: "flex-start",
                  }}
                >
                  <FormattedText
                    text={block.content}
                    baseStyle={{ color: textColor }}
                  />
                  {showMetaText && metaText && isLastTextBlock ? (
                    <Text
                      variant="labelSmall"
                      style={{ color: metaColor, marginTop: 10 }}
                    >
                      {metaText}
                    </Text>
                  ) : null}
                </Pressable>
              );
            }

            return (
              <ToolPart
                key={block.id}
                activity={block.activity}
                metaColor={metaColor}
                borderColor={borderColor}
                textColor={textColor}
              />
            );
          })}

          {showMetaText && metaText && !blocks.some((block) => block.type === "text") ? (
            <Text variant="labelSmall" style={{ color: metaColor }}>
              {metaText}
            </Text>
          ) : null}
        </View>
      );
    },
  );

AssistantBlockSequence.displayName = "AssistantBlockSequence";
