import React from "react";
import {
  ActivityIndicator,
  IconButton,
  Text,
  useTheme,
} from "react-native-paper";
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { useFileContent } from "@/src/lib/api/git";

const TOKENS = [
  { regex: /(\/\/.*|#.*)/g, color: "#6A9955" },
  { regex: /(".*?"|'.*?'|`.*?`)/g, color: "#CE9178" },
  {
    regex: /\b(const|let|var|if|else|return|import|from|export|def|class|function|async|await|for|while|switch|case|try|catch)\b/g,
    color: "#569CD6",
  },
  { regex: /\b(\d+\.?\d*)\b/g, color: "#B5CEA8" },
  { regex: /\b([a-zA-Z_]\w*)\s*(?=\()/g, color: "#DCDCAA" },
];

function tokenizeLine(line: string) {
  const matches: Array<{ start: number; end: number; color: string }> = [];

  for (const token of TOKENS) {
    token.regex.lastIndex = 0;

    for (const match of line.matchAll(token.regex)) {
      const text = match[0];
      const start = match.index ?? 0;

      if (!text) {
        continue;
      }

      const overlaps = matches.some(
        (range) => start < range.end && start + text.length > range.start,
      );

      if (!overlaps) {
        matches.push({ start, end: start + text.length, color: token.color });
      }
    }
  }

  matches.sort((a, b) => a.start - b.start);

  const segments: Array<{ text: string; color?: string }> = [];
  let cursor = 0;

  for (const match of matches) {
    if (cursor < match.start) {
      segments.push({ text: line.slice(cursor, match.start) });
    }

    segments.push({ text: line.slice(match.start, match.end), color: match.color });
    cursor = match.end;
  }

  if (cursor < line.length) {
    segments.push({ text: line.slice(cursor) });
  }

  return segments.length > 0 ? segments : [{ text: line }];
}

export default function FileViewerScreen() {
  const theme = useTheme();
  const { projectId, filePath, fileName } = useLocalSearchParams<{
    projectId: string;
    filePath: string;
    fileName?: string;
  }>();

  const displayFileName = fileName || filePath?.split("/").pop() || "File";
  const { data, isLoading, error, refetch } = useFileContent(
    projectId ?? "",
    filePath ?? "",
  );

  const metaColor = theme.dark ? "#B8C2D1" : "#526277";
  const lineNumberColor = theme.dark ? "#6B7280" : "#94A3B8";
  const lines = data?.content.split("\n") ?? [];
  const lineNumberWidth = Math.max(String(lines.length || 1).length * 10 + 16, 36);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: displayFileName,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.onSurface,
          headerLeft: () => (
            <IconButton
              icon="arrow-left"
              iconColor={theme.colors.onSurface}
              onPress={() => router.back()}
            />
          ),
          headerRight: () => (
            <IconButton
              icon="refresh"
              iconColor={theme.colors.onSurface}
              onPress={() => refetch()}
            />
          ),
        }}
      />

      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.content}
      >
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator />
            <Text
              variant="bodyMedium"
              style={{ color: metaColor, marginTop: 12 }}
            >
              Loading file...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.error, textAlign: "center" }}
            >
              Failed to load file contents.
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: metaColor, marginTop: 8 }}
            >
              {String(error)}
            </Text>
          </View>
        ) : data ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={styles.codeContainer}>
                {lines.map((line, index) => (
                  <View key={`${index}-${line.length}`} style={styles.codeRow}>
                    <Text
                      selectable
                      style={[
                        styles.lineNumber,
                        { color: lineNumberColor, width: lineNumberWidth },
                      ]}
                    >
                      {index + 1}
                    </Text>
                    <Text
                      selectable
                      style={[styles.codeBlock, { color: theme.colors.onSurface }]}
                    >
                      {tokenizeLine(line).map((segment, segmentIndex) => (
                        <Text
                          key={`${index}-${segmentIndex}`}
                          style={segment.color ? { color: segment.color } : undefined}
                        >
                          {segment.text || " "}
                        </Text>
                      ))}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
            {data.truncated ? (
              <Text
                variant="labelSmall"
                style={[styles.truncatedNotice, { color: metaColor }]}
              >
                File truncated (max 512 KB shown)
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  centered: {
    flex: 1,
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  codeBlock: {
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 20,
    flexShrink: 1,
  },
  codeContainer: {
    minWidth: "100%",
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  lineNumber: {
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 20,
    textAlign: "right",
    marginRight: 12,
    paddingRight: 4,
  },
  truncatedNotice: {
    marginTop: 16,
    textAlign: "center",
    fontStyle: "italic",
  },
});
