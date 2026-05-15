export type ParsedPairingUrl = {
  relayUrl: string;
  pairingId: string;
  pairingSecret: string;
  serverId?: string;
  serverName?: string;
  expiresAt?: string;
  serverPublicKey?: string;
  serverKeyId?: string;
  fingerprint?: string;
};

export function parsePairingUrl(value: string): ParsedPairingUrl {
  const url = new URL(value.trim());

  if (url.protocol !== "relaid:") {
    throw new Error("Unsupported QR code");
  }

  const relayUrl = url.searchParams.get("relayUrl")?.trim();
  const pairingId = url.searchParams.get("pairingId")?.trim();
  const pairingSecret = url.searchParams.get("pairingSecret")?.trim();

  if (!relayUrl || !pairingId || !pairingSecret) {
    throw new Error("Invalid pairing QR code");
  }

  return {
    relayUrl: relayUrl.replace(/\/+$/, ""),
    pairingId,
    pairingSecret,
    serverId: url.searchParams.get("serverId")?.trim() || undefined,
    serverName: url.searchParams.get("serverName")?.trim() || undefined,
    expiresAt: url.searchParams.get("expiresAt")?.trim() || undefined,
    serverPublicKey:
      url.searchParams.get("serverPublicKey")?.trim() || undefined,
    serverKeyId: url.searchParams.get("serverKeyId")?.trim() || undefined,
    fingerprint: url.searchParams.get("fingerprint")?.trim() || undefined,
  };
}
