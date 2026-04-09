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
import { usePairingSession } from "@/components/PairingSessionContext";
import { disconnectSseClient } from "@/lib/sse";
import { updateBaseUrl } from "@/lib/axios/base";
import ThemeSelector from "@/components/ThemeSelector";
import { useAppTheme } from "@/components/ThemeContext";

export default function SettingsScreen() {
  const theme = useTheme();
  const { serverUrl, setServerUrl } = useServerUrl();
  const { session, isPaired, clearSession } = usePairingSession();
  const { selectedTheme, setSelectedTheme } = useAppTheme();
  const [urlInput, setUrlInput] = useState(serverUrl);
  const [saved, setSaved] = useState(false);
  const [pingStatus, setPingStatus] = useState<
    "idle" | "pinging" | "success" | "error"
  >("idle");

  const handleSave = useCallback(async () => {
    const trimmed = urlInput.trim().replace(/\/+$/, "");
    if (!trimmed) return;

    await setServerUrl(trimmed);
    updateBaseUrl(trimmed);
    disconnectSseClient();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [urlInput, setServerUrl]);

  const handleReset = useCallback(() => {
    setUrlInput(DEFAULT_SERVER_URL);
  }, []);

  const handlePing = useCallback(async () => {
    const trimmed = urlInput.trim().replace(/\/+$/, "");
    if (!trimmed) return;

    setPingStatus("pinging");
    let timeoutId: ReturnType<typeof setTimeout>;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(`${trimmed}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const data = (await response.json()) as { status?: string };
        setPingStatus(data.status === "ok" ? "success" : "error");
      } else {
        setPingStatus("error");
      }
    } catch {
      setPingStatus("error");
    }
    timeoutId = setTimeout(() => setPingStatus("idle"), 3000);
  }, [urlInput]);

  const handleForgetDevice = useCallback(async () => {
    await clearSession();
    router.replace("/pair" as any);
  }, [clearSession]);

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
                      Pairing
                    </Text>
                    <Text variant="bodySmall" style={styles.settingDescription}>
                      {isPaired
                        ? `${session?.serverName || "Paired server"} is connected to this phone`
                        : "This phone is not paired yet"}
                    </Text>
                  </View>
                </View>

                {isPaired ? (
                  <>
                    <Text variant="bodySmall" style={styles.metaText}>
                      Server ID: {session?.serverId}
                    </Text>
                    <Text variant="bodySmall" style={styles.metaText}>
                      Device ID: {session?.deviceId}
                    </Text>
                    <View style={styles.buttonRow}>
                      <Button
                        mode="outlined"
                        onPress={handleForgetDevice}
                        icon="link-off"
                      >
                        Forget This Device
                      </Button>
                    </View>
                  </>
                ) : (
                  <View style={styles.buttonRow}>
                    <Button
                      mode="contained-tonal"
                      onPress={() => router.push("/pair" as any)}
                      icon="qrcode-scan"
                    >
                      Open Pairing Screen
                    </Button>
                  </View>
                )}
              </Card.Content>
            </Card>

            <Card mode="outlined" style={{ borderColor, marginTop: 20 }}>
              <Card.Content>
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <Text variant="bodyLarge" style={styles.settingTitle}>
                      Relay URL
                    </Text>
                    <Text variant="bodySmall" style={styles.settingDescription}>
                      Base URL of the relay server
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
                />

                <View style={styles.buttonRow}>
                  {urlInput !== DEFAULT_SERVER_URL && (
                    <Button
                      mode="outlined"
                      onPress={handleReset}
                      style={styles.pingButton}
                      icon="refresh"
                    >
                      Reset
                    </Button>
                  )}
                  <Button
                    mode="outlined"
                    onPress={handlePing}
                    disabled={!urlInput.trim() || pingStatus === "pinging"}
                    style={styles.pingButton}
                    icon={
                      pingStatus === "pinging"
                        ? "loading"
                        : pingStatus === "success"
                          ? "check"
                          : pingStatus === "error"
                            ? "close"
                            : "access-point"
                    }
                  >
                    {pingStatus === "pinging"
                      ? "Pinging..."
                      : pingStatus === "success"
                        ? "Connected"
                        : pingStatus === "error"
                          ? "Failed"
                          : "Ping"}
                  </Button>
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
  metaText: {
    marginTop: 10,
    opacity: 0.7,
  },
  inputOutline: {
    borderRadius: 12,
  },
  buttonRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  pingButton: {
    borderRadius: 8,
  },
  saveButton: {
    borderRadius: 8,
  },
});
