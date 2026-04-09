import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Button,
  Card,
  Text,
  useTheme,
} from "react-native-paper";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import {
  useSessions,
  useCreateSession,
  type Session,
} from "@/lib/api/sessions";

const HEADER_HEIGHT = 44;
const HEADER_TOP_MARGIN = 12;

const formatDateTime = (value: string | number | null | undefined) => {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const getSessionSubtitle = (session: Session) => {
  if (session.error) {
    return session.error;
  }

  if (session.output) {
    return session.output;
  }

  return "No output yet";
};

export default function ProjectSessionsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { projectId, projectName } = useLocalSearchParams<{
    projectId: string;
    projectName?: string;
  }>();

  const {
    data: sessions,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useSessions(projectId ?? "");
  const createSessionMutation = useCreateSession();

  const title = projectName || "Sessions";
  const pageSubtitleColor = theme.dark ? "#B8C2D1" : "#5B6B7F";
  const metaLabelColor = theme.dark ? "#D7E0EA" : "#334155";
  const metaValueColor = theme.dark ? "#F8FAFC" : "#0F172A";
  const cardBorderColor = theme.dark ? "#2A3441" : "#D9E2EC";
  const backButtonSurface = theme.dark
    ? "rgba(17, 24, 39, 0.92)"
    : "rgba(255, 255, 255, 0.96)";

  const headerTop = insets.top + HEADER_TOP_MARGIN;
  const listPaddingTop = HEADER_HEIGHT + 20;

  const handleCreateSession = React.useCallback(async () => {
    if (!projectId || createSessionMutation.isPending) {
      return;
    }

    try {
      const session = await createSessionMutation.mutateAsync(
        String(projectId),
      );
      router.push({
        pathname: "/projects/[projectId]/sessions/[sessionId]",
        params: {
          projectId: String(projectId),
          sessionId: session.id,
          projectName: projectName ? String(projectName) : undefined,
        },
      });
    } catch (createError) {
      console.error(createError);
    }
  }, [createSessionMutation, projectId, projectName]);

  const renderSession = ({ item }: { item: Session }) => {
    const createdAt = formatDateTime(item.createdAt);
    const completedAt = formatDateTime(item.completedAt);
    const subtitle = getSessionSubtitle(item);

    return (
      <Card
        onPress={() =>
          router.push({
            pathname: "/projects/[projectId]/sessions/[sessionId]",
            params: {
              projectId: String(projectId),
              sessionId: item.id,
              projectName: projectName ? String(projectName) : undefined,
              prompt: item.prompt,
              status: item.status,
              createdAt: item.createdAt,
            },
          })
        }
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: cardBorderColor,
          },
        ]}
        mode="elevated"
      >
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text variant="titleMedium" style={styles.prompt} numberOfLines={2}>
              {item.prompt}
            </Text>
          </View>

          <Text
            variant="bodyMedium"
            style={[styles.subtitle, { color: pageSubtitleColor }]}
            numberOfLines={3}
          >
            {subtitle}
          </Text>

          <View style={[styles.metaBlock, { borderTopColor: cardBorderColor }]}>
            {createdAt ? (
              <View style={styles.metaRow}>
                <Text
                  variant="labelMedium"
                  style={[styles.metaLabel, { color: metaLabelColor }]}
                >
                  Created
                </Text>
                <Text
                  variant="bodySmall"
                  style={[styles.metaValue, { color: metaValueColor }]}
                >
                  {createdAt}
                </Text>
              </View>
            ) : null}
            {completedAt ? (
              <View style={styles.metaRow}>
                <Text
                  variant="labelMedium"
                  style={[styles.metaLabel, { color: metaLabelColor }]}
                >
                  Finished
                </Text>
                <Text
                  variant="bodySmall"
                  style={[styles.metaValue, { color: metaValueColor }]}
                >
                  {completedAt}
                </Text>
              </View>
            ) : null}
            {item.duration !== null ? (
              <View style={styles.metaRow}>
                <Text
                  variant="labelMedium"
                  style={[styles.metaLabel, { color: metaLabelColor }]}
                >
                  Duration
                </Text>
                <Text
                  variant="bodySmall"
                  style={[styles.metaValue, { color: metaValueColor }]}
                >
                  {item.duration}ms
                </Text>
              </View>
            ) : null}
          </View>
        </Card.Content>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView
        edges={["top", "left", "right", "bottom"]}
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.fadeOverlay} pointerEvents="none">
          <LinearGradient
            colors={[theme.colors.background, "transparent"]}
            locations={[0, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text variant="bodyMedium" style={styles.loadingText}>
            Loading sessions...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView
        edges={["top", "left", "right", "bottom"]}
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.fadeOverlay} pointerEvents="none">
          <LinearGradient
            colors={[theme.colors.background, "transparent"]}
            locations={[0, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View style={styles.centered}>
          <Text variant="titleMedium" style={styles.errorText}>
            Failed to load sessions
          </Text>
          <Text
            variant="bodyMedium"
            style={[
              styles.errorMessage,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            {String(error)}
          </Text>
          <Button mode="contained" onPress={() => refetch()}>
            Retry
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.fadeOverlay} pointerEvents="none">
        <LinearGradient
          colors={[theme.colors.background, "transparent"]}
          locations={[0, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View style={[styles.headerRow, { top: headerTop }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={[
            styles.backButton,
            {
              backgroundColor: backButtonSurface,
              borderColor: cardBorderColor,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={22}
            color={theme.colors.onSurface}
          />
          <Text
            variant="titleMedium"
            style={[styles.projectTitle, { color: theme.colors.onSurface }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create new session"
          disabled={createSessionMutation.isPending}
          onPress={() => void handleCreateSession()}
          style={[
            styles.actionButton,
            {
              backgroundColor: backButtonSurface,
              borderColor: cardBorderColor,
              opacity: createSessionMutation.isPending ? 0.7 : 1,
            },
          ]}
        >
          {createSessionMutation.isPending ? (
            <ActivityIndicator size={18} color={theme.colors.onSurface} />
          ) : (
            <MaterialCommunityIcons
              name="plus"
              size={20}
              color={theme.colors.onSurface}
            />
          )}
        </Pressable>
      </View>

      {sessions && sessions.length > 0 ? (
        <FlatList
          data={sessions}
          renderItem={renderSession}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingTop: listPaddingTop },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetch()}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        />
      ) : (
        <View style={[styles.centered, { paddingTop: listPaddingTop }]}>
          <Text
            variant="bodyLarge"
            style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}
          >
            No sessions found for this project
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  fadeOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 5,
  },
  headerRow: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  backButton: {
    height: HEADER_HEIGHT,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    display: "flex",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
  },
  actionButton: {
    width: HEADER_HEIGHT,
    height: HEADER_HEIGHT,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  projectTitle: {
    flexShrink: 1,
    fontWeight: "600",
    fontSize: 17,
  },
  listContent: {
    paddingBottom: 24,
    gap: 14,
  },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  prompt: {
    flex: 1,
    fontWeight: "600",
    lineHeight: 24,
  },
  statusChip: {
    alignSelf: "flex-start",
    minHeight: 32,
  },
  statusText: {
    textTransform: "capitalize",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  subtitle: {
    marginTop: 12,
    lineHeight: 21,
  },
  metaBlock: {
    marginTop: 14,
    paddingTop: 12,
    gap: 8,
    borderTopWidth: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  metaLabel: {
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metaValue: {
    flex: 1,
    textAlign: "right",
    fontWeight: "600",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    padding: 20,
  },
  loadingText: {
    marginTop: 8,
  },
  errorText: {
    color: "#B91C1C",
  },
  errorMessage: {
    textAlign: "center",
  },
  emptyText: {
    textAlign: "center",
  },
});
