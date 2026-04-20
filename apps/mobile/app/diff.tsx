import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { IconButton, useTheme, ActivityIndicator } from "react-native-paper";
import DiffViewer from "@/src/components/DiffViewer";
import { useGitDiscardFile } from "@/lib/api/git";

export default function FileDiffScreen() {
  const theme = useTheme();
  const { projectId, filePath, fileName } = useLocalSearchParams<{
    projectId: string;
    filePath: string;
    fileName?: string;
  }>();

  const discardMutation = useGitDiscardFile(projectId ?? "");
  const [discarding, setDiscarding] = useState(false);

  const displayFileName = fileName || filePath?.split("/").pop() || "File Diff";

  const handleDiscard = () => {
    Alert.alert(
      "Discard Changes",
      `Are you sure you want to discard changes in "${displayFileName}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: async () => {
            setDiscarding(true);
            try {
              await discardMutation.mutateAsync(filePath ?? "");
              router.back();
            } catch {
              Alert.alert("Error", "Failed to discard changes");
            } finally {
              setDiscarding(false);
            }
          },
        },
      ],
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: displayFileName,
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.onSurface,
          headerLeft: () => (
            <IconButton
              icon="arrow-left"
              iconColor={theme.colors.onSurface}
              onPress={() => router.back()}
            />
          ),
          headerRight: () =>
            discarding ? (
              <ActivityIndicator size={20} color={theme.colors.onSurface} />
            ) : (
              <IconButton
                icon="delete-outline"
                iconColor={theme.colors.error}
                onPress={handleDiscard}
              />
            ),
        }}
      />

      <View style={styles.container}>
        <DiffViewer projectId={projectId ?? ""} filePath={filePath ?? ""} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
