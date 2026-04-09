import React from "react";
import { Text } from "react-native-paper";

type TextSegment = {
  type: "normal" | "bold" | "code";
  content: string;
};

const BOLD_COLOR = "#F97316";
const CODE_COLOR = "#22C55E";

const parseFormattedText = (text: string): TextSegment[] => {
  const segments: TextSegment[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);

    const nextBold = boldMatch ? boldMatch.index! : Infinity;
    const nextCode = codeMatch ? codeMatch.index! : Infinity;

    if (nextBold === Infinity && nextCode === Infinity) {
      segments.push({ type: "normal", content: remaining });
      break;
    }

    const nextMatch = Math.min(nextBold, nextCode);

    if (nextMatch > 0) {
      segments.push({ type: "normal", content: remaining.slice(0, nextMatch) });
    }

    if (nextBold < nextCode && boldMatch) {
      segments.push({ type: "bold", content: boldMatch[1] });
      remaining = remaining.slice(nextBold + boldMatch[0].length);
    } else if (codeMatch) {
      segments.push({ type: "code", content: codeMatch[1] });
      remaining = remaining.slice(nextCode + codeMatch[0].length);
    }
  }

  return segments;
};

interface FormattedTextProps {
  text: string;
  baseStyle?: object;
}

export const FormattedText = React.memo(
  ({ text, baseStyle }: FormattedTextProps) => {
    const segments = parseFormattedText(text.trim());

    return (
      <Text style={baseStyle}>
        {segments.map((segment, index) => {
          if (segment.type === "bold") {
            return (
              <Text
                key={index}
                style={{ fontWeight: "bold", color: BOLD_COLOR }}
              >
                {segment.content}
              </Text>
            );
          }
          if (segment.type === "code") {
            return (
              <Text
                key={index}
                style={{ color: CODE_COLOR, fontFamily: "monospace" }}
              >
                {segment.content}
              </Text>
            );
          }
          return <Text key={index}>{segment.content}</Text>;
        })}
      </Text>
    );
  },
);

FormattedText.displayName = "FormattedText";
