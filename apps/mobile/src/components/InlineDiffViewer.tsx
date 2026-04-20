import React from "react";
import { Platform, ScrollView, View, Text, StyleSheet } from "react-native";
import { useTheme } from "react-native-paper";

interface InlineDiffViewerProps {
  oldContent: string | null;
  newContent: string | null;
  oldLineCount?: number | null;
  newLineCount?: number | null;
}

function getLineCount(value: string): number {
  if (!value) {
    return 0;
  }

  return value.split("\n").length;
}

function DiffChunk({
  prefix,
  content,
  label,
  accentColor,
  backgroundColor,
}: {
  prefix: "+" | "-";
  content: string;
  label: string;
  accentColor: string;
  backgroundColor: string;
}) {
  return (
    <View style={[styles.chunk, { backgroundColor }]}>
      <Text style={[styles.chunkLabel, { color: accentColor }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chunkContent}>
          {content.split("\n").map((line, index) => (
            <View key={index} style={styles.line}>
              <Text style={[styles.linePrefix, { color: accentColor }]}>
                {prefix}
              </Text>
              <Text style={[styles.lineContent, { color: accentColor }]}>
                {line}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export default function InlineDiffViewer({
  oldContent,
  newContent,
  oldLineCount,
  newLineCount,
}: InlineDiffViewerProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const hasOldContent = typeof oldContent === "string" && oldContent.length > 0;
  const hasNewContent = typeof newContent === "string" && newContent.length > 0;

  if (!hasOldContent && !hasNewContent) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: isDark ? "#1a1a1a" : "#f5f5f5" },
      ]}
    >
      {hasOldContent ? (
        <DiffChunk
          prefix="-"
          content={oldContent ?? ""}
          label={`-${oldLineCount ?? getLineCount(oldContent ?? "")} lines`}
          accentColor={isDark ? "#FCA5A5" : "#DC2626"}
          backgroundColor={isDark ? "#2A1515" : "#FEE2E2"}
        />
      ) : null}
      {hasNewContent ? (
        <DiffChunk
          prefix="+"
          content={newContent ?? ""}
          label={`+${newLineCount ?? getLineCount(newContent ?? "")} lines`}
          accentColor={isDark ? "#86EFAC" : "#16A34A"}
          backgroundColor={isDark ? "#152A1B" : "#DCFCE7"}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: "hidden",
    gap: 1,
  },
  chunk: {
    paddingVertical: 8,
  },
  chunkLabel: {
    marginBottom: 6,
    paddingHorizontal: 8,
    fontWeight: "700",
  },
  chunkContent: {
    minWidth: "100%",
  },
  line: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingVertical: 1.5,
  },
  linePrefix: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
    width: 14,
  },
  lineContent: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
    flex: 1,
  },
});
