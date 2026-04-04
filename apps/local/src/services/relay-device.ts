import fs from "fs";
import os from "os";
import path from "path";
import { randomBytes, randomUUID } from "crypto";
import { logger } from "../shared/logger";

const CHAT_SERVER_URL = process.env.CHAT_SERVER_URL || "http://localhost:3001";
const DATA_DIR = path.join(os.homedir(), "maximus-bot-data");
const RELAY_DEVICE_FILE = path.join(DATA_DIR, "relay-device.json");

export type RelayDeviceCredentials = {
  serverId: string;
  serverSecret: string;
};

export type PairingSessionResponse = {
  pairingId: string;
  pairingSecret: string;
  pairingUrl: string;
  expiresAt: string;
  pairedDeviceCount: number;
  serverId: string;
  serverName: string;
};

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}

function parseStoredCredentials(raw: string): RelayDeviceCredentials | null {
  try {
    const parsed = JSON.parse(raw) as Partial<RelayDeviceCredentials>;
    if (
      typeof parsed.serverId === "string" &&
      parsed.serverId.trim() &&
      typeof parsed.serverSecret === "string" &&
      parsed.serverSecret.trim()
    ) {
      return {
        serverId: parsed.serverId.trim(),
        serverSecret: parsed.serverSecret.trim(),
      };
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.warn("Failed to parse relay device credentials", { error: errMsg });
  }

  return null;
}

export function getRelayServerName(): string {
  return process.env.LOCAL_SERVER_NAME || `${os.hostname()} OpenCode Server`;
}

let cachedRelayUrl: string | null = null;

export function setRelayServerUrl(url: string): void {
  cachedRelayUrl = url;
}

export function getRelayServerUrl(): string {
  return cachedRelayUrl || CHAT_SERVER_URL;
}

export function loadOrCreateRelayDeviceCredentials(): RelayDeviceCredentials {
  const envServerId = process.env.LOCAL_SERVER_ID?.trim();
  const envServerSecret = process.env.LOCAL_SERVER_SECRET?.trim();

  if (envServerId && envServerSecret) {
    return {
      serverId: envServerId,
      serverSecret: envServerSecret,
    };
  }

  ensureDataDir();

  if (fs.existsSync(RELAY_DEVICE_FILE)) {
    const stored = parseStoredCredentials(
      fs.readFileSync(RELAY_DEVICE_FILE, "utf8"),
    );
    if (stored) {
      return stored;
    }
  }

  const created: RelayDeviceCredentials = {
    serverId: envServerId || randomUUID(),
    serverSecret: envServerSecret || generateSecret(),
  };

  fs.writeFileSync(RELAY_DEVICE_FILE, `${JSON.stringify(created, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  logger.info("Created relay device credentials", {
    serverId: created.serverId,
    path: RELAY_DEVICE_FILE,
  });

  return created;
}

export async function createPairingSession(
  credentials: RelayDeviceCredentials,
): Promise<PairingSessionResponse> {
  const response = await fetch(`${CHAT_SERVER_URL}/api/pairing/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-server-id": credentials.serverId,
      "x-server-secret": credentials.serverSecret,
    },
    body: JSON.stringify({
      serverName: getRelayServerName(),
    }),
  });

  const payload = (await response.json()) as
    | PairingSessionResponse
    | { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || "Failed to create pairing session");
  }

  return payload as PairingSessionResponse;
}
