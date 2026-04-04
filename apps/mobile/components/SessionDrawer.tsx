import React from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useSessions } from "@/lib/api/sessions";
import { type Project } from "@/lib/api/projects";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(320, SCREEN_WIDTH * 0.85);

type SessionDrawerProps = {
  visible: boolean;
  onClose: () => void;
  activeProject: Project | null;
  activeSessionId: string | null;
  onSelectSession: (sessionId: string | null) => void;
};

export function SessionDrawer({
  visible,
  onClose,
  activeProject,
  activeSessionId,
  onSelectSession,
}: SessionDrawerProps) {
  const theme = useTheme();
  const {
    data: sessions,
    isLoading: sessionsLoading,
    error: sessionsError,
  } = useSessions(activeProject?.id ?? "");

  const borderColor = theme.dark ? "#2A3441" : "#D9E2EC";
  const metaColor = theme.dark ? "#B8C2D1" : "#526277";
  const surfaceColor = theme.dark ? "#1E293B" : "#FFFFFF";
  const surfaceVariant = theme.dark ? "#111827" : "#F8FAFC";

  const handleSelectSession = (sessionId: string) => {
    onSelectSession(sessionId);
    onClose();
  };

  const handleNewSession = () => {
    onSelectSession(null);
    onClose();
  };

  if (!visible) return null;

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
              {activeProject?.name}
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
        </View>

        <Pressable
          onPress={handleNewSession}
          style={[
            styles.newSessionButton,
            { backgroundColor: theme.colors.primary, borderColor },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Start new session"
        >
          <MaterialCommunityIcons
            name="plus-circle-outline"
            size={20}
            color={theme.colors.onPrimary}
          />
          <Text
            variant="labelLarge"
            style={{ color: theme.colors.onPrimary, fontWeight: "600" }}
          >
            New Session
          </Text>
        </Pressable>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {sessionsLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator />
              <Text
                variant="bodyMedium"
                style={{ color: metaColor, marginTop: 12 }}
              >
                Loading sessions...
              </Text>
            </View>
          ) : sessionsError ? (
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
                Failed to load sessions
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
          ) : !sessions || sessions.length === 0 ? (
            <View style={styles.centered}>
              <MaterialCommunityIcons
                name="chat-outline"
                size={32}
                color={metaColor}
              />
              <Text
                variant="bodyMedium"
                style={{ color: metaColor, marginTop: 12 }}
              >
                No sessions yet
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: metaColor, marginTop: 4 }}
              >
                Start a new conversation
              </Text>
            </View>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <Pressable
                  key={session.id}
                  onPress={() => handleSelectSession(session.id)}
                  style={[
                    styles.sessionItem,
                    {
                      backgroundColor: isActive
                        ? "rgba(156, 163, 175, 0.15)"
                        : "transparent",
                      borderColor,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Session: ${session.prompt}`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text
                    variant="titleSmall"
                    style={[
                      styles.sessionPrompt,
                      {
                        color: isActive ? "#6B7280" : theme.colors.onSurface,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {session.prompt || "Untitled session"}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        <Pressable
          onPress={() => {
            onClose();
            router.push("/settings");
          }}
          style={[styles.footer, { borderTopColor: borderColor }]}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <MaterialCommunityIcons
            name="cog-outline"
            size={22}
            color={theme.colors.onSurfaceVariant}
          />
          <Text
            variant="labelLarge"
            style={{ color: theme.colors.onSurfaceVariant, marginLeft: 12 }}
          >
            Settings
          </Text>
        </Pressable>
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
    left: 0,
    top: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    zIndex: 101,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
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
  projectInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  projectName: {
    flex: 1,
  },
  newSessionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  list: {
    flex: 1,
    marginTop: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 8,
  },
  sessionItem: {
    paddingVertical: 8,
    paddingLeft: 5,
    borderRadius: 5,
    gap: 8,
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  sessionPrompt: {
    flex: 1,
    fontWeight: "600",
    lineHeight: 20,
  },
  sessionMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    paddingLeft: 28,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    textTransform: "capitalize",
    fontWeight: "500",
  },

  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
});
