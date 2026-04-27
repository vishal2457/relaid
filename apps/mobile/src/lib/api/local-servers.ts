import baseApi from "../axios/base";

export type ConnectedLocalServer = {
  id: string;
  name: string;
  isConnected: boolean;
  lastConnected: string | null;
  createdAt: string;
};

type ConnectedLocalServersResponse = {
  servers: ConnectedLocalServer[];
};

export async function getConnectedLocalServers(): Promise<ConnectedLocalServer[]> {
  const response = await baseApi.get<ConnectedLocalServersResponse>(
    "/local-servers/connected",
    { timeout: 8000 },
  );

  return response.data.servers;
}
