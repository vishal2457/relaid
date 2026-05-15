import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useProjects, type Project } from "@/src/lib/api/projects";
import {
  useProviders,
  type ActiveModel,
  flattenProvidersToModels,
  groupModelsByRuntime,
} from "@/src/lib/api/providers";
import { useAgents, type Agent } from "@/src/lib/api/agents";
import { useBranches, useSwitchBranch } from "@/src/lib/api/branches";
import { useGitFileStatus } from "@/src/lib/api/git";
import { getActiveSessionStream } from "@/src/lib/active-session-stream";

const LAST_SELECTED_PROJECT_ID = "LAST_SELECTED_PROJECT_ID";
const LAST_SELECTED_AGENT_BY_PROJECT = "LAST_SELECTED_AGENT_BY_PROJECT";
const LAST_SELECTED_AGENT_PROVIDER_ID = "LAST_SELECTED_AGENT_PROVIDER_ID";
const LAST_SELECTED_MODELS_BY_AGENT_PROVIDER =
  "LAST_SELECTED_MODELS_BY_AGENT_PROVIDER";
const LEGACY_LAST_SELECTED_MODEL = "LAST_SELECTED_MODEL";
const LEGACY_AGENT_SELECTION_KEY = "__legacy__";

type StoredModelPreference = {
  id?: string;
  agentProviderId: string;
  providerId: string;
  modelId: string;
};

type StoredAgentSelectionsByProject = Record<string, Record<string, string>>;

function toStoredModelPreference(model: ActiveModel): StoredModelPreference {
  return {
    id: model.id,
    agentProviderId: model.agentProviderId,
    providerId: model.providerId,
    modelId: model.modelId,
  };
}

function parseStoredModelPreferences(
  raw: string | null,
): Record<string, StoredModelPreference> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const preferences: Record<string, StoredModelPreference> = {};

    for (const [agentProviderId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object") {
        continue;
      }

      const candidate = value as Partial<StoredModelPreference>;
      const resolvedAgentProviderId =
        candidate.agentProviderId ?? agentProviderId;

      if (
        typeof resolvedAgentProviderId !== "string" ||
        !resolvedAgentProviderId ||
        typeof candidate.providerId !== "string" ||
        !candidate.providerId ||
        typeof candidate.modelId !== "string" ||
        !candidate.modelId
      ) {
        continue;
      }

      preferences[resolvedAgentProviderId] = {
        id: typeof candidate.id === "string" ? candidate.id : undefined,
        agentProviderId: resolvedAgentProviderId,
        providerId: candidate.providerId,
        modelId: candidate.modelId,
      };
    }

    return preferences;
  } catch {
    return {};
  }
}

function parseStoredAgentSelectionsByProject(
  raw: string | null,
): StoredAgentSelectionsByProject {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const selections: StoredAgentSelectionsByProject = {};

    for (const [projectId, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value) {
        selections[projectId] = {
          [LEGACY_AGENT_SELECTION_KEY]: value,
        };
        continue;
      }

      if (!value || typeof value !== "object") {
        continue;
      }

      const nextSelections: Record<string, string> = {};
      for (const [agentProviderId, agentName] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (typeof agentName === "string" && agentName) {
          nextSelections[agentProviderId] = agentName;
        }
      }

      if (Object.keys(nextSelections).length > 0) {
        selections[projectId] = nextSelections;
      }
    }

    return selections;
  } catch {
    return {};
  }
}

function findMatchingModel(
  models: ActiveModel[],
  preference?: StoredModelPreference | null,
): ActiveModel | null {
  if (!preference) {
    return null;
  }

  return (
    models.find(
      (model) =>
        (preference.id && model.id === preference.id) ||
        (model.agentProviderId === preference.agentProviderId &&
          model.providerId === preference.providerId &&
          model.modelId === preference.modelId),
    ) ?? null
  );
}

function resolveModelForAgentProvider(
  models: ActiveModel[],
  agentProviderId: string,
  preferences: Record<string, StoredModelPreference>,
  current: ActiveModel | null = null,
): ActiveModel | null {
  const providerModels = models.filter(
    (model) => model.agentProviderId === agentProviderId,
  );

  if (providerModels.length === 0) {
    return null;
  }

  if (
    current &&
    current.agentProviderId === agentProviderId &&
    providerModels.some((model) => model.id === current.id)
  ) {
    return current;
  }

  return (
    findMatchingModel(providerModels, preferences[agentProviderId]) ??
    providerModels[0]
  );
}

function normalizeSearchValue(value: string): string {
  return value.toLowerCase().trim();
}

function fuzzyScore(target: string, query: string): number {
  const normalizedTarget = normalizeSearchValue(target);
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return 0;
  }

  if (normalizedTarget === normalizedQuery) {
    return 500;
  }

  if (normalizedTarget.startsWith(normalizedQuery)) {
    return 300 - (normalizedTarget.length - normalizedQuery.length);
  }

  const substringIndex = normalizedTarget.indexOf(normalizedQuery);
  if (substringIndex >= 0) {
    return 220 - substringIndex;
  }

  let queryIndex = 0;
  let score = 0;
  let streak = 0;

  for (let i = 0; i < normalizedTarget.length; i += 1) {
    if (normalizedTarget[i] === normalizedQuery[queryIndex]) {
      queryIndex += 1;
      streak += 1;
      score += 12 + streak * 3;
      if (queryIndex === normalizedQuery.length) {
        return score;
      }
    } else {
      streak = 0;
    }
  }

  return -1;
}

function getModelSearchScore(model: ActiveModel, query: string): number {
  return Math.max(
    fuzzyScore(model.modelName, query),
    fuzzyScore(model.modelId, query),
    fuzzyScore(model.providerName, query),
    fuzzyScore(model.agentProviderName, query),
    fuzzyScore(
      `${model.agentProviderName} ${model.providerName} ${model.modelName}`,
      query,
    ),
  );
}

function getDefaultAgent(agents: Agent[]): Agent | null {
  if (agents.length === 0) {
    return null;
  }

  return (
    agents.find((agent) => agent.name === "general") ??
    agents.find((agent) => agent.mode !== "subagent") ??
    agents[0]
  );
}

export function getAgentSubtitle(agent: Agent): string {
  if (agent.model) {
    return `${agent.model.providerID} / ${agent.model.modelID}`;
  }

  return agent.builtIn ? "Built-in" : agent.mode;
}

export type HydrationDeps = {
  activeAgentProviderIdOverride?: string;
  isMountedRef: React.MutableRefObject<boolean>;
  allowSessionChangeRecoveryRef: React.MutableRefObject<boolean>;
  activeSessionIdRef: React.MutableRefObject<string | null>;
  pendingRequestIdsRef: React.MutableRefObject<Map<string, string>>;
  setActiveSessionId: (id: string | null) => void;
  setActiveSessionAgentProviderId?: (id: string | undefined) => void;
  setPendingRequestIds: (ids: Map<string, string>) => void;
  setOptimisticMessage: (msg: null) => void;
  resetStreamingContent: () => void;
};

export function useChatSession(deps: HydrationDeps) {
  const [activeProject, setActiveProject] = React.useState<Project | null>(
    null,
  );
  const [activeModel, setActiveModel] = React.useState<ActiveModel | null>(
    null,
  );
  const [activeAgent, setActiveAgent] = React.useState<Agent | null>(null);
  const [hydrated, setHydrated] = React.useState(false);
  const [selectionHydrated, setSelectionHydrated] = React.useState(false);
  const [selectedAgentProviderId, setSelectedAgentProviderId] = React.useState<
    string | undefined
  >(undefined);
  const [selectedModelsByProvider, setSelectedModelsByProvider] =
    React.useState<Record<string, StoredModelPreference>>({});
  const [modelSearchQuery, setModelSearchQuery] = React.useState("");
  const [agentSearchQuery, setAgentSearchQuery] = React.useState("");
  const [branchSearchQuery, setBranchSearchQuery] = React.useState("");
  const [showProjectSheet, setShowProjectSheet] = React.useState(false);
  const [showProviderSheet, setShowProviderSheet] = React.useState(false);
  const [showAgentSheet, setShowAgentSheet] = React.useState(false);
  const [showBranchSheet, setShowBranchSheet] = React.useState(false);

  const activeProjectRef = React.useRef<Project | null>(null);
  const projectsRef = React.useRef<Project[] | undefined>(undefined);

  const {
    data: projects,
    isLoading: projectsLoading,
    isRefetching: projectsRefetching,
    refetch: refetchProjects,
  } = useProjects();
  const { data: providers, isLoading: providersLoading } = useProviders();
  const allModels = React.useMemo(
    () => flattenProvidersToModels(providers ?? []),
    [providers],
  );
  const effectiveAgentProviderId =
    deps.activeAgentProviderIdOverride ?? selectedAgentProviderId;
  const { data: agents = [], isLoading: agentsLoading } = useAgents(
    activeProject?.id ?? "",
    effectiveAgentProviderId,
    Boolean(activeProject),
  );
  const { data: gitFileStatus } = useGitFileStatus(
    activeProject?.id ?? "",
    Boolean(activeProject),
  );
  const currentBranch = gitFileStatus?.branch ?? "main";
  const { data: branches, isLoading: branchesLoading } = useBranches(
    activeProject?.id ?? "",
    showBranchSheet && Boolean(activeProject),
  );
  const switchBranchMutation = useSwitchBranch(activeProject?.id ?? "");

  // Keep refs in sync
  React.useEffect(() => {
    activeProjectRef.current = activeProject;
  }, [activeProject]);

  React.useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  React.useEffect(() => {
    if (!projects || projects.length === 0) {
      setActiveProject(null);
      return;
    }

    setActiveProject((current) => {
      if (!current) {
        return current;
      }

      return projects.find((project) => project.id === current.id) ?? current;
    });
  }, [projects]);

  // Hydration: restore active project from storage or active stream
  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const activeStream = await getActiveSessionStream();
        if (cancelled || !deps.isMountedRef.current) {
          return;
        }

        if (activeStream && projects) {
          const streamingProject = projects.find(
            (project) => project.id === activeStream.projectId,
          );
          if (streamingProject) {
            deps.allowSessionChangeRecoveryRef.current = true;
            deps.activeSessionIdRef.current = activeStream.sessionId;
            const newPending = new Map<string, string>();
            newPending.set(activeStream.sessionId, activeStream.requestId);
            deps.pendingRequestIdsRef.current = newPending;
            setActiveProject(streamingProject);
            deps.setActiveSessionAgentProviderId?.(
              activeStream.agentProviderId,
            );
            deps.setActiveSessionId(activeStream.sessionId);
            deps.setPendingRequestIds(newPending);
            deps.setOptimisticMessage(null);
            deps.resetStreamingContent();
            return;
          }
        }

        const savedId = await AsyncStorage.getItem(LAST_SELECTED_PROJECT_ID);
        if (cancelled || !deps.isMountedRef.current) {
          return;
        }

        if (savedId) {
          if (projects) {
            const savedProject = projects.find((p) => p.id === savedId);
            if (savedProject) {
              setActiveProject(savedProject);
            }
          }
        } else if (projects && projects.length > 0) {
          setActiveProject(projects[0]);
        }
      } catch {
      } finally {
        if (!cancelled && deps.isMountedRef.current) {
          setHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  // Persist active project
  React.useEffect(() => {
    if (!hydrated) return;
    if (activeProject) {
      AsyncStorage.setItem(LAST_SELECTED_PROJECT_ID, activeProject.id).catch(
        () => {},
      );
    }
  }, [activeProject, hydrated]);

  // Restore agent from storage on project/agents change
  React.useEffect(() => {
    if (!hydrated || !activeProject || !effectiveAgentProviderId) {
      return;
    }

    void AsyncStorage.getItem(LAST_SELECTED_AGENT_BY_PROJECT)
      .then((raw) => {
        if (!raw || !deps.isMountedRef.current) {
          return;
        }

        const saved = parseStoredAgentSelectionsByProject(raw);
        const projectSelections = saved[activeProject.id];
        const savedAgentName =
          projectSelections?.[effectiveAgentProviderId] ??
          projectSelections?.[LEGACY_AGENT_SELECTION_KEY];
        if (!savedAgentName || agents.length === 0) {
          return;
        }

        const matchedAgent = agents.find(
          (agent) => agent.name === savedAgentName,
        );
        if (matchedAgent) {
          setActiveAgent((current: Agent | null) =>
            current?.name === matchedAgent.name ? current : matchedAgent,
          );
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject, agents, effectiveAgentProviderId, hydrated]);

  // Sync agent when agents list changes
  React.useEffect(() => {
    if (!agents.length) {
      setActiveAgent(null);
      return;
    }

    setActiveAgent((current: Agent | null) => {
      if (current) {
        const matched = agents.find((agent) => agent.name === current.name);
        if (matched) {
          return matched;
        }
      }

      return getDefaultAgent(agents);
    });
  }, [agents]);

  // Persist agent selection
  React.useEffect(() => {
    if (
      !hydrated ||
      !activeProject ||
      !activeAgent ||
      !effectiveAgentProviderId
    ) {
      return;
    }

    void AsyncStorage.getItem(LAST_SELECTED_AGENT_BY_PROJECT)
      .then((raw) => {
        const currentMap = parseStoredAgentSelectionsByProject(raw);
        currentMap[activeProject.id] = {
          ...(currentMap[activeProject.id] ?? {}),
          [effectiveAgentProviderId]: activeAgent.name,
        };
        return AsyncStorage.setItem(
          LAST_SELECTED_AGENT_BY_PROJECT,
          JSON.stringify(currentMap),
        );
      })
      .catch(() => {});
  }, [activeAgent, activeProject, effectiveAgentProviderId, hydrated]);

  React.useEffect(() => {
    if (!hydrated || selectionHydrated || !providers) return;

    let cancelled = false;

    void (async () => {
      try {
        const [savedAgentProviderId, savedModelsJson, legacyModelJson] =
          await Promise.all([
            AsyncStorage.getItem(LAST_SELECTED_AGENT_PROVIDER_ID),
            AsyncStorage.getItem(LAST_SELECTED_MODELS_BY_AGENT_PROVIDER),
            AsyncStorage.getItem(LEGACY_LAST_SELECTED_MODEL),
          ]);
        if (cancelled || !deps.isMountedRef.current) {
          return;
        }

        const nextSelectedModelsByProvider =
          parseStoredModelPreferences(savedModelsJson);

        if (legacyModelJson) {
          try {
            const legacyModel = JSON.parse(legacyModelJson) as ActiveModel;
            if (
              legacyModel &&
              typeof legacyModel.agentProviderId === "string" &&
              legacyModel.agentProviderId &&
              typeof legacyModel.providerId === "string" &&
              legacyModel.providerId &&
              typeof legacyModel.modelId === "string" &&
              legacyModel.modelId &&
              !nextSelectedModelsByProvider[legacyModel.agentProviderId]
            ) {
              nextSelectedModelsByProvider[legacyModel.agentProviderId] =
                toStoredModelPreference(legacyModel);
            }
          } catch {}
        }

        const availableAgentProviderIds = new Set(
          allModels.map((model) => model.agentProviderId),
        );
        const resolvedAgentProviderId =
          [
            savedAgentProviderId,
            ...Object.keys(nextSelectedModelsByProvider),
            allModels[0]?.agentProviderId,
          ].find(
            (candidate): candidate is string =>
              typeof candidate === "string" &&
              candidate.length > 0 &&
              availableAgentProviderIds.has(candidate),
          ) ?? undefined;

        setSelectedModelsByProvider(nextSelectedModelsByProvider);
        setSelectedAgentProviderId(resolvedAgentProviderId);
        setActiveModel(
          resolvedAgentProviderId
            ? resolveModelForAgentProvider(
                allModels,
                resolvedAgentProviderId,
                nextSelectedModelsByProvider,
              )
            : null,
        );
      } catch {
      } finally {
        if (!cancelled && deps.isMountedRef.current) {
          setSelectionHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [allModels, hydrated, providers, selectionHydrated, deps.isMountedRef]);

  React.useEffect(() => {
    if (!selectionHydrated) {
      return;
    }

    if (allModels.length === 0) {
      setActiveModel(null);
      setSelectedAgentProviderId(undefined);
      return;
    }

    setSelectedAgentProviderId((current) => {
      if (
        current &&
        allModels.some((model) => model.agentProviderId === current)
      ) {
        return current;
      }

      return allModels[0]?.agentProviderId;
    });
  }, [allModels, selectionHydrated]);

  React.useEffect(() => {
    if (!selectionHydrated || !selectedAgentProviderId) {
      return;
    }

    setActiveModel((current) =>
      resolveModelForAgentProvider(
        allModels,
        selectedAgentProviderId,
        selectedModelsByProvider,
        current,
      ),
    );
  }, [
    allModels,
    selectedAgentProviderId,
    selectedModelsByProvider,
    selectionHydrated,
  ]);

  React.useEffect(() => {
    if (!selectionHydrated || !activeModel) {
      return;
    }

    setSelectedModelsByProvider((current) => {
      const nextPreference = toStoredModelPreference(activeModel);
      const existing = current[activeModel.agentProviderId];

      if (
        existing?.id === nextPreference.id &&
        existing.providerId === nextPreference.providerId &&
        existing.modelId === nextPreference.modelId
      ) {
        return current;
      }

      return {
        ...current,
        [activeModel.agentProviderId]: nextPreference,
      };
    });
  }, [activeModel, selectionHydrated]);

  React.useEffect(() => {
    if (!hydrated || !selectionHydrated) {
      return;
    }

    if (selectedAgentProviderId) {
      AsyncStorage.setItem(
        LAST_SELECTED_AGENT_PROVIDER_ID,
        selectedAgentProviderId,
      ).catch(() => {});
      return;
    }

    AsyncStorage.removeItem(LAST_SELECTED_AGENT_PROVIDER_ID).catch(() => {});
  }, [hydrated, selectedAgentProviderId, selectionHydrated]);

  React.useEffect(() => {
    if (!hydrated || !selectionHydrated) {
      return;
    }

    AsyncStorage.setItem(
      LAST_SELECTED_MODELS_BY_AGENT_PROVIDER,
      JSON.stringify(selectedModelsByProvider),
    ).catch(() => {});
  }, [hydrated, selectedModelsByProvider, selectionHydrated]);

  const ensureModelForAgentProvider = React.useCallback(
    (agentProviderId: string) => {
      setActiveModel((current) =>
        resolveModelForAgentProvider(
          allModels,
          agentProviderId,
          selectedModelsByProvider,
          current,
        ),
      );
    },
    [allModels, selectedModelsByProvider],
  );

  const handleSelectAgentProvider = React.useCallback(
    (agentProviderId: string) => {
      setSelectedAgentProviderId(agentProviderId);
      setActiveAgent(null);
      setActiveModel((current) =>
        resolveModelForAgentProvider(
          allModels,
          agentProviderId,
          selectedModelsByProvider,
          current,
        ),
      );
    },
    [allModels, selectedModelsByProvider],
  );

  // Sorted/filtered lists
  const sortedModels = React.useMemo(() => {
    const normalizedQuery = normalizeSearchValue(modelSearchQuery);

    const filtered = normalizedQuery
      ? allModels
          .map((model) => ({
            model,
            score: getModelSearchScore(model, normalizedQuery),
          }))
          .filter((entry) => entry.score >= 0)
          .sort((a, b) => {
            if (b.score !== a.score) {
              return b.score - a.score;
            }
            return a.model.name.localeCompare(b.model.name);
          })
          .map((entry) => entry.model)
      : allModels;

    if (!activeModel) {
      return filtered;
    }

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (a.id === activeModel.id) return -1;
      if (b.id === activeModel.id) return 1;
      return 0;
    });
    return sorted;
  }, [allModels, activeModel, modelSearchQuery]);

  const sortedModelGroups = React.useMemo(
    () => groupModelsByRuntime(sortedModels),
    [sortedModels],
  );

  const sortedProjects = React.useMemo(() => {
    if (!activeProject) return projects ?? [];
    const sorted = [...(projects ?? [])];
    sorted.sort((a, b) =>
      a.id === activeProject.id ? -1 : b.id === activeProject.id ? 1 : 0,
    );
    return sorted;
  }, [projects, activeProject]);

  const sortedAgents = React.useMemo(() => {
    const normalizedQuery = normalizeSearchValue(agentSearchQuery);
    const filtered = normalizedQuery
      ? agents.filter((agent) => {
          const haystacks = [
            agent.name,
            agent.description ?? "",
            agent.model?.providerID ?? "",
            agent.model?.modelID ?? "",
          ];
          return haystacks.some((value) =>
            normalizeSearchValue(value).includes(normalizedQuery),
          );
        })
      : agents;

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (a.name === activeAgent?.name) return -1;
      if (b.name === activeAgent?.name) return 1;
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [activeAgent?.name, agentSearchQuery, agents]);

  const sortedBranches = React.useMemo(() => {
    const normalizedQuery = branchSearchQuery.toLowerCase().trim();
    let filtered = branches ?? [];
    if (normalizedQuery) {
      filtered = filtered.filter((b) =>
        b.name.toLowerCase().includes(normalizedQuery),
      );
    }
    filtered.sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      return a.name.localeCompare(b.name);
    });
    return filtered;
  }, [branches, branchSearchQuery]);

  // Stable callbacks for sheet open/close
  const handleCloseProjectSheet = React.useCallback(
    () => setShowProjectSheet(false),
    [],
  );
  const handleOpenProjectSheet = React.useCallback(
    () => setShowProjectSheet(true),
    [],
  );
  const handleCloseProviderSheet = React.useCallback(() => {
    setShowProviderSheet(false);
    setModelSearchQuery("");
  }, []);
  const handleOpenProviderSheet = React.useCallback(
    () => setShowProviderSheet(true),
    [],
  );
  const handleCloseAgentSheet = React.useCallback(() => {
    setShowAgentSheet(false);
    setAgentSearchQuery("");
  }, []);
  const handleOpenAgentSheet = React.useCallback(
    () => setShowAgentSheet(true),
    [],
  );
  const handleCloseBranchSheet = React.useCallback(() => {
    setShowBranchSheet(false);
    setBranchSearchQuery("");
  }, []);
  const handleOpenBranchSheet = React.useCallback(
    () => setShowBranchSheet(true),
    [],
  );

  const handleSelectModel = React.useCallback((item: ActiveModel) => {
    setSelectedAgentProviderId(item.agentProviderId);
    setActiveModel(item);
    setShowProviderSheet(false);
    setModelSearchQuery("");
  }, []);

  const handleSelectAgent = React.useCallback((item: Agent) => {
    setActiveAgent(item);
    setShowAgentSheet(false);
    setAgentSearchQuery("");
  }, []);

  return {
    // State
    activeProject,
    setActiveProject,
    activeModel,
    selectedAgentProviderId,
    activeAgent,
    hydrated,
    // Refs
    activeProjectRef,
    projectsRef,
    // Data
    projects,
    projectsLoading,
    projectsRefetching,
    refetchProjects,
    providers,
    providersLoading,
    agents,
    agentsLoading,
    currentBranch,
    branches,
    branchesLoading,
    switchBranchMutation,
    // Sorted lists
    sortedModels,
    sortedModelGroups,
    sortedProjects,
    sortedAgents,
    sortedBranches,
    // Sheet visibility
    showProjectSheet,
    showProviderSheet,
    showAgentSheet,
    showBranchSheet,
    // Search queries
    modelSearchQuery,
    setModelSearchQuery,
    agentSearchQuery,
    setAgentSearchQuery,
    branchSearchQuery,
    setBranchSearchQuery,
    // Sheet handlers
    handleCloseProjectSheet,
    handleOpenProjectSheet,
    handleCloseProviderSheet,
    handleOpenProviderSheet,
    handleSelectAgentProvider,
    handleCloseAgentSheet,
    handleOpenAgentSheet,
    handleCloseBranchSheet,
    handleOpenBranchSheet,
    ensureModelForAgentProvider,
    handleSelectModel,
    handleSelectAgent,
  };
}
