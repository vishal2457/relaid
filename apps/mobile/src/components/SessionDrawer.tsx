import React from "react";
import {
  Animated,
  Alert,
  Dimensions,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { type Session, useSessionsForProviders } from "@/src/lib/api/sessions";
import { type Project } from "@/src/lib/api/projects";
import { useProviders } from "@/src/lib/api/providers";
import {
  clearActiveSessionStream,
  getActiveSessionStream,
  isStreamingSessionStatus,
} from "@/src/lib/active-session-stream";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(320, SCREEN_WIDTH * 0.85);
const DRAWER_ANIMATION_DURATION = 220;
const INITIAL_SESSION_LIMIT = 5;

type SessionGroup = {
  providerId: string;
  providerLabel: string;
  sessions: Session[];
};

type SessionDrawerProps = {
  visible: boolean;
  onClose: () => void;
  activeProject: Project | null;
  activeSessionId: string | null;
  onSelectSession: (sessionId: string | null, agentProviderId?: string) => void;
};

export function SessionDrawer({
  visible,
  onClose,
  activeProject,
  activeSessionId,
  onSelectSession,
}: SessionDrawerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [isMounted, setIsMounted] = React.useState(visible);
  const [hasPendingSession, setHasPendingSession] = React.useState(false);
  const [expandedProviders, setExpandedProviders] = React.useState<Set<string>>(
    new Set(),
  );
  const slideAnim = React.useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropAnim = React.useRef(new Animated.Value(0)).current;
  const { data: providers = [], isLoading: providersLoading } = useProviders();
  const availableAgentProviderIds = React.useMemo(
    () =>
      Array.from(
        new Set(
          providers
            .map((provider) => provider.agentProviderId ?? "opencode")
            .filter(Boolean),
        ),
      ),
    [providers],
  );
  const {
    data: sessions,
    isLoading: sessionsLoading,
    isRefetching: sessionsRefetching,
    error: sessionsError,
    refetch: refetchSessions,
  } = useSessionsForProviders(
    activeProject?.folder ?? "",
    availableAgentProviderIds,
  );
  const isSessionsLoading = providersLoading || sessionsLoading;
  const isRefreshing = Boolean(activeProject) && sessionsRefetching;

  const borderColor = theme.dark ? "#2A3441" : "#D9E2EC";
  const metaColor = theme.dark ? "#B8C2D1" : "#526277";
  const surfaceColor = theme.dark ? "#1E293B" : "#FFFFFF";
  const surfaceVariant = theme.dark ? "#111827" : "#F8FAFC";
  const providerChipBackground = theme.dark ? "#273449" : "#E8EEF6";

  const groupedSessions = React.useMemo<SessionGroup[]>(() => {
    if (!sessions) return [];

    const groups = new Map<string, SessionGroup>();

    for (const session of sessions) {
      const providerId = session.agentProviderId ?? "opencode";
      const existing = groups.get(providerId);
      const providerLabel =
        providerId === "opencode"
          ? "OpenCode"
          : providerId === "codex"
            ? "Codex"
            : providerId === "claude"
              ? "Claude"
            : providerId.charAt(0).toUpperCase() + providerId.slice(1);

      if (existing) {
        existing.sessions.push(session);
        continue;
      }

      groups.set(providerId, {
        providerId,
        providerLabel,
        sessions: [session],
      });
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        sessions: [...group.sessions].sort((left, right) => {
          const updatedDifference = right.updatedAt - left.updatedAt;
          if (updatedDifference !== 0) return updatedDifference;
          return right.createdAt - left.createdAt;
        }),
      }))
      .sort((left, right) => {
        const leftLatest = left.sessions[0]?.updatedAt ?? 0;
        const rightLatest = right.sessions[0]?.updatedAt ?? 0;
        return rightLatest - leftLatest;
      });
  }, [sessions]);

  const handleSelectSession = (
    sessionId: string,
    sessionAgentProviderId?: string,
  ) => {
    onSelectSession(sessionId, sessionAgentProviderId);
    onClose();
  };

  const handleClearPendingSession = () => {
    Alert.alert(
      "Clear Pending Session",
      "This will clear the pending session that auto-focuses on app open. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearActiveSessionStream();
            setHasPendingSession(false);
          },
        },
      ],
    );
  };

  React.useEffect(() => {
    if (!visible) {
      return;
    }

    if (activeProject) {
      void refetchSessions();
    }

    let isCancelled = false;

    void getActiveSessionStream().then((stream) => {
      if (!isCancelled) {
        setHasPendingSession(Boolean(stream));
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [visible, activeProject]);

  React.useEffect(() => {
    setExpandedProviders(new Set());
  }, [activeProject?.id, visible]);

  const toggleProviderExpansion = (providerId: string) => {
    setExpandedProviders((current) => {
      const next = new Set(current);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

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
        toValue: -DRAWER_WIDTH,
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

  if (!isMounted) return null;

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
            backgroundColor: surfaceColor,
            borderRightWidth: 1,
            borderColor,
            transform: [{ translateX: slideAnim }],
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
            {/* <Image
              // Metro asset resolution is strict; keep this as a relative static require.
              source={require("../assets/images/relaid.png")}
              style={styles.logoImage}
            /> */}
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

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                if (!activeProject) return;
                void refetchSessions();
              }}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
        >
          {isSessionsLoading ? (
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
          ) : groupedSessions.length === 0 ? (
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
            groupedSessions.map((group) => {
              const isSingleProvider = groupedSessions.length === 1;
              const isExpanded = expandedProviders.has(group.providerId);
              const limitedSessions = group.sessions.slice(0, INITIAL_SESSION_LIMIT);
              const visibleProviderSessions = isExpanded
                ? group.sessions
                : isSingleProvider
                  ? group.sessions
                  : limitedSessions;
              const hiddenCount = group.sessions.length - visibleProviderSessions.length;

              return (
                <View
                  key={group.providerId}
                  style={styles.providerSection}
                >
                  <View style={styles.providerSectionHeader}>
                    <View style={styles.providerSectionTitleRow}>
                      <View
                        style={[
                          styles.providerChip,
                          { backgroundColor: providerChipBackground },
                        ]}
                      >
                        <Text
                          variant="labelSmall"
                          style={[
                            styles.providerChipText,
                            { color: theme.colors.onSurfaceVariant },
                          ]}
                        >
                          {group.providerLabel}
                        </Text>
                      </View>
                      
                    </View>

                    {!isSingleProvider && group.sessions.length > INITIAL_SESSION_LIMIT ? (
                      <Pressable
                        onPress={() => toggleProviderExpansion(group.providerId)}
                        style={styles.providerExpandButton}
                        accessibilityRole="button"
                        accessibilityLabel={
                          isExpanded
                            ? `Collapse ${group.providerLabel} sessions`
                            : `Load more ${group.providerLabel} sessions`
                        }
                      >
                        <Text
                          variant="labelMedium"
                          style={{ color: theme.colors.primary, fontWeight: "600" }}
                        >
                          {isExpanded ? "Show Less" : `View All`}
                        </Text>
                        <MaterialCommunityIcons
                          name={isExpanded ? "chevron-up" : "chevron-down"}
                          size={18}
                          color={theme.colors.primary}
                        />
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={styles.providerSectionBody}>
                    {visibleProviderSessions.map((session) => {
                      const isActive = session.id === activeSessionId;
                      const isSessionLoading = isStreamingSessionStatus(
                        session.status,
                      );
                      const sessionStatusLabel =
                        session.status === "pending" ? "Pending" : "Running";

                      return (
                        <Pressable
                          key={session.id}
                          onPress={() =>
                            handleSelectSession(session.id, session.agentProviderId)
                          }
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
                          accessibilityLabel={`${group.providerLabel} session: ${session.prompt || "Untitled session"}${
                            isSessionLoading ? `, ${sessionStatusLabel}` : ""
                          }`}
                          accessibilityState={{
                            selected: isActive,
                            busy: isSessionLoading,
                          }}
                        >
                          <View style={styles.sessionRow}>
                            <View style={styles.sessionTextBlock}>
                              <Text
                                variant="titleSmall"
                                style={[
                                  styles.sessionPrompt,
                                  {
                                    color: isActive
                                      ? "#6B7280"
                                      : theme.colors.onSurface,
                                  },
                                ]}
                                numberOfLines={1}
                              >
                                {session.prompt || "Untitled session"}
                              </Text>
                            </View>

                            {isSessionLoading ? (
                              <View style={styles.sessionLoading}>
                                <ActivityIndicator
                                  size={14}
                                  color={theme.colors.primary}
                                />
                                <Text
                                  variant="labelSmall"
                                  style={[
                                    styles.sessionLoadingText,
                                    { color: theme.colors.primary },
                                  ]}
                                >
                                  {sessionStatusLabel}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        </Pressable>
                      );
                    })}

                    {!isSingleProvider && !isExpanded && hiddenCount > 0 ? (
                      <Pressable
                        onPress={() => toggleProviderExpansion(group.providerId)}
                        style={[styles.loadMoreButton, { borderColor }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Load ${hiddenCount} more ${group.providerLabel} sessions`}
                      >
                        <Text
                          variant="labelLarge"
                          style={{
                            color: theme.colors.onSurfaceVariant,
                            fontWeight: "600",
                          }}
                        >
                          Load More
                        </Text>
                        <MaterialCommunityIcons
                          name="chevron-down"
                          size={20}
                          color={theme.colors.onSurfaceVariant}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {hasPendingSession ? (
          <Pressable
            onPress={handleClearPendingSession}
            style={[styles.footer, { borderTopColor: borderColor }]}
            accessibilityRole="button"
            accessibilityLabel="Clear pending session"
          >
            <MaterialCommunityIcons
              name="close-circle-outline"
              size={22}
              color={theme.colors.onSurfaceVariant}
            />
            <Text
              variant="labelLarge"
              style={{ color: theme.colors.onSurfaceVariant, marginLeft: 12 }}
            >
              Clear Pending Session
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => {
            onClose();
            router.push("/settings");
          }}
          style={[
            styles.footer,
            { borderTopColor: borderColor, marginBottom: insets.bottom },
          ]}
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
  logoImage: {
    width: 25,
    height: 25,
    borderRadius: 8,
    marginRight: 12,
    marginTop: 2,
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
  list: {
    flex: 1,
    marginTop: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  providerSection: {
    gap: 6,
  },
  providerSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 2,
  },
  providerSectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  providerSectionBody: {
    paddingBottom: 2,
  },
  providerExpandButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  sessionItem: {
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 10,
    gap: 8,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sessionTextBlock: {
    flex: 1,
    gap: 6,
  },
  loadMoreButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  sessionPrompt: {
    fontWeight: "600",
    lineHeight: 20,
  },
  providerChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  providerChipText: {
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  sessionLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 72,
    justifyContent: "flex-end",
  },
  sessionLoadingText: {
    fontWeight: "700",
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
