import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";

export default function GithubAuthCallbackScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{
    success?: string | string[];
    error?: string | string[];
  }>();

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      router.replace("/settings" as any);
    }, 250);

    return () => clearTimeout(timeoutId);
  }, []);

  const success = Array.isArray(params.success)
    ? params.success[0]
    : params.success;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background },
      ]}
    >
      <ActivityIndicator />
      <Text style={styles.text}>
        {success === "true"
          ? "Completing GitHub sign-in..."
          : error
            ? `GitHub sign-in failed: ${error}`
            : "Returning to settings..."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  text: {
    textAlign: "center",
  },
});
