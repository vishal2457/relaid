import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React, { useCallback, useEffect, useRef } from "react";
import { BackHandler, Linking, Platform, StyleSheet, View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomSheetBackdropProps } from "@gorhom/bottom-sheet";

import { useVersionCheck } from "@/src/lib/useVersionCheck";

export function ForceUpdateBottomSheet() {
  const { isForceUpdateRequired, versionData } = useVersionCheck();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet>(null);
  const isDark = theme.dark;
  const sheetBg = isDark ? "#1E293B" : "#FFFFFF";

  useEffect(() => {
    if (isForceUpdateRequired) {
      sheetRef.current?.expand();
    }
  }, [isForceUpdateRequired]);

  // Block Android hardware back button while force update is shown
  useEffect(() => {
    if (!isForceUpdateRequired) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    );
    return () => subscription.remove();
  }, [isForceUpdateRequired]);

  const handleUpdate = useCallback(async () => {
    const url =
      Platform.OS === "ios"
        ? (versionData?.appStoreUrl ?? versionData?.playStoreUrl)
        : versionData?.playStoreUrl;
    if (!url) return;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) await Linking.openURL(url);
    } catch {
      // Silently ignore — nothing useful to do if the store URL fails to open
    }
  }, [versionData]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="none"
        opacity={0.75}
      />
    ),
    [],
  );

  if (!isForceUpdateRequired) return null;

  return (
    // pointerEvents="box-none" lets the BottomSheet and backdrop handle their own touches
    // while the parent View itself doesn't intercept any events
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <BottomSheet
        ref={sheetRef}
        index={0}
        enableDynamicSizing
        enablePanDownToClose={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: sheetBg }}
        handleIndicatorStyle={{ backgroundColor: "#CBD5E1" }}
      >
        <BottomSheetView
          style={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 24) + 8 },
          ]}
        >
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: theme.colors.primaryContainer },
            ]}
          >
            <Text style={styles.iconEmoji}>↑</Text>
          </View>

          <Text
            variant="headlineSmall"
            style={[styles.title, { color: theme.colors.onSurface }]}
          >
            Update Required
          </Text>

          <Text
            variant="bodyMedium"
            style={[
              styles.description,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            A critical update is available. Please update to the latest version
            to continue using the app.
          </Text>

          {versionData && (
            <Text
              variant="labelMedium"
              style={[styles.versionBadge, { color: theme.colors.outline }]}
            >
              Version {versionData.latestVersion} is now available
            </Text>
          )}

          <Button
            mode="contained"
            onPress={handleUpdate}
            style={styles.button}
            contentStyle={styles.buttonContent}
            labelStyle={styles.buttonLabel}
          >
            Update Now
          </Button>
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    alignItems: "center",
    gap: 12,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  iconEmoji: {
    fontSize: 36,
    lineHeight: 44,
    color: "#FFFFFF",
  },
  title: {
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  versionBadge: {
    textAlign: "center",
    marginTop: 2,
  },
  button: {
    marginTop: 8,
    width: "100%",
    borderRadius: 12,
  },
  buttonContent: {
    paddingVertical: 6,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: "600",
  },
});
