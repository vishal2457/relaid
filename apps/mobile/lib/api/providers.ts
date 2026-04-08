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

export type ActiveModel = {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
};

export function flattenProvidersToModels(providers: Provider[]): ActiveModel[] {
  const models = providers.flatMap((provider) =>
    (provider.models ?? []).map((model) => ({
      id: model.id,
      name: model.name,
      providerId: provider.id,
      providerName: provider.name,
    })),
  );
  return Array.from(new Map(models.map((model) => [model.id, model])).values());
}

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
