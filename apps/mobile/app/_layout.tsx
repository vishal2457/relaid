import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, PaperProvider } from "react-native-paper";
import { router, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import {
  PairingSessionProvider,
  usePairingSession,
} from "@/src/components/PairingSessionContext";
import { AppThemeProvider, useAppTheme } from "@/src/components/ThemeContext";
import {
  ServerUrlProvider,
  useServerUrl,
} from "@/src/components/ServerUrlContext";
import { defaultTheme, THEMES } from "@/src/constants/themes";
import { queryClient } from "@/src/lib/query-client";
import {
  initializeNotifications,
  requestNotificationPermissions,
  registerPushTokenWithServer,
} from "@/src/lib/notifications";
import {
  hasSeenOnboarding,
  markOnboardingSeen,
  subscribeToOnboardingSeen,
} from "@/src/lib/onboarding";
import { ForceUpdateBottomSheet } from "@/src/components/ForceUpdateBottomSheet";

function StartupInit() {
  useEffect(() => {
    initializeNotifications();
  }, []);
  return null;
}

function PushTokenRegistration() {
  const { session } = usePairingSession();

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const granted = await requestNotificationPermissions();
      if (!granted || cancelled) {
        return;
      }

      await registerPushTokenWithServer();
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  return null;
}

function RootLayoutInner() {
  const { selectedTheme } = useAppTheme();
  const { hydrated: pairingHydrated, isPaired } = usePairingSession();
  const { hydrated: serverUrlHydrated } = useServerUrl();
  const pathname = usePathname();
  const [onboardingHydrated, setOnboardingHydrated] = useState(false);
  const [onboardingSeen, setOnboardingSeen] = useState(false);
  const currentTheme = (THEMES.find((t) => t.key === selectedTheme)?.theme ??
    defaultTheme) as typeof defaultTheme;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const seen = await hasSeenOnboarding();
      if (!cancelled) {
        setOnboardingSeen(seen);
        setOnboardingHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeToOnboardingSeen((seen) => {
      setOnboardingSeen(seen);
      setOnboardingHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!pairingHydrated || !onboardingHydrated || !isPaired || onboardingSeen) {
      return;
    }

    setOnboardingSeen(true);
    void markOnboardingSeen();
  }, [isPaired, onboardingHydrated, onboardingSeen, pairingHydrated]);

  useEffect(() => {
    if (!pairingHydrated || !serverUrlHydrated || !onboardingHydrated) {
      return;
    }

    if (isPaired) {
      if (pathname === "/pair" || pathname === "/onboarding") {
        router.replace("/");
      }
      return;
    }

    if (!onboardingSeen) {
      if (pathname !== "/onboarding") {
        router.replace("/onboarding" as any);
      }
      return;
    }

    if (
      pathname !== "/pair" &&
      pathname !== "/settings" &&
      pathname !== "/auth" &&
      pathname !== "/diff"
    ) {
      router.replace("/pair" as any);
    }
  }, [
    isPaired,
    onboardingHydrated,
    onboardingSeen,
    pairingHydrated,
    pathname,
    serverUrlHydrated,
  ]);

  const isHydrated = pairingHydrated && serverUrlHydrated && onboardingHydrated;

  return (
    <PaperProvider theme={currentTheme}>
      {!isHydrated ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: currentTheme.colors.background,
          }}
        >
          <ActivityIndicator />
        </View>
      ) : isPaired ? (
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="file"
            options={{ headerShown: true, presentation: "card" }}
          />
          <Stack.Screen
            name="settings"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="pair" options={{ headerShown: false }} />
          <Stack.Screen
            name="git"
            options={{ headerShown: false, presentation: "card" }}
          />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack>
      ) : (
        <Stack>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="pair" options={{ headerShown: false }} />
          <Stack.Screen
            name="diff"
            options={{ headerShown: true, presentation: "modal" }}
          />
          <Stack.Screen
            name="settings"
            options={{ headerShown: false, presentation: "modal" }}
          />
        </Stack>
      )}
      {/* ForceUpdateBottomSheet renders as an absolute overlay above all screens */}
      <ForceUpdateBottomSheet />
      <StatusBar style="auto" />
    </PaperProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <QueryClientProvider client={queryClient}>
        <ServerUrlProvider>
          <PairingSessionProvider>
            <AppThemeProvider>
              <StartupInit />
              <PushTokenRegistration />
              <RootLayoutInner />
            </AppThemeProvider>
          </PairingSessionProvider>
        </ServerUrlProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
