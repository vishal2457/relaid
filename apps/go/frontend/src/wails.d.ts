declare module "../../wailsjs/go/main/App" {
  export function GetStoredRelayURL(): Promise<string>;
  export function StoreRelayURL(url: string): Promise<void>;
  export function PingRelay(): Promise<boolean>;
  export function GetDesktopStatus(): Promise<{
    server: {
      baseUrl: string;
      healthy: boolean;
    };
    node: {
      found: boolean;
      compatible: boolean;
      source: "system" | "managed" | "none";
      version: string;
      binaryPath: string;
      installPath: string;
      state:
        | "not_found"
        | "incompatible"
        | "ready"
        | "downloading"
        | "installing"
        | "failed";
      error?: string;
    };
    bridge: {
      installed: boolean;
      running: boolean;
      state: "stopped" | "starting" | "running" | "failed";
      pid?: number;
      entrypoint: string;
      error?: string;
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
    claude: {
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
  export function GetNodeRuntimeStatus(): Promise<{
    found: boolean;
    compatible: boolean;
    source: "system" | "managed" | "none";
    version: string;
    binaryPath: string;
    installPath: string;
    state:
      | "not_found"
      | "incompatible"
      | "ready"
      | "downloading"
      | "installing"
      | "failed";
    error?: string;
  }>;
  export function DownloadNodeRuntime(version: string): Promise<{
    found: boolean;
    compatible: boolean;
    source: "system" | "managed" | "none";
    version: string;
    binaryPath: string;
    installPath: string;
    state:
      | "not_found"
      | "incompatible"
      | "ready"
      | "downloading"
      | "installing"
      | "failed";
    error?: string;
  }>;
  export function GetBridgeStatus(): Promise<{
    installed: boolean;
    running: boolean;
    state: "stopped" | "starting" | "running" | "failed";
    pid?: number;
    entrypoint: string;
    error?: string;
  }>;
  export function StartBridge(): Promise<{
    installed: boolean;
    running: boolean;
    state: "stopped" | "starting" | "running" | "failed";
    pid?: number;
    entrypoint: string;
    error?: string;
  }>;
  export function StopBridge(): Promise<{
    installed: boolean;
    running: boolean;
    state: "stopped" | "starting" | "running" | "failed";
    pid?: number;
    entrypoint: string;
    error?: string;
  }>;
}
