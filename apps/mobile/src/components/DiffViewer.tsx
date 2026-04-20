import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useTheme } from "react-native-paper";
import {
  useFileDiff,
  type FileDiff,
  type DiffHunk,
  type DiffLine,
} from "@/lib/api/git";

const DiffLineItem = ({
  line,
  isDark,
}: {
  line: DiffLine;
  isDark: boolean;
}) => {
  const bgColor =
    line.type === "add"
      ? isDark
        ? "#1a3a1a"
        : "#d4edda"
      : line.type === "remove"
        ? isDark
          ? "#3a1a1a"
          : "#f8d7da"
        : "transparent";
  const textColor =
    line.type === "add"
      ? "#4caf50"
      : line.type === "remove"
        ? "#f44336"
        : isDark
          ? "#ccc"
          : "#333";
  const prefix = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";

  return (
    <View style={[styles.line, { backgroundColor: bgColor }]}>
      <Text style={[styles.linePrefix, { color: textColor }]}>{prefix}</Text>
      <Text style={[styles.lineContent, { color: textColor }]}>
        {line.content}
      </Text>
    </View>
  );
};

const HunkItem = ({ hunk, isDark }: { hunk: DiffHunk; isDark: boolean }) => (
  <View style={styles.hunk}>
    <Text style={[styles.hunkHeader, isDark && styles.hunkHeaderDark]}>
      {hunk.header}
    </Text>
    {hunk.lines.map((line, i) => (
      <DiffLineItem key={i} line={line} isDark={isDark} />
    ))}
  </View>
);

const FileDiffItem = ({
  file,
  isDark,
}: {
  file: FileDiff;
  isDark: boolean;
}) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <View style={[styles.fileDiff, isDark && styles.fileDiffDark]}>
      <TouchableOpacity
        style={[styles.fileHeader, isDark && styles.fileHeaderDark]}
        onPress={() => setCollapsed((c) => !c)}
      >
        <Text style={[styles.fileName, isDark && styles.fileNameDark]}>
          {file.fileName}
        </Text>
        <Text style={styles.collapseIcon}>{collapsed ? "▶" : "▼"}</Text>
      </TouchableOpacity>

      {!collapsed &&
        file.hunks.map((hunk, i) => (
          <HunkItem key={i} hunk={hunk} isDark={isDark} />
        ))}
    </View>
  );
};

interface DiffViewerProps {
  projectId: string;
  filePath: string;
}

export default function DiffViewer({ projectId, filePath }: DiffViewerProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const { data, isLoading, error } = useFileDiff(projectId, filePath);

  if (isLoading) {
    return (
      <View
        style={[styles.center, { backgroundColor: theme.colors.background }]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View
        style={[styles.center, { backgroundColor: theme.colors.background }]}
      >
        <Text style={[styles.error, { color: theme.colors.error }]}>
          Error: {error.message}
        </Text>
      </View>
    );
  }

  if (!data || data.files.length === 0) {
    return (
      <View
        style={[styles.center, { backgroundColor: theme.colors.background }]}
      >
        <Text style={[styles.noChanges, { color: theme.colors.onSurface }]}>
          No changes
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {data.files.map((file, i) => (
        <FileDiffItem key={i} file={file} isDark={isDark} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 8 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  error: { fontSize: 14 },
  noChanges: { fontSize: 14 },

  fileDiff: {
    marginBottom: 16,
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#ccc",
  },
  fileDiffDark: {
    borderColor: "#333",
  },
  fileHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f5f5f5",
    padding: 10,
  },
  fileHeaderDark: {
    backgroundColor: "#2d2d2d",
  },
  fileName: { color: "#007acc", fontWeight: "bold", fontSize: 13 },
  fileNameDark: { color: "#61dafb" },
  collapseIcon: { color: "#666", fontSize: 12 },

  hunk: { borderTopWidth: 1, borderTopColor: "#ccc" },
  hunkHeader: {
    backgroundColor: "#e8f4fd",
    color: "#0066b3",
    padding: 4,
    fontSize: 11,
    fontFamily: "monospace",
  },
  hunkHeaderDark: {
    backgroundColor: "#1a2533",
    color: "#6af",
  },

  line: { flexDirection: "row", paddingHorizontal: 6, paddingVertical: 1 },
  linePrefix: { fontFamily: "monospace", fontSize: 12, width: 14 },
  lineContent: { fontFamily: "monospace", fontSize: 12, flex: 1 },
});
