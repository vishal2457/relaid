import { createHash, randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { Request } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db";
import {
  localServers,
  mobileDevices,
  pairingSessions,
  users,
  type LocalServer,
  type MobileDevice,
} from "../db/schema";
import { getLocalServerSocket } from "../socket/request-broker";
import { RouteError } from "./local-server-proxy";

const DEFAULT_PAIRING_TTL_MS =
  Number(process.env.PAIRING_SESSION_TTL_MS) || 5 * 60 * 1000;

export type AuthenticatedMobileAccess = {
  device: MobileDevice;
  server: LocalServer;
};

export type PairingSessionPayload = {
  pairingId: string;
  pairingSecret: string;
  expiresAt: string;
  pairedDeviceCount: number;
  serverId: string;
  serverName: string;
  serverPublicKey: string;
  serverKeyId: string;
  fingerprint: string;
};

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateOpaqueSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function resolveServerScopeName(serverName?: string): string {
  return serverName?.trim() || "Local OpenCode Server";
}

async function ensureServerScopeUser(
  serverId: string,
  serverName?: string,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, serverId))
    .limit(1);

  const email = `${serverId}@local.relaid`;
  const name = resolveServerScopeName(serverName);

  if (!existingUser) {
    await db.insert(users).values({
      id: serverId,
      email,
      name,
      createdAt: now,
      updatedAt: now,
    });
    return;
  }

  if (existingUser.email !== email || existingUser.name !== name) {
    await db
      .update(users)
      .set({
        email,
        name,
        updatedAt: now,
      })
      .where(eq(users.id, serverId));
  }
}

export async function authenticateLocalServer(
  serverId: string,
  serverSecret: string,
  serverName?: string,
): Promise<LocalServer> {
  if (!serverId.trim()) {
    throw new RouteError(401, "serverId is required");
  }

  if (!serverSecret.trim()) {
    throw new RouteError(401, "serverSecret is required");
  }

  const db = getDb();
  const now = new Date();
  const resolvedServerName = resolveServerScopeName(serverName);
  const secretHash = hashSecret(serverSecret);

  await ensureServerScopeUser(serverId, resolvedServerName);

  const [existingServer] = await db
    .select()
    .from(localServers)
    .where(eq(localServers.id, serverId))
    .limit(1);

  if (!existingServer) {
    const [createdServer] = await db
      .insert(localServers)
      .values({
        id: serverId,
        userId: serverId,
        name: resolvedServerName,
        serverSecretHash: secretHash,
        isConnected: false,
        createdAt: now,
      })
      .returning();

    return createdServer;
  }

  if (
    existingServer.serverSecretHash &&
    existingServer.serverSecretHash !== secretHash
  ) {
    throw new RouteError(401, "Invalid local server credentials");
  }

  const shouldUpdate =
    existingServer.userId !== serverId ||
    existingServer.name !== resolvedServerName ||
    existingServer.serverSecretHash !== secretHash;

  if (!shouldUpdate) {
    return existingServer;
  }

  const [updatedServer] = await db
    .update(localServers)
    .set({
      userId: serverId,
      name: resolvedServerName,
      serverSecretHash: secretHash,
    })
    .where(eq(localServers.id, serverId))
    .returning();

  return updatedServer;
}

export function getBearerToken(headerValue: unknown): string | null {
  if (typeof headerValue !== "string") {
    return null;
  }

  const [scheme, token] = headerValue.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) {
    return null;
  }

  return token.trim();
}

export function getServerHeaders(req: Request): {
  serverId: string;
  serverSecret: string;
} {
  const serverId = req.headers["x-server-id"];
  const serverSecret = req.headers["x-server-secret"];

  if (typeof serverId !== "string" || !serverId.trim()) {
    throw new RouteError(401, "x-server-id header is required");
  }

  if (typeof serverSecret !== "string" || !serverSecret.trim()) {
    throw new RouteError(401, "x-server-secret header is required");
  }

  return {
    serverId: serverId.trim(),
    serverSecret: serverSecret.trim(),
  };
}

export async function issueMobileAccessToken(
  serverId: string,
  devicePublicKey: string,
  deviceKeyId: string,
  name?: string,
  platform?: string,
): Promise<{ accessToken: string; device: MobileDevice }> {
  const db = getDb();
  const now = new Date();
  const accessToken = generateOpaqueSecret();
  const [device] = await db
    .insert(mobileDevices)
    .values({
      id: uuidv4(),
      serverId,
      name: name?.trim() || "Mobile Device",
      platform: platform?.trim() || null,
      tokenHash: hashSecret(accessToken),
      devicePublicKey,
      deviceKeyId,
      createdAt: now,
      lastSeenAt: now,
    })
    .returning();

  return {
    accessToken,
    device,
  };
}

export async function authenticateMobileAccessToken(
  accessToken: string,
): Promise<AuthenticatedMobileAccess> {
  if (!accessToken.trim()) {
    throw new RouteError(401, "Access token is required");
  }

  const db = getDb();
  const tokenHash = hashSecret(accessToken);
  const [device] = await db
    .select()
    .from(mobileDevices)
    .where(
      and(
        eq(mobileDevices.tokenHash, tokenHash),
        isNull(mobileDevices.revokedAt),
      ),
    )
    .limit(1);

  if (!device) {
    throw new RouteError(401, "Invalid access token");
  }

  const [server] = await db
    .select()
    .from(localServers)
    .where(eq(localServers.id, device.serverId))
    .limit(1);

  if (!server) {
    throw new RouteError(401, "Server for access token was not found");
  }

  await db
    .update(mobileDevices)
    .set({
      lastSeenAt: new Date(),
    })
    .where(eq(mobileDevices.id, device.id));

  return {
    device: {
      ...device,
      lastSeenAt: new Date(),
    },
    server,
  };
}

export async function getMobileDeviceById(
  deviceId: string,
): Promise<MobileDevice> {
  const db = getDb();
  const [device] = await db
    .select()
    .from(mobileDevices)
    .where(eq(mobileDevices.id, deviceId))
    .limit(1);

  if (!device) {
    throw new RouteError(404, "Mobile device not found");
  }

  return device;
}

export async function countPairedDevices(serverId: string): Promise<number> {
  const db = getDb();
  const devices = await db
    .select({ id: mobileDevices.id })
    .from(mobileDevices)
    .where(
      and(
        eq(mobileDevices.serverId, serverId),
        isNull(mobileDevices.revokedAt),
      ),
    );

  return devices.length;
}

export async function createPairingSessionForServer(
  serverId: string,
  serverPublicKey: string,
  serverKeyId: string,
  fingerprint: string,
): Promise<PairingSessionPayload> {
  const db = getDb();
  const now = Date.now();
  const pairingId = uuidv4();
  const pairingSecret = generateOpaqueSecret();
  const expiresAt = new Date(now + DEFAULT_PAIRING_TTL_MS);

  await db
    .delete(pairingSessions)
    .where(
      and(
        eq(pairingSessions.serverId, serverId),
        isNull(pairingSessions.usedAt),
      ),
    );

  await db.insert(pairingSessions).values({
    id: pairingId,
    serverId,
    secretHash: hashSecret(pairingSecret),
    serverPublicKey,
    serverKeyId,
    fingerprint,
    createdAt: new Date(now),
    expiresAt,
  });

  const [server] = await db
    .select()
    .from(localServers)
    .where(eq(localServers.id, serverId))
    .limit(1);

  if (!server) {
    throw new RouteError(404, "Local server not found");
  }

  return {
    pairingId,
    pairingSecret,
    expiresAt: expiresAt.toISOString(),
    pairedDeviceCount: await countPairedDevices(serverId),
    serverId,
    serverName: server.name,
    serverPublicKey,
    serverKeyId,
    fingerprint,
  };
}

export async function claimPairingSession(
  pairingId: string,
  pairingSecret: string,
  devicePublicKey: string,
  deviceKeyId: string,
  deviceName?: string,
  platform?: string,
): Promise<{
  accessToken: string;
  deviceId: string;
  serverId: string;
  serverName: string;
  serverPublicKey: string;
  serverKeyId: string;
  fingerprint: string;
}> {
  if (!pairingId.trim()) {
    throw new RouteError(400, "pairingId is required");
  }

  if (!pairingSecret.trim()) {
    throw new RouteError(400, "pairingSecret is required");
  }

  if (!devicePublicKey.trim()) {
    throw new RouteError(400, "devicePublicKey is required");
  }

  if (!deviceKeyId.trim()) {
    throw new RouteError(400, "deviceKeyId is required");
  }

  const db = getDb();
  const [pairingSession] = await db
    .select()
    .from(pairingSessions)
    .where(eq(pairingSessions.id, pairingId))
    .limit(1);

  if (!pairingSession) {
    throw new RouteError(404, "Pairing session not found");
  }

  if (pairingSession.expiresAt.getTime() < Date.now()) {
    throw new RouteError(410, "Pairing session has expired");
  }

  if (pairingSession.secretHash !== hashSecret(pairingSecret)) {
    throw new RouteError(401, "Invalid pairing secret");
  }

  const socket = getLocalServerSocket(pairingSession.serverId);
  if (!socket) {
    throw new RouteError(503, "Local server is offline");
  }

  const [server] = await db
    .select()
    .from(localServers)
    .where(eq(localServers.id, pairingSession.serverId))
    .limit(1);

  if (!server) {
    throw new RouteError(404, "Local server not found");
  }

  const { accessToken, device } = await issueMobileAccessToken(
    server.id,
    devicePublicKey,
    deviceKeyId,
    deviceName,
    platform,
  );

  await db
    .update(pairingSessions)
    .set({
      usedAt: new Date(),
      claimedDeviceId: device.id,
    })
    .where(eq(pairingSessions.id, pairingSession.id));

  return {
    accessToken,
    deviceId: device.id,
    serverId: server.id,
    serverName: server.name,
    serverPublicKey: pairingSession.serverPublicKey,
    serverKeyId: pairingSession.serverKeyId,
    fingerprint: pairingSession.fingerprint,
  };
}
