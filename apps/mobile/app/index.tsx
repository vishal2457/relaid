import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Alert,
  FlatList,
  Keyboard,
  Modal,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  TextInputSelectionChangeEventData,
  View,
  type FlatList as FlatListType,
  type KeyboardEvent,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ChatComposer,
  COMPOSER_BOTTOM_PADDING,
  COMPOSER_TOP_PADDING,
  KEYBOARD_ADDITIONAL_PADDING,
  MAX_INPUT_HEIGHT,
  MIN_INPUT_HEIGHT,
} from "@/components/ChatComposer";
import { SessionDrawer } from "@/components/SessionDrawer";
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
} from "@/lib/api/messages";
import {
  clearActiveSessionStream,
  FOLLOW_UP_SESSION_REFRESH_DELAY_MS,
  getActiveSessionStream,
  hasRecoveredAssistantResponse,
  isStreamingSessionStatus,
  saveActiveSessionStream,
  shouldScheduleSessionRefresh,
} from "@/lib/active-session-stream";
import {
  useProjectFileSearch,
  useProjects,
  type Project,
  type ProjectFileMatch,
} from "@/lib/api/projects";
import {
  useProviders,
  type Provider,
  type ActiveModel,
  flattenProvidersToModels,
} from "@/lib/api/providers";
import { sessionsKeys, useCreateSession, useSession } from "@/lib/api/sessions";
import { queryClient } from "@/lib/query-client";
import { getChatSocket } from "@/lib/socket/chat";
import type { Socket } from "socket.io-client";
import {
  showNewMessageNotification,
  isAppInForeground,
} from "@/lib/notifications";
import { AppState, type AppStateStatus } from "react-native";
import { GitDrawer } from "@/components/GitDrawer";
import { MessageBubble, TypingIndicator } from "@/components/Message";

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

const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;

const LAST_SELECTED_PROJECT_ID = "LAST_SELECTED_PROJECT_ID";
const LAST_SELECTED_MODEL = "LAST_SELECTED_MODEL";

type SessionPromptStartedEvent = {
  requestId: string;
  projectId: string;
  sessionId: string;
};

type SessionPromptResponseEvent = {
  requestId: string;
  projectId: string;
  sessionId: string;
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  duration: number;
  messages?: SessionMessage[];
};

type SessionStreamChunkEvent = {
  requestId: string;
  projectId: string;
  sessionId: string;
  messageId?: string;
  chunk: string;
  type: "text" | "reasoning" | "tool" | "step" | "status" | "complete";
  isComplete?: boolean;
};

export default function ChatScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const flatListRef = React.useRef<FlatListType<SessionMessage>>(null);
  const [expandedThinking, setExpandedThinking] = React.useState<
    Record<string, boolean>
  >({});
  const [inputText, setInputText] = React.useState("");
  const [inputSelection, setInputSelection] = React.useState<ComposerSelection>(
    {
      start: 0,
      end: 0,
    },
  );
  const [inputHeight, setInputHeight] = React.useState(MIN_INPUT_HEIGHT);
  const [pendingRequestId, setPendingRequestId] = React.useState<string | null>(
    null,
  );
  const pendingRequestIdRef = React.useRef<string | null>(null);
  const activeSessionIdRef = React.useRef<string | null>(null);
  const allowSessionChangeRecoveryRef = React.useRef(false);
  const [streamingContent, setStreamingContent] = React.useState("");
  const streamingContentRef = React.useRef("");
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
  const [activeProject, setActiveProject] = React.useState<Project | null>(
    null,
  );
  const [activeProvider, setActiveProvider] = React.useState<Provider | null>(
    null,
  );
  const [activeModel, setActiveModel] = React.useState<ActiveModel | null>(
    null,
  );
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(
    null,
  );
  const [showDrawer, setShowDrawer] = React.useState(false);
  const [showGitDrawer, setShowGitDrawer] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  const [isNearBottom, setIsNearBottom] = React.useState(true);
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

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

  const [connectionState, setConnectionState] =
    React.useState<ConnectionState>("disconnected");
  const reconnectAttemptRef = React.useRef(0);
  const reconnectTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const heartbeatIntervalRef = React.useRef<ReturnType<
    typeof setInterval
  > | null>(null);
  const lastPongRef = React.useRef<number>(Date.now());
  const socketRef = React.useRef<Socket | null>(null);
  const isMountedRef = React.useRef(true);
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);

  const createSessionMutation = useCreateSession();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: providers, isLoading: providersLoading } = useProviders();
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

  React.useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  React.useEffect(() => {
    pendingRequestIdRef.current = pendingRequestId;
  }, [pendingRequestId]);

  React.useEffect(() => {
    streamingContentRef.current = streamingContent;
  }, [streamingContent]);

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
      }
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
            pendingRequestIdRef.current = activeStream.requestId;
            setActiveProject(streamingProject);
            setActiveSessionId(activeStream.sessionId);
            setPendingRequestId(activeStream.requestId);
            setOptimisticMessage(null);
            setStreamingContent("");
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
  }, [projects]);

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

  const displayedMessages = React.useMemo(() => {
    if (!optimisticMessage) {
      return messages ?? [];
    }
    return [...(messages ?? []), optimisticMessage];
  }, [messages, optimisticMessage]);

  const sortedModels = React.useMemo(() => {
    const models = flattenProvidersToModels(providers ?? []);
    if (!activeModel) return models;
    const sorted = [...models];
    sorted.sort((a, b) =>
      a.id === activeModel.id ? -1 : b.id === activeModel.id ? 1 : 0,
    );
    return sorted;
  }, [providers, activeModel]);

  const sortedProjects = React.useMemo(() => {
    if (!activeProject) return projects ?? [];
    const sorted = [...(projects ?? [])];
    sorted.sort((a, b) =>
      a.id === activeProject.id ? -1 : b.id === activeProject.id ? 1 : 0,
    );
    return sorted;
  }, [projects, activeProject]);

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
    if (!streamingContent) {
      return;
    }

    const timer = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 50);

    return () => clearTimeout(timer);
  }, [streamingContent]);

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

  const clearPendingStreamState = React.useCallback(
    (requestId?: string) => {
      pendingRequestIdRef.current = null;
      setPendingRequestId(null);
      setOptimisticMessage(null);
      setStreamingContent("");
      streamingContentRef.current = "";
      clearFollowUpRefreshTimeout();
      clearRequestRecoveryTimeout();
      void clearActiveSessionStream(requestId);
    },
    [clearFollowUpRefreshTimeout, clearRequestRecoveryTimeout],
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

    pendingRequestIdRef.current = activeStream.requestId;
    setPendingRequestId(activeStream.requestId);
    setOptimisticMessage(null);
    setStreamingContent("");
    streamingContentRef.current = "";

    const [sessionResult, messagesResult] = await Promise.allSettled([
      refetchActiveSession(),
      refetch(),
    ]);

    if (sessionResult.status !== "fulfilled") {
      return;
    }

    const recoveredMessages =
      messagesResult.status === "fulfilled"
        ? messagesResult.value.data
        : undefined;

    if (
      !isStreamingSessionStatus(sessionResult.value.data?.status) &&
      hasRecoveredAssistantResponse(
        recoveredMessages,
        activeStream.baselineMessageId,
      )
    ) {
      clearPendingStreamState(activeStream.requestId);
    }
  }, [clearPendingStreamState, refetch, refetchActiveSession]);

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
      pendingRequestIdRef.current
    ) {
      allowSessionChangeRecoveryRef.current = false;
      void recoverPendingStream();
    }
  }, [activeSessionId, recoverPendingStream]);

  const connectSocket = React.useCallback(() => {
    if (!isMountedRef.current) return;

    const socket = getChatSocket();
    if (!socket) {
      socketRef.current = null;
      setConnectionState("disconnected");
      return;
    }

    socketRef.current = socket;

    if (!socket.connected) {
      setConnectionState("connecting");
      socket.connect();
    } else {
      setConnectionState("connected");
    }
  }, []);

  const scheduleReconnect = React.useCallback(() => {
    if (!isMountedRef.current) return;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttemptRef.current),
      RECONNECT_MAX_DELAY,
    );

    reconnectAttemptRef.current += 1;

    reconnectTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        connectSocket();
      }
    }, delay);
  }, [connectSocket]);

  const startHeartbeat = React.useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      if (socketRef.current?.connected) {
        socketRef.current.emit("ping");

        if (Date.now() - lastPongRef.current > 60000) {
          console.log("[Chat] Heartbeat timeout, reconnecting...");
          socketRef.current.disconnect();
          setConnectionState("error");
          scheduleReconnect();
        }
      }
    }, 30000);
  }, [scheduleReconnect]);

  const stopHeartbeat = React.useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const handlePromptStartedRef = React.useRef(
    (payload: SessionPromptStartedEvent) => {
      if (
        payload.requestId === pendingRequestIdRef.current &&
        payload.sessionId === activeSessionIdRef.current
      ) {
        setPendingRequestId(payload.requestId);
      }
    },
  );

  const handleStreamChunkRef = React.useRef(
    (payload: SessionStreamChunkEvent) => {
      if (
        payload.requestId !== pendingRequestIdRef.current ||
        payload.sessionId !== activeSessionIdRef.current
      ) {
        return;
      }

      if (payload.type === "text" || payload.type === "reasoning") {
        setStreamingContent((prev) => prev + payload.chunk);
      }
    },
  );

  const handlePromptResponseRef = React.useRef(
    (payload: SessionPromptResponseEvent) => {
      if (
        payload.requestId !== pendingRequestIdRef.current ||
        payload.sessionId !== activeSessionIdRef.current
      ) {
        return;
      }

      clearPendingStreamState(payload.requestId);

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
        );
      }
    },
  );

  const handleErrorResponseRef = React.useRef(
    (payload: { requestId?: string; message?: string }) => {
      if (payload.requestId !== pendingRequestIdRef.current) {
        return;
      }

      clearPendingStreamState(payload.requestId);
      Alert.alert("Socket error", payload.message || "Failed to send message");
    },
  );

  const handleConnectRef = React.useRef(() => {
    if (!isMountedRef.current) return;

    console.log("[Chat] Socket connected");
    setConnectionState("connected");
    reconnectAttemptRef.current = 0;
    lastPongRef.current = Date.now();
    startHeartbeat();

    if (activeSessionIdRef.current && pendingRequestIdRef.current) {
      void recoverPendingStream();
    }
  });

  const handleDisconnectRef = React.useRef((reason: string) => {
    if (!isMountedRef.current) return;

    console.log("[Chat] Socket disconnected:", reason);
    setConnectionState("disconnected");
    stopHeartbeat();

    if (reason !== "io client disconnect") {
      scheduleReconnect();
    }
  });

  const handleConnectErrorRef = React.useRef((error: Error) => {
    if (!isMountedRef.current) return;

    console.log("[Chat] Socket connection error:", error.message);
    setConnectionState("error");
    stopHeartbeat();
    scheduleReconnect();
  });

  const handlePongRef = React.useRef(() => {
    lastPongRef.current = Date.now();
  });

  React.useEffect(() => {
    const socket = getChatSocket();
    if (!socket) {
      socketRef.current = null;
      setConnectionState("disconnected");
      return;
    }

    socketRef.current = socket;

    socket.on("session_prompt_started", handlePromptStartedRef.current);
    socket.on("session_stream_chunk", handleStreamChunkRef.current);
    socket.on("session_prompt_response", handlePromptResponseRef.current);
    socket.on("error_response", handleErrorResponseRef.current);
    socket.on("connect", handleConnectRef.current);
    socket.on("disconnect", handleDisconnectRef.current);
    socket.on("connect_error", handleConnectErrorRef.current);
    socket.on("pong", handlePongRef.current);

    if (!socket.connected) {
      connectSocket();
    } else {
      setConnectionState("connected");
      startHeartbeat();
    }

    return () => {
      socket.off("session_prompt_started", handlePromptStartedRef.current);
      socket.off("session_stream_chunk", handleStreamChunkRef.current);
      socket.off("session_prompt_response", handlePromptResponseRef.current);
      socket.off("error_response", handleErrorResponseRef.current);
      socket.off("connect", handleConnectRef.current);
      socket.off("disconnect", handleDisconnectRef.current);
      socket.off("connect_error", handleConnectErrorRef.current);
      socket.off("pong", handlePongRef.current);
    };
  }, [
    connectSocket,
    startHeartbeat,
    stopHeartbeat,
    scheduleReconnect,
    recoverPendingStream,
    clearPendingStreamState,
    refreshActiveSessionSnapshot,
  ]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        const prevState = appStateRef.current;
        appStateRef.current = nextState;

        if (!isMountedRef.current) return;

        if (nextState === "active" && prevState !== "active") {
          console.log("[Chat] App became active, checking connection...");

          if (socketRef.current) {
            if (!socketRef.current.connected) {
              console.log("[Chat] Socket disconnected, reconnecting...");
              connectSocket();
            } else {
              socketRef.current.emit("ping");
            }
          }

          if (pendingRequestIdRef.current) {
            void recoverPendingStream();
          }
        } else if (nextState === "background" && prevState === "active") {
          console.log("[Chat] App went to background");
        }
      },
    );

    return () => subscription.remove();
  }, [connectSocket, recoverPendingStream]);

  const borderColor = theme.dark ? "#2A3441" : "#D9E2EC";
  const metaColor = theme.dark ? "#B8C2D1" : "#526277";
  const userBubble = theme.dark ? "#1D4ED8" : "#DBEAFE";
  const assistantBubble = theme.dark ? "#1F2937" : "#FFFFFF";
  const systemBubble = theme.dark ? "#3F3F46" : "#E2E8F0";
  const thinkingSurface = theme.dark ? "#111827" : "#F8FAFC";
  const sheetBg = theme.dark ? "#1E293B" : "#FFFFFF";
  const showMentionSuggestions = Boolean(activeProject && activeMention);
  const mentionSuggestionCount = fileSuggestions?.length ?? 0;
  const mentionSuggestionHeight = showMentionSuggestions
    ? Math.min(
        mentionSuggestionCount > 0 ? mentionSuggestionCount * 52 + 16 : 88,
        220,
      ) + 8
    : 0;
  const composerHeight =
    Math.min(MAX_INPUT_HEIGHT, Math.max(MIN_INPUT_HEIGHT, inputHeight)) +
    COMPOSER_TOP_PADDING +
    Math.max(insets.bottom, COMPOSER_BOTTOM_PADDING) +
    mentionSuggestionHeight +
    keyboardHeight +
    (keyboardHeight > 0 ? KEYBOARD_ADDITIONAL_PADDING : 0);
  const trimmedInput = inputText.trim();
  const isSending = pendingRequestId !== null;

  const handleSend = React.useCallback(async () => {
    if (!activeProject || !trimmedInput || isSending) {
      return;
    }

    const socket = getChatSocket();
    if (!socket) {
      Alert.alert("Connection Error", "This device is not paired yet.");
      return;
    }

    if (!socket.connected) {
      console.log("[Chat] Socket not connected, connecting...");
      socket.connect();
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (!socket.connected) {
        Alert.alert(
          "Connection Error",
          "Unable to connect to server. Please try again.",
        );
        return;
      }
    }

    let sessionId = activeSessionId;

    if (!sessionId) {
      try {
        const session = await createSessionMutation.mutateAsync(
          activeProject.id,
        );
        sessionId = session.id;
        allowSessionChangeRecoveryRef.current = false;
        setActiveSessionId(sessionId);
      } catch (createError) {
        console.error(createError);
        Alert.alert("Error", "Failed to create session");
        return;
      }
    }

    const requestId = `mobile_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;

    setPendingRequestId(requestId);
    pendingRequestIdRef.current = requestId;
    activeSessionIdRef.current = sessionId;
    setOptimisticMessage({
      id: `optimistic_${requestId}`,
      sessionID: sessionId,
      role: "user",
      content: trimmedInput,
      visibleContent: trimmedInput,
      thinkingContent: null,
      thinkingDurationSeconds: null,
      parts: [{ type: "text", content: trimmedInput, durationSeconds: null }],
      createdAt: Date.now(),
    });
    setStreamingContent("");
    streamingContentRef.current = "";
    setInputText("");
    setInputSelection({ start: 0, end: 0 });
    setInputHeight(MIN_INPUT_HEIGHT);
    void saveActiveSessionStream({
      requestId,
      projectId: activeProject.id,
      sessionId,
      baselineMessageId: messages?.[messages.length - 1]?.id ?? null,
    });

    clearRequestRecoveryTimeout();
    requestRecoveryTimeoutRef.current = setTimeout(() => {
      requestRecoveryTimeoutRef.current = null;
      if (pendingRequestIdRef.current === requestId) {
        void recoverPendingStream();
      }
    }, 60_000);

    socket.emit("session_prompt_request", {
      requestId,
      projectId: activeProject.id,
      sessionId,
      prompt: trimmedInput,
      model: activeModel
        ? {
            providerId: activeModel.providerId,
            modelId: activeModel.id,
          }
        : undefined,
    });
  }, [
    activeProject,
    activeSessionId,
    trimmedInput,
    isSending,
    messages,
    createSessionMutation,
    clearRequestRecoveryTimeout,
    recoverPendingStream,
    activeModel,
  ]);

  const toggleThinking = React.useCallback((messageId: string) => {
    setExpandedThinking((current: Record<string, boolean>) => ({
      ...current,
      [messageId]: !current[messageId],
    }));
  }, []);

  const renderMessage = React.useCallback(
    ({ item }: { item: SessionMessage }) => {
      console.log(item, "itemb");

      return (
        <MessageBubble
          message={item}
          isThinkingExpanded={Boolean(expandedThinking[item.id])}
          onToggleThinking={toggleThinking}
          borderColor={borderColor}
          metaColor={metaColor}
          userBubble={userBubble}
          assistantBubble={assistantBubble}
          systemBubble={systemBubble}
          thinkingSurface={thinkingSurface}
          surfaceColor={assistantBubble}
          textColor={theme.colors.onSurface}
        />
      );
    },
    [
      expandedThinking,
      borderColor,
      metaColor,
      userBubble,
      assistantBubble,
      systemBubble,
      thinkingSurface,
      theme.colors.onSurface,
      toggleThinking,
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
  }, []);

  const handleSelectFileSuggestion = React.useCallback(
    (match: ProjectFileMatch) => {
      if (!activeMention) {
        return;
      }

      const replacement = `${match.path} `;
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
        <View style={[styles.buttonGroup, { borderColor }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh session"
            onPress={handleRefreshPress}
            disabled={isRefreshing}
            style={[
              styles.gitButton,
              {
                backgroundColor: theme.dark
                  ? "rgba(17, 24, 39, 0.92)"
                  : "rgba(255, 255, 255, 0.96)",
              },
            ]}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color={theme.colors.onSurface} />
            ) : (
              <MaterialCommunityIcons
                name="refresh"
                size={20}
                color={theme.colors.onSurface}
              />
            )}
          </Pressable>
          <View
            style={[
              styles.buttonGroupDivider,
              { backgroundColor: borderColor },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Git drawer"
            onPress={() => setShowGitDrawer(true)}
            style={[
              styles.gitButton,
              {
                backgroundColor: theme.dark
                  ? "rgba(17, 24, 39, 0.92)"
                  : "rgba(255, 255, 255, 0.96)",
              },
            ]}
          >
            <MaterialCommunityIcons
              name="source-branch"
              size={20}
              color={theme.colors.onSurface}
            />
          </Pressable>
          <View
            style={[
              styles.buttonGroupDivider,
              { backgroundColor: borderColor },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New session"
            onPress={() => {
              setActiveSessionId(null);
              setOptimisticMessage(null);
            }}
            style={[
              styles.gitButton,
              {
                backgroundColor: theme.dark
                  ? "rgba(17, 24, 39, 0.92)"
                  : "rgba(255, 255, 255, 0.96)",
              },
            ]}
          >
            <MaterialCommunityIcons
              name="plus"
              size={20}
              color={theme.colors.onSurface}
            />
          </Pressable>
        </View>
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
                  paddingTop: insets.top + 72,
                  paddingBottom: composerHeight,
                },
              ]}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode={
                Platform.OS === "ios" ? "interactive" : "on-drag"
              }
              keyboardShouldPersistTaps="handled"
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
                isSending ? (
                  <TypingIndicator
                    streamingContent={streamingContent}
                    borderColor={borderColor}
                    assistantBubble={assistantBubble}
                  />
                ) : null
              }
            />
          )}
        </View>
        <ChatComposer
          activeProject={Boolean(activeProject)}
          activeProjectName={activeProject?.name ?? "No project"}
          borderColor={borderColor}
          fileSuggestions={fileSuggestions}
          fileSuggestionsLoading={fileSuggestionsLoading}
          inputHeight={inputHeight}
          inputSelection={inputSelection}
          inputText={inputText}
          isSending={isSending}
          mentionQuery={activeMention?.query ?? ""}
          metaColor={metaColor}
          onChangeText={setInputText}
          onInputHeightChange={setInputHeight}
          onPressModel={() => setShowProviderSheet(true)}
          onPressProject={() => setShowProjectSheet(true)}
          onSelectionChange={handleInputSelectionChange}
          onSelectFileSuggestion={handleSelectFileSuggestion}
          onSend={() => void handleSend()}
          selectedModelName={activeModel?.name ?? "No model"}
          showMentionSuggestions={showMentionSuggestions}
          trimmedInput={trimmedInput}
        />
      </View>

      {!isNearBottom && (
        <Pressable
          onPress={scrollToBottom}
          style={[
            styles.scrollToBottomButton,
            {
              backgroundColor: theme.dark ? "#1E293B" : "#FFFFFF",
              borderColor,
              shadowColor: theme.dark ? "#000" : "#000",
              bottom: composerHeight + 12,
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

      <Modal
        visible={showProjectSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProjectSheet(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setShowProjectSheet(false)}
        >
          <View style={[styles.sheetContainer, { backgroundColor: sheetBg }]}>
            <View style={styles.sheetHandle} />
            <Text variant="titleMedium" style={styles.sheetTitle}>
              Select Project
            </Text>
            {projectsLoading ? (
              <View style={styles.sheetLoading}>
                <ActivityIndicator />
              </View>
            ) : (
              <FlatList
                data={sortedProjects}
                keyExtractor={(item) => item.id}
                style={styles.sheetList}
                renderItem={({ item }) => {
                  const isActiveProject = activeProject?.id === item.id;
                  return (
                    <Pressable
                      onPress={() => {
                        if (item.id !== activeProject?.id) {
                          setActiveProject(item);
                          setActiveSessionId(null);
                          setOptimisticMessage(null);
                          hasScrolledToBottom.current = false;
                        }
                        setShowProjectSheet(false);
                      }}
                      style={[
                        styles.sheetItem,
                        {
                          backgroundColor: isActiveProject
                            ? "rgba(150,150,150,0.12)"
                            : "transparent",
                          borderColor,
                        },
                      ]}
                    >
                      <View style={styles.sheetItemRow}>
                        <View
                          style={[
                            styles.statusDot,
                            {
                              backgroundColor: isActiveProject
                                ? "#00FF41"
                                : "#F2A900",
                            },
                          ]}
                        />
                        <View style={styles.sheetItemContent}>
                          <Text
                            variant="bodyLarge"
                            style={{
                              fontWeight: isActiveProject ? "600" : "500",
                              color: theme.colors.onSurface,
                            }}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                          <Text
                            variant="bodySmall"
                            style={{ color: metaColor, marginTop: 2 }}
                            numberOfLines={1}
                          >
                            {item.folder || "No folder path"}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.sheetEmpty}>
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      No projects found
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showProviderSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProviderSheet(false)}
      >
        <Pressable
          style={styles.sheetOverlay}
          onPress={() => setShowProviderSheet(false)}
        >
          <View style={[styles.sheetContainer, { backgroundColor: sheetBg }]}>
            <View style={styles.sheetHandle} />
            <Text variant="titleMedium" style={styles.sheetTitle}>
              Select Model
            </Text>
            {providersLoading ? (
              <View style={styles.sheetLoading}>
                <ActivityIndicator />
              </View>
            ) : (
              <FlatList
                data={sortedModels}
                keyExtractor={(item) => item.id}
                style={styles.sheetList}
                renderItem={({ item }) => {
                  const isActiveModel = activeModel?.id === item.id;
                  return (
                    <Pressable
                      onPress={() => {
                        setActiveModel(item);
                        setShowProviderSheet(false);
                      }}
                      style={[
                        styles.sheetItem,
                        {
                          backgroundColor: isActiveModel
                            ? "rgba(150,150,150,0.12)"
                            : "transparent",
                          borderColor,
                        },
                      ]}
                    >
                      <View style={styles.sheetItemRow}>
                        <View
                          style={[
                            styles.statusDot,
                            {
                              backgroundColor: isActiveModel
                                ? "#00FF41"
                                : "#6366F1",
                            },
                          ]}
                        />
                        <View style={styles.sheetItemContent}>
                          <Text
                            variant="bodyLarge"
                            style={{
                              fontWeight: isActiveModel ? "600" : "500",
                              color: theme.colors.onSurface,
                            }}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                          <Text
                            variant="bodySmall"
                            style={{ color: metaColor, marginTop: 2 }}
                            numberOfLines={1}
                          >
                            {item.providerName}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.sheetEmpty}>
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      No models found
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </Pressable>
      </Modal>

      <SessionDrawer
        visible={showDrawer}
        onClose={() => setShowDrawer(false)}
        activeProject={activeProject}
        activeSessionId={activeSessionId}
        onSelectSession={(sessionId) => {
          if (sessionId === null) {
            setActiveSessionId(null);
            setOptimisticMessage(null);
            hasScrolledToBottom.current = false;
          } else {
            setActiveSessionId(sessionId);
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
  buttonGroup: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
  },
  buttonGroupDivider: {
    width: 1,
    height: "100%",
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
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "60%",
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  sheetTitle: {
    fontWeight: "700",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  sheetLoading: {
    padding: 32,
    alignItems: "center",
  },
  sheetList: {
    paddingHorizontal: 12,
  },
  sheetItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  sheetItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sheetItemContent: {
    flex: 1,
  },
  sheetEmpty: {
    padding: 32,
    alignItems: "center",
  },
  gitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 40,
    width: 40,
  },
  scrollToBottomButton: {
    position: "absolute",
    right: 16,
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
});
