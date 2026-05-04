import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { SelectionSheet } from "@/src/components/SelectionSheet";
import type { ModelGroup } from "@/src/lib/api/providers";

type AgentProviderSelectionSheetProps = {
  visible: boolean;
  providers: ModelGroup[];
  activeAgentProviderId?: string;
  onClose: () => void;
  onSelectProvider: (provider: ModelGroup) => void;
};

export function AgentProviderSelectionSheet({
  visible,
  providers,
  activeAgentProviderId,
  onClose,
  onSelectProvider,
}: AgentProviderSelectionSheetProps) {
  const theme = useTheme();
  const borderColor = theme.dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";

  return (
    <SelectionSheet
      visible={visible}
      title="Select Agent Provider"
      data={providers}
      onClose={onClose}
      onItemPress={(item) => onSelectProvider(item)}
      emptyText="No agent providers found"
      selectedId={activeAgentProviderId}
      getItemId={(item) => item.agentProviderId}
      keyExtractor={(item) => item.agentProviderId}
      renderItem={(item, isSelected) => (
        <Pressable
          onPress={() => onSelectProvider(item)}
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
                { backgroundColor: isSelected ? "#00FF41" : "#6366F1" },
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
                {item.agentProviderName}
              </Text>
              <Text
                variant="bodySmall"
                style={[
                  styles.subtitle,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {item.models.length} model{item.models.length === 1 ? "" : "s"}
              </Text>
            </View>
          </View>
        </Pressable>
      )}
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
  title: {},
  subtitle: {
    marginTop: 2,
  },
});
