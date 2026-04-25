import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useProjects,
  type Project,
} from "@/src/lib/api/projects";
import {
  useProviders,
  type ActiveModel,
  flattenProvidersToModels,
} from "@/src/lib/api/providers";
import { useAgents, type Agent } from "@/src/lib/api/agents";
import { useBranches, useSwitchBranch } from "@/src/lib/api/branches";
import { useGitFileStatus } from "@/src/lib/api/git";
import {
  getActiveSessionStream,
} from "@/src/lib/active-session-stream";

const LAST_SELECTED_PROJECT_ID = "LAST_SELECTED_PROJECT_ID";
const LAST_SELECTED_MODEL = "LAST_SELECTED_MODEL";
const LAST_SELECTED_AGENT_BY_PROJECT = "LAST_SELECTED_AGENT_BY_PROJECT";

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
    fuzzyScore(model.name, query),
    fuzzyScore(model.id, query),
    fuzzyScore(model.providerName, query),
    fuzzyScore(`${model.providerName} ${model.name}`, query),
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
  isMountedRef: React.MutableRefObject<boolean>;
  allowSessionChangeRecoveryRef: React.MutableRefObject<boolean>;
  activeSessionIdRef: React.MutableRefObject<string | null>;
  pendingRequestIdsRef: React.MutableRefObject<Map<string, string>>;
  setActiveSessionId: (id: string | null) => void;
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
  const [modelSearchQuery, setModelSearchQuery] = React.useState("");
  const [agentSearchQuery, setAgentSearchQuery] = React.useState("");
  const [branchSearchQuery, setBranchSearchQuery] = React.useState("");
  const [showProjectSheet, setShowProjectSheet] = React.useState(false);
  const [showProviderSheet, setShowProviderSheet] = React.useState(false);
  const [showAgentSheet, setShowAgentSheet] = React.useState(false);
  const [showBranchSheet, setShowBranchSheet] = React.useState(false);

  const activeProjectRef = React.useRef<Project | null>(null);
  const projectsRef = React.useRef<Project[] | undefined>(undefined);

  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: providers, isLoading: providersLoading } = useProviders();
  const { data: agents = [], isLoading: agentsLoading } = useAgents(
    activeProject?.id ?? "",
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

  // Persist active model
  React.useEffect(() => {
    if (!hydrated) return;
    if (activeModel) {
      AsyncStorage.setItem(
        LAST_SELECTED_MODEL,
        JSON.stringify(activeModel),
      ).catch(() => {});
    }
  }, [activeModel, hydrated]);

  // Restore agent from storage on project/agents change
  React.useEffect(() => {
    if (!hydrated || !activeProject) {
      return;
    }

    void AsyncStorage.getItem(LAST_SELECTED_AGENT_BY_PROJECT)
      .then((raw) => {
        if (!raw || !deps.isMountedRef.current) {
          return;
        }

        const saved = JSON.parse(raw) as Record<string, string>;
        const savedAgentName = saved[activeProject.id];
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
  }, [activeProject, agents, hydrated]);

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
    if (!hydrated || !activeProject || !activeAgent) {
      return;
    }

    void AsyncStorage.getItem(LAST_SELECTED_AGENT_BY_PROJECT)
      .then((raw) => {
        const currentMap = raw
          ? (JSON.parse(raw) as Record<string, string>)
          : {};
        currentMap[activeProject.id] = activeAgent.name;
        return AsyncStorage.setItem(
          LAST_SELECTED_AGENT_BY_PROJECT,
          JSON.stringify(currentMap),
        );
      })
      .catch(() => {});
  }, [activeAgent, activeProject, hydrated]);

  // Restore model from storage
  React.useEffect(() => {
    if (!hydrated || !providers) return;

    (async () => {
      try {
        const savedModelJson = await AsyncStorage.getItem(LAST_SELECTED_MODEL);
        if (savedModelJson) {
          const savedModel = JSON.parse(savedModelJson) as ActiveModel;
          const modelExists = providers.some(
            (p) =>
              p.id === savedModel.providerId &&
              p.models.some((m) => m.id === savedModel.id),
          );
          if (modelExists) {
            setActiveModel(savedModel);
          }
        }
      } catch {}
    })();
  }, [hydrated, providers]);

  // Sorted/filtered lists
  const sortedModels = React.useMemo(() => {
    const models = flattenProvidersToModels(providers ?? []);
    const normalizedQuery = normalizeSearchValue(modelSearchQuery);

    const filtered = normalizedQuery
      ? models
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
      : models;

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
  }, [providers, activeModel, modelSearchQuery]);

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

  const handleSelectModel = React.useCallback(
    (item: ActiveModel) => {
      setActiveModel(item);
      setShowProviderSheet(false);
      setModelSearchQuery("");
    },
    [],
  );

  const handleSelectAgent = React.useCallback(
    (item: Agent) => {
      setActiveAgent(item);
      setShowAgentSheet(false);
      setAgentSearchQuery("");
    },
    [],
  );

  return {
    // State
    activeProject,
    setActiveProject,
    activeModel,
    setActiveModel,
    activeAgent,
    setActiveAgent,
    hydrated,
    // Refs
    activeProjectRef,
    projectsRef,
    // Data
    projects,
    projectsLoading,
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
    handleCloseAgentSheet,
    handleOpenAgentSheet,
    handleCloseBranchSheet,
    handleOpenBranchSheet,
    handleSelectModel,
    handleSelectAgent,
  };
}
