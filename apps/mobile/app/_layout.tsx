import { PaperProvider } from "react-native-paper";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import "react-native-reanimated";

import { AppThemeProvider, useAppTheme } from "@/components/ThemeContext";
import { ServerUrlProvider } from "@/components/ServerUrlContext";
import { defaultTheme, THEMES } from "@/constants/themes";
import { queryClient } from "@/lib/query-client";
import { requestNotificationPermissions } from "@/lib/notifications";

requestNotificationPermissions();

export const unstable_settings = {
  anchor: "index",
};

function RootLayoutInner() {
  const { selectedTheme } = useAppTheme();
  const currentTheme =
    THEMES.find((t) => t.key === selectedTheme)?.theme ?? defaultTheme;

  return (
    <PaperProvider theme={currentTheme}>
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
      </Stack>
      <StatusBar style="auto" />
    </PaperProvider>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ServerUrlProvider>
        <AppThemeProvider>
          <RootLayoutInner />
        </AppThemeProvider>
      </ServerUrlProvider>
    </QueryClientProvider>
  );
}
