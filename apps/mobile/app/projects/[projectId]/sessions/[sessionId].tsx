import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
  type FlatList as FlatListType,
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
  hasRecoveredAssistantResponse,
  isStreamingSessionStatus,
  saveActiveSessionStream,
  shouldScheduleSessionRefresh,
} from "@/lib/active-session-stream";
import { queryClient } from "@/lib/query-client";
import { getChatSocket } from "@/lib/socket/chat";

type TextSegment = {
  type: "normal" | "bold" | "code";
  content: string;
};

const parseFormattedText = (text: string): TextSegment[] => {
  const segments: TextSegment[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);

    const nextBold = boldMatch ? boldMatch.index! : Infinity;
    const nextCode = codeMatch ? codeMatch.index! : Infinity;

    if (nextBold === Infinity && nextCode === Infinity) {
      segments.push({ type: "normal", content: remaining });
      break;
    }

    const nextMatch = Math.min(nextBold, nextCode);

    if (nextMatch > 0) {
      segments.push({ type: "normal", content: remaining.slice(0, nextMatch) });
    }

    if (nextBold < nextCode && boldMatch) {
      segments.push({ type: "bold", content: boldMatch[1] });
      remaining = remaining.slice(nextBold + boldMatch[0].length);
    } else if (codeMatch) {
      segments.push({ type: "code", content: codeMatch[1] });
      remaining = remaining.slice(nextCode + codeMatch[0].length);
    }
  }

  return segments;
};

const BOLD_COLOR = "#F97316";
const CODE_COLOR = "#22C55E";

const FormattedText = ({
  text,
  baseStyle,
}: {
  text: string;
  baseStyle: object;
}) => {
  const segments = parseFormattedText(text);

  return (
    <Text style={baseStyle}>
      {segments.map((segment, index) => {
        if (segment.type === "bold") {
          return (
            <Text key={index} style={{ fontWeight: "bold", color: BOLD_COLOR }}>
              {segment.content}
            </Text>
          );
        }
        if (segment.type === "code") {
          return (
            <Text
              key={index}
              style={{ color: CODE_COLOR, fontFamily: "monospace" }}
            >
              {segment.content}
            </Text>
          );
        }
        return <Text key={index}>{segment.content}</Text>;
      })}
    </Text>
  );
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const roleLabelMap: Record<SessionMessage["role"], string> = {
  assistant: "Assistant",
  user: "You",
  system: "System",
};

const formatThinkingLabel = (seconds: number | null) => {
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    return `Thought for ${seconds}s`;
  }
  return "Thinking...";
};

const MIN_INPUT_HEIGHT = 44;
const MAX_INPUT_HEIGHT = 150;
const COMPOSER_TOP_PADDING = 12;
const COMPOSER_BOTTOM_PADDING = 12;

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

export default function SessionMessagesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = React.useRef<FlatListType<SessionMessage>>(null);
  const [expandedThinking, setExpandedThinking] = React.useState<
    Record<string, boolean>
  >({});
  const [inputText, setInputText] = React.useState("");
  const [inputHeight, setInputHeight] = React.useState(MIN_INPUT_HEIGHT);
  const [pendingRequestId, setPendingRequestId] = React.useState<string | null>(
    null,
  );
  const pendingRequestIdRef = React.useRef<string | null>(null);
  const [streamingContent, setStreamingContent] = React.useState<string>("");
  const [optimisticMessage, setOptimisticMessage] =
    React.useState<SessionMessage | null>(null);
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
      // Delay to let FlatList render + KeyboardAvoidingView animate
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
      setStreamingContent("");
      clearFollowUpRefreshTimeout();
      void clearActiveSessionStream(requestId);
    },
    [clearFollowUpRefreshTimeout],
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
    setStreamingContent("");

    const [sessionResult, messagesResult] = await Promise.allSettled([
      refetchSession(),
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
  }, [clearPendingStreamState, projectId, refetch, refetchSession, sessionId]);

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
      if (nextState === "active" && pendingRequestIdRef.current) {
        void recoverPendingStream();
      }
    });

    return () => subscription.remove();
  }, [recoverPendingStream]);

  React.useEffect(() => {
    if (!sessionId || !projectId) {
      return;
    }

    const socket = getChatSocket();
    if (!socket.connected) {
      socket.connect();
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

      if (payload.type === "text" || payload.type === "reasoning") {
        setStreamingContent((prev) => prev + payload.chunk);
      }
    };

    const handlePromptResponse = (payload: SessionPromptResponseEvent) => {
      if (
        payload.requestId !== pendingRequestIdRef.current ||
        payload.sessionId !== sessionId
      ) {
        return;
      }

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

      clearPendingStreamState(payload.requestId);
      Alert.alert("Socket error", payload.message || "Failed to send message");
    };

    const handleReconnect = () => {
      if (pendingRequestIdRef.current) {
        void recoverPendingStream();
      }
    };

    socket.on("session_prompt_started", handlePromptStarted);
    socket.on("session_stream_chunk", handleStreamChunk);
    socket.on("session_prompt_response", handlePromptResponse);
    socket.on("error_response", handleErrorResponse);
    socket.on("connect", handleReconnect);

    return () => {
      socket.off("session_prompt_started", handlePromptStarted);
      socket.off("session_stream_chunk", handleStreamChunk);
      socket.off("session_prompt_response", handlePromptResponse);
      socket.off("error_response", handleErrorResponse);
      socket.off("connect", handleReconnect);
    };
  }, [
    clearPendingStreamState,
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
  const thinkingSurface = theme.dark ? "#111827" : "#F8FAFC";
  const backButtonSurface = theme.dark
    ? "rgba(17, 24, 39, 0.92)"
    : "rgba(255, 255, 255, 0.96)";
  const composerHeight =
    Math.min(MAX_INPUT_HEIGHT, Math.max(MIN_INPUT_HEIGHT, inputHeight)) +
    COMPOSER_TOP_PADDING +
    Math.max(insets.bottom, COMPOSER_BOTTOM_PADDING);
  const trimmedInput = inputText.trim();
  const isSending = pendingRequestId !== null;

  const TypingIndicator = () => (
    <View style={[styles.messageRow, styles.messageRowLeft]}>
      <View
        style={[
          styles.messageBubble,
          {
            backgroundColor: assistantBubble,
            borderColor,
            alignSelf: "flex-start",
          },
        ]}
      >
        {streamingContent ? (
          <FormattedText
            text={streamingContent}
            baseStyle={[styles.messageText, { color: theme.colors.onSurface }]}
          />
        ) : (
          <View style={styles.typingIndicator}>
            <View style={styles.typingDots}>
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  style={[styles.typingDot, { backgroundColor: metaColor }]}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );

  const handleSend = React.useCallback(() => {
    if (!sessionId || !projectId || !trimmedInput || isSending) {
      return;
    }

    const requestId = `mobile_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;

    setPendingRequestId(requestId);
    pendingRequestIdRef.current = requestId;
    setOptimisticMessage({
      id: `optimistic_${requestId}`,
      sessionId,
      role: "user",
      content: trimmedInput,
      visibleContent: trimmedInput,
      thinkingContent: null,
      thinkingDurationSeconds: null,
      parts: [{ type: "text", content: trimmedInput, durationSeconds: null }],
      createdAt: new Date().toISOString(),
    });
    setInputText("");
    setInputHeight(MIN_INPUT_HEIGHT);
    void saveActiveSessionStream({
      requestId,
      projectId,
      sessionId,
      baselineMessageId: messages?.[messages.length - 1]?.id ?? null,
    });

    const socket = getChatSocket();
    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("session_prompt_request", {
      requestId,
      projectId,
      sessionId,
      prompt: trimmedInput,
    });
  }, [isSending, messages, projectId, sessionId, trimmedInput]);

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

  const toggleThinking = (messageId: string) => {
    setExpandedThinking((current: Record<string, boolean>) => ({
      ...current,
      [messageId]: !current[messageId],
    }));
  };

  const renderMessage = ({ item }: { item: SessionMessage }) => {
    const isUser = item.role === "user";
    const isSystem = item.role === "system";
    const isAssistant = item.role === "assistant";
    const hasThinking = Boolean(item.thinkingContent?.trim());
    const hasVisibleContent = Boolean(item.visibleContent.trim());
    const bubbleColor = isSystem
      ? systemBubble
      : isUser
        ? userBubble
        : assistantBubble;
    const textColor = isUser ? "#0F172A" : theme.colors.onSurface;
    const mainContent =
      item.role === "assistant" ? item.visibleContent : item.content;
    const isThinkingExpanded = Boolean(expandedThinking[item.id]);
    const thinkingParts = item.parts.filter((part) => part.type !== "text");
    const thinkingLabel = formatThinkingLabel(item.thinkingDurationSeconds);
    const shouldUsePlainThoughtRow =
      isAssistant && hasThinking && !hasVisibleContent;
    const canToggleThinking = isAssistant && hasThinking;

    return (
      <View
        style={[
          styles.messageRow,
          isUser ? styles.messageRowRight : styles.messageRowLeft,
        ]}
      >
        {shouldUsePlainThoughtRow ? (
          <View style={styles.plainThoughtWrap}>
            <Pressable
              onPress={() => toggleThinking(item.id)}
              style={styles.plainThoughtTrigger}
            >
              <View style={styles.plainThoughtHeader}>
                <MaterialCommunityIcons
                  name="brain"
                  size={16}
                  color={metaColor}
                />
                <Text variant="bodyMedium" style={{ color: metaColor }}>
                  {thinkingLabel}
                </Text>
              </View>
            </Pressable>

            {isThinkingExpanded ? (
              <View
                style={[
                  styles.thinkingPanel,
                  {
                    borderColor,
                    backgroundColor: thinkingSurface,
                    alignSelf: "flex-start",
                  },
                ]}
              >
                <Text
                  variant="labelSmall"
                  style={[styles.reasoningTitle, { color: metaColor }]}
                >
                  Reasoning
                </Text>
                {thinkingParts.map((part, index) => (
                  <View
                    key={`${item.id}-${part.type}-${index}`}
                    style={styles.thinkingBlock}
                  >
                    <Text
                      variant="labelSmall"
                      style={[styles.thinkingLabel, { color: metaColor }]}
                    >
                      {part.type}
                    </Text>
                    <FormattedText
                      text={part.content}
                      baseStyle={[
                        styles.thinkingText,
                        { color: theme.colors.onSurface },
                      ]}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View
            style={[
              styles.messageBubble,
              {
                backgroundColor: bubbleColor,
                borderColor,
                alignSelf: isUser ? "flex-end" : "flex-start",
              },
            ]}
          >
            <View style={styles.messageHeader}>
              <Text
                variant="labelMedium"
                style={[styles.roleLabel, { color: metaColor }]}
              >
                {roleLabelMap[item.role]}
              </Text>
              <Text variant="labelSmall" style={{ color: metaColor }}>
                {formatDateTime(item.createdAt)}
              </Text>
            </View>

            <Pressable
              disabled={!canToggleThinking}
              onPress={() => toggleThinking(item.id)}
              style={styles.messageBodyPressable}
            >
              <FormattedText
                text={mainContent}
                baseStyle={[styles.messageText, { color: textColor }]}
              />

              {canToggleThinking ? (
                <View style={styles.thinkingInlineLabel}>
                  <MaterialCommunityIcons
                    name="brain"
                    size={14}
                    color={metaColor}
                  />
                  <Text variant="labelSmall" style={{ color: metaColor }}>
                    {thinkingLabel}
                  </Text>
                </View>
              ) : null}
            </Pressable>

            {canToggleThinking && isThinkingExpanded ? (
              <View
                style={[
                  styles.thinkingPanel,
                  { borderColor, backgroundColor: thinkingSurface },
                ]}
              >
                <Text
                  variant="labelSmall"
                  style={[styles.reasoningTitle, { color: metaColor }]}
                >
                  Reasoning
                </Text>
                {thinkingParts.map((part, index) => (
                  <View
                    key={`${item.id}-${part.type}-${index}`}
                    style={styles.thinkingBlock}
                  >
                    <Text
                      variant="labelSmall"
                      style={[styles.thinkingLabel, { color: metaColor }]}
                    >
                      {part.type}
                    </Text>
                    <FormattedText
                      text={part.content}
                      baseStyle={[
                        styles.thinkingText,
                        { color: theme.colors.onSurface },
                      ]}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </View>
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
        style={[
          styles.sendButton,
          {
            backgroundColor: theme.colors.primary,
            opacity: !trimmedInput || isSending ? 0.7 : 1,
          },
        ]}
      >
        {isSending ? (
          <ActivityIndicator size={18} color={theme.colors.onPrimary} />
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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        style={styles.keyboardContainer}
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
              keyExtractor={(item) => item.id}
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
              ListFooterComponent={isSending ? <TypingIndicator /> : null}
            />
          )}
        </View>
        {inputBar}
      </KeyboardAvoidingView>
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
