import { useEffect } from "react";
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
import { defaultTheme, THEMES } from "@/constants/themes";
import { queryClient } from "@/lib/query-client";
import {
  initializeNotifications,
  requestNotificationPermissions,
  registerPushTokenWithServer,
} from "@/lib/notifications";

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
  const currentTheme = (THEMES.find((t) => t.key === selectedTheme)?.theme ??
    defaultTheme) as typeof defaultTheme;

  useEffect(() => {
    if (!pairingHydrated || !serverUrlHydrated) {
      return;
    }

    if (!isPaired && pathname !== "/pair" && pathname !== "/settings") {
      router.replace("/pair" as any);
      return;
    }

    if (isPaired && pathname === "/pair") {
      router.replace("/");
    }
  }, [isPaired, pairingHydrated, pathname, serverUrlHydrated]);

  if (!pairingHydrated || !serverUrlHydrated) {
    return (
      <PaperProvider theme={currentTheme}>
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
        <StatusBar style="auto" />
      </PaperProvider>
    );
  }

  return (
    <PaperProvider theme={currentTheme}>
      {isPaired ? (
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen
            name="projects/[projectId]"
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="file"
            options={{ headerShown: true, presentation: "card" }}
          />
          <Stack.Screen
            name="settings"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen name="pair" options={{ headerShown: false }} />
        </Stack>
      ) : (
        <Stack>
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
