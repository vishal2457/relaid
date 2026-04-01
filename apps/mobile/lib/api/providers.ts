import { useQuery } from "@tanstack/react-query";
import baseApi from "../axios/base";

export type ProviderModel = {
  id: string;
  name: string;
};

export type Provider = {
  id: string;
  name: string;
  models: ProviderModel[];
};

export const providersKeys = {
  all: ["providers"] as const,
  lists: () => [...providersKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...providersKeys.lists(), filters] as const,
  details: () => [...providersKeys.all, "detail"] as const,
  detail: (id: string) => [...providersKeys.details(), id] as const,
};

export function useProviders() {
  return useQuery<Provider[]>({
    queryKey: providersKeys.lists(),
    queryFn: async () => {
      const response = await baseApi.get<{ providers: Provider[] }>(
        "/providers",
      );
      return response.data.providers ?? [];
    },
  });
}
