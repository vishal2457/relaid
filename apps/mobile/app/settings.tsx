import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import {
  Text,
  useTheme,
  TextInput,
  Button,
  Card,
  IconButton,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  useServerUrl,
  DEFAULT_SERVER_URL,
} from "@/components/ServerUrlContext";
import { disconnectChatSocket } from "@/lib/socket/chat";
import { updateBaseUrl } from "@/lib/axios/base";
import ThemeSelector from "@/components/ThemeSelector";
import { useAppTheme } from "@/components/ThemeContext";

export default function SettingsScreen() {
  const theme = useTheme();
  const { serverUrl, setServerUrl } = useServerUrl();
  const { selectedTheme, setSelectedTheme } = useAppTheme();
  const [urlInput, setUrlInput] = useState(serverUrl);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    const trimmed = urlInput.trim().replace(/\/+$/, "");
    if (!trimmed) return;

    await setServerUrl(trimmed);
    updateBaseUrl(trimmed);
    disconnectChatSocket();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [urlInput, setServerUrl]);

  const handleReset = useCallback(() => {
    setUrlInput(DEFAULT_SERVER_URL);
  }, []);

  const borderColor = theme.dark ? "#2A3441" : "#D9E2EC";

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["top"]}
    >
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <IconButton icon="arrow-left" size={24} onPress={() => router.back()} />
        <Text variant="titleLarge" style={styles.headerTitle}>
          Settings
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Card mode="outlined" style={{ borderColor }}>
              <Card.Content>
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <Text variant="bodyLarge" style={styles.settingTitle}>
                      Server URL
                    </Text>
                    <Text variant="bodySmall" style={styles.settingDescription}>
                      Base URL of the OpenCode server
                    </Text>
                  </View>
                </View>

                <TextInput
                  mode="outlined"
                  value={urlInput}
                  onChangeText={setUrlInput}
                  placeholder="http://100.95.62.14:3001"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={styles.input}
                  outlineStyle={styles.inputOutline}
                  right={
                    urlInput !== DEFAULT_SERVER_URL ? (
                      <TextInput.Icon icon="refresh" onPress={handleReset} />
                    ) : undefined
                  }
                />

                <View style={styles.buttonRow}>
                  <Button
                    mode="contained"
                    onPress={handleSave}
                    disabled={!urlInput.trim()}
                    style={styles.saveButton}
                    icon={saved ? "check" : "content-save"}
                  >
                    {saved ? "Saved" : "Save"}
                  </Button>
                </View>
              </Card.Content>
            </Card>

            <View style={{ marginTop: 20 }}>
              <ThemeSelector
                selectedTheme={selectedTheme}
                onSelectTheme={setSelectedTheme}
              />
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontWeight: "700",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontWeight: "500",
    marginBottom: 2,
  },
  settingDescription: {
    opacity: 0.6,
  },
  input: {
    marginTop: 16,
  },
  inputOutline: {
    borderRadius: 12,
  },
  buttonRow: {
    marginTop: 12,
    alignItems: "flex-end",
  },
  saveButton: {
    borderRadius: 8,
  },
});
