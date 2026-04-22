import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Alert,
  AppState,
  FlatList,
  Keyboard,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  TextInputSelectionChangeEventData,
  View,
  type AppStateStatus,
  type FlatList as FlatListType,
  type KeyboardEvent,
  type LayoutChangeEvent,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ChatComposer,
  COMPOSER_BOTTOM_PADDING,
  COMPOSER_TOP_PADDING,
  KEYBOARD_ADDITIONAL_PADDING,
  MAX_INPUT_HEIGHT,
  MIN_INPUT_HEIGHT,
} from "@/src/components/ChatComposer";
import { SessionDrawer } from "@/src/components/SessionDrawer";
import { ProjectSelectionSheet } from "@/src/components/BottomModals/ProjectSelectionSheet";
import { ModelSelectionSheet } from "@/src/components/BottomModals/ModelSelectionSheet";
import { AgentSelectionSheet } from "@/src/components/BottomModals/AgentSelectionSheet";
import { BranchSelectionSheet } from "@/src/components/BottomModals/BranchSelectionSheet";
import { Stack } from "expo-router";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import {
  messageKeys,
  useSessionMessages,
  type SessionMessage,
} from "@/src/lib/api/messages";
import {
  clearActiveSessionStream,
  FOLLOW_UP_SESSION_REFRESH_DELAY_MS,
  getActiveSessionStream,
  isStreamingSessionStatus,
  saveActiveSessionStream,
  shouldScheduleSessionRefresh,
} from "@/src/lib/active-session-stream";
import { useLiveAssistantStream } from "@/src/lib/live-assistant-stream";
import {
  useProjectFileSearch,
  useProjects,
  type Project,
  type ProjectFileMatch,
} from "@/src/lib/api/projects";
import { useProjectSkills, type Skill } from "@/src/lib/api/skills";
import { useAgents, type Agent } from "@/src/lib/api/agents";
import { useBranches, useSwitchBranch } from "@/src/lib/api/branches";
import {
  useProviders,
  type ActiveModel,
  flattenProvidersToModels,
} from "@/src/lib/api/providers";
import {
  sessionsKeys,
  useCreateSession,
  useSession,
} from "@/src/lib/api/sessions";
import { queryClient } from "@/src/lib/query-client";
import { showPermissionNotification } from "@/src/lib/permission-notifications";
import {
  isAppInForeground,
  showNewMessageNotification,
} from "@/src/lib/notifications";
import {
  connectSseClient,
  getSseClient,
  disconnectSseClient,
  sendPromptRequest,
  sendAbortRequest,
  sendPermissionResponse,
  sendQuestionResponse,
  subscribeToSse,
  type SseClient,
} from "@/src/lib/sse";
import type {
  SessionPromptResponseEvent,
  SessionStreamChunkEvent,
} from "@/src/lib/sse/events";
import { GitDrawer } from "@/src/components/GitDrawer";
import { FileDrawer } from "@/src/components/FileDrawer";
import { HeaderActionMenu } from "@/src/components/HeaderActionMenu";
import { useGitFileStatus } from "@/src/lib/api/git";
// Message queue temporarily disabled - will be re-enabled later
// import { QueueDrawer } from "@/components/QueueDrawer";
import { MessageRow, TypingIndicator } from "@/src/components/Message";
import { getAssistantResponseSummaryContext } from "@/src/components/Message/getAssistantResponseSummary";
import {
  PermissionCard,
  QuestionCard,
  type PermissionRequest,
  type QuestionRequest,
} from "@/src/components/PermissionCard";

type ComposerSelection = {
  start: number;
  end: number;
};

type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

function getActiveMention(
  value: string,
  selection: ComposerSelection,
): ActiveMention | null {
  if (selection.start !== selection.end) {
    return null;
  }

  const cursor = selection.start;
  let tokenStart = cursor - 1;

  while (tokenStart >= 0 && !/\s/.test(value[tokenStart] ?? "")) {
    tokenStart -= 1;
  }

  tokenStart += 1;

  if (value[tokenStart] !== "@") {
    return null;
  }

  const suffix = value.slice(cursor);
  const suffixLength = suffix.match(/^[^\s]*/)?.[0].length ?? 0;
  const tokenEnd = cursor + suffixLength;
  const token = value.slice(tokenStart, tokenEnd);

  if (!token.startsWith("@") || token.slice(1).includes("@")) {
    return null;
  }

  return {
    start: tokenStart,
    end: tokenEnd,
    query: token.slice(1),
  };
}

type ConnectionState = "connected" | "disconnected" | "connecting" | "error";

const LAST_SELECTED_PROJECT_ID = "LAST_SELECTED_PROJECT_ID";
const LAST_SELECTED_MODEL = "LAST_SELECTED_MODEL";
const LAST_SELECTED_AGENT_BY_PROJECT = "LAST_SELECTED_AGENT_BY_PROJECT";

type SessionPromptStartedEvent = {
  requestId: string;
  projectId: string;
  sessionId: string;
};

type PermissionRequestEvent = PermissionRequest;
type QuestionRequestEvent = QuestionRequest;

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

function getAgentSubtitle(agent: Agent): string {
  if (agent.model) {
    return `${agent.model.providerID} / ${agent.model.modelID}`;
  }

  return agent.builtIn ? "Built-in" : agent.mode;
}

export default function ChatScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const flatListRef = React.useRef<FlatListType<SessionMessage>>(null);
  const [inputText, setInputText] = React.useState("");
  const [inputSelection, setInputSelection] = React.useState<ComposerSelection>(
    {
      start: 0,
      end: 0,
    },
  );
  const [inputHeight, setInputHeight] = React.useState(MIN_INPUT_HEIGHT);
  const [pendingRequestIds, setPendingRequestIds] = React.useState<
    Map<string, string>
  >(new Map());
  const [creatingSessionId, setCreatingSessionId] = React.useState<
    string | null
  >(null);
  const [hasActiveStreamEvent, setHasActiveStreamEvent] = React.useState(false);
  const pendingRequestIdsRef = React.useRef<Map<string, string>>(new Map());
  const activeSessionIdRef = React.useRef<string | null>(null);
  const allowSessionChangeRecoveryRef = React.useRef(false);
  const {
    visibleText: streamingContent,
    thinkingContent: streamingThinkingContent,
    activities: streamingActivities,
    phase: streamingPhase,
    revision: streamingRevision,
    applyChunk: applyStreamingChunk,
    flush: flushStreamingContent,
    reset: resetStreamingContent,
  } = useLiveAssistantStream();
  const followUpRefreshTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const requestRecoveryTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [optimisticMessage, setOptimisticMessage] =
    React.useState<SessionMessage | null>(null);
  const [showProjectSheet, setShowProjectSheet] = React.useState(false);
  const [showProviderSheet, setShowProviderSheet] = React.useState(false);
  const [showAgentSheet, setShowAgentSheet] = React.useState(false);
  const [showBranchSheet, setShowBranchSheet] = React.useState(false);
  const [modelSearchQuery, setModelSearchQuery] = React.useState("");
  const [agentSearchQuery, setAgentSearchQuery] = React.useState("");
  const [branchSearchQuery, setBranchSearchQuery] = React.useState("");
  const [activeProject, setActiveProject] = React.useState<Project | null>(
    null,
  );
  const [activeModel, setActiveModel] = React.useState<ActiveModel | null>(
    null,
  );
  const [activeAgent, setActiveAgent] = React.useState<Agent | null>(null);
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(
    null,
  );
  const [showDrawer, setShowDrawer] = React.useState(false);
  const [showGitDrawer, setShowGitDrawer] = React.useState(false);
  const [showFileDrawer, setShowFileDrawer] = React.useState(false);
  // Message queue temporarily disabled
  // const [showQueueDrawer, setShowQueueDrawer] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  const [isNearBottom, setIsNearBottom] = React.useState(true);
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
  const [composerLayoutHeight, setComposerLayoutHeight] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [menuExpanded, setMenuExpanded] = React.useState(false);
  const [pendingPermission, setPendingPermission] =
    React.useState<PermissionRequestEvent | null>(null);
  const [pendingQuestion, setPendingQuestion] =
    React.useState<QuestionRequestEvent | null>(null);
  const [isRespondingToPermission, setIsRespondingToPermission] =
    React.useState(false);
  const [isRespondingToQuestion, setIsRespondingToQuestion] =
    React.useState(false);
  const streamScrollTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  React.useEffect(() => {
    const showListener = Keyboard.addListener(
      "keyboardDidShow",
      (e: KeyboardEvent) => {
        setKeyboardHeight(e.endCoordinates.height);
      },
    );
    const hideListener = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    });
    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, []);

  const [, setConnectionState] =
    React.useState<ConnectionState>("disconnected");
  const sseClientRef = React.useRef<SseClient | null>(null);
  const isMountedRef = React.useRef(true);
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);
  const activeProjectRef = React.useRef<Project | null>(null);
  const projectsRef = React.useRef<Project[] | undefined>(undefined);

  const createSessionMutation = useCreateSession();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: providers, isLoading: providersLoading } = useProviders();
  const { data: agents = [], isLoading: agentsLoading } = useAgents(
    activeProject?.id ?? "",
    Boolean(activeProject),
  );
  const activeMention = React.useMemo(
    () => getActiveMention(inputText, inputSelection),
    [inputSelection, inputText],
  );
  const deferredMentionQuery = React.useDeferredValue(
    activeMention?.query ?? "",
  );
  const { data: fileSuggestions, isLoading: fileSuggestionsLoading } =
    useProjectFileSearch(
      activeProject?.id ?? "",
      deferredMentionQuery,
      Boolean(activeProject && activeMention && deferredMentionQuery.trim()),
    );

  const activeSlash = React.useMemo(() => {
    if (!inputText.startsWith("/")) return null;
    const spaceIndex = inputText.indexOf(" ");
    const query =
      spaceIndex === -1 ? inputText.slice(1) : inputText.slice(1, spaceIndex);
    return { query };
  }, [inputText]);
  const deferredSlashQuery = React.useDeferredValue(activeSlash?.query ?? "");
  const { data: skillSuggestions, isLoading: skillSuggestionsLoading } =
    useProjectSkills(
      activeProject?.id ?? "",
      deferredSlashQuery,
      Boolean(activeProject && activeSlash),
    );

  React.useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  React.useEffect(() => {
    activeProjectRef.current = activeProject;
  }, [activeProject]);

  React.useEffect(() => {
    projectsRef.current = projects;
  }, [projects, resetStreamingContent]);

  React.useEffect(() => {
    pendingRequestIdsRef.current = pendingRequestIds;
  }, [pendingRequestIds]);

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
      disconnectSseClient();
      sseClientRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const activeStream = await getActiveSessionStream();
        if (cancelled || !isMountedRef.current) {
          return;
        }

        if (activeStream && projects) {
          const streamingProject = projects.find(
            (project) => project.id === activeStream.projectId,
          );
          if (streamingProject) {
            allowSessionChangeRecoveryRef.current = true;
            activeSessionIdRef.current = activeStream.sessionId;
            const newPending = new Map<string, string>();
            newPending.set(activeStream.sessionId, activeStream.requestId);
            pendingRequestIdsRef.current = newPending;
            setActiveProject(streamingProject);
            setActiveSessionId(activeStream.sessionId);
            setPendingRequestIds(newPending);
            setOptimisticMessage(null);
            resetStreamingContent();
            return;
          }
        }

        const savedId = await AsyncStorage.getItem(LAST_SELECTED_PROJECT_ID);
        if (cancelled || !isMountedRef.current) {
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
        if (!cancelled && isMountedRef.current) {
          setHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projects, resetStreamingContent]);

  React.useEffect(() => {
    if (!hydrated) return;
    if (activeProject) {
      AsyncStorage.setItem(LAST_SELECTED_PROJECT_ID, activeProject.id).catch(
        () => {},
      );
    }
  }, [activeProject, hydrated]);

  React.useEffect(() => {
    if (!hydrated) return;
    if (activeModel) {
      AsyncStorage.setItem(
        LAST_SELECTED_MODEL,
        JSON.stringify(activeModel),
      ).catch(() => {});
    }
  }, [activeModel, hydrated]);

  React.useEffect(() => {
    if (!hydrated || !activeProject) {
      return;
    }

    void AsyncStorage.getItem(LAST_SELECTED_AGENT_BY_PROJECT)
      .then((raw) => {
        if (!raw || !isMountedRef.current) {
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
  }, [activeProject, agents, hydrated]);

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

  const {
    data: messages,
    isLoading: messagesLoading,
    error,
    refetch,
  } = useSessionMessages(activeSessionId ?? "");
  const { refetch: refetchActiveSession } = useSession(activeSessionId ?? "");
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

  const activeSessionMessages = React.useMemo(() => {
    if (!activeSessionId) {
      return [];
    }

    return (messages ?? []).filter(
      (message) => message.sessionID === activeSessionId,
    );
  }, [activeSessionId, messages]);

  const displayedMessages = React.useMemo(() => {
    if (!optimisticMessage) {
      return activeSessionMessages;
    }
    return [...activeSessionMessages, optimisticMessage];
  }, [activeSessionMessages, optimisticMessage]);

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

  const hasScrolledToBottom = React.useRef(false);
  React.useEffect(() => {
    if (messages && messages.length > 0 && !hasScrolledToBottom.current) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
        hasScrolledToBottom.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  const prevMessageCount = React.useRef(displayedMessages.length);
  React.useEffect(() => {
    if (displayedMessages.length > prevMessageCount.current) {
      prevMessageCount.current = displayedMessages.length;
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 300);
      return () => clearTimeout(timer);
    } else {
      prevMessageCount.current = displayedMessages.length;
    }
  }, [displayedMessages.length]);

  React.useEffect(() => {
    if (
      !streamingContent &&
      !streamingThinkingContent &&
      streamingActivities.length === 0
    ) {
      return;
    }

    if (streamScrollTimeoutRef.current) {
      return;
    }

    streamScrollTimeoutRef.current = setTimeout(() => {
      streamScrollTimeoutRef.current = null;
      if (isNearBottom) {
        flatListRef.current?.scrollToEnd({ animated: false });
      }
    }, 120);
  }, [
    isNearBottom,
    streamingActivities.length,
    streamingContent,
    streamingRevision,
    streamingThinkingContent,
  ]);

  const clearFollowUpRefreshTimeout = React.useCallback(() => {
    if (followUpRefreshTimeoutRef.current) {
      clearTimeout(followUpRefreshTimeoutRef.current);
      followUpRefreshTimeoutRef.current = null;
    }
  }, []);

  const clearRequestRecoveryTimeout = React.useCallback(() => {
    if (requestRecoveryTimeoutRef.current) {
      clearTimeout(requestRecoveryTimeoutRef.current);
      requestRecoveryTimeoutRef.current = null;
    }
  }, []);

  const refreshActiveSessionSnapshot = React.useCallback(
    (followUp = false) => {
      if (!activeSessionIdRef.current) {
        return;
      }

      void refetch();
      void refetchActiveSession();

      if (!followUp) {
        clearFollowUpRefreshTimeout();
        return;
      }

      clearFollowUpRefreshTimeout();
      followUpRefreshTimeoutRef.current = setTimeout(() => {
        followUpRefreshTimeoutRef.current = null;
        void refetch();
        void refetchActiveSession();
      }, FOLLOW_UP_SESSION_REFRESH_DELAY_MS);
    },
    [clearFollowUpRefreshTimeout, refetch, refetchActiveSession],
  );

  const handleRefreshPress = React.useCallback(async () => {
    if (isRefreshing || !activeSessionIdRef.current) {
      return;
    }

    setIsRefreshing(true);
    try {
      await Promise.all([refetch(), refetchActiveSession()]);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, refetch, refetchActiveSession]);

  const handleToggleMenu = React.useCallback(() => {
    setMenuExpanded((prev) => !prev);
  }, []);

  const clearPendingStreamState = React.useCallback(
    (sessionId?: string, requestId?: string) => {
      pendingRequestIdsRef.current = new Map();
      setPendingRequestIds(new Map());
      setHasActiveStreamEvent(false);
      setOptimisticMessage(null);
      resetStreamingContent();
      clearFollowUpRefreshTimeout();
      clearRequestRecoveryTimeout();
      void clearActiveSessionStream(requestId);
    },
    [
      clearFollowUpRefreshTimeout,
      clearRequestRecoveryTimeout,
      resetStreamingContent,
    ],
  );

  const recoverPendingStream = React.useCallback(async () => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) {
      return;
    }

    const activeStream = await getActiveSessionStream();
    if (!activeStream || activeStream.sessionId !== sessionId) {
      return;
    }

    const newPending = new Map<string, string>();
    newPending.set(sessionId, activeStream.requestId);
    pendingRequestIdsRef.current = newPending;
    setPendingRequestIds(newPending);
    setHasActiveStreamEvent(false);
    setOptimisticMessage(null);
    resetStreamingContent();

    const [sessionResult] = await Promise.allSettled([
      refetchActiveSession(),
      refetch(),
    ]);

    if (sessionResult.status !== "fulfilled") {
      return;
    }

    const recoveredStatus = sessionResult.value.data?.status;

    if (!isStreamingSessionStatus(recoveredStatus)) {
      flushStreamingContent();
      clearPendingStreamState(sessionId, activeStream.requestId);
    }
  }, [
    clearPendingStreamState,
    flushStreamingContent,
    refetch,
    refetchActiveSession,
    resetStreamingContent,
  ]);

  React.useEffect(() => {
    return () => {
      clearFollowUpRefreshTimeout();
      clearRequestRecoveryTimeout();
    };
  }, [clearFollowUpRefreshTimeout, clearRequestRecoveryTimeout]);

  React.useEffect(() => {
    if (
      allowSessionChangeRecoveryRef.current &&
      activeSessionId &&
      pendingRequestIdsRef.current.size > 0
    ) {
      allowSessionChangeRecoveryRef.current = false;
      void recoverPendingStream();
    }
  }, [activeSessionId, recoverPendingStream]);

  const connectSse = React.useCallback(() => {
    if (!isMountedRef.current) {
      return () => {};
    }

    setConnectionState("connecting");
    console.log("[Chat] Attempting SSE connection...");

    const { unsubscribe } = subscribeToSse({
      onEvent(event, data) {
        switch (event) {
          case "session_prompt_started":
            handlePromptStartedRef.current(
              data as unknown as SessionPromptStartedEvent,
            );
            break;
          case "session_stream_chunk":
            console.log("handle stream");

            handleStreamChunkRef.current(
              data as unknown as SessionStreamChunkEvent,
            );
            break;
          case "session_prompt_response":
            handlePromptResponseRef.current(
              data as unknown as SessionPromptResponseEvent,
            );
            break;
          case "error_response":
            handleErrorResponseRef.current(
              data as { requestId?: string; message?: string },
            );
            break;
          case "permission_request":
            console.log(data, "permssion request");

            handlePermissionRequestRef.current(
              data as unknown as PermissionRequestEvent,
            );
            break;
          case "question_request":
            handleQuestionRequestRef.current(
              data as unknown as QuestionRequestEvent,
            );
            break;
        }
      },
      onConnect() {
        if (!isMountedRef.current) return;
        console.log("[Chat] SSE connected");
        setConnectionState("connected");

        if (
          activeSessionIdRef.current &&
          pendingRequestIdsRef.current.size > 0
        ) {
          void recoverPendingStream();
        }
      },
      onDisconnect() {
        if (!isMountedRef.current) return;
        console.log("[Chat] SSE disconnected");
        setConnectionState("disconnected");
      },
      onError(error) {
        if (!isMountedRef.current) return;
        console.log("[Chat] SSE error:", error.message);
        setConnectionState("error");
      },
    });

    const client = connectSseClient();
    if (!client) {
      setConnectionState("disconnected");
      sseClientRef.current = null;
      unsubscribe();
      return () => {};
    }

    sseClientRef.current = client;
    return unsubscribe;
  }, [recoverPendingStream]);

  const handlePromptStartedRef = React.useRef(
    (payload: SessionPromptStartedEvent) => {
      const pending = pendingRequestIdsRef.current;
      if (
        pending.get(payload.sessionId) === payload.requestId &&
        payload.sessionId === activeSessionIdRef.current
      ) {
        setHasActiveStreamEvent(false);
        setPendingRequestIds(new Map(pending));
      }
    },
  );

  const handleStreamChunkRef = React.useRef(
    (payload: SessionStreamChunkEvent) => {
      const pending = pendingRequestIdsRef.current;
      if (
        pending.get(payload.sessionId) !== payload.requestId ||
        payload.sessionId !== activeSessionIdRef.current
      ) {
        return;
      }

      setHasActiveStreamEvent(true);
      applyStreamingChunk(payload);
    },
  );

  const handlePromptResponseRef = React.useRef(
    (payload: SessionPromptResponseEvent) => {
      const pending = pendingRequestIdsRef.current;
      if (
        pending.get(payload.sessionId) !== payload.requestId ||
        payload.sessionId !== activeSessionIdRef.current
      ) {
        return;
      }

      flushStreamingContent();
      clearPendingStreamState(payload.sessionId, payload.requestId);

      if (payload.messages) {
        queryClient.setQueryData(
          messageKeys.list(payload.sessionId),
          payload.messages,
        );
      }

      refreshActiveSessionSnapshot(
        shouldScheduleSessionRefresh(payload.messages, payload.output),
      );

      void queryClient.invalidateQueries({ queryKey: sessionsKeys.all });

      if (!payload.success) {
        Alert.alert(
          "OpenCode failed",
          payload.error || "Failed to send message",
        );
      } else if (
        !isAppInForeground() &&
        payload.messages &&
        payload.messages.length > 0
      ) {
        const lastMessage = payload.messages[payload.messages.length - 1];
        void showNewMessageNotification(
          "New Message",
          lastMessage.content.slice(0, 100),
          {
            projectId: payload.projectId,
            sessionId: payload.sessionId,
          },
        );
      }
    },
  );

  const handleErrorResponseRef = React.useRef(
    (payload: { requestId?: string; message?: string }) => {
      const pending = pendingRequestIdsRef.current;
      let foundSessionId: string | null = null;
      for (const [sessionId, requestId] of pending) {
        if (requestId === payload.requestId) {
          foundSessionId = sessionId;
          break;
        }
      }
      if (!foundSessionId) {
        return;
      }

      flushStreamingContent();
      clearPendingStreamState(foundSessionId, payload.requestId);
      Alert.alert("SSE error", payload.message || "Failed to send message");
    },
  );

  const handlePermissionRequestRef = React.useRef(
    (payload: PermissionRequestEvent) => {
      const currentProject = activeProjectRef.current;
      const availableProjects = projectsRef.current ?? [];

      if (currentProject?.id !== payload.projectId) {
        const matchingProject = availableProjects.find(
          (project) => project.id === payload.projectId,
        );
        if (matchingProject) {
          setActiveProject(matchingProject);
        }
      }

      if (activeSessionIdRef.current !== payload.sessionId) {
        activeSessionIdRef.current = payload.sessionId;
        setActiveSessionId(payload.sessionId);
      }

      setPendingPermission(payload);
      setPendingQuestion(null);

      if (!isAppInForeground()) {
        showPermissionNotification({
          requestId: payload.requestId,
          projectId: payload.projectId,
          sessionId: payload.sessionId,
          jobId: payload.jobId,
          permission: payload.permission,
          patterns: payload.patterns,
          title:
            typeof payload.metadata?.title === "string"
              ? (payload.metadata.title as string)
              : undefined,
        }).catch((err) => {
          console.error("Failed to show permission notification:", err);
        });
      }
    },
  );

  const handleQuestionRequestRef = React.useRef(
    (payload: QuestionRequestEvent) => {
      const currentProject = activeProjectRef.current;
      const availableProjects = projectsRef.current ?? [];

      if (currentProject?.id !== payload.projectId) {
        const matchingProject = availableProjects.find(
          (project) => project.id === payload.projectId,
        );
        if (matchingProject) {
          setActiveProject(matchingProject);
        }
      }

      if (activeSessionIdRef.current !== payload.sessionId) {
        activeSessionIdRef.current = payload.sessionId;
        setActiveSessionId(payload.sessionId);
      }

      setPendingQuestion(payload);
      setPendingPermission(null);
    },
  );

  React.useEffect(() => {
    const unsubscribe = connectSse();

    return () => {
      sseClientRef.current = null;
      unsubscribe();
    };
  }, [connectSse]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        const prevState = appStateRef.current;
        appStateRef.current = nextState;

        if (!isMountedRef.current) return;

        if (nextState === "active" && prevState !== "active") {
          console.log("[Chat] App became active, checking connection...");

          if (
            !sseClientRef.current ||
            sseClientRef.current.getState() !== "connected"
          ) {
            console.log("[Chat] SSE not connected, reconnecting...");
            sseClientRef.current = connectSseClient() ?? getSseClient();
          }

          if (pendingRequestIdsRef.current.size > 0) {
            void recoverPendingStream();
          }
        } else if (nextState === "background" && prevState === "active") {
          console.log("[Chat] App went to background");
        }
      },
    );

    return () => subscription.remove();
  }, [connectSse, recoverPendingStream]);

  const borderColor = theme.dark ? "#2A3441" : "#D9E2EC";
  const metaColor = theme.dark ? "#B8C2D1" : "#526277";
  const userBubble = theme.dark ? "#1D4ED8" : "#DBEAFE";
  const assistantBubble = theme.dark ? "#1F2937" : "#FFFFFF";
  const systemBubble = theme.dark ? "#3F3F46" : "#E2E8F0";
  const sheetBg = theme.dark ? "#1E293B" : "#FFFFFF";
  const showMentionSuggestions = Boolean(activeProject && activeMention);
  const mentionSuggestionCount = fileSuggestions?.length ?? 0;
  const mentionSuggestionHeight = showMentionSuggestions
    ? Math.min(
        mentionSuggestionCount > 0 ? mentionSuggestionCount * 52 + 16 : 88,
        220,
      ) + 8
    : 0;
  const showSkillSuggestions = Boolean(activeProject && activeSlash);
  const skillSuggestionCount = skillSuggestions?.length ?? 0;
  const skillSuggestionHeight = showSkillSuggestions
    ? Math.min(
        skillSuggestionCount > 0 ? skillSuggestionCount * 60 + 16 : 88,
        220,
      ) + 8
    : 0;
  const composerHeight =
    Math.min(MAX_INPUT_HEIGHT, Math.max(MIN_INPUT_HEIGHT, inputHeight)) +
    COMPOSER_TOP_PADDING +
    Math.max(insets.bottom, COMPOSER_BOTTOM_PADDING) +
    mentionSuggestionHeight +
    skillSuggestionHeight +
    keyboardHeight +
    (keyboardHeight > 0 ? KEYBOARD_ADDITIONAL_PADDING : 0);
  const measuredComposerHeight = composerLayoutHeight || composerHeight;
  const trimmedInput = inputText.trim();
  const isSessionSending = creatingSessionId
    ? true
    : activeSessionId
      ? pendingRequestIds.has(activeSessionId)
      : false;
  const footerStreamingContent = hasActiveStreamEvent ? streamingContent : "";
  const footerThinkingContent = hasActiveStreamEvent
    ? streamingThinkingContent
    : null;
  const footerActivities = hasActiveStreamEvent ? streamingActivities : [];
  const footerPhase = hasActiveStreamEvent ? streamingPhase : "thinking";

  const handleSend = React.useCallback(async () => {
    if (!activeProject || !trimmedInput || isSessionSending) {
      return;
    }

    const prompt = trimmedInput;
    const requestId = `mobile_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    const optimisticMessageId = `optimistic_${requestId}`;
    let sessionId = activeSessionId;
    const isCreatingSession = !sessionId;

    setOptimisticMessage({
      id: optimisticMessageId,
      sessionID: sessionId ?? `pending_${requestId}`,
      role: "user",
      content: prompt,
      visibleContent: prompt,
      thinkingContent: null,
      thinkingDurationSeconds: null,
      parts: [{ type: "text", content: prompt, durationSeconds: null }],
      createdAt: Date.now(),
    });
    setHasActiveStreamEvent(false);
    resetStreamingContent();
    setInputText("");
    setInputSelection({ start: 0, end: 0 });
    setInputHeight(MIN_INPUT_HEIGHT);

    if (!sessionId) {
      const tempRequestId = `creating_${Date.now()}`;
      setCreatingSessionId(tempRequestId);
      try {
        const session = await createSessionMutation.mutateAsync(
          activeProject.id,
        );
        const resolvedSessionId = session.id;
        sessionId = resolvedSessionId;
        allowSessionChangeRecoveryRef.current = false;
        setActiveSessionId(resolvedSessionId);
        setCreatingSessionId(null);
        setOptimisticMessage((current) =>
          current?.id === optimisticMessageId
            ? { ...current, sessionID: resolvedSessionId }
            : current,
        );
      } catch (createError) {
        setCreatingSessionId(null);
        setOptimisticMessage(null);
        setInputText(prompt);
        setInputSelection({ start: prompt.length, end: prompt.length });
        setInputHeight(MIN_INPUT_HEIGHT);
        console.error(createError);
        Alert.alert("Error", "Failed to create session");
        return;
      }
    }
    const newPending = new Map(pendingRequestIds);
    newPending.set(sessionId, requestId);
    setPendingRequestIds(newPending);
    pendingRequestIdsRef.current = newPending;
    activeSessionIdRef.current = sessionId;
    void saveActiveSessionStream({
      requestId,
      projectId: activeProject.id,
      sessionId,
      baselineMessageId: isCreatingSession
        ? null
        : (activeSessionMessages[activeSessionMessages.length - 1]?.id ?? null),
    });

    clearRequestRecoveryTimeout();
    requestRecoveryTimeoutRef.current = setTimeout(() => {
      requestRecoveryTimeoutRef.current = null;
      if (pendingRequestIdsRef.current.get(sessionId) === requestId) {
        void recoverPendingStream();
      }
    }, 60_000);

    try {
      await sendPromptRequest({
        sessionId,
        requestId,
        projectId: activeProject.id,
        prompt,
        agent: activeAgent?.name,
        model: activeModel
          ? {
              providerId: activeModel.providerId,
              modelId: activeModel.id,
            }
          : undefined,
      });
    } catch (error) {
      console.error("[Chat] Failed to send prompt:", error);
      clearPendingStreamState(sessionId, requestId);
      Alert.alert("Error", "Failed to send message. Please try again.");
    }
  }, [
    activeProject,
    activeSessionId,
    trimmedInput,
    isSessionSending,
    pendingRequestIds,
    activeSessionMessages,
    createSessionMutation,
    clearPendingStreamState,
    clearRequestRecoveryTimeout,
    recoverPendingStream,
    activeModel,
    activeAgent,
    resetStreamingContent,
  ]);

  const handleAbort = React.useCallback(async () => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) {
      return;
    }

    const requestId = pendingRequestIdsRef.current.get(sessionId);
    if (!requestId || !activeProject) {
      return;
    }

    // Only clear streaming state, keep optimistic message (user's message)
    resetStreamingContent();
    clearRequestRecoveryTimeout();
    void clearActiveSessionStream(requestId);

    // Remove only this session from pending request IDs
    const newPending = new Map(pendingRequestIdsRef.current);
    newPending.delete(sessionId);
    pendingRequestIdsRef.current = newPending;
    setPendingRequestIds(new Map(newPending));

    // Fire abort request in background (don't block UI)
    sendAbortRequest({
      sessionId,
      requestId,
      projectId: activeProject.id,
    }).catch((error) => {
      console.error("[Chat] Failed to abort:", error);
    });
  }, [activeProject, clearRequestRecoveryTimeout, resetStreamingContent]);

  const handlePermissionResponse = React.useCallback(
    async (reply: "once" | "always" | "reject") => {
      if (!pendingPermission) {
        return;
      }

      setIsRespondingToPermission(true);

      try {
        await sendPermissionResponse({
          requestId: pendingPermission.requestId,
          sessionId: pendingPermission.sessionId,
          jobId: pendingPermission.jobId,
          reply,
        });
        setPendingPermission(null);
      } catch (error) {
        console.error("[PermissionResponse] Failed to send:", error);
        Alert.alert(
          "Permission response failed",
          "The request was not delivered. Please try again.",
        );
      } finally {
        setIsRespondingToPermission(false);
      }
    },
    [pendingPermission],
  );

  const handleQuestionResponse = React.useCallback(
    async (answers: string[][]) => {
      if (!pendingQuestion) {
        return;
      }

      setIsRespondingToQuestion(true);

      try {
        await sendQuestionResponse({
          requestId: pendingQuestion.requestId,
          sessionId: pendingQuestion.sessionId,
          jobId: pendingQuestion.jobId,
          answers,
        });
        setPendingQuestion(null);
      } catch (error) {
        console.error("[QuestionResponse] Failed to send:", error);
        Alert.alert(
          "Question response failed",
          "The answers were not delivered. Please try again.",
        );
      } finally {
        setIsRespondingToQuestion(false);
      }
    },
    [pendingQuestion],
  );

  const renderMessage = React.useCallback(
    ({ item, index }: { item: SessionMessage; index: number }) => {
      const responseSummaryContext = getAssistantResponseSummaryContext(
        displayedMessages,
        index,
      );

      return (
        <MessageRow
          message={item}
          responseSummary={responseSummaryContext}
          borderColor={borderColor}
          metaColor={metaColor}
          userBubble={userBubble}
          assistantBubble={assistantBubble}
          systemBubble={systemBubble}
          textColor={theme.colors.onSurface}
        />
      );
    },
    [
      borderColor,
      metaColor,
      userBubble,
      assistantBubble,
      systemBubble,
      theme.colors.onSurface,
      displayedMessages,
    ],
  );

  const handleInputSelectionChange = React.useCallback(
    (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setInputSelection(event.nativeEvent.selection);
    },
    [],
  );

  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } =
        event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;
      setIsNearBottom(distanceFromBottom < 150);
    },
    [],
  );

  const scrollToBottom = React.useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [flatListRef]);

  const handleComposerLayout = React.useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    setComposerLayoutHeight((current) =>
      current === nextHeight ? current : nextHeight,
    );
  }, []);

  const handleSelectFileSuggestion = React.useCallback(
    (match: ProjectFileMatch) => {
      if (!activeMention) {
        return;
      }

      const replacement = `"${match.path}" `;
      const nextText = [
        inputText.slice(0, activeMention.start),
        replacement,
        inputText.slice(activeMention.end),
      ].join("");
      const cursor = activeMention.start + replacement.length;

      setInputText(nextText);
      setInputSelection({ start: cursor, end: cursor });
    },
    [activeMention, inputText],
  );

  const handleSelectSkillSuggestion = React.useCallback(
    (skill: Skill) => {
      if (!activeSlash) {
        return;
      }

      const slashIndex = inputText.indexOf("/");
      const replacement = `/${skill.name} `;
      const nextText = [
        inputText.slice(0, slashIndex),
        replacement,
        inputText.slice(slashIndex + 1 + activeSlash.query.length),
      ].join("");
      const cursor = slashIndex + replacement.length;

      setInputText(nextText);
      setInputSelection({ start: cursor, end: cursor });
    },
    [activeSlash, inputText],
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar
        barStyle={theme.dark ? "light-content" : "dark-content"}
        backgroundColor={theme.colors.background}
      />

      <View style={[styles.headerRow, { top: insets.top + 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open sessions drawer"
          onPress={() => setShowDrawer(true)}
          style={[
            styles.headerButton,
            {
              backgroundColor: theme.dark
                ? "rgba(17, 24, 39, 0.92)"
                : "rgba(255, 255, 255, 0.96)",
              borderColor,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="menu"
            size={22}
            color={theme.colors.onSurface}
          />
        </Pressable>
        <HeaderActionMenu
          menuExpanded={menuExpanded}
          isRefreshing={isRefreshing}
          borderColor={borderColor}
          onToggleMenu={handleToggleMenu}
          onRefreshPress={handleRefreshPress}
          onOpenGitDrawer={() => setShowGitDrawer(true)}
          onOpenFileDrawer={() => setShowFileDrawer(true)}
          onNewSession={() => {
            setActiveSessionId(null);
            setOptimisticMessage(null);
          }}
        />
      </View>

      <View
        style={[
          styles.keyboardContainer,
          {
            paddingBottom:
              keyboardHeight +
              (keyboardHeight > 0 ? KEYBOARD_ADDITIONAL_PADDING : 0),
          },
        ]}
      >
        <View style={styles.messagesContainer}>
          {messagesLoading &&
          activeSessionId &&
          displayedMessages.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator />
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text variant="titleMedium" style={styles.errorText}>
                Failed to load messages
              </Text>
              <Text
                variant="bodyMedium"
                style={[
                  styles.errorMessage,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {String(error)}
              </Text>
              <Pressable
                onPress={() => refetch()}
                style={[styles.retryButton, { borderColor }]}
              >
                <Text style={{ color: theme.colors.primary }}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={displayedMessages}
              renderItem={renderMessage}
              keyExtractor={(item) => `${item.id}-${item.createdAt}`}
              contentContainerStyle={[
                styles.listContent,
                {
                  paddingTop: insets.top + 8,
                },
              ]}
              showsVerticalScrollIndicator={false}
              bounces={false}
              keyboardShouldPersistTaps="always"
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              removeClippedSubviews={Platform.OS === "android"}
              maxToRenderPerBatch={10}
              windowSize={10}
              initialNumToRender={15}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text
                    variant="bodyLarge"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {activeProject
                      ? "Start a conversation..."
                      : "Select a project to begin"}
                  </Text>
                </View>
              }
              ListFooterComponent={
                isSessionSending || hasActiveStreamEvent ? (
                  <TypingIndicator
                    key={
                      (activeSessionId
                        ? pendingRequestIds.get(activeSessionId)
                        : creatingSessionId) ?? "typing"
                    }
                    streamingContent={footerStreamingContent}
                    thinkingContent={footerThinkingContent}
                    activities={footerActivities}
                    phase={footerPhase}
                    borderColor={borderColor}
                    assistantBubble={assistantBubble}
                    metaColor={metaColor}
                  />
                ) : null
              }
            />
          )}
        </View>
        {pendingPermission ? (
          <PermissionCard
            request={pendingPermission}
            onRespond={handlePermissionResponse}
            isResponding={isRespondingToPermission}
          />
        ) : pendingQuestion ? (
          <QuestionCard
            request={pendingQuestion}
            onRespond={handleQuestionResponse}
            isResponding={isRespondingToQuestion}
          />
        ) : null}
        {!isNearBottom && (
          <Pressable
            onPress={scrollToBottom}
            style={[
              styles.scrollToBottomButton,
              {
                backgroundColor: theme.dark ? "#1E293B" : "#FFFFFF",
                borderColor,
                shadowColor: theme.dark ? "#000" : "#000",
                bottom:
                  keyboardHeight > 0
                    ? keyboardHeight + measuredComposerHeight + 18
                    : measuredComposerHeight,
              },
            ]}
          >
            <MaterialCommunityIcons
              name="chevron-down"
              size={20}
              color={theme.colors.onSurface}
            />
          </Pressable>
        )}
        <ChatComposer
          activeProject={Boolean(activeProject)}
          activeAgentName={activeAgent?.name ?? "Default agent"}
          activeProjectName={activeProject?.name ?? "No project"}
          borderColor={borderColor}
          branchName={currentBranch}
          fileSuggestions={fileSuggestions}
          fileSuggestionsLoading={fileSuggestionsLoading}
          inputHeight={inputHeight}
          inputSelection={inputSelection}
          inputText={inputText}
          isSending={isSessionSending}
          onPressAgent={() => setShowAgentSheet(true)}
          onPressBranch={() => setShowBranchSheet(true)}
          mentionQuery={activeMention?.query ?? ""}
          metaColor={metaColor}
          onChangeText={setInputText}
          onComposerLayout={handleComposerLayout}
          onInputHeightChange={setInputHeight}
          onPressModel={() => setShowProviderSheet(true)}
          onPressProject={() => setShowProjectSheet(true)}
          onSelectionChange={handleInputSelectionChange}
          onSelectFileSuggestion={handleSelectFileSuggestion}
          onSend={() => void handleSend()}
          onAbort={handleAbort}
          selectedModelDisplayName={activeModel ? activeModel.name : "No model"}
          showMentionSuggestions={showMentionSuggestions}
          showSkillSuggestions={showSkillSuggestions}
          skillSuggestions={skillSuggestions}
          skillSuggestionsLoading={skillSuggestionsLoading}
          onSelectSkillSuggestion={handleSelectSkillSuggestion}
          trimmedInput={trimmedInput}
        />
      </View>

      <ProjectSelectionSheet
        visible={showProjectSheet}
        projects={sortedProjects}
        activeProjectId={activeProject?.id}
        loading={projectsLoading}
        onClose={() => setShowProjectSheet(false)}
        onSelectProject={(item) => {
          if (item.id !== activeProject?.id) {
            activeSessionIdRef.current = null;
            clearPendingStreamState();
            setActiveProject(item);
            setActiveSessionId(null);
            setOptimisticMessage(null);
            hasScrolledToBottom.current = false;
          }
        }}
      />

      <ModelSelectionSheet
        visible={showProviderSheet}
        models={sortedModels}
        activeModelId={activeModel?.id}
        loading={providersLoading}
        searchQuery={modelSearchQuery}
        onSearchChange={setModelSearchQuery}
        onClose={() => {
          setShowProviderSheet(false);
          setModelSearchQuery("");
        }}
        onSelectModel={(item) => {
          setActiveModel(item);
          setShowProviderSheet(false);
          setModelSearchQuery("");
        }}
      />

      <AgentSelectionSheet
        visible={showAgentSheet}
        agents={sortedAgents}
        activeAgentName={activeAgent?.name}
        loading={agentsLoading}
        searchQuery={agentSearchQuery}
        onSearchChange={setAgentSearchQuery}
        onClose={() => {
          setShowAgentSheet(false);
          setAgentSearchQuery("");
        }}
        onSelectAgent={(item) => {
          setActiveAgent(item);
          setShowAgentSheet(false);
          setAgentSearchQuery("");
        }}
        getAgentSubtitle={getAgentSubtitle}
      />

      <BranchSelectionSheet
        visible={showBranchSheet}
        branches={sortedBranches}
        currentBranch={currentBranch}
        loading={branchesLoading}
        searchQuery={branchSearchQuery}
        onSearchChange={setBranchSearchQuery}
        onClose={() => {
          setShowBranchSheet(false);
          setBranchSearchQuery("");
        }}
        onSelectBranch={async (item) => {
          if (item.name !== currentBranch) {
            await switchBranchMutation.mutateAsync(item.name);
          }
          setShowBranchSheet(false);
          setBranchSearchQuery("");
        }}
      />

      <SessionDrawer
        visible={showDrawer}
        onClose={() => setShowDrawer(false)}
        activeProject={activeProject}
        activeSessionId={activeSessionId}
        onSelectSession={(sessionId) => {
          if (sessionId === null) {
            activeSessionIdRef.current = null;
            clearPendingStreamState();
            setActiveSessionId(null);
            setOptimisticMessage(null);
            hasScrolledToBottom.current = false;
          } else {
            clearRequestRecoveryTimeout();
            setActiveSessionId(sessionId);
            activeSessionIdRef.current = sessionId;
            setOptimisticMessage(null);
            hasScrolledToBottom.current = false;
          }
        }}
      />

      <GitDrawer
        visible={showGitDrawer}
        onClose={() => setShowGitDrawer(false)}
        activeProject={activeProject}
        borderColor={borderColor}
        metaColor={metaColor}
        backgroundColor={sheetBg}
      />

      <FileDrawer
        visible={showFileDrawer}
        onClose={() => setShowFileDrawer(false)}
        activeProject={activeProject}
        borderColor={borderColor}
        metaColor={metaColor}
        backgroundColor={sheetBg}
      />

      {/* Message queue temporarily disabled
      <QueueDrawer
        visible={showQueueDrawer}
        onClose={() => setShowQueueDrawer(false)}
        activeProject={activeProject}
        activeSessionId={activeSessionId}
      />
      */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  headerRow: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  messagesContainer: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  scrollToBottomButton: {
    position: "absolute",
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 20,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorText: {
    textAlign: "center",
  },
  errorMessage: {
    textAlign: "center",
    marginBottom: 12,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  emptyState: {
    flex: 1,
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  branchBadge: {
    position: "absolute",
    right: 16,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
