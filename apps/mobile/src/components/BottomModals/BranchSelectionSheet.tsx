import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { SelectionSheet } from "@/src/components/SelectionSheet";
import type { Branch } from "@/src/lib/api/branches";

type BranchSelectionSheetProps = {
  visible: boolean;
  branches: Branch[];
  currentBranch?: string | null;
  warningMessage?: string | null;
  loading?: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClose: () => void;
  onSelectBranch: (branch: Branch) => Promise<void> | void;
};

export function BranchSelectionSheet({
  visible,
  branches,
  currentBranch,
  warningMessage,
  loading = false,
  searchQuery,
  onSearchChange,
  onClose,
  onSelectBranch,
}: BranchSelectionSheetProps) {
  const theme = useTheme();
  const borderColor = theme.dark
    ? "rgba(255,255,255,0.1)"
    : "rgba(0,0,0,0.08)";

  return (
    <SelectionSheet
      visible={visible}
      title="Select Branch"
      data={branches}
      onClose={onClose}
      onItemPress={onSelectBranch}
      searchPlaceholder="Search branches"
      searchQuery={searchQuery}
      onSearchChange={onSearchChange}
      isLoading={loading}
      emptyText="No branches found"
      headerContent={
        warningMessage ? (
          <View
            style={[
              styles.warningCard,
              { backgroundColor: theme.dark ? "#3F2A00" : "#FFF4D6" },
            ]}
          >
            <Text
              variant="bodySmall"
              style={{ color: theme.dark ? "#FFD166" : "#8A5A00" }}
            >
              {warningMessage}
            </Text>
          </View>
        ) : null
      }
      selectedId={currentBranch}
      getItemId={(item) => item.name}
      keyExtractor={(item) => item.name}
      renderItem={(item, isSelected) => {
        return (
          <Pressable
            onPress={() => onSelectBranch(item)}
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
                  { backgroundColor: isSelected ? "#00FF41" : "#F2A900" },
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
  warningCard: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
});
