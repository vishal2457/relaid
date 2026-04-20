import React from "react";
import { Pressable, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import InlineDiffViewer from "../InlineDiffViewer";
import type {
  SessionAssistantActivity,
  SessionAssistantActivityItem,
} from "@/lib/api/messages";
import { RawDiffViewer } from "./MessageSummaryDiffs";
import { toUnifiedDiffSmart } from "@/lib/diff/to-unified-diff";

interface ToolPartProps {
  activity: SessionAssistantActivity;
  metaColor: string;
  borderColor: string;
  textColor: string;
}

function getFullPath(activity: SessionAssistantActivity): string | null {
  if (!activity.filename && !activity.directory) {
    return null;
  }

  return `${activity.directory ?? ""}${activity.filename ?? ""}` || null;
}

function getExpandedLines(activity: SessionAssistantActivity): string[] {
  const lines: string[] = [];
  const fullPath = getFullPath(activity);

  if (fullPath) {
    lines.push(fullPath);
  }

  if (activity.detail && activity.kind !== "explored") {
    lines.push(activity.detail);
  }

  if (
    activity.kind === "edit" &&
    activity.additions !== null &&
    activity.deletions !== null
  ) {
    lines.push(`Changes: +${activity.additions} -${activity.deletions}`);
  }

  return lines;
}

const ExpandedItemRow = ({
  item,
  metaColor,
  textColor,
}: {
  item: SessionAssistantActivityItem;
  metaColor: string;
  textColor: string;
}) => {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 6,
        paddingLeft: 8,
      }}
    >
      <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Text
          variant="bodySmall"
          style={{ color: textColor, fontWeight: "600" }}
        >
          {item.label}
        </Text>
        {item.detail ? (
          <Text variant="bodySmall" style={{ color: metaColor, flexShrink: 1 }}>
            {item.detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const ActivityDetailText = ({
  activity,
  metaColor,
  textColor,
}: {
  activity: SessionAssistantActivity;
  metaColor: string;
  textColor: string;
}) => {
  if (activity.filename || activity.directory) {
    return (
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 2,
          minWidth: 0,
        }}
      >
        {activity.filename ? (
          <Text
            variant="bodySmall"
            numberOfLines={1}
            style={{ color: textColor, fontWeight: "500" }}
          >
            {activity.filename}
          </Text>
        ) : null}
        {activity.directory ? (
          <Text
            variant="bodySmall"
            style={{ color: metaColor, flexShrink: 1 }}
            numberOfLines={1}
            ellipsizeMode="head"
          >
            {activity.directory}
          </Text>
        ) : null}
      </View>
    );
  }

  if (!activity.detail) {
    return null;
  }

  return (
    <Text
      variant="bodySmall"
      numberOfLines={1}
      style={{ color: metaColor, flex: 1, flexShrink: 1 }}
    >
      {activity.detail}
    </Text>
  );
};

const DiffCount = ({
  prefix,
  value,
  color,
}: {
  prefix: "+" | "-";
  value: number;
  color: string;
}) => {
  return (
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
};

export const ToolPart: React.FC<ToolPartProps> = React.memo(
  ({ activity, metaColor, borderColor, textColor }) => {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const expandedItems = activity.items ?? [];
    const hasShellOutput =
      activity.kind === "shell" &&
      typeof activity.output === "string" &&
      activity.output.trim().length > 0;
    const expandedLines = React.useMemo(
      () => getExpandedLines(activity),
      [activity],
    );
    const isExpandable =
      expandedItems.length > 0 || expandedLines.length > 0 || hasShellOutput;
    const hasDiffCounts =
      activity.kind === "edit" &&
      activity.additions !== null &&
      activity.deletions !== null;
    const hasDiffContent =
      activity.kind === "edit" &&
      (activity.oldContent !== null || activity.newContent !== null);

    return (
      <View style={{ gap: isExpanded ? 5 : 0 }}>
        <Pressable
          disabled={!isExpandable}
          onPress={() => setIsExpanded((current) => !current)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            marginVertical: 2,
          }}
        >
          <Text
            variant="bodySmall"
            style={{
              color: textColor,
              fontWeight: "600",
            }}
          >
            {activity.label}
          </Text>

          <ActivityDetailText
            activity={activity}
            metaColor={metaColor}
            textColor={textColor}
          />

          {hasDiffCounts ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 2,
                marginLeft: "auto",
              }}
            >
              <DiffCount
                prefix="+"
                value={activity.additions ?? 0}
                color="#86EFAC"
              />
              <DiffCount
                prefix="-"
                value={activity.deletions ?? 0}
                color="#F97316"
              />
            </View>
          ) : null}

          {isExpandable ? (
            <MaterialCommunityIcons
              name={isExpanded ? "chevron-down" : "chevron-right"}
              size={16}
              color={metaColor}
            />
          ) : null}
        </Pressable>

        {isExpanded ? (
          <View
            style={{
              marginLeft: 12,
              gap: 4,
            }}
          >
            {expandedItems.length > 0
              ? expandedItems.map((item) => (
                  <ExpandedItemRow
                    key={item.id}
                    item={item}
                    metaColor={metaColor}
                    textColor={textColor}
                  />
                ))
              : null}
            {hasShellOutput ? (
              <View
                style={{
                  marginTop: expandedLines.length > 0 ? 4 : 0,
                  backgroundColor: "#000000",
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <Text
                  variant="bodySmall"
                  style={{
                    color: "#FFFFFF",
                    fontFamily: "monospace",
                    lineHeight: 18,
                  }}
                >
                  {activity.output}
                </Text>
              </View>
            ) : null}
            {hasDiffContent && isExpanded ? (
              <RawDiffViewer
                diff={toUnifiedDiffSmart({
                  fileName: activity.filename ?? "",
                  oldContent: activity.oldContent ?? "",
                  newContent: activity.newContent ?? "",
                })}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    );
  },
);

ToolPart.displayName = "ToolPart";
