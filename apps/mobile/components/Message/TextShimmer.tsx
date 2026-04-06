import React from "react";
import { Text } from "react-native-paper";

interface TextShimmerProps {
  text: string;
  active?: boolean;
  color?: string;
}

export const TextShimmer: React.FC<TextShimmerProps> = ({
  text,
  active = false,
  color,
}) => {
  if (!active) {
    return <Text style={{ color: color || "#9CA3AF" }}>{text}</Text>;
  }

  return <Text style={{ color: color || "#60A5FA" }}>{text}</Text>;
};
