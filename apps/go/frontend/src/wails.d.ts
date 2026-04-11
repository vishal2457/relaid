declare module "../../wailsjs/go/main/App" {
  export function GetStoredRelayURL(): Promise<string>;
  export function StoreRelayURL(url: string): Promise<void>;
  export function PingRelay(): Promise<boolean>;
  export function CreatePairingSession(): Promise<{
    pairingId: string;
    pairingSecret: string;
    pairingUrl: string;
    expiresAt: string;
    pairedDeviceCount: number;
    serverId: string;
    serverName: string;
  }>;
  export function GetDeviceCredentials(): Promise<{
    serverId: string;
    serverSecret: string;
  }>;
}
