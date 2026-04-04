import { useEffect } from "react";
import { View } from "react-native";
import { ActivityIndicator } from "react-native-paper";
import { PaperProvider } from "react-native-paper";
import { router, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import "react-native-reanimated";

import {
  PairingSessionProvider,
  usePairingSession,
} from "@/components/PairingSessionContext";
import { AppThemeProvider, useAppTheme } from "@/components/ThemeContext";
import { ServerUrlProvider, useServerUrl } from "@/components/ServerUrlContext";
import { defaultTheme, THEMES } from "@/constants/themes";
import { queryClient } from "@/lib/query-client";
import {
  requestNotificationPermissions,
  registerPushTokenWithServer,
} from "@/lib/notifications";

requestNotificationPermissions();

function PushTokenRegistration() {
  const { session } = usePairingSession();

  useEffect(() => {
    if (!session) {
      return;
    }

    void registerPushTokenWithServer();
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
            name="settings"
            options={{ headerShown: false, presentation: "modal" }}
          />
          <Stack.Screen name="pair" options={{ headerShown: false }} />
        </Stack>
      ) : (
        <Stack>
          <Stack.Screen name="pair" options={{ headerShown: false }} />
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
    <QueryClientProvider client={queryClient}>
      <ServerUrlProvider>
        <PairingSessionProvider>
          <AppThemeProvider>
            <PushTokenRegistration />
            <RootLayoutInner />
          </AppThemeProvider>
        </PairingSessionProvider>
      </ServerUrlProvider>
    </QueryClientProvider>
  );
}
