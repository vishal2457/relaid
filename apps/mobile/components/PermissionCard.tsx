import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View, Platform } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";

export type PermissionRequest = {
  requestId: string;
  projectId: string;
  sessionId: string;
  jobId: string;
  threadId: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
  timestamp?: string;
};

export type QuestionRequest = {
  requestId: string;
  projectId: string;
  sessionId: string;
  jobId: string;
  threadId: string;
  questions: Array<{
    header: string;
    question: string;
    options: Array<{ label: string; description: string }>;
    multiple?: boolean;
    custom?: boolean;
  }>;
};

type PermissionCardProps = {
  request: PermissionRequest;
  onRespond: (reply: "once" | "always" | "reject") => void;
  isResponding?: boolean;
};

type QuestionCardProps = {
  request: QuestionRequest;
  onRespond: (answers: string[][]) => void;
  isResponding?: boolean;
};

export function formatPermissionType(permission: string): string {
  const permissionLabels: Record<string, string> = {
    bash: "Run Command",
    edit: "Edit File",
    read: "Read File",
    delete: "Delete File",
    move: "Move File",
    search: "Search Files",
    glob: "Search Files",
    execute: "Run Command",
    webfetch: "Fetch URL",
    websearch: "Web Search",
    codesearch: "Code Search",
    external_directory: "Access Directory",
    think: "Run Command",
    list: "List Files",
    task: "Run Task",
    todowrite: "Write Todo",
    question: "Answer Question",
    lsp: "Language Server",
    skill: "Run Skill",
  };
  return permissionLabels[permission] || permission;
}

function getPermissionIcon(permission: string): string {
  const iconMap: Record<string, string> = {
    bash: "console",
    execute: "console",
    think: "console",
    task: "console",
    edit: "file-edit-outline",
    delete: "file-remove-outline",
    move: "file-move-outline",
    read: "file-eye-outline",
    glob: "file-search-outline",
    search: "file-search-outline",
    grep: "file-search-outline",
    list: "file-tree-outline",
    webfetch: "web",
    websearch: "web",
    codesearch: "code-search",
    external_directory: "folder-open-outline",
    skill: "lightning-bolt-outline",
  };
  return iconMap[permission] || "shield-lock-outline";
}

export function PermissionCard({
  request,
  onRespond,
  isResponding = false,
}: PermissionCardProps) {
  const theme = useTheme();

  const isDark = theme.dark;
  const borderColor = isDark
    ? "rgba(255, 255, 255, 0.1)"
    : "rgba(0, 0, 0, 0.05)";
  const warningColor = "#F59E0B";
  const surfaceColor = isDark ? "#1E293B" : "#F8FAFC";

  return (
    <View
      style={[
        styles.container,
        {
          borderColor,
          backgroundColor: surfaceColor,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        },
      ]}
    >
      <View style={styles.header}>
        <View
          style={[
            styles.iconWrapper,
            {
              backgroundColor: isDark
                ? "rgba(245, 158, 11, 0.15)"
                : "rgba(245, 158, 11, 0.1)",
            },
          ]}
        >
          <MaterialCommunityIcons
            name="shield-lock"
            size={22}
            color={warningColor}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            variant="labelSmall"
            style={{
              color: warningColor,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Permission
          </Text>
          <Text
            variant="titleSmall"
            style={{ color: theme.colors.onSurface, fontWeight: "600" }}
          >
            The agent requests permission
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.permissionTypeRow}>
          <MaterialCommunityIcons
            name={getPermissionIcon(request.permission) as any}
            size={18}
            color={theme.colors.primary}
            style={{ marginRight: 6 }}
          />
          <Text
            variant="bodyLarge"
            style={{ fontWeight: "700", color: theme.colors.primary }}
          >
            {formatPermissionType(request.permission)}
          </Text>
        </View>

        {(() => {
          const title =
            request.metadata &&
            typeof request.metadata.title === "string" &&
            request.metadata.title
              ? (request.metadata.title as string)
              : null;
          if (!title) return null;
          return (
            <Text
              variant="bodyMedium"
              style={{
                color: theme.colors.onSurface,
                fontWeight: "500",
              }}
              numberOfLines={3}
            >
              {title}
            </Text>
          );
        })()}

        {request.patterns.length > 0 && (
          <View style={styles.patternsWrapper}>
            {request.patterns.map((pattern, idx) => {
              const patternIcon: any =
                request.permission === "bash" ||
                request.permission === "execute" ||
                request.permission === "think"
                  ? "console-line"
                  : request.permission === "webfetch" ||
                      request.permission === "websearch"
                    ? "web"
                    : "file-document-outline";
              const displayPattern =
                pattern.length > 60
                  ? "..." + pattern.slice(pattern.length - 57)
                  : pattern;
              return (
                <View
                  key={idx}
                  style={[
                    styles.patternItem,
                    {
                      backgroundColor: isDark
                        ? "rgba(0,0,0,0.2)"
                        : "rgba(0,0,0,0.03)",
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={patternIcon}
                    size={14}
                    color={theme.colors.onSurfaceVariant}
                  />
                  <Text
                    variant="bodySmall"
                    style={{
                      color: theme.colors.onSurfaceVariant,
                      fontFamily:
                        Platform.OS === "ios" ? "Courier" : "monospace",
                    }}
                    numberOfLines={2}
                  >
                    {displayPattern}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.actionRow}>
        <Button
          mode="text"
          onPress={() => onRespond("reject")}
          disabled={isResponding}
          textColor="#EF4444"
          style={styles.actionButton}
          labelStyle={{ fontWeight: "600" }}
        >
          Deny
        </Button>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            mode="outlined"
            onPress={() => onRespond("once")}
            disabled={isResponding}
            style={[styles.actionButton, { borderColor: theme.colors.outline }]}
            labelStyle={{ fontWeight: "600" }}
          >
            Once
          </Button>
          <Button
            mode="contained"
            onPress={() => onRespond("always")}
            disabled={isResponding}
            style={styles.actionButton}
            labelStyle={{ fontWeight: "700" }}
          >
            Always
          </Button>
        </View>
      </View>
    </View>
  );
}

export function QuestionCard({
  request,
  onRespond,
  isResponding = false,
}: QuestionCardProps) {
  const theme = useTheme();
  const isDark = theme.dark;
  const [selectedOptions, setSelectedOptions] = React.useState<
    Record<number, string[]>
  >({});
  const [customAnswers, setCustomAnswers] = React.useState<
    Record<number, string>
  >({});

  const borderColor = isDark
    ? "rgba(255, 255, 255, 0.1)"
    : "rgba(0, 0, 0, 0.05)";
  const accentColor = "#3B82F6";
  const surfaceColor = isDark ? "#1E293B" : "#F8FAFC";

  const handleToggleOption = (questionIndex: number, optionLabel: string) => {
    const question = request.questions[questionIndex];
    setSelectedOptions((prev) => {
      const current = prev[questionIndex] || [];
      if (question.multiple) {
        if (current.includes(optionLabel)) {
          return {
            ...prev,
            [questionIndex]: current.filter((o) => o !== optionLabel),
          };
        } else {
          return {
            ...prev,
            [questionIndex]: [...current, optionLabel],
          };
        }
      } else {
        return { ...prev, [questionIndex]: [optionLabel] };
      }
    });
  };

  const handleSubmit = () => {
    const answers: string[][] = request.questions.map((_, index) => {
      const selected = selectedOptions[index] || [];
      const custom = customAnswers[index];
      if (custom && custom.trim()) {
        return [...selected, custom.trim()];
      }
      return selected;
    });
    onRespond(answers);
  };

  const allAnswered = request.questions.every((_, index) => {
    const selected = selectedOptions[index] || [];
    const custom = customAnswers[index];
    return selected.length > 0 || (custom && custom.trim().length > 0);
  });

  return (
    <View
      style={[
        styles.container,
        {
          borderColor,
          backgroundColor: surfaceColor,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        },
      ]}
    >
      <View style={styles.header}>
        <View
          style={[
            styles.iconWrapper,
            {
              backgroundColor: isDark
                ? "rgba(59, 130, 246, 0.15)"
                : "rgba(59, 130, 246, 0.1)",
            },
          ]}
        >
          <MaterialCommunityIcons
            name="help-circle"
            size={22}
            color={accentColor}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            variant="labelSmall"
            style={{
              color: accentColor,
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Action Required
          </Text>
          <Text
            variant="titleSmall"
            style={{ color: theme.colors.onSurface, fontWeight: "600" }}
          >
            Provide more context
          </Text>
        </View>
      </View>

      {request.questions.map((question, qIndex) => (
        <View key={qIndex} style={styles.questionBlock}>
          <View style={styles.questionHeader}>
            <Text
              variant="labelMedium"
              style={{ color: theme.colors.primary, fontWeight: "600" }}
            >
              {question.header}
            </Text>
            <Text
              variant="bodyMedium"
              style={{
                color: theme.colors.onSurface,
                fontWeight: "500",
                marginTop: 2,
              }}
            >
              {question.question}
            </Text>
          </View>

          <View style={styles.optionsList}>
            {question.options.map((option, oIndex) => {
              const isSelected = (selectedOptions[qIndex] || []).includes(
                option.label,
              );
              return (
                <Pressable
                  key={oIndex}
                  onPress={() =>
                    !isResponding && handleToggleOption(qIndex, option.label)
                  }
                  style={[
                    styles.optionCard,
                    {
                      borderColor: isSelected
                        ? theme.colors.primary
                        : borderColor,
                      backgroundColor: isSelected
                        ? isDark
                          ? "rgba(59, 130, 246, 0.1)"
                          : "rgba(59, 130, 246, 0.05)"
                        : isDark
                          ? "rgba(0,0,0,0.1)"
                          : "#FFFFFF",
                    },
                  ]}
                >
                  <View style={styles.optionContent}>
                    <MaterialCommunityIcons
                      name={
                        isSelected
                          ? question.multiple
                            ? "checkbox-marked"
                            : "radiobox-marked"
                          : question.multiple
                            ? "checkbox-blank-outline"
                            : "radiobox-blank"
                      }
                      size={20}
                      color={
                        isSelected
                          ? theme.colors.primary
                          : theme.colors.onSurfaceVariant
                      }
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        variant="bodyMedium"
                        style={{
                          fontWeight: isSelected ? "600" : "400",
                          color: isSelected
                            ? theme.colors.primary
                            : theme.colors.onSurface,
                        }}
                      >
                        {option.label}
                      </Text>
                      {option.description && (
                        <Text
                          variant="labelSmall"
                          style={{
                            color: theme.colors.onSurfaceVariant,
                            marginTop: 2,
                          }}
                        >
                          {option.description}
                        </Text>
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <View style={styles.actionRow}>
        <Button
          mode="text"
          onPress={() => onRespond([])}
          disabled={isResponding}
          style={styles.actionButton}
        >
          Skip
        </Button>
        <Button
          mode="contained"
          onPress={handleSubmit}
          disabled={isResponding || !allAnswered}
          style={styles.actionButton}
          labelStyle={{ fontWeight: "700" }}
        >
          Submit
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    gap: 12,
  },
  permissionTypeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  patternsWrapper: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  patternItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  actionButton: {
    borderRadius: 8,
    minWidth: 80,
  },
  questionBlock: {
    gap: 12,
  },
  questionHeader: {
    gap: 2,
  },
  optionsList: {
    gap: 8,
  },
  optionCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
  },
  optionContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
});
