import { claimPairingSession } from "@/src/lib/api/pairing";
import { parsePairingUrl } from "@/src/lib/pairing/url";
import { usePairingSession } from "@/src/components/PairingSessionContext";
import { useServerUrl } from "@/src/components/ServerUrlContext";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Device from "expo-device";
import { router, Stack } from "expo-router";
import React, { useCallback, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  IconButton,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export default function PairScreen() {
  const theme = useTheme();
  const { setServerUrl } = useServerUrl();
  const { saveSession } = usePairingSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOpenScanner = useCallback(async () => {
    if (!permission?.granted) {
      const nextPermission = await requestPermission();
      if (!nextPermission.granted) {
        setErrorMessage(
          "Camera access is required to scan the pairing QR code.",
        );
        return;
      }
    }

    setErrorMessage(null);
    setScannerOpen(true);
  }, [permission?.granted, requestPermission]);

  const handleBarcodeScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (submitting) {
        return;
      }

      setSubmitting(true);
      setErrorMessage(null);

      try {
        const parsed = parsePairingUrl(data);
        const qrRelayUrl = normalizeUrl(parsed.relayUrl);
        await setServerUrl(qrRelayUrl);
        try {
          const claimedSession = await claimPairingSession({
            pairingId: parsed.pairingId,
            pairingSecret: parsed.pairingSecret,
            deviceName: Device.deviceName || "Mobile Device",
            platform: Platform.OS,
          });
          console.log(claimedSession, "claimed session");

          await saveSession(claimedSession);
          setScannerOpen(false);
          router.replace("/");
        } catch (error) {
          console.log(error, "error");

          throw error;
        }
      } catch (error) {
        console.log(error, "error");

        const errMsg = error instanceof Error ? error.message : String(error);
        setErrorMessage(errMsg || "Failed to pair device.");
        setScannerOpen(false);
      } finally {
        setSubmitting(false);
      }
    },
    [saveSession, setServerUrl, submitting],
  );

  const borderColor = theme.dark ? "#243244" : "#D8E2EC";
  const surfaceColor = theme.dark ? "#101826" : "#FFFFFF";
  const scannerBorder = theme.dark ? "#0F172A" : "#0B1320";

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["top", "bottom"]}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <View>
          <Text variant="headlineSmall" style={styles.title}>
            Pair this phone
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Start the local server, then scan the QR code shown in the CLI.
          </Text>
        </View>
        <IconButton
          icon="cog-outline"
          onPress={() => router.push("/settings")}
        />
      </View>

      <Card
        mode="outlined"
        style={[styles.card, { borderColor, backgroundColor: surfaceColor }]}
      >
        <Card.Content>
          <Text variant="titleMedium" style={styles.cardTitle}>
            QR pairing
          </Text>
          <Text variant="bodyMedium" style={styles.cardCopy}>
            The QR contains a short-lived pairing secret and the relay URL. Each
            phone only needs to scan once.
          </Text>

          <Button
            mode="contained"
            icon="qrcode-scan"
            onPress={handleOpenScanner}
            disabled={submitting}
            style={styles.primaryButton}
          >
            {scannerOpen ? "Scanner Open" : "Scan QR Code"}
          </Button>

          {submitting ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" />
              <Text variant="bodyMedium">Pairing device…</Text>
            </View>
          ) : null}

          {errorMessage ? (
            <Text
              variant="bodyMedium"
              style={[styles.errorText, { color: theme.colors.error }]}
            >
              {errorMessage}
            </Text>
          ) : null}
        </Card.Content>
      </Card>

      {scannerOpen ? (
        <View style={styles.scannerShell}>
          <View style={[styles.scannerCard, { borderColor: scannerBorder }]}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <View style={styles.scannerFooter}>
              <Text variant="bodyMedium" style={styles.scannerCopy}>
                Hold the QR code inside the frame.
              </Text>
              <Button mode="text" onPress={() => setScannerOpen(false)}>
                Cancel
              </Button>
            </View>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  title: {
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 8,
    opacity: 0.72,
    maxWidth: 280,
    lineHeight: 22,
  },
  card: {
    marginTop: 24,
    borderRadius: 20,
  },
  cardTitle: {
    fontWeight: "700",
  },
  cardCopy: {
    marginTop: 10,
    lineHeight: 22,
    opacity: 0.74,
  },
  primaryButton: {
    marginTop: 18,
    borderRadius: 14,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
  },
  errorText: {
    marginTop: 14,
    lineHeight: 22,
  },
  scannerShell: {
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 24,
  },
  scannerCard: {
    borderWidth: 1,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  camera: {
    aspectRatio: 1,
    width: "100%",
  },
  scannerFooter: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scannerCopy: {
    color: "#FFFFFF",
    flex: 1,
    marginRight: 12,
  },
});
