import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { SelectionSheet } from "@/src/components/SelectionSheet";
import type { Agent } from "@/src/lib/api/agents";

type AgentSelectionSheetProps = {
  visible: boolean;
  agents: Agent[];
  activeAgentName?: string | null;
  loading?: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClose: () => void;
  onSelectAgent: (agent: Agent) => void;
  getAgentSubtitle: (agent: Agent) => string;
};

export function AgentSelectionSheet({
  visible,
  agents,
  activeAgentName,
  loading = false,
  searchQuery,
  onSearchChange,
  onClose,
  onSelectAgent,
  getAgentSubtitle,
}: AgentSelectionSheetProps) {
  const theme = useTheme();
  const borderColor = theme.dark
    ? "rgba(255,255,255,0.1)"
    : "rgba(0,0,0,0.08)";

  return (
    <SelectionSheet
      visible={visible}
      title="Select Agent"
      data={agents}
      onClose={onClose}
      onItemPress={onSelectAgent}
      searchPlaceholder="Search agents"
      searchQuery={searchQuery}
      onSearchChange={onSearchChange}
      isLoading={loading}
      emptyText="No agents found"
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
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text
                  variant="bodySmall"
                  style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
                  numberOfLines={2}
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
  title: {
  },
  subtitle: {
    marginTop: 2,
  },
});
