export namespace main {
	
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

