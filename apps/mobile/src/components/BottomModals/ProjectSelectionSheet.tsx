import React from "react";
import { Pressable, StyleSheet, Text as RNText, View } from "react-native";
import { BottomSheetSectionList } from "@gorhom/bottom-sheet";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import { SelectionSheet } from "@/src/components/SelectionSheet";
import type { Project } from "@/src/lib/api/projects";

type ProjectSection = {
  title: string;
  data: Project[];
};

type ProjectSelectionSheetProps = {
  visible: boolean;
  projects: Project[];
  favoriteProjectIds: string[];
  activeProjectId?: string | null;
  loading?: boolean;
  refreshing?: boolean;
  onClose: () => void;
  onSelectProject: (project: Project) => void;
  onToggleFavorite: (project: Project) => void;
  onRefresh?: () => void;
};

export function ProjectSelectionSheet({
  visible,
  projects,
  favoriteProjectIds,
  activeProjectId,
  loading = false,
  refreshing = false,
  onClose,
  onSelectProject,
  onToggleFavorite,
  onRefresh,
}: ProjectSelectionSheetProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const theme = useTheme();
  const borderColor = theme.dark
    ? "rgba(255,255,255,0.1)"
    : "rgba(0,0,0,0.08)";
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const favoriteProjectIdSet = React.useMemo(
    () => new Set(favoriteProjectIds),
    [favoriteProjectIds],
  );

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

  const sections = React.useMemo<ProjectSection[]>(() => {
    const favoriteProjects = filteredProjects.filter((project) =>
      favoriteProjectIdSet.has(project.id),
    );
    const otherProjects = filteredProjects.filter(
      (project) => !favoriteProjectIdSet.has(project.id),
    );

    return [
      favoriteProjects.length > 0
        ? { title: "Favorites", data: favoriteProjects }
        : null,
      otherProjects.length > 0
        ? { title: favoriteProjects.length > 0 ? "All Projects" : "Projects", data: otherProjects }
        : null,
    ].filter((section): section is ProjectSection => section !== null);
  }, [favoriteProjectIdSet, filteredProjects]);

  return (
    <SelectionSheet
      visible={visible}
      title="Select Project"
      onClose={onClose}
      searchPlaceholder="Search projects"
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      isLoading={loading}
      emptyText="No projects found"
      titleAction={
        onRefresh ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh projects"
            onPress={onRefresh}
            style={({ pressed }) => [
              styles.refreshButton,
              { borderColor },
              pressed && styles.refreshButtonPressed,
            ]}
          >
            <MaterialCommunityIcons
              name={refreshing ? "loading" : "refresh"}
              size={16}
              color={theme.colors.onSurface}
            />
          </Pressable>
        ) : null
      }
      children={
        loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator />
          </View>
        ) : sections.length === 0 ? (
          <View style={styles.emptyState}>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              No projects found
            </Text>
          </View>
        ) : (
          <BottomSheetSectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            stickySectionHeadersEnabled={false}
            contentContainerStyle={styles.listContent}
            renderSectionHeader={({ section }) => (
              <RNText
                style={[
                  styles.sectionTitle,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {section.title}
              </RNText>
            )}
            renderItem={({ item }) => {
              const isSelected = item.id === activeProjectId;
              const isFavorite = favoriteProjectIdSet.has(item.id);

              return (
                <Pressable
                  onPress={() => onSelectProject(item)}
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
                    <View style={styles.content}>
                      <RNText
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
                      </RNText>
                      <RNText
                        style={[
                          styles.subtitle,
                          { color: theme.colors.onSurfaceVariant },
                        ]}
                        numberOfLines={1}
                      >
                        {item.folder || "No folder path"}
                      </RNText>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        isFavorite
                          ? `Unfavorite ${item.name}`
                          : `Favorite ${item.name}`
                      }
                      hitSlop={8}
                      onPress={(event) => {
                        event.stopPropagation();
                        onToggleFavorite(item);
                      }}
                      style={({ pressed }) => [
                        styles.favoriteButton,
                        pressed && styles.favoriteButtonPressed,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={isFavorite ? "star" : "star-outline"}
                        size={20}
                        color={
                          isFavorite
                            ? theme.colors.primary
                            : theme.colors.onSurfaceVariant
                        }
                      />
                    </Pressable>
                  </View>
                </Pressable>
              );
            }}
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  item: {
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 6,
    fontWeight: "700",
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 48,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: "center",
  },
  loadingState: {
    paddingVertical: 32,
    alignItems: "center",
  },
  favoriteButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  favoriteButtonPressed: {
    opacity: 0.7,
  },
  refreshButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  refreshButtonPressed: {
    opacity: 0.7,
  },
});
