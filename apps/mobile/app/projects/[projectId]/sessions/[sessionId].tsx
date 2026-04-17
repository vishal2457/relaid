import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Alert,
  AppState,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
  type FlatList as FlatListType,
  type KeyboardEvent,
} from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Button, Text, useTheme } from "react-native-paper";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import {
  messageKeys,
  useSessionMessages,
  type SessionMessage,
} from "@/lib/api/messages";
import { sessionsKeys, useCreateSession, useSession } from "@/lib/api/sessions";
import {
  clearActiveSessionStream,
  FOLLOW_UP_SESSION_REFRESH_DELAY_MS,
  getActiveSessionStream,
  isStreamingSessionStatus,
  saveActiveSessionStream,
  shouldScheduleSessionRefresh,
} from "@/lib/active-session-stream";
import { queryClient } from "@/lib/query-client";
import { showPermissionNotification } from "@/lib/permission-notifications";
import { isAppInForeground } from "@/lib/notifications";
import { useLiveAssistantStream } from "@/lib/live-assistant-stream";
import {
  connectSseClient,
  getSseClient,
  sendPromptRequest,
  sendAbortRequest,
  sendPermissionResponse,
  sendQuestionResponse,
  subscribeToSse,
} from "@/lib/sse";
import type {
  SessionPromptResponseEvent,
  SessionStreamChunkEvent,
} from "@/lib/sse/events";
import {
  PermissionCard,
  QuestionCard,
  type PermissionRequest,
  type QuestionRequest,
} from "@/components/PermissionCard";
import { MessageRow, TypingIndicator } from "@/components/Message";
import { getAssistantResponseSummaryContext } from "@/components/Message/getAssistantResponseSummary";

const MIN_INPUT_HEIGHT = 44;
const MAX_INPUT_HEIGHT = 150;
const COMPOSER_TOP_PADDING = 12;
const COMPOSER_BOTTOM_PADDING = 12;
const KEYBOARD_ADDITIONAL_PADDING = 16;

type SessionPromptStartedEvent = {
  requestId: string;
  projectId: string;
  sessionId: string;
};

type PermissionRequestEvent = PermissionRequest;
type QuestionRequestEvent = QuestionRequest;

export default function SessionMessagesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = React.useRef<FlatListType<SessionMessage>>(null);
  const [inputText, setInputText] = React.useState("");
  const [inputHeight, setInputHeight] = React.useState(MIN_INPUT_HEIGHT);
  const [pendingRequestId, setPendingRequestId] = React.useState<string | null>(
    null,
  );
  const pendingRequestIdRef = React.useRef<string | null>(null);
  const {
    visibleText: streamingContent,
    thinkingContent: streamingThinkingContent,
    activities: streamingActivities,
    phase: streamingPhase,
    revision: streamingRevision,
    applyChunk: applyStreamingChunk,
    flush: flushStreamingContent,
    reset: resetStreamingContent,
    hasContent: hasStreamingContent,
  } = useLiveAssistantStream();
  const [optimisticMessage, setOptimisticMessage] =
    React.useState<SessionMessage | null>(null);
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
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

  const followUpRefreshTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const createSessionMutation = useCreateSession();

  const { projectId, sessionId } = useLocalSearchParams<{
    projectId: string;
    sessionId: string;
  }>();

  const {
    data: messages,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useSessionMessages(sessionId ?? "");
  const { refetch: refetchSession } = useSession(sessionId ?? "");

  const displayedMessages = React.useMemo(() => {
    if (!optimisticMessage) {
      return messages ?? [];
    }

    return [...(messages ?? []), optimisticMessage];
  }, [messages, optimisticMessage]);

  // Scroll to bottom on initial load when messages arrive
  const hasScrolledToBottom = React.useRef(false);
  React.useEffect(() => {
    if (messages && messages.length > 0 && !hasScrolledToBottom.current) {
      // Small delay to ensure layout is complete
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
        hasScrolledToBottom.current = true;
      }, 100);
    }
  }, [messages]);

  // Scroll to bottom whenever a new message is added
  const prevMessageCount = React.useRef(displayedMessages.length);
  React.useEffect(() => {
    if (displayedMessages.length > prevMessageCount.current) {
      prevMessageCount.current = displayedMessages.length;
      // Delay to let FlatList render + keyboard animation complete
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
      flatListRef.current?.scrollToEnd({ animated: false });
    }, 120);
  }, [
    streamingActivities.length,
    streamingContent,
    streamingRevision,
    streamingThinkingContent,
  ]);

  React.useEffect(() => {
    pendingRequestIdRef.current = pendingRequestId;
  }, [pendingRequestId]);

  const clearFollowUpRefreshTimeout = React.useCallback(() => {
    if (followUpRefreshTimeoutRef.current) {
      clearTimeout(followUpRefreshTimeoutRef.current);
      followUpRefreshTimeoutRef.current = null;
    }
  }, []);

  const refreshSessionSnapshot = React.useCallback(
    (followUp = false) => {
      void refetch();
      void refetchSession();

      if (!followUp) {
        clearFollowUpRefreshTimeout();
        return;
      }

      clearFollowUpRefreshTimeout();
      followUpRefreshTimeoutRef.current = setTimeout(() => {
        followUpRefreshTimeoutRef.current = null;
        void refetch();
        void refetchSession();
      }, FOLLOW_UP_SESSION_REFRESH_DELAY_MS);
    },
    [clearFollowUpRefreshTimeout, refetch, refetchSession],
  );

  const clearPendingStreamState = React.useCallback(
    (requestId?: string) => {
      pendingRequestIdRef.current = null;
      setPendingRequestId(null);
      setOptimisticMessage(null);
      resetStreamingContent();
      clearFollowUpRefreshTimeout();
      void clearActiveSessionStream(requestId);
    },
    [clearFollowUpRefreshTimeout, resetStreamingContent],
  );

  const recoverPendingStream = React.useCallback(async () => {
    if (!projectId || !sessionId) {
      return;
    }

    const activeStream = await getActiveSessionStream();
    if (
      !activeStream ||
      activeStream.projectId !== projectId ||
      activeStream.sessionId !== sessionId
    ) {
      return;
    }

    pendingRequestIdRef.current = activeStream.requestId;
    setPendingRequestId(activeStream.requestId);
    setOptimisticMessage(null);
    resetStreamingContent();

    const [sessionResult] = await Promise.allSettled([
      refetchSession(),
      refetch(),
    ]);

    if (sessionResult.status !== "fulfilled") {
      return;
    }

    const recoveredStatus = sessionResult.value.data?.status;

    if (!isStreamingSessionStatus(recoveredStatus)) {
      flushStreamingContent();
      clearPendingStreamState(activeStream.requestId);
    }
  }, [
    clearPendingStreamState,
    flushStreamingContent,
    projectId,
    refetch,
    refetchSession,
    resetStreamingContent,
    sessionId,
  ]);

  React.useEffect(() => {
    return () => {
      clearFollowUpRefreshTimeout();
    };
  }, [clearFollowUpRefreshTimeout]);

  React.useEffect(() => {
    void recoverPendingStream();
  }, [recoverPendingStream]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        const sseClient = getSseClient();
        if (!sseClient || sseClient.getState() !== "connected") {
          connectSseClient();
        }

        if (pendingRequestIdRef.current) {
          void recoverPendingStream();
        }
      }
    });

    return () => subscription.remove();
  }, [recoverPendingStream]);

  React.useEffect(() => {
    if (!sessionId || !projectId) {
      return;
    }

    const handlePromptStarted = (payload: SessionPromptStartedEvent) => {
      if (
        payload.requestId === pendingRequestIdRef.current &&
        payload.sessionId === sessionId
      ) {
        setPendingRequestId(payload.requestId);
      }
    };

    const handleStreamChunk = (payload: SessionStreamChunkEvent) => {
      if (
        payload.requestId !== pendingRequestIdRef.current ||
        payload.sessionId !== sessionId
      ) {
        return;
      }

      applyStreamingChunk(payload);
    };

    const handlePromptResponse = (payload: SessionPromptResponseEvent) => {
      if (
        payload.requestId !== pendingRequestIdRef.current ||
        payload.sessionId !== sessionId
      ) {
        return;
      }

      flushStreamingContent();
      clearPendingStreamState(payload.requestId);

      if (payload.messages) {
        queryClient.setQueryData(messageKeys.list(sessionId), payload.messages);
      }

      refreshSessionSnapshot(
        shouldScheduleSessionRefresh(payload.messages, payload.output),
      );

      void queryClient.invalidateQueries({ queryKey: sessionsKeys.all });

      if (!payload.success) {
        Alert.alert(
          "OpenCode failed",
          payload.error || "Failed to send message",
        );
      }
    };

    const handleErrorResponse = (payload: {
      requestId?: string;
      message?: string;
    }) => {
      if (payload.requestId !== pendingRequestIdRef.current) {
        return;
      }

      flushStreamingContent();
      clearPendingStreamState(payload.requestId);
      Alert.alert("Error", payload.message || "Failed to send message");
    };

    const handlePermissionRequest = (payload: PermissionRequestEvent) => {
      if (payload.projectId !== projectId) {
        return;
      }

      setPendingPermission(payload);
      setPendingQuestion(null);

      if (!isAppInForeground()) {
        showPermissionNotification({
          requestId: payload.requestId,
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
    };

    const handleQuestionRequest = (payload: QuestionRequestEvent) => {
      if (payload.projectId !== projectId) {
        return;
      }

      setPendingQuestion(payload);
      setPendingPermission(null);
    };

    const { unsubscribe } = subscribeToSse({
      onEvent(event, data) {
        switch (event) {
          case "session_prompt_started":
            handlePromptStarted(data as unknown as SessionPromptStartedEvent);
            break;
          case "session_stream_chunk":
            handleStreamChunk(data as unknown as SessionStreamChunkEvent);
            break;
          case "session_prompt_response":
            handlePromptResponse(data as unknown as SessionPromptResponseEvent);
            break;
          case "error_response":
            handleErrorResponse(
              data as { requestId?: string; message?: string },
            );
            break;
          case "permission_request":
            handlePermissionRequest(data as unknown as PermissionRequestEvent);
            break;
          case "question_request":
            handleQuestionRequest(data as unknown as QuestionRequestEvent);
            break;
        }
      },
      onConnect() {
        console.log("[SSE] Connected", { projectId, sessionId });
        if (pendingRequestIdRef.current) {
          void recoverPendingStream();
        }
      },
      onDisconnect() {
        console.log("[SSE] Disconnected", { projectId, sessionId });
      },
      onError(error) {
        console.log("[SSE] Error:", error.message);
      },
    });

    const sseClient = connectSseClient() ?? getSseClient();
    if (sseClient) {
      sseClient.connect();
    }

    return () => {
      unsubscribe();
    };
  }, [
    applyStreamingChunk,
    clearPendingStreamState,
    flushStreamingContent,
    projectId,
    recoverPendingStream,
    refreshSessionSnapshot,
    sessionId,
  ]);

  const borderColor = theme.dark ? "#2A3441" : "#D9E2EC";
  const metaColor = theme.dark ? "#B8C2D1" : "#526277";
  const userBubble = theme.dark ? "#1D4ED8" : "#DBEAFE";
  const assistantBubble = theme.dark ? "#1F2937" : "#FFFFFF";
  const systemBubble = theme.dark ? "#3F3F46" : "#E2E8F0";
  const backButtonSurface = theme.dark
    ? "rgba(17, 24, 39, 0.92)"
    : "rgba(255, 255, 255, 0.96)";
  const composerHeight =
    Math.min(MAX_INPUT_HEIGHT, Math.max(MIN_INPUT_HEIGHT, inputHeight)) +
    COMPOSER_TOP_PADDING +
    Math.max(insets.bottom, COMPOSER_BOTTOM_PADDING) +
    keyboardHeight +
    (keyboardHeight > 0 ? KEYBOARD_ADDITIONAL_PADDING : 0);
  const trimmedInput = inputText.trim();
  const isSending = pendingRequestId !== null;

  const handleAbortSession = React.useCallback(async () => {
    if (!sessionId || !projectId || !pendingRequestId) {
      return;
    }

    try {
      await sendAbortRequest({
        sessionId,
        requestId: pendingRequestId,
        projectId,
      });
    } catch (error) {
      console.error("[Session] Failed to abort:", error);
    }

    clearPendingStreamState(pendingRequestId);
  }, [sessionId, projectId, pendingRequestId, clearPendingStreamState]);

  const handleSend = React.useCallback(async () => {
    if (!sessionId || !projectId || !trimmedInput || isSending) {
      return;
    }

    const prompt = trimmedInput;
    const requestId = `mobile_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;

    setOptimisticMessage({
      id: `optimistic_${requestId}`,
      sessionID: sessionId,
      role: "user",
      content: prompt,
      visibleContent: prompt,
      thinkingContent: null,
      thinkingDurationSeconds: null,
      parts: [{ type: "text", content: prompt, durationSeconds: null }],
      createdAt: Date.now(),
    });
    setInputText("");
    setInputHeight(MIN_INPUT_HEIGHT);
    resetStreamingContent();
    setPendingRequestId(requestId);
    pendingRequestIdRef.current = requestId;
    void saveActiveSessionStream({
      requestId,
      projectId,
      sessionId,
      baselineMessageId: messages?.[messages.length - 1]?.id ?? null,
    });

    try {
      await sendPromptRequest({
        sessionId,
        requestId,
        projectId,
        prompt,
      });
    } catch (error) {
      console.error("[Session] Failed to send prompt:", error);
      clearPendingStreamState(requestId);
      Alert.alert("Error", "Failed to send message. Please try again.");
    }
  }, [
    clearPendingStreamState,
    isSending,
    messages,
    projectId,
    resetStreamingContent,
    sessionId,
    trimmedInput,
  ]);

  const handleCreateSession = React.useCallback(async () => {
    if (!projectId || createSessionMutation.isPending) {
      return;
    }

    try {
      const session = await createSessionMutation.mutateAsync(
        String(projectId),
      );
      router.push({
        pathname: "/projects/[projectId]/sessions/[sessionId]",
        params: {
          projectId: String(projectId),
          sessionId: session.id,
        },
      });
    } catch (createError) {
      console.error(createError);
    }
  }, [createSessionMutation, projectId, router]);

  const handlePermissionResponse = React.useCallback(
    async (reply: "once" | "always" | "reject") => {
      if (!pendingPermission) {
        console.warn(
          "[PermissionResponse] No pending permission to respond to",
        );
        return;
      }

      setIsRespondingToPermission(true);
      const responsePayload = {
        requestId: pendingPermission.requestId,
        sessionId: pendingPermission.sessionId,
        jobId: pendingPermission.jobId,
        reply,
      };

      console.log("[PermissionResponse] Sending:", responsePayload);

      try {
        await sendPermissionResponse(responsePayload);
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
      const responsePayload = {
        requestId: pendingQuestion.requestId,
        sessionId: pendingQuestion.sessionId,
        jobId: pendingQuestion.jobId,
        answers,
      };

      try {
        await sendQuestionResponse(responsePayload);
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

  const renderMessage = ({
    item,
    index,
  }: {
    item: SessionMessage;
    index: number;
  }) => {
    const responseSummary = getAssistantResponseSummaryContext(
      displayedMessages,
      index,
    );

    return (
      <MessageRow
        message={item}
        responseSummary={responseSummary}
        borderColor={borderColor}
        metaColor={metaColor}
        userBubble={userBubble}
        assistantBubble={assistantBubble}
        systemBubble={systemBubble}
        textColor={item.role === "user" ? "#0F172A" : theme.colors.onSurface}
      />
    );
  };

  const inputBar = (
    <View
      style={[
        styles.inputContainer,
        {
          backgroundColor: theme.colors.surface,
          borderColor,
          paddingBottom: Math.max(insets.bottom, COMPOSER_BOTTOM_PADDING),
        },
      ]}
    >
      <TextInput
        style={[
          styles.textInput,
          {
            backgroundColor: theme.colors.background,
            borderColor,
            color: theme.colors.onSurface,
            height: Math.min(
              MAX_INPUT_HEIGHT,
              Math.max(MIN_INPUT_HEIGHT, inputHeight),
            ),
          },
        ]}
        placeholder="Send a message..."
        placeholderTextColor={theme.colors.onSurfaceVariant}
        value={inputText}
        onChangeText={setInputText}
        multiline
        scrollEnabled={inputHeight >= MAX_INPUT_HEIGHT}
        onContentSizeChange={(e) =>
          setInputHeight(e.nativeEvent.contentSize.height)
        }
      />
      <Pressable
        disabled={!trimmedInput || isSending}
        onPress={handleSend}
        onLongPress={isSending ? handleAbortSession : undefined}
        style={[
          styles.sendButton,
          {
            backgroundColor: isSending ? "#EF4444" : theme.colors.primary,
            opacity: !trimmedInput || isSending ? 0.7 : 1,
          },
        ]}
      >
        {isSending ? (
          <MaterialCommunityIcons
            name="stop"
            size={20}
            color={theme.colors.onPrimary}
          />
        ) : (
          <MaterialCommunityIcons
            name="send"
            size={20}
            color={theme.colors.onPrimary}
          />
        )}
      </Pressable>
    </View>
  );

  const permissionCard = (() => {
    if (pendingPermission) {
      return (
        <PermissionCard
          request={pendingPermission}
          onRespond={handlePermissionResponse}
          isResponding={isRespondingToPermission}
        />
      );
    }
    if (pendingQuestion) {
      return (
        <QuestionCard
          request={pendingQuestion}
          onRespond={handleQuestionResponse}
          isResponding={isRespondingToQuestion}
        />
      );
    }
    return null;
  })();

  const bottomContent = (
    <View style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
      {permissionCard}
      {inputBar}
    </View>
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.headerRow, { top: insets.top + 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={[
            styles.headerButton,
            {
              backgroundColor: backButtonSurface,
              borderColor,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={22}
            color={theme.colors.onSurface}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create new session"
          disabled={createSessionMutation.isPending}
          onPress={() => void handleCreateSession()}
          style={[
            styles.headerButton,
            {
              backgroundColor: backButtonSurface,
              borderColor,
              opacity: createSessionMutation.isPending ? 0.7 : 1,
            },
          ]}
        >
          {createSessionMutation.isPending ? (
            <ActivityIndicator size={18} color={theme.colors.onSurface} />
          ) : (
            <MaterialCommunityIcons
              name="plus"
              size={22}
              color={theme.colors.onSurface}
            />
          )}
        </Pressable>
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
          <View style={styles.fadeOverlay} pointerEvents="none">
            <LinearGradient
              colors={[theme.colors.background, "transparent"]}
              locations={[0, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>
          {isLoading && displayedMessages.length === 0 ? (
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
              <Button mode="contained" onPress={() => refetch()}>
                Retry
              </Button>
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
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text
                    variant="bodyLarge"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    Ready when you are.
                  </Text>
                </View>
              }
              refreshControl={
                <RefreshControl
                  refreshing={isRefetching}
                  onRefresh={() => refetch()}
                  colors={[theme.colors.primary]}
                  tintColor={theme.colors.primary}
                />
              }
              ListFooterComponent={
                isSending || hasStreamingContent ? (
                  <TypingIndicator
                    key={pendingRequestId ?? "typing"}
                    streamingContent={streamingContent}
                    thinkingContent={streamingThinkingContent}
                    activities={streamingActivities}
                    phase={streamingPhase}
                    borderColor={borderColor}
                    assistantBubble={assistantBubble}
                    metaColor={metaColor}
                  />
                ) : null
              }
            />
          )}
        </View>
        {bottomContent}
      </View>
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
  fadeOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    zIndex: 5,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  messageRow: {
    width: "100%",
  },
  messageRowLeft: {
    alignItems: "flex-start",
  },
  messageRowRight: {
    alignItems: "flex-end",
  },
  messageBubble: {
    maxWidth: "88%",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 8,
  },
  roleLabel: {
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  messageText: {
    lineHeight: 21,
  },
  messageBodyPressable: {
    gap: 10,
  },
  thinkingInlineLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  thinkingPanel: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  reasoningTitle: {
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  thinkingBlock: {
    gap: 4,
  },
  thinkingLabel: {
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  thinkingText: {
    lineHeight: 19,
  },
  plainThoughtWrap: {
    maxWidth: "88%",
    gap: 10,
    alignSelf: "flex-start",
  },
  plainThoughtTrigger: {
    alignSelf: "flex-start",
  },
  plainThoughtHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  emptyState: {
    flex: 1,
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    opacity: 0.8,
  },
  errorText: {
    textAlign: "center",
  },
  errorMessage: {
    textAlign: "center",
    marginBottom: 12,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: COMPOSER_TOP_PADDING,
    borderTopWidth: 1,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    textAlignVertical: "top",
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  typingDots: {
    flexDirection: "row",
    gap: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
