import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Surface, Text, useTheme } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { FileDiff, MessageSummary } from "@/src/lib/api/messages";
import { toUnifiedDiffSmart } from "@/src/lib/diff/to-unified-diff";

interface MessageSummaryDiffsProps {
  summary: MessageSummary;
  borderColor: string;
  metaColor: string;
  textColor: string;
}

const DiffCount = ({
  value,
  color,
  prefix,
}: {
  value: number;
  color: string;
  prefix: "+" | "-";
}) => (
  <Text
    variant="bodyMedium"
    style={{
      color,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    }}
  >
    {prefix}
    {value}
  </Text>
);

const DiffBars = ({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) => {
  const totalBlocks = 5;
  const total = additions + deletions;

  let addedBlocks = 0;
  let deletedBlocks = 0;

  if (total > 0) {
    if (total < 5) {
      addedBlocks = additions > 0 ? 1 : 0;
      deletedBlocks = deletions > 0 ? 1 : 0;
    } else {
      const colorBlocks = total < 20 ? totalBlocks - 1 : totalBlocks;
      const rawAdded = (additions / total) * colorBlocks;
      const rawDeleted = (deletions / total) * colorBlocks;
      addedBlocks = additions > 0 ? Math.max(1, Math.round(rawAdded)) : 0;
      deletedBlocks = deletions > 0 ? Math.max(1, Math.round(rawDeleted)) : 0;

      const allocated = addedBlocks + deletedBlocks;
      if (allocated > colorBlocks) {
        if (rawAdded >= rawDeleted) {
          addedBlocks = colorBlocks - deletedBlocks;
        } else {
          deletedBlocks = colorBlocks - addedBlocks;
        }
      }
    }
  }

  const neutralBlocks = Math.max(0, totalBlocks - addedBlocks - deletedBlocks);
  const colors = [
    ...Array(addedBlocks).fill("#22C55E"),
    ...Array(deletedBlocks).fill("#F97316"),
    ...Array(neutralBlocks).fill("rgba(148,163,184,0.35)"),
  ].slice(0, totalBlocks);

  return (
    <View style={{ flexDirection: "row", gap: 2, marginRight: 2 }}>
      {colors.map((color, index) => (
        <View
          key={index}
          style={{
            width: 3,
            height: 14,
            borderRadius: 999,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
};

const DiffFileRow = ({
  diff,
  isExpanded,
  onPress,
  metaColor,
  textColor,
}: {
  diff: FileDiff;
  isExpanded: boolean;
  loading?: boolean;
  onPress: () => void;
  borderColor: string;
  metaColor: string;
  textColor: string;
}) => {
  const directory = diff.file
  const unifiedDiff =
    diff.patch ||
    (diff.before || diff.after
      ? toUnifiedDiffSmart({
          fileName: diff.file,
          oldContent: diff.before || "",
          newContent: diff.after || "",
        })
      : null);

  return (
    <View>
      <Pressable
        onPress={onPress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingVertical: 12,
          paddingHorizontal: 14,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          {directory ? (
            <Text
              variant="labelSmall"
              style={{ color: metaColor, marginTop: 2 }}
            >
              {directory}
            </Text>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginLeft: "auto",
          }}
        >
          <DiffCount value={diff.additions} color="#86EFAC" prefix="+" />
          <DiffCount value={diff.deletions} color="#F97316" prefix="-" />
          <MaterialCommunityIcons
            name={isExpanded ? "chevron-down" : "chevron-right"}
            size={16}
            color={metaColor}
          />
        </View>
      </Pressable>

      {isExpanded ? (
        <View
          style={{
            overflow: "hidden",
          }}
        >
          {unifiedDiff ? (
            <RawDiffViewer diff={unifiedDiff} />
          ) : (
            <View style={{ padding: 12 }}>
              <Text variant="bodySmall" style={{ color: metaColor }}>
                No preview available
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
};

type DiffViewerProps = {
  diff: string;
};

type DiffLineType = "add" | "delete" | "meta" | "header" | "context";

function getLineType(line: string): DiffLineType {
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "delete";
  if (line.startsWith("@@")) return "meta";
  if (
    line.startsWith("Index:") ||
    line.startsWith("===") ||
    line.startsWith("---") ||
    line.startsWith("+++")
  )
    return "header";
  return "context";
}

const CONTEXT_LINES = 7;

export function RawDiffViewer({ diff }: DiffViewerProps) {
  const theme = useTheme();
  const [expandedRanges, setExpandedRanges] = React.useState<Set<string>>(
    new Set(),
  );

  const lines = React.useMemo(() => diff.split("\n"), [diff]);

  const changedIndices = React.useMemo(() => {
    const set = new Set<number>();
    lines.forEach((line, i) => {
      const type = getLineType(line);
      if (type === "add" || type === "delete") set.add(i);
    });
    return set;
  }, [lines]);

  const visibleIndices = React.useMemo(() => {
    const set = new Set<number>();
    changedIndices.forEach((idx) => {
      for (
        let j = Math.max(0, idx - CONTEXT_LINES);
        j <= Math.min(lines.length - 1, idx + CONTEXT_LINES);
        j++
      ) {
        set.add(j);
      }
    });
    return set;
  }, [changedIndices, lines.length]);

  const segments = React.useMemo(() => {
    type Segment =
      | { kind: "visible"; indices: number[] }
      | { kind: "collapsed"; indices: number[]; id: string };
    const result: Segment[] = [];

    let i = 0;
    while (i < lines.length) {
      if (visibleIndices.has(i)) {
        const run: number[] = [];
        while (i < lines.length && visibleIndices.has(i)) run.push(i++);
        result.push({ kind: "visible", indices: run });
      } else {
        const run: number[] = [];
        const start = i;
        while (i < lines.length && !visibleIndices.has(i)) run.push(i++);
        result.push({ kind: "collapsed", indices: run, id: `${start}` });
      }
    }
    return result;
  }, [lines, visibleIndices]);

  const toggleExpand = (id: string) => {
    setExpandedRanges((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <Surface
      style={[
        styles.container,
        { backgroundColor: theme.colors.surfaceVariant },
      ]}
    >
      <ScrollView style={styles.verticalScroll} nestedScrollEnabled>
        <ScrollView
          horizontal
          style={styles.outerScroll}
          contentContainerStyle={styles.outerScrollContainer}
        >
          <View style={styles.innerContent}>
            <View style={styles.innerContent}>
              {segments.map((seg) => {
                if (seg.kind === "visible") {
                  return seg.indices.map((idx) => {
                    const line = lines[idx];
                    const type = getLineType(line);
                    return (
                      <Text
                        key={idx}
                        style={[
                          styles.line,
                          {
                            color: getColor(type, theme),
                            backgroundColor: getBackground(type, theme),
                          },
                        ]}
                      >
                        {line || " "}
                      </Text>
                    );
                  });
                }

                const isExpanded = expandedRanges.has(seg.id);
                if (isExpanded) {
                  return seg.indices.map((idx) => {
                    const line = lines[idx];
                    const type = getLineType(line);
                    return (
                      <Text
                        key={idx}
                        style={[
                          styles.line,
                          {
                            color: getColor(type, theme),
                            backgroundColor: getBackground(type, theme),
                          },
                        ]}
                      >
                        {line || " "}
                      </Text>
                    );
                  });
                }

                return (
                  <TouchableOpacity
                    key={seg.id}
                    onPress={() => toggleExpand(seg.id)}
                    style={[
                      styles.collapseButton,
                      { backgroundColor: theme.colors.surfaceVariant },
                    ]}
                  >
                    <Text
                      style={[
                        styles.collapseText,
                        { color: theme.colors.secondary },
                      ]}
                    >
                      ▶ Show {seg.indices.length} unchanged line
                      {seg.indices.length !== 1 ? "s" : ""}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </ScrollView>
    </Surface>
  );
}

function getColor(type: DiffLineType, theme: any) {
  switch (type) {
    case "add":
      return "#2e7d32";
    case "delete":
      return "#c62828";
    case "meta":
      return theme.colors.primary;
    case "header":
      return theme.colors.secondary;
    default:
      return theme.colors.onSurface;
  }
}

function getBackground(type: DiffLineType, theme: any) {
  switch (type) {
    case "add":
      return "#e8f5e9";
    case "delete":
      return "#ffebee";
    default:
      return "transparent";
  }
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 0,
    paddingVertical: 8,
  },
  verticalScroll: {
    maxHeight: 300, // caps height, but allows scrolling within
  },
  outerScroll: {
    flexGrow: 0,
  },
  outerScrollContainer: {
    minWidth: "100%",
  },
  innerContent: {
    minWidth: 600,
  },
  line: {
    minWidth: 600,
    fontFamily: "monospace",
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  collapseButton: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  collapseText: {
    fontSize: 12,
    fontFamily: "monospace",
  },
});

export const MessageSummaryDiffs: React.FC<MessageSummaryDiffsProps> =
  React.memo(({ summary, borderColor, metaColor, textColor }) => {
    const [expandedFiles, setExpandedFiles] = React.useState<Set<string>>(
      new Set(),
    );
    const resolvedDiffs = summary.diffs;

    const totalAdditions = resolvedDiffs.reduce(
      (count, diff) => count + diff.additions,
      0,
    );
    const totalDeletions = resolvedDiffs.reduce(
      (count, diff) => count + diff.deletions,
      0,
    );
    const hasSummaryText =
      typeof summary.title === "string" || typeof summary.body === "string";

    const toggleFile = (fileKey: string) => {
      setExpandedFiles((current) => {
        const next = new Set(current);
        if (next.has(fileKey)) {
          next.delete(fileKey);
        } else {
          next.add(fileKey);
        }
        return next;
      });
    };

    if (!hasSummaryText && resolvedDiffs.length === 0) {
      return null;
    }

    return (
      <View
        style={{
          width: "100%",
          marginTop: 18,
          gap: 16,
        }}
      >
        {summary.title || summary.body ? (
          <View style={{ gap: 8 }}>
            {summary.title ? (
              <Text
                variant="titleSmall"
                style={{ color: textColor, fontWeight: "700" }}
              >
                {summary.title}
              </Text>
            ) : null}
            {summary.body ? (
              <Text
                variant="bodyMedium"
                style={{ color: textColor, lineHeight: 22 }}
              >
                {summary.body}
              </Text>
            ) : null}
          </View>
        ) : null}

        {resolvedDiffs.length > 0 ? (
          <View style={{ gap: 10 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <DiffBars additions={totalAdditions} deletions={totalDeletions} />
              <Text
                variant="titleSmall"
                style={{ color: textColor, fontWeight: "500" }}
              >
                {resolvedDiffs.length} Change
                {resolvedDiffs.length === 1 ? "" : "s"}
              </Text>
              <DiffCount value={totalAdditions} color="#86EFAC" prefix="+" />
              <DiffCount value={totalDeletions} color="#F97316" prefix="-" />
            </View>

            <View
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 14,
                overflow: "hidden",
                backgroundColor: "rgba(255,255,255,0.02)",
              }}
            >
              {resolvedDiffs.map((diff, index) => {
                const diffKey = `${diff.file}-${index}`;

                return (
                  <View
                    key={diffKey}
                    style={{
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: borderColor,
                    }}
                  >
                    <DiffFileRow
                      diff={diff}
                      isExpanded={expandedFiles.has(diffKey)}
                      onPress={() => toggleFile(diffKey)}
                      borderColor={borderColor}
                      metaColor={metaColor}
                      textColor={textColor}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>
    );
  });

MessageSummaryDiffs.displayName = "MessageSummaryDiffs";
