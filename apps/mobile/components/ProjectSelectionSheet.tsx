import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { SelectionSheet } from "@/src/components/SelectionSheet";
import type { Project } from "@/lib/api/projects";

type ProjectSelectionSheetProps = {
  visible: boolean;
  projects: Project[];
  activeProjectId?: string | null;
  loading?: boolean;
  onClose: () => void;
  onSelectProject: (project: Project) => void;
};

export function ProjectSelectionSheet({
  visible,
  projects,
  activeProjectId,
  loading = false,
  onClose,
  onSelectProject,
}: ProjectSelectionSheetProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const theme = useTheme();
  const borderColor = theme.dark
    ? "rgba(255,255,255,0.1)"
    : "rgba(0,0,0,0.08)";
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  React.useEffect(() => {
    if (!visible) {
      setSearchQuery("");
    }
  }, [visible]);

  const filteredProjects = React.useMemo(() => {
    if (!normalizedSearchQuery) {
      return projects;
    }

    return projects.filter((project) => {
      const searchableText = [
        project.name,
        project.folder,
        project.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearchQuery);
    });
  }, [normalizedSearchQuery, projects]);

  const handleSelect = (project: Project) => {
    onSelectProject(project);
    onClose();
  };

  return (
    <SelectionSheet
      visible={visible}
      title="Select Project"
      data={filteredProjects}
      onClose={onClose}
      onItemPress={handleSelect}
      searchPlaceholder="Search projects"
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      isLoading={loading}
      emptyText="No projects found"
      selectedId={activeProjectId}
      getItemId={(item) => item.id}
      renderItem={(item, isSelected) => {
        return (
          <Pressable
            onPress={() => handleSelect(item)}
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
                <Text
                  variant="bodySmall"
                  style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
                  numberOfLines={1}
                >
                  {item.folder || "No folder path"}
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
