import React, { useState, useCallback } from "react";
import {
  Animated,
  Easing,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Checkbox,
  Text,
  useTheme,
  type MD3Theme,
} from "react-native-paper";
import {
  useGitFileStatus,
  useGitStageFiles,
  useGitUnstageFiles,
  type GitFileStatus,
} from "@/src/lib/api/git";
import type { Project } from "@/src/lib/api/projects";

const statusLabelMap: Record<string, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
  typechanged: "T",
  unmerged: "U",
  untracked: "?",
  ignored: "I",
  created: "C",
  conflicted: "!",
  staged: "S",
};

const statusColorMap: Record<string, string> = {
  added: "#22C55E",
  modified: "#F59E0B",
  deleted: "#EF4444",
  renamed: "#8B5CF6",
  copied: "#22C55E",
  typechanged: "#0EA5E9",
  unmerged: "#EF4444",
  untracked: "#64748B",
  ignored: "#94A3B8",
  created: "#22C55E",
  conflicted: "#EF4444",
  staged: "#22C55E",
};

type Section = "none" | "changes" | "staged";
const DRAWER_WIDTH = 320;
const DRAWER_ANIMATION_DURATION = 220;

type CollapsibleSectionProps = {
  title: string;
  icon: string;
  files: GitFileStatus[];
  borderColor: string;
  metaColor: string;
  theme: MD3Theme;
  selectedFiles: Set<string>;
  onToggleFile: (path: string) => void;
  onSelectAll: (paths: string[]) => void;
  isActive: boolean;
  disabled: boolean;
  onCollapse: (paths: string[]) => void;
  onFilePress: (path: string) => void;
};

function CollapsibleSection({
  title,
  icon,
  files,
  borderColor,
  metaColor,
  theme,
  selectedFiles,
  onToggleFile,
  onSelectAll,
  disabled,
  onCollapse,
  onFilePress,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(true);

  const allSelected =
    files.length > 0 && files.every((f) => selectedFiles.has(f.path));
  const someSelected = files.some((f) => selectedFiles.has(f.path));
  const selectAllStatus: "checked" | "unchecked" | "indeterminate" = allSelected
    ? "checked"
    : someSelected
      ? "indeterminate"
      : "unchecked";

  const handleSelectAllPress = () => {
    const paths = files.map((f) => f.path);
    onSelectAll(paths);
  };

  return (
    <View style={styles.section}>
      <Pressable
        style={[styles.sectionHeader, { borderBottomColor: borderColor }]}
        onPress={() => {
          if (expanded) onCollapse(files.map((f) => f.path));
          setExpanded((prev) => !prev);
        }}
      >
        <View style={styles.sectionHeaderLeft}>
          <MaterialCommunityIcons
            name={icon as any}
            size={18}
            color={metaColor}
          />
          <Text
            variant="titleSmall"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            {title}
          </Text>
          <Text
            variant="labelSmall"
            style={[styles.sectionCount, { color: metaColor }]}
          >
            {files.length}
          </Text>
        </View>
        <MaterialCommunityIcons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={metaColor}
        />
      </Pressable>

      {expanded && files.length === 0 && (
        <View style={styles.sectionEmpty}>
          <Text variant="bodySmall" style={{ color: metaColor }}>
            No {title.toLowerCase()}
          </Text>
        </View>
      )}

      {expanded && files.length > 0 && (
        <>
          <View
            style={[styles.selectAllRow, { borderBottomColor: borderColor }]}
          >
            <Checkbox.Android
              status={selectAllStatus}
              onPress={handleSelectAllPress}
              disabled={disabled}
            />
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurface, flex: 1 }}
            >
              Select all
            </Text>
          </View>

          <FlatList
            data={files}
            keyExtractor={(item) => item.path}
            scrollEnabled={false}
            renderItem={({ item }) => {
              const isSelected = selectedFiles.has(item.path);
              return (
                <Pressable
                  style={[styles.fileItem, { borderBottomColor: borderColor }]}
                  onPress={() => onFilePress(item.path)}
                >
                  <Checkbox.Android
                    status={isSelected ? "checked" : "unchecked"}
                    onPress={() => onToggleFile(item.path)}
                    disabled={disabled}
                  />
                  <View style={styles.fileInfo}>
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurface }}
                      numberOfLines={1}
                    >
                      {item.path.split("/").pop()}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: metaColor }}
                      numberOfLines={1}
                    >
                      {item.path}
                    </Text>
                  </View>
                  <Text
                    variant="labelSmall"
                    style={{
                      color: statusColorMap[item.status] ?? metaColor,
                      fontWeight: "600",
                    }}
                  >
                    {statusLabelMap[item.status] ?? "?"}
                  </Text>
                </Pressable>
              );
            }}
          />
        </>
      )}
    </View>
  );
}

type GitDrawerProps = {
  visible: boolean;
  onClose: () => void;
  activeProject: Project | null;
  borderColor: string;
  metaColor: string;
  backgroundColor: string;
};

export function GitDrawer({
  visible,
  onClose,
  activeProject,
  borderColor,
  metaColor,
  backgroundColor,
}: GitDrawerProps) {
  const theme = useTheme();
  const [isMounted, setIsMounted] = useState(visible);
  const slideAnim = React.useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const backdropAnim = React.useRef(new Animated.Value(0)).current;
  const [activeSection, setActiveSection] = useState<Section>("none");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);

  const { data, isLoading, error, refetch, isRefetching } = useGitFileStatus(
    activeProject?.id ?? "",
    Boolean(activeProject),
  );

  const staged = data?.staged ?? [];
  const unstaged = data?.unstaged ?? [];
  const branch = data?.branch ?? "";

  const clearSelection = useCallback(() => {
    setSelectedFiles(new Set());
    setActiveSection("none");
  }, []);

  const stageFiles = useGitStageFiles(activeProject?.id ?? "", clearSelection);
  const unstageFiles = useGitUnstageFiles(
    activeProject?.id ?? "",
    clearSelection,
  );

  const toggleFile = useCallback(
    (path: string, section: Section) => {
      setSelectedFiles((prev) => {
        if (activeSection !== section && activeSection !== "none") {
          const next = new Set<string>();
          next.add(path);
          setActiveSection(section);
          return next;
        }
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
          if (next.size === 0) setActiveSection("none");
        } else {
          next.add(path);
          setActiveSection(section);
        }
        return next;
      });
    },
    [activeSection],
  );

  const handleSelectAll = useCallback((paths: string[], section: Section) => {
    setSelectedFiles((prev) => {
      const allSelected = paths.every((p) => prev.has(p));
      if (allSelected) {
        setActiveSection("none");
        return new Set();
      }
      setActiveSection(section);
      return new Set(paths);
    });
  }, []);

  const clearSectionFiles = useCallback((paths: string[]) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const p of paths) {
        if (next.has(p)) {
          next.delete(p);
          changed = true;
        }
      }
      if (!changed) return prev;
      if (next.size === 0) setActiveSection("none");
      return next;
    });
  }, []);

  const handleStage = () => {
    const files = Array.from(selectedFiles);
    stageFiles.mutate(files);
  };

  const handleUnstage = () => {
    const files = Array.from(selectedFiles);
    unstageFiles.mutate(files);
  };

  const handleCommit = useCallback(async () => {
    if (!activeProject || selectedFiles.size === 0) return;

    const files = Array.from(selectedFiles);
    setIsCommitting(true);

    try {
      await stageFiles.mutateAsync(files);
      setCommitMessage("");
      setIsCommitting(false);
      setSelectedFiles(new Set());
      setActiveSection("none");
    } catch (error) {
      console.error("Commit failed:", error);
      setIsCommitting(false);
    }
  }, [activeProject, selectedFiles, stageFiles]);

  React.useEffect(() => {
    if (visible) {
      setIsMounted(true);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: DRAWER_ANIMATION_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: DRAWER_ANIMATION_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!isMounted) return;

    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: DRAWER_WIDTH,
        duration: DRAWER_ANIMATION_DURATION,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: DRAWER_ANIMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setIsMounted(false);
    });
  }, [visible, isMounted, slideAnim, backdropAnim]);

  if (!isMounted) {
    return null;
  }

  return (
    <>
      <Animated.View
        pointerEvents={visible ? "auto" : "none"}
        style={[styles.backdrop, { opacity: backdropAnim }]}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.drawer,
          {
            backgroundColor,
            borderLeftWidth: 1,
            borderColor,
          },
        ]}
      >
        <KeyboardAvoidingView
          style={styles.drawerContent}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[styles.header, { borderBottomColor: borderColor }]}>
            {activeSection !== "none" ? (
              <View style={styles.selectionHeader}>
                <Pressable onPress={clearSelection} style={styles.backButton}>
                  <MaterialCommunityIcons
                    name="arrow-left"
                    size={20}
                    color={theme.colors.onSurface}
                  />
                </Pressable>
                <Text variant="titleMedium" style={styles.selectionTitle}>
                  {selectedFiles.size} selected
                </Text>
              </View>
            ) : (
              <Text
                variant="bodySmall"
                style={[styles.headerTitle, { fontSize: 14 }]}
              >
                {branch}
              </Text>
            )}
            <Pressable
              onPress={() => refetch()}
              style={[styles.closeButton, { borderColor, marginRight: 8 }]}
              disabled={!activeProject || isRefetching}
            >
              {isRefetching ? (
                <ActivityIndicator size={18} />
              ) : (
                <MaterialCommunityIcons
                  name="refresh"
                  size={20}
                  color={theme.colors.onSurface}
                />
              )}
            </Pressable>
            <Pressable
              onPress={onClose}
              style={[styles.closeButton, { borderColor }]}
            >
              <MaterialCommunityIcons
                name="close"
                size={20}
                color={theme.colors.onSurface}
              />
            </Pressable>
          </View>

          {!activeProject ? (
            <View style={styles.centerContent}>
              <MaterialCommunityIcons
                name="folder-outline"
                size={32}
                color={metaColor}
              />
              <Text
                variant="bodyMedium"
                style={{ color: metaColor, marginTop: 12 }}
              >
                Select a project first
              </Text>
            </View>
          ) : isLoading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator />
              <Text
                variant="bodyMedium"
                style={{ color: metaColor, marginTop: 12 }}
              >
                Loading...
              </Text>
            </View>
          ) : error ? (
            <View style={styles.centerContent}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={32}
                color={theme.colors.error}
              />
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}
              >
                Failed to load files
              </Text>
            </View>
          ) : (
            <FlatList
              data={[]}
              keyExtractor={() => "empty"}
              renderItem={() => null}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <>
                  <CollapsibleSection
                    title="Changes"
                    icon="file-edit-outline"
                    files={unstaged}
                    borderColor={borderColor}
                    metaColor={metaColor}
                    theme={theme}
                    selectedFiles={selectedFiles}
                    onToggleFile={(path) => toggleFile(path, "changes")}
                    onSelectAll={(paths) => handleSelectAll(paths, "changes")}
                    isActive={activeSection === "changes"}
                    disabled={activeSection === "staged"}
                    onCollapse={clearSectionFiles}
                    onFilePress={(path) => {
                      if (!activeProject) return;
                      router.push({
                        pathname: "/diff",
                        params: {
                          projectId: activeProject.id,
                          filePath: path,
                          fileName: path.split("/").pop(),
                        },
                      });
                    }}
                  />
                  <CollapsibleSection
                    title="Staged"
                    icon="check-circle-outline"
                    files={staged}
                    borderColor={borderColor}
                    metaColor={metaColor}
                    theme={theme}
                    selectedFiles={selectedFiles}
                    onToggleFile={(path) => toggleFile(path, "staged")}
                    onSelectAll={(paths) => handleSelectAll(paths, "staged")}
                    isActive={activeSection === "staged"}
                    disabled={activeSection === "changes"}
                    onCollapse={clearSectionFiles}
                    onFilePress={(path) => {
                      if (!activeProject) return;
                      router.push({
                        pathname: "/diff",
                        params: {
                          projectId: activeProject.id,
                          filePath: path,
                          fileName: path.split("/").pop(),
                        },
                      });
                    }}
                  />
                </>
              }
            />
          )}

          {activeProject &&
            !isLoading &&
            !error &&
            activeSection !== "none" &&
            selectedFiles.size > 0 && (
              <View
                style={[
                  styles.bottomActionBar,
                  { borderTopColor: borderColor },
                ]}
              >
                <Pressable
                  style={({ pressed }) => [
                    styles.bottomActionBtn,
                    {
                      backgroundColor:
                        activeSection === "changes" ? "#2563EB" : "#D97706",
                      opacity:
                        pressed ||
                        stageFiles.isPending ||
                        unstageFiles.isPending
                          ? 0.7
                          : 1,
                    },
                  ]}
                  onPress={
                    activeSection === "changes" ? handleStage : handleUnstage
                  }
                  disabled={stageFiles.isPending || unstageFiles.isPending}
                >
                  {(activeSection === "changes" && stageFiles.isPending) ||
                  (activeSection === "staged" && unstageFiles.isPending) ? (
                    <ActivityIndicator size={14} color="#fff" />
                  ) : (
                    <MaterialCommunityIcons
                      name={activeSection === "changes" ? "plus" : "minus"}
                      size={14}
                      color="#fff"
                    />
                  )}
                  <Text variant="labelSmall" style={styles.bottomActionText}>
                    {activeSection === "changes" && stageFiles.isPending
                      ? "Staging..."
                      : activeSection === "staged" && unstageFiles.isPending
                        ? "Unstaging..."
                        : activeSection === "changes"
                          ? `Stage ${selectedFiles.size}`
                          : `Unstage ${selectedFiles.size}`}
                  </Text>
                </Pressable>

                {activeSection === "staged" && (
                  <>
                    <View style={styles.commitInputRow}>
                      <TextInput
                        style={styles.commitInput}
                        placeholder="Enter commit message..."
                        value={commitMessage}
                        onChangeText={setCommitMessage}
                        placeholderTextColor="#94A3B8"
                      />
                      <Pressable
                        style={({ pressed }) => [
                          styles.commitButton,
                          {
                            opacity: pressed || isCommitting ? 0.7 : 1,
                            backgroundColor: commitMessage.trim()
                              ? "#2563EB"
                              : "#64748B",
                          },
                        ]}
                        onPress={handleCommit}
                        disabled={!commitMessage.trim() || isCommitting}
                      >
                        {isCommitting ? (
                          <ActivityIndicator size={14} color="#fff" />
                        ) : (
                          <Text
                            variant="labelSmall"
                            style={styles.commitButtonText}
                          >
                            Commit
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  </>
                )}
              </View>
            )}
        </KeyboardAvoidingView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 100,
  },
  drawer: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    zIndex: 101,
    shadowColor: "#000",
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  drawerContent: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontWeight: "700",
    flex: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  backButton: {
    marginRight: 8,
  },
  selectionTitle: {
    fontWeight: "600",
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  list: {
    flex: 1,
  },
  section: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontWeight: "600",
  },
  sectionCount: {
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  sectionEmpty: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  selectAllRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
  },
  fileItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fileInfo: {
    flex: 1,
  },
  bottomActionBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    alignItems: "stretch",
    gap: 12,
  },
  bottomActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  bottomActionText: {
    color: "#fff",
    fontWeight: "600",
  },
  commitInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  commitInput: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#fff",
  },
  commitButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  commitButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
