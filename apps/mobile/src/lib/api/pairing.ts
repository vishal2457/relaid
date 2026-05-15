import baseApi from "../axios/base";

export type PairingClaimResponse = {
  accessToken: string;
  deviceId: string;
  serverId: string;
  serverName: string;
  serverPublicKey: string;
  serverKeyId: string;
  fingerprint: string;
};

export async function claimPairingSession(
  payload: {
    pairingId: string;
    pairingSecret: string;
    devicePublicKey: string;
    deviceKeyId: string;
    deviceName?: string;
    platform: string;
  },
): Promise<PairingClaimResponse> {
  const response = await baseApi.post<PairingClaimResponse>(`/pairing/claim`, payload);
  const data = response.data as PairingClaimResponse;
  return data;
}
