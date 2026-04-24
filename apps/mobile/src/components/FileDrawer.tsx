import React from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import {
  useProjectDirectory,
  type Project,
  type ProjectDirectoryNode,
} from "@/src/lib/api/projects";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const DRAWER_WIDTH = Math.min(360, SCREEN_WIDTH * 0.88);
const DRAWER_ANIMATION_DURATION = 220;

type FileTreeNodeProps = {
  node: ProjectDirectoryNode;
  projectId: string;
  depth: number;
  borderColor: string;
  metaColor: string;
};

function FileTreeNode({
  node,
  projectId,
  depth,
  borderColor,
  metaColor,
}: FileTreeNodeProps) {
  const theme = useTheme();
  const isDirectory = node.type === "directory";
  const [expanded, setExpanded] = React.useState(false);
  const {
    data: children = [],
    isLoading,
    error,
    refetch,
  } = useProjectDirectory(projectId, node.path, isDirectory && expanded);

  return (
    <View>
      <Pressable
        accessibilityRole={isDirectory ? "button" : undefined}
        accessibilityLabel={
          isDirectory ? `${expanded ? "Collapse" : "Expand"} ${node.name}` : node.name
        }
        disabled={false}
        onPress={() => {
          if (isDirectory) {
            setExpanded((prev) => !prev);
          } else {
            router.push({
              pathname: "/file",
              params: {
                projectId,
                filePath: node.path,
                fileName: node.name,
              },
            });
          }
        }}
        style={[
          styles.nodeRow,
          {
            borderBottomColor: borderColor,
            paddingLeft: 16 + depth * 18,
          },
        ]}
      >
        <View style={styles.nodeLeading}>
          {isDirectory ? (
            <MaterialCommunityIcons
              name={expanded ? "chevron-down" : "chevron-right"}
              size={18}
              color={metaColor}
            />
          ) : (
            <View style={styles.nodeSpacer} />
          )}
          <MaterialCommunityIcons
            name={isDirectory ? (expanded ? "folder-open-outline" : "folder-outline") : "file-outline"}
            size={18}
            color={isDirectory ? theme.colors.primary : metaColor}
          />
        </View>
        <View style={styles.nodeContent}>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurface }}
            numberOfLines={1}
          >
            {node.name}
          </Text>
          <Text variant="bodySmall" style={{ color: metaColor }} numberOfLines={1}>
            {node.path}
          </Text>
        </View>
      </Pressable>

      {isDirectory && expanded ? (
        isLoading ? (
          <View style={[styles.stateRow, { paddingLeft: 34 + depth * 18 }]}> 
            <ActivityIndicator size="small" />
          </View>
        ) : error ? (
          <Pressable
            onPress={() => void refetch()}
            style={[styles.stateRow, { paddingLeft: 34 + depth * 18 }]}
          >
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={16}
              color={theme.colors.error}
            />
            <Text variant="bodySmall" style={{ color: theme.colors.error }}>
              Failed to load. Tap to retry.
            </Text>
          </Pressable>
        ) : children.length === 0 ? (
          <View style={[styles.stateRow, { paddingLeft: 34 + depth * 18 }]}> 
            <Text variant="bodySmall" style={{ color: metaColor }}>
              Empty folder
            </Text>
          </View>
        ) : (
          children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              projectId={projectId}
              depth={depth + 1}
              borderColor={borderColor}
              metaColor={metaColor}
            />
          ))
        )
      ) : null}
    </View>
  );
}

type FileDrawerProps = {
  visible: boolean;
  onClose: () => void;
  activeProject: Project | null;
  borderColor: string;
  metaColor: string;
  backgroundColor: string;
};

export function FileDrawer({
  visible,
  onClose,
  activeProject,
  borderColor,
  metaColor,
  backgroundColor,
}: FileDrawerProps) {
  const theme = useTheme();
  const [isMounted, setIsMounted] = React.useState(visible);
  const slideAnim = React.useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const backdropAnim = React.useRef(new Animated.Value(0)).current;
  const {
    data: rootNodes = [],
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useProjectDirectory(activeProject?.id ?? "", "", visible && Boolean(activeProject));

  const surfaceVariant = theme.dark ? "#111827" : "#F8FAFC";

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
            backgroundColor,
            borderLeftWidth: 1,
            borderColor,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        <LinearGradient
          colors={[backgroundColor, surfaceVariant]}
          locations={[0, 0.28]}
          style={StyleSheet.absoluteFill}
        />

        <View style={[styles.header, { borderBottomColor: borderColor }]}> 
          <View style={styles.headerTop}>
            <View style={styles.headerTitleWrap}>
              <Text variant="titleLarge" style={styles.title}>
                Files
              </Text>
              <Text variant="bodySmall" style={{ color: metaColor }} numberOfLines={1}>
                {activeProject?.folder ?? "Select a project first"}
              </Text>
            </View>
            <View style={styles.headerActions}>
              {activeProject ? (
                <Pressable
                  onPress={() => void refetch()}
                  style={[styles.iconButton, { borderColor }]}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh file tree"
                >
                  {isRefetching ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <MaterialCommunityIcons
                      name="refresh"
                      size={18}
                      color={theme.colors.onSurface}
                    />
                  )}
                </Pressable>
              ) : null}
              <Pressable
                onPress={onClose}
                style={[styles.iconButton, { borderColor }]}
                accessibilityRole="button"
                accessibilityLabel="Close files drawer"
              >
                <MaterialCommunityIcons
                  name="close"
                  size={18}
                  color={theme.colors.onSurface}
                />
              </Pressable>
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {!activeProject ? (
            <View style={styles.centered}>
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
            <View style={styles.centered}>
              <ActivityIndicator />
              <Text variant="bodyMedium" style={{ color: metaColor, marginTop: 12 }}>
                Loading files...
              </Text>
            </View>
          ) : error ? (
            <Pressable onPress={() => void refetch()} style={styles.centered}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={32}
                color={theme.colors.error}
              />
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.error, marginTop: 12 }}
              >
                Failed to load files. Tap to retry.
              </Text>
            </Pressable>
          ) : rootNodes.length === 0 ? (
            <View style={styles.centered}>
              <MaterialCommunityIcons
                name="folder-open-outline"
                size={32}
                color={metaColor}
              />
              <Text variant="bodyMedium" style={{ color: metaColor, marginTop: 12 }}>
                No visible files
              </Text>
            </View>
          ) : (
            rootNodes.map((node) => (
              <FileTreeNode
                key={node.path}
                node={node}
                projectId={activeProject.id}
                depth={0}
                borderColor={borderColor}
                metaColor={metaColor}
              />
            ))
          )}
        </ScrollView>
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
    top: 0,
    right: 0,
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
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerTitleWrap: {
    flex: 1,
  },
  title: {
    fontWeight: "700",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
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
    paddingBottom: 40,
  },
  centered: {
    paddingHorizontal: 24,
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeRow: {
    minHeight: 52,
    paddingRight: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  nodeLeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  nodeSpacer: {
    width: 18,
  },
  nodeContent: {
    flex: 1,
  },
  stateRow: {
    minHeight: 36,
    paddingRight: 16,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
