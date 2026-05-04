declare module "../../wailsjs/go/main/App" {
  export function GetStoredRelayURL(): Promise<string>;
  export function StoreRelayURL(url: string): Promise<void>;
  export function PingRelay(): Promise<boolean>;
  export function GetDesktopStatus(): Promise<{
    server: {
      baseUrl: string;
      healthy: boolean;
    };
    opencode: {
      available: boolean;
      connected: boolean;
      statusMessage?: string;
      providers: Array<{
        id: string;
        name: string;
        modelCount: number;
        models: string[];
      }>;
      agents: Array<{
        name: string;
        description?: string;
        mode?: string;
        hidden: boolean;
        tools: string[];
      }>;
      availableTools: string[];
      errors?: string[];
    };
    codex: {
      available: boolean;
      connected: boolean;
      statusMessage?: string;
      providers: Array<{
        id: string;
        name: string;
        modelCount: number;
        models: string[];
      }>;
      agents: Array<{
        name: string;
        description?: string;
        mode?: string;
        hidden: boolean;
        tools: string[];
      }>;
      availableTools: string[];
      errors?: string[];
    };
  }>;
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
