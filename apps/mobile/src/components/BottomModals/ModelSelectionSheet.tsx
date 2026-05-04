import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { SelectionSheet } from "@/src/components/SelectionSheet";
import type { ActiveModel, ModelGroup } from "@/src/lib/api/providers";

type ModelSelectionSheetProps = {
  visible: boolean;
  groups: ModelGroup[];
  activeModelId?: string | null;
  loading?: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClose: () => void;
  onSelectModel: (model: ActiveModel) => void;
};

type ModelRow =
  | { type: "header"; id: string; title: string }
  | { type: "model"; id: string; model: ActiveModel };

export function ModelSelectionSheet({
  visible,
  groups,
  activeModelId,
  loading = false,
  searchQuery,
  onSearchChange,
  onClose,
  onSelectModel,
}: ModelSelectionSheetProps) {
  const theme = useTheme();
  const borderColor = theme.dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const rows = React.useMemo<ModelRow[]>(() => {
    const showHeaders = groups.length > 1;
    return groups.flatMap((group) => [
      ...(showHeaders
        ? [
            {
              type: "header" as const,
              id: `runtime:${group.agentProviderId}`,
              title: group.agentProviderName,
            },
          ]
        : []),
      ...group.models.map((model) => ({
        type: "model" as const,
        id: model.id,
        model,
      })),
    ]);
  }, [groups]);

  return (
    <SelectionSheet
      visible={visible}
      title="Select Model"
      data={rows}
      onClose={onClose}
      onItemPress={(item) => {
        if (item.type === "model") {
          onSelectModel(item.model);
        }
      }}
      searchPlaceholder="Search models or providers"
      searchQuery={searchQuery}
      onSearchChange={onSearchChange}
      isLoading={loading}
      emptyText="No models found. Start OpenCode on desktop, then refresh this screen."
      selectedId={activeModelId}
      getItemId={(item) => item.id}
      keyExtractor={(item) => item.id}
      renderItem={(item, isSelected) => {
        if (item.type === "header") {
          return (
            <View
              style={[
                styles.header,
                { backgroundColor: theme.colors.surfaceVariant },
              ]}
            >
              <Text
                variant="labelLarge"
                style={[
                  styles.headerTitle,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {item.title}
              </Text>
            </View>
          );
        }
        const model = item.model;
        return (
          <Pressable
            onPress={() => onSelectModel(model)}
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
                  {model.modelName}
                </Text>
                <Text
                  variant="bodySmall"
                  style={[
                    styles.subtitle,
                    { color: theme.colors.onSurfaceVariant },
                  ]}
                >
                  {model.providerName}
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
  header: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitle: {
    fontWeight: "700",
    textTransform: "uppercase",
  },
  item: {
    paddingLeft: 28,
    paddingRight: 16,
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
