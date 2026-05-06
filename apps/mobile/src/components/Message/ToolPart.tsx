import React from "react";
import { Pressable, View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type {
  SessionAssistantActivity,
  SessionAssistantActivityItem,
} from "@/src/lib/api/messages";
import { RawDiffViewer } from "./MessageSummaryDiffs";
import { toUnifiedDiffSmart } from "@/src/lib/diff/to-unified-diff";

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

function getItemFullPath(item: SessionAssistantActivityItem): string | null {
  if (!item.filename && !item.directory) {
    return null;
  }

  return `${item.directory ?? ""}${item.filename ?? ""}` || null;
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
    <View style={{ gap: 6, paddingLeft: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 6,
        }}
      >
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Text
            variant="bodySmall"
            style={{ color: textColor, fontWeight: "600" }}
          >
            {item.label}
          </Text>
          {item.detail ? (
            <Text variant="bodySmall" style={{ color: metaColor }}>
              {item.detail}
            </Text>
          ) : null}
          {!item.detail && getItemFullPath(item) ? (
            <Text variant="bodySmall" style={{ color: metaColor }}>
              {getItemFullPath(item)}
            </Text>
          ) : null}
        </View>
        {item.additions !== null &&
          item.additions !== undefined &&
          item.deletions !== null &&
          item.deletions !== undefined ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 2,
            }}
          >
            <DiffCount prefix="+" value={item.additions} color="#86EFAC" />
            <DiffCount prefix="-" value={item.deletions} color="#F97316" />
          </View>
        ) : null}
      </View>
      {/* {item.patch ? <RawDiffViewer diff={item.patch} /> : null}
      {!item.patch && (item.oldContent !== null || item.newContent !== null) ? (
        <RawDiffViewer
          diff={toUnifiedDiffSmart({
            fileName: item.filename ?? "file",
            oldContent: item.oldContent ?? "",
            newContent: item.newContent ?? "",
          })}
        />
      ) : null} */}
    </View>
  );
};

const ActivityDetailText = ({
  activity,
  textColor,
}: {
  activity: SessionAssistantActivity;
  textColor: string;
}) => {
  if (activity.filename || activity.directory) {
    return (
      <View
        style={{
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
      style={{ color: textColor, maxWidth: "80%" }}
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
      (activity.patch !== null ||
        activity.oldContent !== null ||
        activity.newContent !== null);

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
              activity.patch ? (
                <RawDiffViewer diff={activity.patch} />
              ) : (
                <RawDiffViewer
                  diff={toUnifiedDiffSmart({
                    fileName: activity.filename ?? "",
                    oldContent: activity.oldContent ?? "",
                    newContent: activity.newContent ?? "",
                  })}
                />
              )
            ) : null}
          </View>
        ) : null}
      </View>
    );
  },
);

ToolPart.displayName = "ToolPart";
