export namespace main {
	
	export class DesktopAgent {
	    name: string;
	    description?: string;
	    mode?: string;
	    hidden: boolean;
	    tools: string[];
	
	    static createFrom(source: any = {}) {
	        return new DesktopAgent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.mode = source["mode"];
	        this.hidden = source["hidden"];
	        this.tools = source["tools"];
	    }
	}
	export class DesktopProvider {
	    id: string;
	    name: string;
	    modelCount: number;
	    models: string[];
	
	    static createFrom(source: any = {}) {
	        return new DesktopProvider(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.modelCount = source["modelCount"];
	        this.models = source["models"];
	    }
	}
	export class DesktopCodexStatus {
	    available: boolean;
	    connected: boolean;
	    statusMessage?: string;
	    providers: DesktopProvider[];
	    agents: DesktopAgent[];
	    availableTools: string[];
	    errors?: string[];
	
	    static createFrom(source: any = {}) {
	        return new DesktopCodexStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.available = source["available"];
	        this.connected = source["connected"];
	        this.statusMessage = source["statusMessage"];
	        this.providers = this.convertValues(source["providers"], DesktopProvider);
	        this.agents = this.convertValues(source["agents"], DesktopAgent);
	        this.availableTools = source["availableTools"];
	        this.errors = source["errors"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DesktopOpencodeStatus {
	    available: boolean;
	    connected: boolean;
	    statusMessage?: string;
	    providers: DesktopProvider[];
	    agents: DesktopAgent[];
	    availableTools: string[];
	    errors?: string[];
	
	    static createFrom(source: any = {}) {
	        return new DesktopOpencodeStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.available = source["available"];
	        this.connected = source["connected"];
	        this.statusMessage = source["statusMessage"];
	        this.providers = this.convertValues(source["providers"], DesktopProvider);
	        this.agents = this.convertValues(source["agents"], DesktopAgent);
	        this.availableTools = source["availableTools"];
	        this.errors = source["errors"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class DesktopServerStatus {
	    baseUrl: string;
	    healthy: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DesktopServerStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.baseUrl = source["baseUrl"];
	        this.healthy = source["healthy"];
	    }
	}
	export class DesktopStatusPayload {
	    server: DesktopServerStatus;
	    opencode: DesktopOpencodeStatus;
	    codex: DesktopCodexStatus;
	
	    static createFrom(source: any = {}) {
	        return new DesktopStatusPayload(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.server = this.convertValues(source["server"], DesktopServerStatus);
	        this.opencode = this.convertValues(source["opencode"], DesktopOpencodeStatus);
	        this.codex = this.convertValues(source["codex"], DesktopCodexStatus);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class WorkspacePayload {
	    id: string;
	    name: string;
	    description?: string;
	    directory: string;
	    createdAt: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new WorkspacePayload(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.directory = source["directory"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}

}

export namespace relay {
	
	export class DeviceCredentials {
	    serverId: string;
	    serverSecret: string;
	
	    static createFrom(source: any = {}) {
	        return new DeviceCredentials(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverId = source["serverId"];
	        this.serverSecret = source["serverSecret"];
	    }
	}
	export class MobileClient {
	    connectionId: string;
	
	    static createFrom(source: any = {}) {
	        return new MobileClient(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connectionId = source["connectionId"];
	    }
	}
	export class PairingSessionResponse {
	    pairingId: string;
	    pairingSecret: string;
	    pairingUrl: string;
	    expiresAt: string;
	    pairedDeviceCount: number;
	    serverId: string;
	    serverName: string;
	
	    static createFrom(source: any = {}) {
	        return new PairingSessionResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pairingId = source["pairingId"];
	        this.pairingSecret = source["pairingSecret"];
	        this.pairingUrl = source["pairingUrl"];
	        this.expiresAt = source["expiresAt"];
	        this.pairedDeviceCount = source["pairedDeviceCount"];
	        this.serverId = source["serverId"];
	        this.serverName = source["serverName"];
	    }
	}

}

export namespace services {
	
	export class UpdateResponse {
	    isUpdateAvailable: boolean;
	    downloadUrl: string;
	    fileName: string;
	    currentVersion: string;
	    latestVersion: string;
	    releaseTag: string;
	    target: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.isUpdateAvailable = source["isUpdateAvailable"];
	        this.downloadUrl = source["downloadUrl"];
	        this.fileName = source["fileName"];
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.releaseTag = source["releaseTag"];
	        this.target = source["target"];
	        this.error = source["error"];
	    }
	}

}

