import { useQuery } from "@tanstack/react-query";
import baseApi from "../axios/base";

export type ProviderModel = {
  id: string;
  name: string;
  agentProviderId?: string;
  agentProviderName?: string;
  providerId?: string;
  providerName?: string;
  modelId?: string;
  modelName?: string;
};

export type Provider = {
  id: string;
  name: string;
  agentProviderId?: string;
  agentProviderName?: string;
  providerId?: string;
  providerName?: string;
  models: ProviderModel[];
};

export type ActiveModel = {
  id: string;
  agentProviderId: string;
  agentProviderName: string;
  providerName: string;
  providerId: string;
  modelId: string;
  modelName: string;
  name: string;
};

export type ModelGroup = {
  agentProviderId: string;
  agentProviderName: string;
  models: ActiveModel[];
};

export type ProviderApp = {
  id: string;
  name: string;
  description: string;
  isAccessible: boolean;
  isEnabled: boolean;
  labels?: string[];
};

export function flattenProvidersToModels(providers: Provider[]): ActiveModel[] {
  const models = providers.flatMap((provider) =>
    (provider.models ?? []).map((model) => {
      const agentProviderId =
        model.agentProviderId ?? provider.agentProviderId ?? "opencode";
      const agentProviderName =
        model.agentProviderName ??
        provider.agentProviderName ??
        agentProviderId;
      const providerId = model.providerId ?? provider.providerId ?? provider.id;
      const providerName =
        model.providerName ?? provider.providerName ?? provider.name;
      const modelId = model.modelId ?? model.id;
      const modelName = model.modelName ?? model.name;

      return {
        id: `${agentProviderId}:${providerId}:${modelId}`,
        agentProviderId,
        agentProviderName,
        providerId,
        providerName,
        modelId,
        modelName,
        name: modelName,
      };
    }),
  );
  return Array.from(new Map(models.map((model) => [model.id, model])).values());
}

export function groupModelsByRuntime(models: ActiveModel[]): ModelGroup[] {
  const groups = new Map<string, ModelGroup>();
  for (const model of models) {
    const existing = groups.get(model.agentProviderId);
    if (existing) {
      existing.models.push(model);
    } else {
      groups.set(model.agentProviderId, {
        agentProviderId: model.agentProviderId,
        agentProviderName: model.agentProviderName,
        models: [model],
      });
    }
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    models: group.models.sort((a, b) => {
      const providerCompare = a.providerName.localeCompare(b.providerName);
      if (providerCompare !== 0) return providerCompare;
      return a.modelName.localeCompare(b.modelName);
    }),
  }));
}

export const providersKeys = {
  all: ["providers"] as const,
  lists: () => [...providersKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...providersKeys.lists(), filters] as const,
  details: () => [...providersKeys.all, "detail"] as const,
  detail: (id: string) => [...providersKeys.details(), id] as const,
  apps: () => [...providersKeys.all, "apps"] as const,
  appList: (providerId: string, sessionId?: string) =>
    [...providersKeys.apps(), providerId, sessionId ?? ""] as const,
};

export function useProviders() {
  return useQuery<Provider[]>({
    queryKey: providersKeys.lists(),
    queryFn: async () => {
      const response = await baseApi.get<{ providers: Provider[] }>(
        "/providers",
        { suppressErrorToast: true },
      );
      return response.data.providers ?? [];
    },
  });
}

export function useProviderApps(
  providerId: string,
  sessionId?: string,
  projectId?: string,
  enabled = true,
) {
  return useQuery<ProviderApp[]>({
    queryKey: [...providersKeys.appList(providerId, sessionId), projectId ?? ""],
    enabled: Boolean(providerId) && enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const response = await baseApi.get<{ apps: ProviderApp[] }>(
        `/providers/${providerId}/apps`,
        {
          params: {
            ...(sessionId ? { sessionId } : undefined),
            ...(projectId ? { projectId } : undefined),
            limit: 100,
          },
          suppressErrorToast: true,
        },
      );
      return response.data.apps ?? [];
    },
  });
}
