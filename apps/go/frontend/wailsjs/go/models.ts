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

