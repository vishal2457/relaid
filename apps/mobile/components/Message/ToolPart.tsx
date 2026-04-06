import React from "react";
import { View } from "react-native";
import { Text } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { FormattedText } from "./FormattedText";
import type { ToolStatus } from "@/lib/api/message-parts";

interface ToolPartProps {
  tool: string;
  input: Record<string, any>;
  output?: string;
  status: ToolStatus;
  metadata?: Record<string, any>;
  isDark?: boolean;
  metaColor: string;
  borderColor: string;
  surfaceColor: string;
}

const getToolIcon = (tool: string): string => {
  const icons: Record<string, string> = {
    bash: "console",
    shell: "console",
    read: "file-document-outline",
    write: "file-edit-outline",
    edit: "pencil",
    glob: "file-search-outline",
    grep: "text-search",
    list: "folder-outline",
    webfetch: "web",
    websearch: "magnify",
    task: "robot-outline",
    todowrite: "checkbox-marked-outline",
    question: "help-circle-outline",
  };
  return icons[tool] || "tools";
};

const getToolTitle = (tool: string): string => {
  const titles: Record<string, string> = {
    bash: "Shell",
    shell: "Shell",
    read: "Read",
    write: "Write",
    edit: "Edit",
    glob: "Glob",
    grep: "Grep",
    list: "List",
    webfetch: "Fetch",
    websearch: "Search",
    task: "Task",
    todowrite: "Plan",
    question: "Question",
  };
  return titles[tool] || tool;
};

const getToolSubtitle = (
  tool: string,
  input?: Record<string, any>,
): string | undefined => {
  if (!input) return undefined;

  switch (tool) {
    case "read":
    case "write":
    case "edit":
      return input.filePath?.split("/").pop();
    case "glob":
      return input.pattern;
    case "grep":
      return input.pattern;
    case "list":
      return input.path?.split("/").pop();
    case "task":
      return input.description || input.subagent_type;
    case "webfetch":
    case "websearch":
      return input.url || input.query;
    default:
      return undefined;
  }
};

const isRunning = (status: ToolStatus): boolean => {
  return status === "pending" || status === "running";
};

export const ToolPart: React.FC<ToolPartProps> = ({
  tool,
  input,
  output,
  status,
  metadata,
  isDark = true,
  metaColor,
  borderColor,
  surfaceColor,
}) => {
  const icon = getToolIcon(tool);
  const title = getToolTitle(tool);
  const subtitle = getToolSubtitle(tool, input);
  const running = isRunning(status);

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
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <MaterialCommunityIcons
          name={icon as any}
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
          {title}
        </Text>
        {subtitle && (
          <Text
            variant="labelSmall"
            style={{ color: metaColor, flex: 1 }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        )}
      </View>

      {running && !output && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
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

      {output && tool === "bash" && (
        <View style={{ marginTop: 8 }}>
          <FormattedText
            text={output}
            baseStyle={{
              color: isDark ? "#E5E7EB" : "#374151",
              fontFamily: "monospace",
              fontSize: 12,
            }}
          />
        </View>
      )}

      {metadata?.description && tool === "bash" && (
        <Text variant="bodySmall" style={{ color: metaColor, marginTop: 4 }}>
          {metadata.description}
        </Text>
      )}
    </View>
  );
};
