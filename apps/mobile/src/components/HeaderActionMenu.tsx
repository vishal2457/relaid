import React from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, useTheme } from "react-native-paper";

type HeaderActionMenuProps = {
  menuExpanded: boolean;
  isRefreshing: boolean;
  borderColor: string;
  onToggleMenu: () => void;
  onRefreshPress: () => void;
  onOpenGitPage: () => void;
  onOpenFileDrawer: () => void;
  onNewSession: () => void;
};

const MENU_ANIMATION_DURATION = 180;

export function HeaderActionMenu({
  menuExpanded,
  isRefreshing,
  borderColor,
  onToggleMenu,
  onRefreshPress,
  onOpenGitPage,
  onOpenFileDrawer,
  onNewSession,
}: HeaderActionMenuProps) {
  const theme = useTheme();
  const [showExpandedActions, setShowExpandedActions] = React.useState(menuExpanded);
  const expandAnim = React.useRef(new Animated.Value(menuExpanded ? 1 : 0)).current;
  const rotateAnim = React.useRef(new Animated.Value(menuExpanded ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: menuExpanded ? 1 : 0,
      duration: MENU_ANIMATION_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [menuExpanded, rotateAnim]);

  React.useEffect(() => {
    if (menuExpanded) {
      setShowExpandedActions(true);
      Animated.timing(expandAnim, {
        toValue: 1,
        duration: MENU_ANIMATION_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(expandAnim, {
      toValue: 0,
      duration: MENU_ANIMATION_DURATION,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setShowExpandedActions(false);
    });
  }, [menuExpanded, expandAnim]);

  const buttonBackgroundColor = theme.dark
    ? "rgba(17, 24, 39, 0.92)"
    : "rgba(255, 255, 255, 0.96)";
  const chevronRotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const expandedActionsStyle = {
    opacity: expandAnim,
    transform: [
      {
        translateX: expandAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
    ],
  };

  return (
    <View style={[styles.buttonGroup, { borderColor }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={menuExpanded ? "Collapse menu" : "Expand menu"}
        onPress={onToggleMenu}
        style={[styles.actionButton, { backgroundColor: buttonBackgroundColor }]}
      >
        <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
          <MaterialCommunityIcons
            name="chevron-left"
            size={20}
            color={theme.colors.onSurface}
          />
        </Animated.View>
      </Pressable>

      {showExpandedActions ? (
        <Animated.View
          pointerEvents={menuExpanded ? "auto" : "none"}
          style={[styles.expandedActions, expandedActionsStyle]}
        >
          <View style={[styles.buttonGroupDivider, { backgroundColor: borderColor }]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh session"
            onPress={onRefreshPress}
            disabled={isRefreshing}
            style={[styles.actionButton, { backgroundColor: buttonBackgroundColor }]}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color={theme.colors.onSurface} />
            ) : (
              <MaterialCommunityIcons
                name="refresh"
                size={20}
                color={theme.colors.onSurface}
              />
            )}
          </Pressable>

          <View style={[styles.buttonGroupDivider, { backgroundColor: borderColor }]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Git page"
            onPress={onOpenGitPage}
            style={[styles.actionButton, { backgroundColor: buttonBackgroundColor }]}
          >
            <MaterialCommunityIcons
              name="source-branch"
              size={20}
              color={theme.colors.onSurface}
            />
          </Pressable>

          <View style={[styles.buttonGroupDivider, { backgroundColor: borderColor }]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open files drawer"
            onPress={onOpenFileDrawer}
            style={[styles.actionButton, { backgroundColor: buttonBackgroundColor }]}
          >
            <MaterialCommunityIcons
              name="file-tree-outline"
              size={20}
              color={theme.colors.onSurface}
            />
          </Pressable>
        </Animated.View>
      ) : null}

      <View style={[styles.buttonGroupDivider, { backgroundColor: borderColor }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="New session"
        onPress={onNewSession}
        style={[styles.actionButton, { backgroundColor: buttonBackgroundColor }]}
      >
        <MaterialCommunityIcons name="plus" size={20} color={theme.colors.onSurface} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonGroup: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
  },
  expandedActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  buttonGroupDivider: {
    width: 1,
    height: "100%",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 40,
    width: 40,
  },
});
