import { AgentSelectionSheet } from "@/src/components/BottomModals/AgentSelectionSheet";
import { AgentProviderSelectionSheet } from "@/src/components/BottomModals/AgentProviderSelectionSheet";
import { BranchSelectionSheet } from "@/src/components/BottomModals/BranchSelectionSheet";
import { ModelSelectionSheet } from "@/src/components/BottomModals/ModelSelectionSheet";
import { ProjectSelectionSheet } from "@/src/components/BottomModals/ProjectSelectionSheet";
import {
  ChatComposer,
  COMPOSER_BOTTOM_PADDING,
  COMPOSER_TOP_PADDING,
  KEYBOARD_ADDITIONAL_PADDING,
  MAX_INPUT_HEIGHT,
  MIN_INPUT_HEIGHT,
} from "@/src/components/ChatComposer";
import { ErrorToast } from "@/src/components/ErrorToast";
import { SessionDrawer } from "@/src/components/SessionDrawer";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  AppState,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
  type AppStateStatus,
  type FlatList as FlatListType,
} from "react-native";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { FileDrawer } from "@/src/components/FileDrawer";
import { GitDrawer } from "@/src/components/GitDrawer";
import { HeaderActionMenu } from "@/src/components/HeaderActionMenu";
import {
  clearActiveSessionStream,
  FOLLOW_UP_SESSION_REFRESH_DELAY_MS,
  getActiveSessionStream,
  isStreamingSessionStatus,
  saveActiveSessionStream,
  shouldScheduleSessionRefresh,
} from "@/src/lib/active-session-stream";
import {
  messageKeys,
  useSessionMessages,
  type SessionMessage,
} from "@/src/lib/api/messages";
import {
  flattenProvidersToModels,
  groupModelsByRuntime,
} from "@/src/lib/api/providers";
import {
  sessionsKeys,
  useCreateSession,
  useSession,
} from "@/src/lib/api/sessions";
import { useLiveAssistantStream } from "@/src/lib/live-assistant-stream";
import {
  isAppInForeground,
  showNewMessageNotification,
} from "@/src/lib/notifications";
import { showPermissionNotification } from "@/src/lib/permission-notifications";
import { queryClient } from "@/src/lib/query-client";
import {
  connectSseClient,
  disconnectSseClient,
  getSseClient,
  sendAbortRequest,
  sendPermissionResponse,
  sendPromptRequest,
  sendQuestionResponse,
  subscribeToSse,
  type SseClient,
} from "@/src/lib/sse";
import type {
  SessionPromptResponseEvent,
  SessionStreamChunkEvent,
} from "@/src/lib/sse/events";
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
import { getAgentSubtitle, useChatSession } from "@/src/hooks/useChatSession";
import { useComposerState } from "@/src/hooks/useComposerState";
import { useKeyboardHeight } from "@/src/hooks/useKeyboardHeight";

type ConnectionState = "connected" | "disconnected" | "connecting" | "error";

type SessionPromptStartedEvent = {
  requestId: string;
  projectId: string;
  sessionId: string;
};

type PermissionRequestEvent = PermissionRequest;
type QuestionRequestEvent = QuestionRequest;

function getSingleSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" && value[0] ? value[0] : undefined;
  }

  return typeof value === "string" && value ? value : undefined;
}

export default function ChatScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const flatListRef = React.useRef<FlatListType<SessionMessage>>(null);
  const routeParams = useLocalSearchParams<{
    projectId?: string | string[];
    sessionId?: string | string[];
    agentProviderId?: string | string[];
  }>();
  const notificationProjectId = getSingleSearchParam(routeParams.projectId);
  const notificationSessionId = getSingleSearchParam(routeParams.sessionId);
  const notificationAgentProviderId = getSingleSearchParam(
    routeParams.agentProviderId,
  );

  // --- Extracted hooks ---
  const keyboardHeight = useKeyboardHeight();

  const [pendingRequestIds, setPendingRequestIds] = React.useState<
    Map<string, string>
  >(new Map());
  const [creatingSessionId, setCreatingSessionId] = React.useState<
    string | null
  >(null);
  const [hasActiveStreamEvent, setHasActiveStreamEvent] = React.useState(false);
  const pendingRequestIdsRef = React.useRef<Map<string, string>>(new Map());
  const activeSessionIdRef = React.useRef<string | null>(null);
  const activeAgentProviderIdRef = React.useRef<string | undefined>(undefined);
  const allowSessionChangeRecoveryRef = React.useRef(false);
  const {
    thinkingContent: streamingThinkingContent,
    blocks: streamingBlocks,
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
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(
    null,
  );
  const [activeSessionAgentProviderId, setActiveSessionAgentProviderId] =
    React.useState<string | undefined>(undefined);
  const [errorToastVisible, setErrorToastVisible] = React.useState(false);
  const [errorToastMessage, setErrorToastMessage] = React.useState("");

  const showError = React.useCallback((message: string) => {
    setErrorToastMessage(message);
    setErrorToastVisible(true);
  }, []);

  const [showDrawer, setShowDrawer] = React.useState(false);
  const [showGitDrawer, setShowGitDrawer] = React.useState(false);
  const [showFileDrawer, setShowFileDrawer] = React.useState(false);
  const [showAgentProviderSheet, setShowAgentProviderSheet] =
    React.useState(false);
  // Message queue temporarily disabled
  // const [showQueueDrawer, setShowQueueDrawer] = React.useState(false);
  const [isNearBottom, setIsNearBottom] = React.useState(true);
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

  const session = useChatSession({
    isMountedRef: React.useRef(true),
    allowSessionChangeRecoveryRef,
    activeSessionIdRef,
    pendingRequestIdsRef,
    setActiveSessionId,
    setActiveSessionAgentProviderId,
    setPendingRequestIds,
    setOptimisticMessage: () => setOptimisticMessage(null),
    resetStreamingContent,
  });
  const {
    activeProjectRef: sessionActiveProjectRef,
    projects: sessionProjects,
    projectsRef: sessionProjectsRef,
    setActiveProject,
    refetchProjects,
    ensureModelForAgentProvider,
  } = session;

  const [, setConnectionState] =
    React.useState<ConnectionState>("disconnected");
  const sseClientRef = React.useRef<SseClient | null>(null);
  const isMountedRef = React.useRef(true);
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);

  const createSessionMutation = useCreateSession();
  // Draft selections drive new sessions; active sessions temporarily lock the provider.
  const draftAgentProviderId =
    session.selectedAgentProviderId ?? session.activeModel?.agentProviderId;
  const activeLookupAgentProviderId =
    activeSessionId
      ? activeSessionAgentProviderId ?? draftAgentProviderId
      : draftAgentProviderId;
  const composer = useComposerState(
    session.activeProject?.id,
    activeLookupAgentProviderId,
    activeSessionId,
  );
  const allModels = React.useMemo(
    () => flattenProvidersToModels(session.providers ?? []),
    [session.providers],
  );
  const availableAgentProviders = React.useMemo(
    () => groupModelsByRuntime(allModels),
    [allModels],
  );
  const selectedAgentProvider = React.useMemo(() => {
    if (!activeLookupAgentProviderId) {
      return availableAgentProviders[0] ?? null;
    }

    return (
      availableAgentProviders.find(
        (provider) => provider.agentProviderId === activeLookupAgentProviderId,
      ) ?? null
    );
  }, [activeLookupAgentProviderId, availableAgentProviders]);
  const visibleModelGroups = React.useMemo(() => {
    if (!activeLookupAgentProviderId) {
      return session.sortedModelGroups;
    }

    return session.sortedModelGroups.filter(
      (group) => group.agentProviderId === activeLookupAgentProviderId,
    );
  }, [activeLookupAgentProviderId, session.sortedModelGroups]);

  React.useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  React.useEffect(() => {
    activeAgentProviderIdRef.current = activeLookupAgentProviderId;
  }, [activeLookupAgentProviderId]);

  React.useEffect(() => {
    if (!activeLookupAgentProviderId) {
      return;
    }

    ensureModelForAgentProvider(activeLookupAgentProviderId);
  }, [activeLookupAgentProviderId, ensureModelForAgentProvider]);

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

  const {
    data: messages,
    isLoading: messagesLoading,
    error,
    refetch,
  } = useSessionMessages(
    activeSessionId ?? "",
    100,
    activeLookupAgentProviderId,
  );
  const { refetch: refetchActiveSession } = useSession(
    activeSessionId ?? "",
    activeLookupAgentProviderId,
  );
  const { data: notificationSession } = useSession(
    notificationSessionId ?? "",
    notificationAgentProviderId,
  );

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

  // Phase 5: Memoize theme-derived colors
  const colors = React.useMemo(
    () => ({
      borderColor: theme.dark ? "#2A3441" : "#D9E2EC",
      metaColor: theme.dark ? "#B8C2D1" : "#526277",
      userBubble: theme.dark ? "#1D4ED8" : "#DBEAFE",
      assistantBubble: theme.dark ? "#1F2937" : "#FFFFFF",
      systemBubble: theme.dark ? "#3F3F46" : "#E2E8F0",
      sheetBg: theme.dark ? "#1E293B" : "#FFFFFF",
    }),
    [theme.dark],
  );

  const hasScrolledToBottom = React.useRef(false);

  React.useEffect(() => {
    if (!notificationProjectId || !notificationSessionId) {
      return;
    }

    const availableProjects = sessionProjectsRef.current ?? sessionProjects ?? [];
    const targetProjectId = notificationSession?.projectID ?? notificationProjectId;
    const targetProject = availableProjects.find(
      (project) => project.id === targetProjectId,
    );

    if (!targetProject) {
      return;
    }

    if (sessionActiveProjectRef.current?.id !== targetProject.id) {
      setActiveProject(targetProject);
    }

    const targetAgentProviderId =
      notificationSession?.agentProviderId ?? notificationAgentProviderId;

    activeSessionIdRef.current = notificationSessionId;
    setActiveSessionId(notificationSessionId);
    setActiveSessionAgentProviderId(targetAgentProviderId);
    setOptimisticMessage(null);
    hasScrolledToBottom.current = false;

    router.replace("/");
  }, [
    notificationAgentProviderId,
    notificationProjectId,
    notificationSession,
    notificationSessionId,
    sessionActiveProjectRef,
    sessionProjects,
    sessionProjectsRef,
    setActiveProject,
  ]);
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
    if (streamingBlocks.length === 0 && !streamingThinkingContent) {
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
    streamingBlocks.length,
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
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    try {
      const refreshTasks: Promise<unknown>[] = [refetchProjects()];

      if (activeSessionIdRef.current) {
        refreshTasks.push(refetch(), refetchActiveSession());
      }

      await Promise.all(refreshTasks);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, refetch, refetchActiveSession, refetchProjects]);

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
            console.log("handle stream", data);

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
      let requestSessionId: string | null = null;
      for (const [sessionId, requestId] of pending) {
        if (requestId === payload.requestId) {
          requestSessionId = sessionId;
          break;
        }
      }
      if (
        !requestSessionId ||
        requestSessionId !== activeSessionIdRef.current
      ) {
        return;
      }

      const responseSessionId = payload.sessionId || requestSessionId;
      if (responseSessionId !== requestSessionId) {
        activeSessionIdRef.current = responseSessionId;
        allowSessionChangeRecoveryRef.current = false;
        setActiveSessionId(responseSessionId);
        setActiveSessionAgentProviderId(activeAgentProviderIdRef.current);
      }

      flushStreamingContent();
      clearPendingStreamState(requestSessionId, payload.requestId);

      if (payload.messages) {
        queryClient.setQueryData(
          messageKeys.list(responseSessionId, activeAgentProviderIdRef.current),
          payload.messages,
        );
      }

      refreshActiveSessionSnapshot(
        shouldScheduleSessionRefresh(payload.messages, payload.output),
      );

      void queryClient.invalidateQueries({ queryKey: sessionsKeys.all });

      if (!payload.success) {
        showError(payload.error || "Failed to send message");
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
            sessionId: responseSessionId,
            agentProviderId: activeAgentProviderIdRef.current,
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
      showError(payload.message || "Failed to send message");
    },
  );

  const handlePermissionRequestRef = React.useRef(
    (payload: PermissionRequestEvent) => {
      const currentProject = session.activeProjectRef.current;
      const availableProjects = session.projectsRef.current ?? [];
      const requestAgentProviderId =
        payload.agentProviderId ?? activeAgentProviderIdRef.current;

      if (currentProject?.id !== payload.projectId) {
        const matchingProject = availableProjects.find(
          (project) => project.id === payload.projectId,
        );
        if (matchingProject) {
          session.setActiveProject(matchingProject);
        }
      }

      if (activeSessionIdRef.current !== payload.sessionId) {
        activeSessionIdRef.current = payload.sessionId;
        setActiveSessionAgentProviderId(requestAgentProviderId);
        setActiveSessionId(payload.sessionId);
      } else if (requestAgentProviderId) {
        setActiveSessionAgentProviderId(requestAgentProviderId);
      }

      setPendingPermission(payload);
      setPendingQuestion(null);

      if (!isAppInForeground()) {
        showPermissionNotification({
          requestId: payload.requestId,
          agentProviderId: requestAgentProviderId,
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
      const currentProject = session.activeProjectRef.current;
      const availableProjects = session.projectsRef.current ?? [];
      const requestAgentProviderId =
        payload.agentProviderId ?? activeAgentProviderIdRef.current;

      if (currentProject?.id !== payload.projectId) {
        const matchingProject = availableProjects.find(
          (project) => project.id === payload.projectId,
        );
        if (matchingProject) {
          session.setActiveProject(matchingProject);
        }
      }

      if (activeSessionIdRef.current !== payload.sessionId) {
        activeSessionIdRef.current = payload.sessionId;
        setActiveSessionAgentProviderId(requestAgentProviderId);
        setActiveSessionId(payload.sessionId);
      } else if (requestAgentProviderId) {
        setActiveSessionAgentProviderId(requestAgentProviderId);
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

  const mentionSuggestionCount =
    (composer.fileSuggestions?.length ?? 0) +
    (composer.appSuggestions?.length ?? 0);
  const mentionSuggestionHeight = composer.showMentionSuggestions
    ? Math.min(
        mentionSuggestionCount > 0 ? mentionSuggestionCount * 52 + 16 : 88,
        220,
      ) + 8
    : 0;
  const skillSuggestionCount = composer.skillSuggestions?.length ?? 0;
  const skillSuggestionHeight = composer.showSkillSuggestions
    ? Math.min(
        skillSuggestionCount > 0 ? skillSuggestionCount * 60 + 16 : 88,
        220,
      ) + 8
    : 0;
  const composerHeight =
    Math.min(
      MAX_INPUT_HEIGHT,
      Math.max(MIN_INPUT_HEIGHT, composer.inputHeight),
    ) +
    COMPOSER_TOP_PADDING +
    Math.max(insets.bottom, COMPOSER_BOTTOM_PADDING) +
    mentionSuggestionHeight +
    skillSuggestionHeight +
    keyboardHeight +
    (keyboardHeight > 0 ? KEYBOARD_ADDITIONAL_PADDING : 0);
  const measuredComposerHeight =
    composer.composerLayoutHeight || composerHeight;
  const isSessionSending = creatingSessionId
    ? true
    : activeSessionId
      ? pendingRequestIds.has(activeSessionId)
      : false;
  const footerThinkingContent = hasActiveStreamEvent
    ? streamingThinkingContent
    : null;
  const footerBlocks = hasActiveStreamEvent ? streamingBlocks : [];
  const footerPhase = hasActiveStreamEvent ? streamingPhase : "thinking";

  const handleSend = React.useCallback(async () => {
    if (!session.activeProject || !composer.trimmedInput || isSessionSending) {
      return;
    }

    const prompt = composer.trimmedInput;
    const appMentions = composer.selectedAppMentions;
    const requestId = `mobile_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    const optimisticMessageId = `optimistic_${requestId}`;
    let sessionId = activeSessionId;
    const isCreatingSession = !sessionId;
    const requestAgentProviderId =
      activeLookupAgentProviderId ?? session.activeModel?.agentProviderId;

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
    composer.resetInput();

    if (!sessionId) {
      const tempRequestId = `creating_${Date.now()}`;
      setCreatingSessionId(tempRequestId);
      try {
        const newSession = await createSessionMutation.mutateAsync({
          projectId: session.activeProject.id,
          agentProviderId: requestAgentProviderId,
        });
        const resolvedSessionId = newSession.id;
        sessionId = resolvedSessionId;
        allowSessionChangeRecoveryRef.current = false;
        setActiveSessionAgentProviderId(requestAgentProviderId);
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
        composer.restoreInput(prompt, appMentions);
        console.error(createError);
        showError("Failed to create session");
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
      projectId: session.activeProject.id,
      sessionId,
      agentProviderId: requestAgentProviderId,
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
        agentProviderId: requestAgentProviderId,
        projectId: session.activeProject.id,
        prompt,
        agent: session.activeAgent?.name,
        appMentions,
        model: session.activeModel
          ? {
              providerId: session.activeModel.providerId,
              modelId: session.activeModel.modelId,
            }
          : undefined,
      });
    } catch (error) {
      console.error("[Chat] Failed to send prompt:", error);
      clearPendingStreamState(sessionId, requestId);
      composer.restoreInput(prompt, appMentions);
      showError("Failed to send message. Please try again.");
    }
  }, [
    session.activeProject,
    activeLookupAgentProviderId,
    activeSessionId,
    isSessionSending,
    pendingRequestIds,
    activeSessionMessages,
    createSessionMutation,
    clearPendingStreamState,
    clearRequestRecoveryTimeout,
    recoverPendingStream,
    session.activeModel,
    session.activeAgent,
    showError,
    resetStreamingContent,
    composer,
  ]);

  const handleAbort = React.useCallback(async () => {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) {
      return;
    }

    const requestId = pendingRequestIdsRef.current.get(sessionId);
    if (!requestId || !session.activeProject) {
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
      agentProviderId: activeLookupAgentProviderId,
      projectId: session.activeProject.id,
    }).catch((error) => {
      console.error("[Chat] Failed to abort:", error);
    });
  }, [
    session.activeProject,
    activeLookupAgentProviderId,
    clearRequestRecoveryTimeout,
    resetStreamingContent,
  ]);

  const handlePermissionResponse = React.useCallback(
    async (reply: "once" | "always" | "reject") => {
      if (!pendingPermission) {
        return;
      }

      setIsRespondingToPermission(true);

      try {
        await sendPermissionResponse({
          requestId: pendingPermission.requestId,
          agentProviderId:
            pendingPermission.agentProviderId ?? activeLookupAgentProviderId,
          sessionId: pendingPermission.sessionId,
          jobId: pendingPermission.jobId,
          reply,
        });
        setPendingPermission(null);
      } catch (error) {
        console.error("[PermissionResponse] Failed to send:", error);
        showError(
          "The permission response was not delivered. Please try again.",
        );
      } finally {
        setIsRespondingToPermission(false);
      }
    },
    [pendingPermission, activeLookupAgentProviderId, showError],
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
          agentProviderId:
            pendingQuestion.agentProviderId ?? activeLookupAgentProviderId,
          sessionId: pendingQuestion.sessionId,
          jobId: pendingQuestion.jobId,
          answers,
        });
        setPendingQuestion(null);
      } catch (error) {
        console.error("[QuestionResponse] Failed to send:", error);
        showError("The answers were not delivered. Please try again.");
      } finally {
        setIsRespondingToQuestion(false);
      }
    },
    [pendingQuestion, activeLookupAgentProviderId, showError],
  );

  // Phase 3: Use a ref for displayedMessages so renderMessage stays stable
  const displayedMessagesRef = React.useRef(displayedMessages);
  displayedMessagesRef.current = displayedMessages;

  const renderMessage = React.useCallback(
    ({ item, index }: { item: SessionMessage; index: number }) => {
      const responseSummaryContext = getAssistantResponseSummaryContext(
        displayedMessagesRef.current,
        index,
      );
      const isLastAssistantMessage =
        item.role !== "assistant" ||
        displayedMessagesRef.current[index + 1]?.role !== "assistant";

      return (
        <MessageRow
          message={item}
          responseSummary={responseSummaryContext}
          showAssistantMeta={isLastAssistantMessage}
          showResponseSummary={isLastAssistantMessage}
          borderColor={colors.borderColor}
          metaColor={colors.metaColor}
          userBubble={colors.userBubble}
          assistantBubble={colors.assistantBubble}
          systemBubble={colors.systemBubble}
          textColor={theme.colors.onSurface}
        />
      );
    },
    [colors, theme.colors.onSurface],
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

  // Phase 4: Stable callbacks for drawers
  const handleOpenDrawer = React.useCallback(() => setShowDrawer(true), []);
  const handleCloseDrawer = React.useCallback(() => setShowDrawer(false), []);
  const handleOpenGitDrawer = React.useCallback(
    () => setShowGitDrawer(true),
    [],
  );
  const handleCloseGitDrawer = React.useCallback(
    () => setShowGitDrawer(false),
    [],
  );
  const handleOpenFileDrawer = React.useCallback(
    () => setShowFileDrawer(true),
    [],
  );
  const handleCloseFileDrawer = React.useCallback(
    () => setShowFileDrawer(false),
    [],
  );
  const handleCloseAgentProviderSheet = React.useCallback(
    () => setShowAgentProviderSheet(false),
    [],
  );
  const handleNewSession = React.useCallback(() => {
    setActiveSessionId(null);
    setOptimisticMessage(null);
  }, []);

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
          onPress={handleOpenDrawer}
          style={[
            styles.headerButton,
            {
              backgroundColor: theme.dark
                ? "rgba(17, 24, 39, 0.92)"
                : "rgba(255, 255, 255, 0.96)",
              borderColor: colors.borderColor,
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
          borderColor={colors.borderColor}
          onToggleMenu={handleToggleMenu}
          onRefreshPress={handleRefreshPress}
          onOpenGitDrawer={handleOpenGitDrawer}
          onOpenFileDrawer={handleOpenFileDrawer}
          onNewSession={handleNewSession}
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
                style={[
                  styles.retryButton,
                  { borderColor: colors.borderColor },
                ]}
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
              removeClippedSubviews
              maxToRenderPerBatch={5}
              updateCellsBatchingPeriod={50}
              windowSize={7}
              initialNumToRender={15}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text
                    variant="bodyLarge"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {session.activeProject
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
                    thinkingContent={footerThinkingContent}
                    blocks={footerBlocks}
                    phase={footerPhase}
                    borderColor={colors.borderColor}
                    assistantBubble={colors.assistantBubble}
                    metaColor={colors.metaColor}
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
                borderColor: colors.borderColor,
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
          activeProject={Boolean(session.activeProject)}
          activeAgentName={session.activeAgent?.name ?? "Default agent"}
          activeAgentProviderName={
            selectedAgentProvider?.agentProviderName ?? "No provider"
          }
          activeProjectName={session.activeProject?.name ?? "No project"}
          appSuggestions={composer.appSuggestions}
          appSuggestionsLoading={composer.appSuggestionsLoading}
          agentProviderLocked={Boolean(activeSessionId)}
          borderColor={colors.borderColor}
          branchName={session.currentBranch}
          fileSuggestions={composer.fileSuggestions}
          fileSuggestionsLoading={composer.fileSuggestionsLoading}
          inputHeight={composer.inputHeight}
          inputSelection={composer.inputSelection}
          inputText={composer.inputText}
          isSending={isSessionSending}
          onPressAgent={session.handleOpenAgentSheet}
          onPressAgentProvider={() => setShowAgentProviderSheet(true)}
          onPressBranch={session.handleOpenBranchSheet}
          mentionQuery={composer.activeMention?.query ?? ""}
          metaColor={colors.metaColor}
          onChangeText={composer.setInputText}
          onComposerLayout={composer.handleComposerLayout}
          onInputHeightChange={composer.setInputHeight}
          onPressModel={session.handleOpenProviderSheet}
          onPressProject={session.handleOpenProjectSheet}
          onSelectionChange={composer.handleInputSelectionChange}
          onSelectAppSuggestion={composer.handleSelectAppSuggestion}
          onSelectFileSuggestion={composer.handleSelectFileSuggestion}
          onSend={() => void handleSend()}
          onAbort={handleAbort}
          selectedModelDisplayName={
            session.activeModel ? session.activeModel.name : "No model"
          }
          showMentionSuggestions={composer.showMentionSuggestions}
          showSkillSuggestions={composer.showSkillSuggestions}
          skillSuggestions={composer.skillSuggestions}
          skillSuggestionsLoading={composer.skillSuggestionsLoading}
          onSelectSkillSuggestion={composer.handleSelectSkillSuggestion}
          trimmedInput={composer.trimmedInput}
        />
        <ErrorToast
          visible={errorToastVisible}
          message={errorToastMessage}
          onDismiss={() => setErrorToastVisible(false)}
          bottomOffset={
            keyboardHeight > 0
              ? keyboardHeight +
                measuredComposerHeight +
                KEYBOARD_ADDITIONAL_PADDING
              : measuredComposerHeight
          }
        />
      </View>

      <ProjectSelectionSheet
        visible={session.showProjectSheet}
        projects={session.sortedProjects}
        activeProjectId={session.activeProject?.id}
        loading={session.projectsLoading}
        refreshing={session.projectsRefetching}
        onClose={session.handleCloseProjectSheet}
        onRefresh={() => {
          void session.refetchProjects();
        }}
        onSelectProject={(item) => {
          if (item.id !== session.activeProject?.id) {
            activeSessionIdRef.current = null;
            clearPendingStreamState();
            session.setActiveProject(item);
            setActiveSessionId(null);
            setActiveSessionAgentProviderId(undefined);
            setOptimisticMessage(null);
            hasScrolledToBottom.current = false;
          }
          session.handleCloseProjectSheet();
        }}
      />

      <ModelSelectionSheet
        visible={session.showProviderSheet}
        groups={visibleModelGroups}
        activeModelId={session.activeModel?.id}
        loading={session.providersLoading}
        searchQuery={session.modelSearchQuery}
        onSearchChange={session.setModelSearchQuery}
        onClose={session.handleCloseProviderSheet}
        onSelectModel={session.handleSelectModel}
      />

      <AgentProviderSelectionSheet
        visible={showAgentProviderSheet}
        providers={availableAgentProviders}
        activeAgentProviderId={selectedAgentProvider?.agentProviderId}
        onClose={handleCloseAgentProviderSheet}
        onSelectProvider={(provider) => {
          session.handleSelectAgentProvider(provider.agentProviderId);
          setShowAgentProviderSheet(false);
        }}
      />

      <AgentSelectionSheet
        visible={session.showAgentSheet}
        agents={session.sortedAgents}
        activeAgentName={session.activeAgent?.name}
        loading={session.agentsLoading}
        searchQuery={session.agentSearchQuery}
        onSearchChange={session.setAgentSearchQuery}
        onClose={session.handleCloseAgentSheet}
        onSelectAgent={session.handleSelectAgent}
        getAgentSubtitle={getAgentSubtitle}
      />

      <BranchSelectionSheet
        visible={session.showBranchSheet}
        branches={session.sortedBranches}
        currentBranch={session.currentBranch}
        loading={session.branchesLoading}
        searchQuery={session.branchSearchQuery}
        onSearchChange={session.setBranchSearchQuery}
        onClose={session.handleCloseBranchSheet}
        onSelectBranch={async (item) => {
          if (item.name !== session.currentBranch) {
            await session.switchBranchMutation.mutateAsync(item.name);
          }
          session.handleCloseBranchSheet();
        }}
      />

      <SessionDrawer
        visible={showDrawer}
        onClose={handleCloseDrawer}
        activeProject={session.activeProject}
        activeSessionId={activeSessionId}
        onSelectSession={(sessionId, sessionAgentProviderId) => {
          if (sessionId === null) {
            activeSessionIdRef.current = null;
            clearPendingStreamState();
            setActiveSessionId(null);
            setActiveSessionAgentProviderId(undefined);
            setOptimisticMessage(null);
            hasScrolledToBottom.current = false;
          } else {
            clearRequestRecoveryTimeout();
            setActiveSessionAgentProviderId(
              sessionAgentProviderId ?? draftAgentProviderId,
            );
            setActiveSessionId(sessionId);
            activeSessionIdRef.current = sessionId;
            setOptimisticMessage(null);
            hasScrolledToBottom.current = false;
          }
        }}
      />

      <GitDrawer
        visible={showGitDrawer}
        onClose={handleCloseGitDrawer}
        activeProject={session.activeProject}
        borderColor={colors.borderColor}
        metaColor={colors.metaColor}
        backgroundColor={colors.sheetBg}
      />

      <FileDrawer
        visible={showFileDrawer}
        onClose={handleCloseFileDrawer}
        activeProject={session.activeProject}
        borderColor={colors.borderColor}
        metaColor={colors.metaColor}
        backgroundColor={colors.sheetBg}
      />

      {/* Message queue temporarily disabled
      <QueueDrawer
        visible={showQueueDrawer}
        onClose={() => setShowQueueDrawer(false)}
        activeProject={session.activeProject}
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
    paddingBottom: 16,
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
