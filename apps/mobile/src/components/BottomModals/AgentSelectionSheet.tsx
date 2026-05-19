import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { SelectionSheet } from "@/src/components/SelectionSheet";
import type { Agent } from "@/src/lib/api/agents";

const CODEX_APPROVAL_POLICIES = [
  { value: "untrusted", label: "Untrusted" },
  { value: "on-request", label: "On request" },
  { value: "on-failure", label: "On failure" },
  { value: "never", label: "Never" },
] as const;

const CODEX_EFFORTS = [
  { value: "default", label: "Default" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "XHigh" },
] as const;

type AgentSelectionSheetProps = {
  visible: boolean;
  agents: Agent[];
  activeAgentName?: string | null;
  showCodexOptions?: boolean;
  codexApprovalPolicy?: string;
  codexEffort?: string;
  loading?: boolean;
  title?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClose: () => void;
  onSelectAgent: (agent: Agent) => void;
  onSelectCodexApprovalPolicy?: (value: string) => void;
  onSelectCodexEffort?: (value: string) => void;
  getAgentSubtitle: (agent: Agent) => string;
};

export function AgentSelectionSheet({
  visible,
  agents,
  activeAgentName,
  showCodexOptions = false,
  codexApprovalPolicy = "on-request",
  codexEffort = "default",
  loading = false,
  title = "Select Agent",
  emptyText = "No agents found",
  onClose,
  onSelectAgent,
  onSelectCodexApprovalPolicy,
  onSelectCodexEffort,
  getAgentSubtitle,
}: AgentSelectionSheetProps) {
  const theme = useTheme();
  const borderColor = theme.dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const chipBackground = theme.dark ? "rgba(148,163,184,0.12)" : "#EEF2F7";
  const chipSelectedBackground = theme.dark ? "#1D4ED8" : "#DBEAFE";
  const chipTextColor = theme.dark ? "#E2E8F0" : "#334155";
  const chipSelectedTextColor = theme.dark ? "#EFF6FF" : "#1D4ED8";

  const headerContent = showCodexOptions ? (
    <View style={styles.optionSections}>
      <View style={styles.optionSection}>
        <Text
          variant="labelLarge"
          style={[styles.optionLabel, { color: theme.colors.onSurface }]}
        >
          Approval policy
        </Text>
        <View style={styles.chipRow}>
          {CODEX_APPROVAL_POLICIES.map((option) => {
            const selected = codexApprovalPolicy === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => onSelectCodexApprovalPolicy?.(option.value)}
                style={[
                  styles.chip,
                  {
                    borderColor,
                    backgroundColor: selected
                      ? chipSelectedBackground
                      : chipBackground,
                  },
                ]}
              >
                <Text
                  variant="labelMedium"
                  style={{
                    color: selected ? chipSelectedTextColor : chipTextColor,
                    fontWeight: selected ? "700" : "500",
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.optionSection}>
        <Text
          variant="labelLarge"
          style={[styles.optionLabel, { color: theme.colors.onSurface }]}
        >
          Effort
        </Text>
        <View style={styles.chipRow}>
          {CODEX_EFFORTS.map((option) => {
            const selected = codexEffort === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => onSelectCodexEffort?.(option.value)}
                style={[
                  styles.chip,
                  {
                    borderColor,
                    backgroundColor: selected
                      ? chipSelectedBackground
                      : chipBackground,
                  },
                ]}
              >
                <Text
                  variant="labelMedium"
                  style={{
                    color: selected ? chipSelectedTextColor : chipTextColor,
                    fontWeight: selected ? "700" : "500",
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  ) : null;

  return (
    <SelectionSheet
      visible={visible}
      title={title}
      data={agents}
      onClose={onClose}
      onItemPress={onSelectAgent}
      isLoading={loading}
      emptyText={emptyText}
      headerContent={headerContent}
      selectedId={activeAgentName}
      getItemId={(item) => item.name}
      keyExtractor={(item) => item.name}
      renderItem={(item, isSelected) => {
        return (
          <Pressable
            onPress={() => onSelectAgent(item)}
            style={[
              styles.item,
              {
                backgroundColor: isSelected
                  ? "rgba(150,150,150,0.12)"
                  : "transparent",
                borderColor,
              },
            ]}
          >
            <View style={styles.row}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: isSelected ? "#00FF41" : "#14B8A6" },
                ]}
              />
              <View style={styles.content}>
                <Text
                  variant="bodyLarge"
                  style={[
                    styles.title,
                    {
                      fontWeight: isSelected ? "600" : "500",
                      color: theme.colors.onSurface,
                    },
                  ]}
                >
                  {item.name}
                </Text>
                <Text
                  variant="bodySmall"
                  style={[
                    styles.subtitle,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {item.description?.trim() || getAgentSubtitle(item)}
                </Text>
              </View>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  item: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  content: {
    flex: 1,
  },
  optionSections: {
    gap: 12,
  },
  optionSection: {
    gap: 8,
  },
  optionLabel: {
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  title: {},
  subtitle: {
    marginTop: 2,
  },
});
