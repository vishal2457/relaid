import { usePairingSession } from "@/src/components/PairingSessionContext";
import { SelectionSheet } from "@/src/components/SelectionSheet";
import {
  DEFAULT_SERVER_URL,
  useServerUrl,
} from "@/src/components/ServerUrlContext";
import { useAppTheme } from "@/src/components/ThemeContext";
import ThemeSelector from "@/src/components/ThemeSelector";
import {
  // checkGithubStatus,
  clearGithubSession,
  // disconnectGithub,
  // loadStoredGithubSession,
  // startGithubOAuth,
  // type GithubSession,
} from "@/src/lib/api/github";
import {
  getConnectedLocalServers,
  type ConnectedLocalServer,
} from "@/src/lib/api/local-servers";
import { disconnectSseClient } from "@/src/lib/sse";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  View
} from "react-native";
import {
  Button,
  Card,
  IconButton,
  ActivityIndicator,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

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
  const [showPairingSheet, setShowPairingSheet] = useState(false);
  const [showRelaySheet, setShowRelaySheet] = useState(false);
  // const [githubSession, setGithubSession] = useState<GithubSession | null>(
  //   null,
  // );
  // const [githubHydrated, setGithubHydrated] = useState(false);
  // const [githubConnecting, setGithubConnecting] = useState(false);
  const [connectedServers, setConnectedServers] = useState<ConnectedLocalServer[]>(
    [],
  );
  const [connectedServersLoading, setConnectedServersLoading] = useState(false);
  const [connectedServersError, setConnectedServersError] = useState<string | null>(
    null,
  );

  // useEffect(() => {
  //   let cancelled = false;

  //   const hydrateGithubSession = async () => {
  //     setGithubHydrated(false);

  //     const stored = await loadStoredGithubSession();
  //     if (cancelled) return;
  //     setGithubSession(stored);

  //     if (!isPaired) {
  //       setGithubHydrated(true);
  //       return;
  //     }

  //     try {
  //       const status = await checkGithubStatus();
  //       if (cancelled) return;
  //       setGithubSession(
  //         status.connected && status.username
  //           ? { username: status.username }
  //           : null,
  //       );
  //     } catch (error) {
  //       console.error("Failed to load GitHub status", error);
  //     } finally {
  //       if (!cancelled) {
  //         setGithubHydrated(true);
  //       }
  //     }
  //   };

  //   void hydrateGithubSession();

  //   return () => {
  //     cancelled = true;
  //   };
  // }, [isPaired]);

  const loadConnectedServers = useCallback(async () => {
    if (!isPaired) {
      setConnectedServers([]);
      setConnectedServersError(null);
      return;
    }

    try {
      setConnectedServersLoading(true);
      setConnectedServersError(null);
      const servers = await getConnectedLocalServers();
      setConnectedServers(servers);
    } catch (error) {
      console.error("Failed to load connected local servers", error);
      setConnectedServersError("Unable to load connected local servers");
    } finally {
      setConnectedServersLoading(false);
    }
  }, [isPaired]);

  useEffect(() => {
    if (!showPairingSheet) return;
    void loadConnectedServers();
  }, [loadConnectedServers, showPairingSheet]);

  const handleSave = useCallback(async () => {
    const trimmed = urlInput.trim().replace(/\/+$/, "");
    if (!trimmed) return;

    await setServerUrl(trimmed);
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
    await clearGithubSession();
    await clearSession();
    router.replace("/pair" as any);
  }, [clearSession]);

  // const handleGithubConnect = useCallback(async () => {
  //   if (!isPaired) return;
  //   try {
  //     setGithubConnecting(true);
  //     const session = await startGithubOAuth();
  //     if (session) {
  //       setGithubSession(session);
  //     }
  //   } catch (err) {
  //     console.error("GitHub OAuth failed", err);
  //   } finally {
  //     setGithubConnecting(false);
  //   }
  // }, [isPaired]);

  // const handleGithubDisconnect = useCallback(async () => {
  //   try {
  //     setGithubConnecting(true);
  //     await disconnectGithub();
  //     setGithubSession(null);
  //   } catch (err) {
  //     console.error("GitHub disconnect failed", err);
  //   } finally {
  //     setGithubConnecting(false);
  //   }
  // }, []);

  const borderColor = theme.dark ? "#2A3441" : "#D9E2EC";

  const formatConnectedTime = useCallback((value: string | null) => {
    if (!value) return null;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString();
  }, []);

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
                <Text variant="titleMedium" style={styles.cardTitle}>
                  Connection
                </Text>
                <View style={styles.buttonGroup}>
                  <Button
                    mode="outlined"
                    onPress={() => setShowPairingSheet(true)}
                    icon="link"
                    style={styles.groupButton}
                  >
                    Pairing
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={() => setShowRelaySheet(true)}
                    icon="access-point"
                    style={styles.groupButton}
                  >
                    Relay
                  </Button>
                </View>
              </Card.Content>
            </Card>

            {/* <Card mode="outlined" style={{ borderColor, marginTop: 16 }}>
              <Card.Content>
                <Text variant="titleMedium" style={styles.cardTitle}>
                  GitHub Integration
                </Text>
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <Text variant="bodyLarge" style={styles.settingTitle}>
                      {!githubHydrated
                        ? "Checking connection..."
                        : githubSession
                          ? githubSession.username
                          : "Not connected"}
                    </Text>
                    <Text variant="bodySmall" style={styles.settingDescription}>
                      {!isPaired
                        ? "Pair this phone with your relay before connecting GitHub"
                        : !githubHydrated
                          ? "Syncing GitHub connection status"
                          : githubSession
                            ? "GitHub account linked for PR reviews"
                            : "Connect your GitHub account to review pull requests"}
                    </Text>
                  </View>
                </View>
                <View style={styles.sheetButtonRow}>
                  {githubSession ? (
                    <Button
                      mode="outlined"
                      onPress={handleGithubDisconnect}
                      icon="link-off"
                      loading={githubConnecting}
                      disabled={githubConnecting || !githubHydrated}
                      textColor={theme.colors.error}
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      mode="contained-tonal"
                      onPress={handleGithubConnect}
                      loading={githubConnecting}
                      disabled={
                        githubConnecting || !isPaired || !githubHydrated
                      }
                      icon="source-branch"
                    >
                      {githubConnecting ? "Connecting..." : "Connect GitHub"}
                    </Button>
                  )}
                </View>
              </Card.Content>
            </Card> */}

            <View style={{ marginTop: 20 }}>
              <ThemeSelector
                selectedTheme={selectedTheme}
                onSelectTheme={setSelectedTheme}
              />
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      <SelectionSheet
        visible={showPairingSheet}
        title="Pairing"
        onClose={() => setShowPairingSheet(false)}
        enableDynamicSizing
      >
        {isPaired ? (
          <View style={styles.connectedServersSection}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text variant="bodyLarge" style={styles.settingTitle}>
                  Connected Local Servers
                </Text>
                <Text variant="bodySmall" style={styles.settingDescription}>
                  Servers currently online through this relay
                </Text>
              </View>
              <IconButton
                icon="refresh"
                size={20}
                onPress={() => void loadConnectedServers()}
                disabled={connectedServersLoading}
              />
            </View>

            {connectedServersLoading ? (
              <View style={styles.connectedServersLoadingRow}>
                <ActivityIndicator size="small" />
                <Text variant="bodySmall" style={styles.settingDescription}>
                  Loading connected servers...
                </Text>
              </View>
            ) : connectedServersError ? (
              <Text variant="bodySmall" style={styles.metaText}>
                {connectedServersError}
              </Text>
            ) : connectedServers.length > 0 ? (
              connectedServers.map((server) => {
                const lastConnected = formatConnectedTime(server.lastConnected);

                return (
                  <View
                    key={server.id}
                    style={[
                      styles.connectedServerItem,
                      { borderColor },
                    ]}
                  >
                    <Text variant="bodyMedium" style={styles.connectedServerName}>
                      {server.name}
                    </Text>
                    <Text variant="bodySmall" style={styles.settingDescription}>
                      Server ID: {server.id}
                    </Text>
                    {lastConnected ? (
                      <Text variant="bodySmall" style={styles.settingDescription}>
                        Last connected: {lastConnected}
                      </Text>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <Text variant="bodySmall" style={styles.metaText}>
                No local servers are currently connected.
              </Text>
            )}
          </View>
        ) : null}

        {isPaired ? (
          <>
            <Text variant="bodySmall" style={styles.metaText}>
              Device ID: {session?.deviceId}
            </Text>
            <View style={styles.sheetButtonRow}>
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
          <View style={styles.sheetButtonRow}>
            <Button
              mode="contained-tonal"
              onPress={() => {
                setShowPairingSheet(false);
                router.push("/pair" as any);
              }}
              icon="qrcode-scan"
            >
              Open Pairing Screen
            </Button>
          </View>
        )}
      </SelectionSheet>

      <SelectionSheet
        visible={showRelaySheet}
        title="Relay URL"
        onClose={() => setShowRelaySheet(false)}
        enableDynamicSizing
      >
        <TextInput
          mode="outlined"
          value={urlInput}
          onChangeText={setUrlInput}
          placeholder="https://relaid.derived.dev"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
          outlineStyle={styles.inputOutline}
        />

        <View style={styles.sheetButtonRow}>
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
      </SelectionSheet>
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
  cardTitle: {
    fontWeight: "600",
    marginBottom: 16,
  },
  buttonGroup: {
    flexDirection: "row",
    gap: 12,
  },
  groupButton: {
    flex: 1,
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
  connectedServersSection: {
    marginTop: 20,
  },
  connectedServersLoadingRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  connectedServerItem: {
    marginTop: 12,
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  connectedServerName: {
    fontWeight: "600",
    marginBottom: 4,
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
  sheetButtonRow: {
    marginTop: 20,
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
  sheetTitle: {
    fontWeight: "700",
    paddingBottom: 12,
  },
});
