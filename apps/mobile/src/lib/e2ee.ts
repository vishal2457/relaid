import "react-native-get-random-values";
import { Buffer } from "buffer";
import nacl from "tweetnacl";
import type { PairingSession } from "./pairing/session";

export type EncryptedEnvelope = {
  version: "v1";
  senderDeviceId?: string;
  recipientServerId?: string;
  nonce: string;
  ciphertext: string;
};

export type GeneratedDeviceKeyPair = {
  devicePublicKey: string;
  devicePrivateKey: string;
  deviceKeyId: string;
};

type PairingCryptoContext = Pick<
  PairingSession,
  "deviceId" | "serverId" | "serverPublicKey" | "devicePrivateKey"
>;

function toBase64(value: Uint8Array): string {
  return Buffer.from(value).toString("base64");
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function toUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function fromUtf8(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

function getKeyId(publicKey: Uint8Array): string {
  return Buffer.from(publicKey).toString("hex").slice(0, 16);
}

function getContext(session: PairingCryptoContext): {
  devicePublicKey?: string;
  devicePrivateKey: Uint8Array;
  serverPublicKey: Uint8Array;
} {
  if (!session.devicePrivateKey) {
    throw new Error("Missing device private key");
  }

  if (!session.serverPublicKey) {
    throw new Error("Missing server public key");
  }

  const devicePrivateKey = fromBase64(session.devicePrivateKey);
  const serverPublicKey = fromBase64(session.serverPublicKey);

  if (devicePrivateKey.length !== nacl.box.secretKeyLength) {
    throw new Error("Invalid device private key");
  }

  if (serverPublicKey.length !== nacl.box.publicKeyLength) {
    throw new Error("Invalid server public key");
  }

  return {
    devicePrivateKey,
    serverPublicKey,
  };
}

export function generateDeviceKeyPair(): GeneratedDeviceKeyPair {
  const pair = nacl.box.keyPair();
  return {
    devicePublicKey: toBase64(pair.publicKey),
    devicePrivateKey: toBase64(pair.secretKey),
    deviceKeyId: getKeyId(pair.publicKey),
  };
}

export function encryptForServer(
  session: PairingCryptoContext,
  payload: unknown,
): EncryptedEnvelope {
  const { devicePrivateKey, serverPublicKey } = getContext(session);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const message = toUtf8(JSON.stringify(payload));
  const boxed = nacl.box(message, nonce, serverPublicKey, devicePrivateKey);

  return {
    version: "v1",
    senderDeviceId: session.deviceId,
    recipientServerId: session.serverId,
    nonce: toBase64(nonce),
    ciphertext: toBase64(boxed),
  };
}

export function decryptFromServer<T>(
  session: PairingCryptoContext,
  envelope: EncryptedEnvelope,
): T {
  const { devicePrivateKey, serverPublicKey } = getContext(session);
  const opened = nacl.box.open(
    fromBase64(envelope.ciphertext),
    fromBase64(envelope.nonce),
    serverPublicKey,
    devicePrivateKey,
  );

  if (!opened) {
    throw new Error("Failed to decrypt relay payload");
  }

  return JSON.parse(fromUtf8(opened)) as T;
}
