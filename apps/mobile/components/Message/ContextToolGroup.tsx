import React from "react";
import { View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ToolPart } from "@/lib/api/message-parts";

interface ContextToolGroupProps {
  tools: ToolPart[];
  isDark?: boolean;
  metaColor: string;
  borderColor: string;
  surfaceColor: string;
}

const getToolSummary = (tools: ToolPart[]) => {
  const summary = {
    read: 0,
    search: 0,
    list: 0,
  };

  for (const tool of tools) {
    if (tool.tool === "read") summary.read++;
    else if (tool.tool === "glob" || tool.tool === "grep") summary.search++;
    else if (tool.tool === "list") summary.list++;
  }

  return summary;
};

const isAnyRunning = (tools: ToolPart[]): boolean => {
  return tools.some(
    (t) => t.state.status === "pending" || t.state.status === "running",
  );
};

export const ContextToolGroup: React.FC<ContextToolGroupProps> = ({
  tools,
  isDark = true,
  metaColor,
  borderColor,
  surfaceColor,
}) => {
  const summary = getToolSummary(tools);
  const running = isAnyRunning(tools);

  const parts: string[] = [];
  if (summary.read > 0) {
    parts.push(`${summary.read} ${summary.read === 1 ? "read" : "reads"}`);
  }
  if (summary.search > 0) {
    parts.push(
      `${summary.search} ${summary.search === 1 ? "search" : "searches"}`,
    );
  }
  if (summary.list > 0) {
    parts.push(`${summary.list} ${summary.list === 1 ? "list" : "lists"}`);
  }

  const summaryText = parts.length > 0 ? parts.join(" · ") : "0 tools";

  return (
    <View
      style={{
        marginBottom: 12,
        borderWidth: 1,
        borderColor,
        borderRadius: 12,
        backgroundColor: surfaceColor,
        padding: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <MaterialCommunityIcons
          name={running ? "sync" : "folder-search-outline"}
          size={16}
          color={running ? "#60A5FA" : metaColor}
        />
        <Text
          variant="labelMedium"
          style={{
            fontWeight: running ? "600" : "500",
            color: running ? "#60A5FA" : metaColor,
          }}
        >
          {running ? "Gathering context..." : "Explored"}
        </Text>
        <Text variant="labelSmall" style={{ color: metaColor }}>
          {summaryText}
        </Text>
      </View>

      {running && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginTop: 8,
          }}
        >
          <View style={{ flexDirection: "row", gap: 4 }}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: "#60A5FA",
                }}
              />
            ))}
          </View>
        </View>
      )}
    </View>
  );
};
