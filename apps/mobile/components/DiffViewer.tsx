import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import {
  useFileDiff,
  type FileDiff,
  type DiffHunk,
  type DiffLine,
} from "../lib/api/git";

const DiffLineItem = ({ line }: { line: DiffLine }) => {
  const bgColor =
    line.type === "add"
      ? "#1a3a1a"
      : line.type === "remove"
        ? "#3a1a1a"
        : "transparent";
  const textColor =
    line.type === "add"
      ? "#4caf50"
      : line.type === "remove"
        ? "#f44336"
        : "#ccc";
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

const HunkItem = ({ hunk }: { hunk: DiffHunk }) => (
  <View style={styles.hunk}>
    <Text style={styles.hunkHeader}>{hunk.header}</Text>
    {hunk.lines.map((line, i) => (
      <DiffLineItem key={i} line={line} />
    ))}
  </View>
);

const FileDiffItem = ({ file }: { file: FileDiff }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <View style={styles.fileDiff}>
      <TouchableOpacity
        style={styles.fileHeader}
        onPress={() => setCollapsed((c) => !c)}
      >
        <Text style={styles.fileName}>{file.fileName}</Text>
        <Text style={styles.collapseIcon}>{collapsed ? "▶" : "▼"}</Text>
      </TouchableOpacity>

      {!collapsed &&
        file.hunks.map((hunk, i) => <HunkItem key={i} hunk={hunk} />)}
    </View>
  );
};

interface DiffViewerProps {
  projectId: string;
  filePath: string;
}

export default function DiffViewer({ projectId, filePath }: DiffViewerProps) {
  const { data, isLoading, error } = useFileDiff(projectId, filePath);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#61dafb" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Error: {error.message}</Text>
      </View>
    );
  }

  if (!data || data.files.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.noChanges}>No changes</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {data.files.map((file, i) => (
        <FileDiffItem key={i} file={file} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1e1e1e", padding: 8 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1e1e1e",
    padding: 16,
  },
  error: { color: "#f44336", fontSize: 14 },
  noChanges: { color: "#888", fontSize: 14 },

  fileDiff: {
    marginBottom: 16,
    borderRadius: 6,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#333",
  },
  fileHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#2d2d2d",
    padding: 10,
  },
  fileName: { color: "#61dafb", fontWeight: "bold", fontSize: 13 },
  collapseIcon: { color: "#888", fontSize: 12 },

  hunk: { borderTopWidth: 1, borderTopColor: "#333" },
  hunkHeader: {
    backgroundColor: "#1a2533",
    color: "#6af",
    padding: 4,
    fontSize: 11,
    fontFamily: "monospace",
  },

  line: { flexDirection: "row", paddingHorizontal: 6, paddingVertical: 1 },
  linePrefix: { fontFamily: "monospace", fontSize: 12, width: 14 },
  lineContent: { fontFamily: "monospace", fontSize: 12, flex: 1 },
});
