import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState, useCallback } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  ActivityIndicator,
  Checkbox,
  Text,
  Snackbar,
  useTheme,
  type MD3Theme,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGitFileStatus,
  useGitStageFiles,
  useGitUnstageFiles,
  useGitCommit,
  useGitPush,
  type GitFileStatus,
} from "@/src/lib/api/git";
import { SelectionSheet } from "@/src/components/SelectionSheet";

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
  A: "#22C55E",
  M: "#F59E0B",
  D: "#EF4444",
  R: "#8B5CF6",
  C: "#22C55E",
  T: "#0EA5E9",
  U: "#EF4444",
  "?": "#64748B",
  I: "#94A3B8",
  "!": "#EF4444",
  S: "#22C55E",
};

type Section = "none" | "changes" | "staged";

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
}: {
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  files: GitFileStatus[];
  borderColor: string;
  metaColor: string;
  theme: MD3Theme;
  selectedFiles: Set<string>;
  onToggleFile: (path: string) => void;
  onSelectAll: (paths: string[]) => void;
  disabled: boolean;
  onCollapse: (paths: string[]) => void;
  onFilePress: (path: string) => void;
}) {
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
          <MaterialCommunityIcons name={icon} size={18} color={metaColor} />
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
          <View style={[styles.selectAllRow, { borderBottomColor: borderColor }]}>
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
              const statusLabel =
                statusLabelMap[item.status] ?? item.status ?? "?";
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
                      ellipsizeMode="tail"
                    >
                      {item.path.split("/").pop()}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: metaColor }}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {item.path}
                    </Text>
                  </View>
                  <Text
                    variant="labelSmall"
                    style={{
                      color: statusColorMap[statusLabel] ?? metaColor,
                      fontWeight: "600",
                    }}
                  >
                    {statusLabel}
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

export default function GitPage() {
  const { projectId } = useLocalSearchParams<{ projectId?: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const isDark = theme.dark;
  const bgColor = isDark ? "#0F172A" : "#F8FAFC";
  const surfaceColor = isDark ? "#1E293B" : "#FFFFFF";
  const borderColor = isDark ? "#334155" : "#E2E8F0";
  const metaColor = isDark ? "#94A3B8" : "#64748B";

  const [activeSection, setActiveSection] = useState<Section>("none");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showCommitSheet, setShowCommitSheet] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isRefetching } = useGitFileStatus(
    projectId ?? "",
    Boolean(projectId),
  );

  const staged = data?.staged ?? [];
  const unstaged = data?.unstaged ?? [];
  const branch = data?.branch ?? "";

  const clearSelection = useCallback(() => {
    setSelectedFiles(new Set());
    setActiveSection("none");
  }, []);

  const stageFiles = useGitStageFiles(projectId ?? "", clearSelection);
  const unstageFiles = useGitUnstageFiles(projectId ?? "", clearSelection);
  const commitMutation = useGitCommit(projectId ?? "", () => {
    setSelectedFiles(new Set());
    setActiveSection("none");
    setShowCommitSheet(false);
    setCommitMessage("");
  });
  const pushMutation = useGitPush(projectId ?? "", () => {
    setSyncMessage("Changes synced to remote");
  });

  const hasSelection = selectedFiles.size > 0;
  const canSyncChanges = Boolean(projectId && branch && branch !== "HEAD");

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
    stageFiles.mutate(Array.from(selectedFiles));
  };

  const handleUnstage = () => {
    unstageFiles.mutate(Array.from(selectedFiles));
  };

  const handleOpenCommitSheet = () => {
    setShowCommitSheet(true);
  };

  const handleCommit = () => {
    if (!commitMessage.trim()) return;
    const files = Array.from(selectedFiles);
    commitMutation.mutate({ message: commitMessage.trim(), files });
  };

  const handlePush = () => {
    if (!canSyncChanges) {
      return;
    }

    pushMutation.mutate({
      remote: "origin",
      branch,
      setUpstream: true,
    });
  };

  const headerContent = (
    <View style={[styles.pageHeader, { paddingTop: insets.top + 8 }]}>
      <View style={styles.pageHeaderRow}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons
            name="arrow-left"
            size={22}
            color={theme.colors.onSurface}
          />
        </Pressable>
        <Text
          variant="titleMedium"
          style={[styles.pageTitle, { color: theme.colors.onSurface }]}
        >
          Git
        </Text>
        <View style={styles.headerActions}>
          {branch ? (
            <Text
              variant="bodySmall"
              style={{ color: metaColor, marginRight: 8 }}
            >
              {branch}
            </Text>
          ) : null}
          <Pressable
            onPress={() => void refetch()}
            style={[styles.iconBtn, { borderColor }]}
            disabled={isRefetching}
          >
            {isRefetching ? (
              <ActivityIndicator size={16} />
            ) : (
              <MaterialCommunityIcons
                name="refresh"
                size={18}
                color={theme.colors.onSurface}
              />
            )}
          </Pressable>
        </View>
      </View>

      {activeSection !== "none" ? (
        <View style={[styles.selectionBar, { borderColor }]}>
          <Pressable onPress={clearSelection} style={styles.backButton}>
            <MaterialCommunityIcons
              name="arrow-left"
              size={18}
              color={theme.colors.onSurface}
            />
          </Pressable>
          <Text
            variant="bodyMedium"
            style={[styles.selectionTitle, { color: theme.colors.onSurface }]}
          >
            {selectedFiles.size} selected
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {headerContent}

      {!projectId ? (
        <View style={styles.centerContent}>
          <MaterialCommunityIcons
            name="folder-outline"
            size={32}
            color={metaColor}
          />
          <Text variant="bodyMedium" style={{ color: metaColor, marginTop: 12 }}>
            Select a project first
          </Text>
        </View>
      ) : isLoading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator />
          <Text variant="bodyMedium" style={{ color: metaColor, marginTop: 12 }}>
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
          contentContainerStyle={styles.listContent}
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
                disabled={activeSection === "staged"}
                onCollapse={clearSectionFiles}
                onFilePress={(path) => {
                  if (!projectId) return;
                  router.push({
                    pathname: "/diff",
                    params: {
                      projectId,
                      filePath: path,
                      fileName: path.split("/").pop() ?? path,
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
                disabled={activeSection === "changes"}
                onCollapse={clearSectionFiles}
                onFilePress={(path) => {
                  if (!projectId) return;
                  router.push({
                    pathname: "/diff",
                    params: {
                      projectId,
                      filePath: path,
                      fileName: path.split("/").pop() ?? path,
                    },
                  });
                }}
              />
            </>
          }
        />
      )}

      {projectId && !isLoading && !error && (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[
            styles.bottomActionBar,
            {
              backgroundColor: surfaceColor,
              paddingBottom: insets.bottom + 8,
              borderColor,
            },
          ]}
        >
          {hasSelection ? (
            <View style={styles.bottomActionRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.bottomActionBtn,
                  {
                    backgroundColor:
                      activeSection === "changes" ? "#2563EB" : "#D97706",
                    opacity:
                      pressed || stageFiles.isPending || unstageFiles.isPending
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

              {activeSection === "staged" ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.bottomActionBtn,
                    styles.bottomActionBtnPrimary,
                    {
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                  onPress={handleOpenCommitSheet}
                >
                  <MaterialCommunityIcons
                    name="source-commit"
                    size={16}
                    color="#fff"
                  />
                  <Text variant="labelSmall" style={styles.bottomActionText}>
                    Commit {selectedFiles.size}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.syncButton,
              {
                backgroundColor: canSyncChanges ? "#0F172A" : borderColor,
                opacity: pressed || pushMutation.isPending ? 0.7 : 1,
              },
            ]}
            onPress={handlePush}
            disabled={!canSyncChanges || pushMutation.isPending}
          >
            {pushMutation.isPending ? (
              <ActivityIndicator size={16} color="#fff" />
            ) : (
              <MaterialCommunityIcons
                name="cloud-upload-outline"
                size={16}
                color={canSyncChanges ? "#fff" : metaColor}
              />
            )}
            <Text
              variant="labelMedium"
              style={[
                styles.syncButtonText,
                { color: canSyncChanges ? "#fff" : metaColor },
              ]}
            >
              {pushMutation.isPending ? "Syncing..." : "Sync Changes"}
            </Text>
          </Pressable>

          {!canSyncChanges ? (
            <Text variant="bodySmall" style={[styles.syncHint, { color: metaColor }]}>
              Sync is available when the project is on a named branch.
            </Text>
          ) : null}
        </KeyboardAvoidingView>
      )}

      <SelectionSheet
        visible={showCommitSheet}
        title="Commit changes"
        onClose={() => {
          setShowCommitSheet(false);
          setCommitMessage("");
        }}
        enableDynamicSizing
        snapPoints={[]}
      >
        <View style={styles.commitSheetContent}>
          <Text
            variant="bodySmall"
            style={{ color: metaColor, marginBottom: 12 }}
          >
            {selectedFiles.size} file{selectedFiles.size > 1 ? "s" : ""} will be
            committed
          </Text>
          <TextInput
            style={[
              styles.commitSheetInput,
              {
                color: theme.colors.onSurface,
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.04)",
                borderColor,
              },
            ]}
            placeholder="Enter commit message..."
            placeholderTextColor={metaColor}
            value={commitMessage}
            onChangeText={setCommitMessage}
            multiline
            textAlignVertical="top"
          />
          <Pressable
            style={({ pressed }) => [
              styles.commitSheetButton,
              {
                backgroundColor:
                  commitMessage.trim() && !commitMutation.isPending
                    ? "#2563EB"
                    : "#64748B",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            onPress={handleCommit}
            disabled={!commitMessage.trim() || commitMutation.isPending}
          >
            {commitMutation.isPending ? (
              <ActivityIndicator size={16} color="#fff" />
            ) : (
              <Text variant="labelMedium" style={styles.commitSheetButtonText}>
                Commit
              </Text>
            )}
          </Pressable>
        </View>
      </SelectionSheet>

      <Snackbar
        visible={Boolean(syncMessage)}
        onDismiss={() => setSyncMessage(null)}
        duration={2500}
      >
        {syncMessage}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pageHeader: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: "transparent",
  },
  pageHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: {
    fontWeight: "700",
    flex: 1,
    textAlign: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
    marginTop: 4,
    borderTopWidth: 1,
    borderColor: "transparent",
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
  listContent: {
    paddingBottom: 168,
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
    borderBottomWidth: 1,
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
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 24,
    gap: 10,
    shadowColor: "#020617",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  bottomActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  bottomActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 48,
    borderRadius: 18,
  },
  bottomActionBtnPrimary: {
    backgroundColor: "#2563EB",
  },
  bottomActionText: {
    color: "#fff",
    fontWeight: "600",
  },
  syncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 48,
    borderRadius: 18,
  },
  syncButtonText: {
    fontWeight: "700",
  },
  syncHint: {
    textAlign: "center",
  },
  commitSheetContent: {
    paddingBottom: 16,
  },
  commitSheetInput: {
    minHeight: 80,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    marginBottom: 12,
  },
  commitSheetButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  commitSheetButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
