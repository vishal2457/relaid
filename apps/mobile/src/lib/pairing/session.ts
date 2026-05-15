import * as SecureStore from "expo-secure-store";

export type PairingSession = {
  accessToken: string;
  deviceId: string;
  devicePublicKey: string;
  deviceKeyId: string;
  devicePrivateKey: string;
  serverId: string;
  serverName: string;
  serverPublicKey: string;
  serverKeyId: string;
  fingerprint: string;
};

const PAIRING_SESSION_KEY = "PAIRING_SESSION";

let currentPairingSession: PairingSession | null = null;

function isPairingSession(value: unknown): value is PairingSession {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as PairingSession).accessToken === "string" &&
    typeof (value as PairingSession).deviceId === "string" &&
    typeof (value as PairingSession).devicePublicKey === "string" &&
    typeof (value as PairingSession).deviceKeyId === "string" &&
    typeof (value as PairingSession).devicePrivateKey === "string" &&
    typeof (value as PairingSession).serverId === "string" &&
    typeof (value as PairingSession).serverName === "string" &&
    typeof (value as PairingSession).serverPublicKey === "string" &&
    typeof (value as PairingSession).serverKeyId === "string" &&
    typeof (value as PairingSession).fingerprint === "string",
  );
}

export function getCurrentPairingSession(): PairingSession | null {
  return currentPairingSession;
}

export function getCurrentAccessToken(): string | null {
  return currentPairingSession?.accessToken ?? null;
}

export async function loadStoredPairingSession(): Promise<PairingSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(PAIRING_SESSION_KEY);
    if (!raw) {
      currentPairingSession = null;
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isPairingSession(parsed)) {
      currentPairingSession = null;
      await SecureStore.deleteItemAsync(PAIRING_SESSION_KEY);
      return null;
    }

    currentPairingSession = parsed;
    return parsed;
  } catch {
    currentPairingSession = null;
    return null;
  }
}

export async function savePairingSession(
  session: PairingSession,
): Promise<void> {
  currentPairingSession = session;
  await SecureStore.setItemAsync(PAIRING_SESSION_KEY, JSON.stringify(session));
}

export async function clearPairingSession(): Promise<void> {
  currentPairingSession = null;
  await SecureStore.deleteItemAsync(PAIRING_SESSION_KEY);
}
