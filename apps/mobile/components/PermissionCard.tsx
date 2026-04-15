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
  questions: {
    header: string;
    question: string;
    options: { label: string; description: string }[];
    multiple?: boolean;
    custom?: boolean;
  }[];
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
  const surfaceColor = isDark ? "#111827" : "#FFFFFF";
  const mutedSurface = isDark ? "rgba(255, 255, 255, 0.04)" : "#F8FAFC";
  const title =
    request.metadata &&
    typeof request.metadata.title === "string" &&
    request.metadata.title
      ? (request.metadata.title as string)
      : null;
  const displayPatterns = request.patterns.slice(0, 3);
  const remainingPatternCount = request.patterns.length - displayPatterns.length;

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
      <View style={styles.permissionHeader}>
        <Text
          variant="titleMedium"
          style={{ color: theme.colors.onSurface, fontWeight: "700" }}
        >
          Allow {formatPermissionType(request.permission).toLowerCase()}?
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}
        >
          {title || "Review the request before continuing."}
        </Text>
      </View>

      <View style={styles.content}>
        <View
          style={[
            styles.permissionTypePill,
            {
              backgroundColor: mutedSurface,
              borderColor,
            },
          ]}
        >
          <Text
            variant="labelLarge"
            style={{ fontWeight: "600", color: theme.colors.onSurface }}
          >
            {formatPermissionType(request.permission)}
          </Text>
        </View>

        {request.patterns.length > 0 && (
          <View style={styles.patternsWrapper}>
            <Text
              variant="labelMedium"
              style={{ color: theme.colors.onSurfaceVariant, fontWeight: "600" }}
            >
              Requested items
            </Text>
            {displayPatterns.map((pattern, idx) => {
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
                      backgroundColor: mutedSurface,
                      borderColor,
                    },
                  ]}
                >
                  <Text
                    variant="bodySmall"
                    style={{
                      color: theme.colors.onSurface,
                      fontFamily:
                        Platform.OS === "ios" ? "Courier" : "monospace",
                    }}
                    numberOfLines={1}
                  >
                    {displayPattern}
                  </Text>
                </View>
              );
            })}
            {remainingPatternCount > 0 && (
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                +{remainingPatternCount} more
              </Text>
            )}
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
            Allow once
          </Button>
          <Button
            mode="contained"
            onPress={() => onRespond("always")}
            disabled={isResponding}
            style={styles.actionButton}
            labelStyle={{ fontWeight: "700" }}
          >
            Always allow
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
  const [customAnswers] = React.useState<Record<number, string>>({});

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
  permissionHeader: {
    gap: 6,
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
  permissionTypePill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  patternsWrapper: {
    gap: 8,
  },
  patternItem: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
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
