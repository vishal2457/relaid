import React, { useState } from "react";
import {
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import {
  useMessageQueue,
  useRemoveFromQueue,
  useExecuteQueueItem,
  type QueueItem,
  type QueueItemStatus,
} from "@/src/lib/api/message-queue";
import { type Project } from "@/src/lib/api/projects";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(320, SCREEN_WIDTH * 0.85);

type QueueDrawerProps = {
  visible: boolean;
  onClose: () => void;
  activeProject: Project | null;
  activeSessionId: string | null;
  onSessionCreated?: (sessionId: string) => void;
};

function getStatusColor(status: QueueItemStatus): string {
  switch (status) {
    case "pending":
      return "#9CA3AF";
    case "running":
      return "#3B82F6";
    case "completed":
      return "#10B981";
    case "failed":
      return "#EF4444";
    case "aborted":
      return "#F59E0B";
    default:
      return "#9CA3AF";
  }
}

function getStatusIcon(
  status: QueueItemStatus,
): keyof typeof MaterialCommunityIcons.glyphMap {
  switch (status) {
    case "pending":
      return "clock-outline";
    case "running":
      return "play-circle";
    case "completed":
      return "check-circle";
    case "failed":
      return "close-circle";
    case "aborted":
      return "stop-circle";
    default:
      return "help-circle";
  }
}

function QueueItemCard({
  item,
  onExecute,
  onRemove,
  canExecute,
}: {
  item: QueueItem;
  onExecute: (item: QueueItem) => void;
  onRemove: (item: QueueItem) => void;
  canExecute: boolean;
}) {
  const theme = useTheme();
  const borderColor = theme.dark ? "#2A3441" : "#D9E2EC";
  const metaColor = theme.dark ? "#B8C2D1" : "#526277";

  const isRunning = item.status === "running";
  const isPending = item.status === "pending";
  const isCompleted = item.status === "completed" || item.status === "failed";

  return (
    <View
      style={[
        styles.queueItem,
        {
          borderColor,
          backgroundColor: theme.dark
            ? "rgba(255,255,255,0.03)"
            : "rgba(0,0,0,0.02)",
        },
      ]}
    >
      <View style={styles.queueItemHeader}>
        <View style={styles.statusRow}>
          <MaterialCommunityIcons
            name={getStatusIcon(item.status)}
            size={16}
            color={getStatusColor(item.status)}
          />
          <Text
            variant="bodySmall"
            style={[styles.statusText, { color: getStatusColor(item.status) }]}
          >
            {item.status}
          </Text>
        </View>
        {isRunning && <ActivityIndicator size="small" />}
      </View>

      <Text
        variant="bodyMedium"
        style={[styles.queueItemPrompt, { color: theme.colors.onSurface }]}
        numberOfLines={3}
      >
        {item.prompt}
      </Text>

      {item.error && (
        <Text
          variant="bodySmall"
          style={[styles.queueItemError, { color: theme.colors.error }]}
          numberOfLines={2}
        >
          {item.error}
        </Text>
      )}

      <View style={styles.queueItemActions}>
        {isPending && canExecute && (
          <Pressable
            onPress={() => onExecute(item)}
            style={[
              styles.actionButton,
              { backgroundColor: theme.colors.primary },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Execute queue item"
          >
            <MaterialCommunityIcons name="play" size={14} color="#FFF" />
            <Text style={styles.actionButtonText}>Run</Text>
          </Pressable>
        )}
        {!isRunning && (
          <Pressable
            onPress={() => onRemove(item)}
            style={[styles.actionButton, styles.removeButton, { borderColor }]}
            accessibilityRole="button"
            accessibilityLabel="Remove queue item"
          >
            <MaterialCommunityIcons name="close" size={14} color={metaColor} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function QueueDrawer({
  visible,
  onClose,
  activeProject,
  activeSessionId,
  onSessionCreated,
}: QueueDrawerProps) {
  const theme = useTheme();
  const {
    data: queueData,
    isLoading: queueLoading,
    error: queueError,
  } = useMessageQueue(activeProject?.id ?? "");

  const removeFromQueue = useRemoveFromQueue(activeProject?.id ?? "");
  const executeQueueItem = useExecuteQueueItem(activeProject?.id ?? "");

  const borderColor = theme.dark ? "#2A3441" : "#D9E2EC";
  const metaColor = theme.dark ? "#B8C2D1" : "#526277";
  const surfaceColor = theme.dark ? "#1E293B" : "#FFFFFF";
  const surfaceVariant = theme.dark ? "#111827" : "#F8FAFC";

  const handleExecute = (item: QueueItem) => {
    Alert.alert(
      "Execute Queue Item",
      "Where do you want to run this message?",
      [
        {
          text: "Current Session",
          onPress: () => {
            if (activeSessionId) {
              executeQueueItem.mutate({
                queueItemId: item.id,
                sessionId: activeSessionId,
              });
            } else {
              executeQueueItem.mutate({
                queueItemId: item.id,
                createNewSession: true,
              });
            }
          },
        },
        {
          text: "New Session",
          onPress: () => {
            executeQueueItem.mutate({
              queueItemId: item.id,
              createNewSession: true,
            });
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  const handleRemove = (item: QueueItem) => {
    Alert.alert(
      "Remove from Queue",
      "Are you sure you want to remove this item?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeFromQueue.mutate(item.id),
        },
      ],
    );
  };

  if (!visible) return null;

  const items = queueData?.items ?? [];
  const pendingItems = items.filter((i) => i.status === "pending");
  const runningItems = items.filter((i) => i.status === "running");
  const completedItems = items.filter(
    (i) =>
      i.status === "completed" ||
      i.status === "failed" ||
      i.status === "aborted",
  );

  return (
    <>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.drawer,
          {
            backgroundColor: surfaceColor,
            borderRightWidth: 1,
            borderColor,
          },
        ]}
      >
        <LinearGradient
          colors={[surfaceColor, surfaceVariant]}
          locations={[0, 0.3]}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.header, { borderBottomColor: borderColor }]}>
          <View style={styles.headerTop}>
            <Text variant="titleLarge" style={styles.title}>
              Queue
            </Text>
            <Pressable
              onPress={onClose}
              style={[styles.closeButton, { borderColor }]}
              accessibilityRole="button"
              accessibilityLabel="Close drawer"
            >
              <MaterialCommunityIcons
                name="close"
                size={20}
                color={theme.colors.onSurface}
              />
            </Pressable>
          </View>
          {activeProject && (
            <Text
              variant="bodySmall"
              style={{ color: metaColor, marginTop: 4 }}
            >
              {activeProject.name}
            </Text>
          )}
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {queueLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator />
              <Text
                variant="bodyMedium"
                style={{ color: metaColor, marginTop: 12 }}
              >
                Loading queue...
              </Text>
            </View>
          ) : queueError ? (
            <View style={styles.centered}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={32}
                color={theme.colors.error}
              />
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}
              >
                Failed to load queue
              </Text>
            </View>
          ) : !activeProject ? (
            <View style={styles.centered}>
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
          ) : items.length === 0 ? (
            <View style={styles.centered}>
              <MaterialCommunityIcons
                name="playlist-remove"
                size={32}
                color={metaColor}
              />
              <Text
                variant="bodyMedium"
                style={{ color: metaColor, marginTop: 12 }}
              >
                Queue is empty
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: metaColor, marginTop: 4 }}
              >
                Add messages to execute later
              </Text>
            </View>
          ) : (
            <>
              {runningItems.length > 0 && (
                <View style={styles.section}>
                  <Text
                    variant="labelSmall"
                    style={[styles.sectionTitle, { color: metaColor }]}
                  >
                    RUNNING
                  </Text>
                  {runningItems.map((item) => (
                    <QueueItemCard
                      key={item.id}
                      item={item}
                      onExecute={handleExecute}
                      onRemove={handleRemove}
                      canExecute={false}
                    />
                  ))}
                </View>
              )}

              {pendingItems.length > 0 && (
                <View style={styles.section}>
                  <Text
                    variant="labelSmall"
                    style={[styles.sectionTitle, { color: metaColor }]}
                  >
                    PENDING ({pendingItems.length})
                  </Text>
                  {pendingItems.map((item) => (
                    <QueueItemCard
                      key={item.id}
                      item={item}
                      onExecute={handleExecute}
                      onRemove={handleRemove}
                      canExecute={true}
                    />
                  ))}
                </View>
              )}

              {completedItems.length > 0 && (
                <View style={styles.section}>
                  <Text
                    variant="labelSmall"
                    style={[styles.sectionTitle, { color: metaColor }]}
                  >
                    COMPLETED
                  </Text>
                  {completedItems.map((item) => (
                    <QueueItemCard
                      key={item.id}
                      item={item}
                      onExecute={handleExecute}
                      onRemove={handleRemove}
                      canExecute={false}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
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
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
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
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  queueItem: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  queueItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: {
    textTransform: "capitalize",
    fontWeight: "500",
    fontSize: 12,
  },
  queueItemPrompt: {
    lineHeight: 20,
  },
  queueItemError: {
    fontStyle: "italic",
  },
  queueItemActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  actionButtonText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
  },
  removeButton: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
});
