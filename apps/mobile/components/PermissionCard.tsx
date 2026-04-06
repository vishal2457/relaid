import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { Button, Card, Text, useTheme } from "react-native-paper";

export type PermissionRequest = {
  requestId: string;
  projectId: string;
  sessionId: string;
  jobId: string;
  threadId: string;
  permission: string;
  patterns: string[];
  metadata: Record<string, unknown>;
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

function formatPermissionType(permission: string): string {
  const permissionLabels: Record<string, string> = {
    bash: "Run Command",
    edit: "Edit File",
    webfetch: "Fetch URL",
    external_directory: "Access Directory",
  };
  return permissionLabels[permission] || permission;
}

function formatPatternsPreview(patterns: string[]): string {
  if (patterns.length === 0) return "";
  if (patterns.length <= 2) return patterns.join(", ");
  return `${patterns.slice(0, 2).join(", ")} +${patterns.length - 2} more`;
}

export function PermissionCard({
  request,
  onRespond,
  isResponding = false,
}: PermissionCardProps) {
  const theme = useTheme();

  const borderColor = theme.dark ? "#2A3441" : "#D9E2EC";
  const warningColor = "#F59E0B";

  return (
    <View style={[styles.container, { borderColor }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons
          name="shield-alert"
          size={20}
          color={warningColor}
        />
        <Text variant="titleMedium" style={{ color: warningColor }}>
          Permission Required
        </Text>
      </View>

      <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
        {formatPermissionType(request.permission)}
      </Text>

      {request.patterns.length > 0 && (
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {formatPatternsPreview(request.patterns)}
        </Text>
      )}

      <View style={styles.buttonRow}>
        <Button
          mode="outlined"
          compact
          onPress={() => onRespond("reject")}
          disabled={isResponding}
          textColor="#EF4444"
          style={styles.button}
        >
          Reject
        </Button>
        <Button
          mode="outlined"
          compact
          onPress={() => onRespond("once")}
          disabled={isResponding}
          style={styles.button}
        >
          Allow Once
        </Button>
        <Button
          mode="contained"
          compact
          onPress={() => onRespond("always")}
          disabled={isResponding}
          style={styles.button}
        >
          Always Allow
        </Button>
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
  const [selectedOptions, setSelectedOptions] = React.useState<
    Record<number, string[]>
  >({});
  const [customAnswers, setCustomAnswers] = React.useState<
    Record<number, string>
  >({});

  const borderColor = theme.dark ? "#2A3441" : "#D9E2EC";
  const accentColor = "#3B82F6";

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

  const handleCustomAnswerChange = (questionIndex: number, value: string) => {
    setCustomAnswers((prev) => ({ ...prev, [questionIndex]: value }));
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
    <View style={[styles.container, { borderColor }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons
          name="help-circle"
          size={20}
          color={accentColor}
        />
        <Text variant="titleMedium" style={{ color: accentColor }}>
          Question Required
        </Text>
      </View>

      {request.questions.map((question, qIndex) => (
        <View key={qIndex} style={styles.questionBlock}>
          <Text
            variant="labelSmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {question.header}
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
            {question.question}
          </Text>

          <View style={styles.optionsContainer}>
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
                    styles.optionButton,
                    {
                      borderColor: isSelected
                        ? theme.colors.primary
                        : borderColor,
                      backgroundColor: isSelected
                        ? theme.colors.primaryContainer
                        : "transparent",
                    },
                  ]}
                >
                  <Text
                    variant="bodySmall"
                    style={{
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
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {option.description}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      <View style={styles.buttonRow}>
        <Button
          mode="outlined"
          compact
          onPress={() => onRespond([])}
          disabled={isResponding}
          style={styles.button}
        >
          Cancel
        </Button>
        <Button
          mode="contained"
          compact
          onPress={handleSubmit}
          disabled={isResponding || !allAnswered}
          style={styles.button}
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
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  button: {
    minWidth: 80,
  },
  questionBlock: {
    gap: 6,
  },
  optionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  optionButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
