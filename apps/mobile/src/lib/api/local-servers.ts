import { useQuery } from "@tanstack/react-query";
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

export const localServersKeys = {
  all: ["local-servers"] as const,
  connected: () => [...localServersKeys.all, "connected"] as const,
};

export async function getConnectedLocalServers(): Promise<ConnectedLocalServer[]> {
  const response = await baseApi.get<ConnectedLocalServersResponse>(
    "/local-servers/connected",
    { timeout: 8000, suppressErrorToast: true },
  );

  return response.data.servers;
}

export function useConnectedLocalServers(enabled = true) {
  return useQuery<ConnectedLocalServer[]>({
    queryKey: localServersKeys.connected(),
    enabled,
    queryFn: getConnectedLocalServers,
  });
}
