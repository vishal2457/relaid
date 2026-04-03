import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  TextInputSelectionChangeEventData,
  View,
  type FlatList as FlatListType,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ChatComposer,
  COMPOSER_BOTTOM_PADDING,
  COMPOSER_TOP_PADDING,
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
  useProjectFileSearch,
  useProjects,
  type Project,
  type ProjectFileMatch,
} from "@/lib/api/projects";
import { useProviders, type Provider } from "@/lib/api/providers";
import { sessionsKeys, useCreateSession } from "@/lib/api/sessions";
import { queryClient } from "@/lib/query-client";
import { getChatSocket } from "@/lib/socket/chat";
import {
  showNewMessageNotification,
  isAppInForeground,
} from "@/lib/notifications";
import { AppState } from "react-native";
import { GitDrawer } from "@/components/GitDrawer";

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

const LAST_SELECTED_PROJECT_ID = "LAST_SELECTED_PROJECT_ID";

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
  const [streamingContent, setStreamingContent] = React.useState("");
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
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(
    null,
  );
  const [showDrawer, setShowDrawer] = React.useState(false);
  const [showGitDrawer, setShowGitDrawer] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);

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
    (async () => {
      try {
        const savedId = await AsyncStorage.getItem(LAST_SELECTED_PROJECT_ID);
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
        // noop
      } finally {
        setHydrated(true);
      }
    })();
  }, [projects]);

  React.useEffect(() => {
    if (!hydrated) return;
    if (activeProject) {
      AsyncStorage.setItem(LAST_SELECTED_PROJECT_ID, activeProject.id).catch(
        () => {},
      );
    }
  }, [activeProject, hydrated]);

  const {
    data: messages,
    isLoading: messagesLoading,
    error,
    refetch,
  } = useSessionMessages(activeSessionId ?? "");

  const displayedMessages = React.useMemo(() => {
    if (!optimisticMessage) {
      return messages ?? [];
    }
    return [...(messages ?? []), optimisticMessage];
  }, [messages, optimisticMessage]);

  const hasScrolledToBottom = React.useRef(false);
  React.useEffect(() => {
    if (messages && messages.length > 0 && !hasScrolledToBottom.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
        hasScrolledToBottom.current = true;
      }, 100);
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

  React.useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  React.useEffect(() => {
    pendingRequestIdRef.current = pendingRequestId;
  }, [pendingRequestId]);

  React.useEffect(() => {
    const socket = getChatSocket();
    if (!socket.connected) {
      socket.connect();
    }

    const handlePromptStarted = (payload: SessionPromptStartedEvent) => {
      if (
        payload.requestId === pendingRequestIdRef.current &&
        payload.sessionId === activeSessionIdRef.current
      ) {
        setPendingRequestId(payload.requestId);
      }
    };

    const handleStreamChunk = (payload: SessionStreamChunkEvent) => {
      if (
        payload.requestId !== pendingRequestIdRef.current ||
        payload.sessionId !== activeSessionIdRef.current
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
        payload.sessionId !== activeSessionIdRef.current
      ) {
        return;
      }

      pendingRequestIdRef.current = null;
      setPendingRequestId(null);
      setOptimisticMessage(null);
      setStreamingContent("");

      if (payload.messages) {
        queryClient.setQueryData(
          messageKeys.list(payload.sessionId),
          payload.messages,
        );
      } else {
        void refetch();
      }

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
    };

    const handleErrorResponse = (payload: {
      requestId?: string;
      message?: string;
    }) => {
      if (payload.requestId !== pendingRequestIdRef.current) {
        return;
      }

      pendingRequestIdRef.current = null;
      setPendingRequestId(null);
      setOptimisticMessage(null);
      setStreamingContent("");
      Alert.alert("Socket error", payload.message || "Failed to send message");
    };

    socket.on("session_prompt_started", handlePromptStarted);
    socket.on("session_stream_chunk", handleStreamChunk);
    socket.on("session_prompt_response", handlePromptResponse);
    socket.on("error_response", handleErrorResponse);

    const handleReconnect = () => {
      if (activeSessionIdRef.current && pendingRequestIdRef.current) {
        void refetch();
      }
    };
    socket.on("connect", handleReconnect);

    return () => {
      socket.off("session_prompt_started", handlePromptStarted);
      socket.off("session_stream_chunk", handleStreamChunk);
      socket.off("session_prompt_response", handlePromptResponse);
      socket.off("error_response", handleErrorResponse);
      socket.off("connect", handleReconnect);
    };
  }, [refetch]);

  React.useEffect(() => {
    if (!activeSessionId) return;

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        if (pendingRequestIdRef.current) {
          pendingRequestIdRef.current = null;
          setPendingRequestId(null);
          setOptimisticMessage(null);
          setStreamingContent("");
        }
        void refetch();
      }
    });

    return () => subscription.remove();
  }, [activeSessionId, refetch]);

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
    mentionSuggestionHeight;
  const trimmedInput = inputText.trim();
  const isSending = pendingRequestId !== null;

  const handleSend = React.useCallback(async () => {
    if (!activeProject || !trimmedInput || isSending) {
      return;
    }

    let sessionId = activeSessionId;

    if (!sessionId) {
      try {
        const session = await createSessionMutation.mutateAsync(
          activeProject.id,
        );
        sessionId = session.id;
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
      sessionId,
      role: "user",
      content: trimmedInput,
      visibleContent: trimmedInput,
      thinkingContent: null,
      thinkingDurationSeconds: null,
      parts: [{ type: "text", content: trimmedInput, durationSeconds: null }],
      createdAt: new Date().toISOString(),
    });
    setStreamingContent("");
    setInputText("");
    setInputSelection({ start: 0, end: 0 });
    setInputHeight(MIN_INPUT_HEIGHT);

    setTimeout(() => {
      setPendingRequestId((current) => {
        if (current === requestId) {
          pendingRequestIdRef.current = null;
          setOptimisticMessage(null);
          setStreamingContent("");
          return null;
        }
        return current;
      });
      void refetch();
    }, 60_000);

    const socket = getChatSocket();
    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("session_prompt_request", {
      requestId,
      projectId: activeProject.id,
      sessionId,
      prompt: trimmedInput,
    });
  }, [
    activeProject,
    activeSessionId,
    trimmedInput,
    isSending,
    createSessionMutation,
    refetch,
  ]);

  const toggleThinking = (messageId: string) => {
    setExpandedThinking((current: Record<string, boolean>) => ({
      ...current,
      [messageId]: !current[messageId],
    }));
  };

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
                    {part.type !== "reasoning" && (
                      <Text
                        variant="labelSmall"
                        style={[styles.thinkingLabel, { color: metaColor }]}
                      >
                        {part.type}
                      </Text>
                    )}
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
                    {part.type !== "reasoning" && (
                      <Text
                        variant="labelSmall"
                        style={[styles.thinkingLabel, { color: metaColor }]}
                      >
                        {part.type}
                      </Text>
                    )}
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

  const handleInputSelectionChange = React.useCallback(
    (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setInputSelection(event.nativeEvent.selection);
    },
    [],
  );

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
            accessibilityLabel="Select provider"
            onPress={() => setShowProviderSheet(true)}
            style={[
              styles.providerSelector,
              {
                backgroundColor: theme.dark
                  ? "rgba(17, 24, 39, 0.92)"
                  : "rgba(255, 255, 255, 0.96)",
              },
            ]}
          >
            <MaterialCommunityIcons
              name="cube-outline"
              size={18}
              color={theme.colors.onSurface}
            />
            <Text
              variant="labelMedium"
              style={[
                styles.buttonGroupText,
                { color: theme.colors.onSurface },
              ]}
              numberOfLines={1}
            >
              {activeProvider?.name ?? "Provider"}
            </Text>
            <MaterialCommunityIcons
              name="chevron-down"
              size={16}
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
            accessibilityLabel="Select project"
            onPress={() => setShowProjectSheet(true)}
            style={[
              styles.projectSelector,
              {
                backgroundColor: theme.dark
                  ? "rgba(17, 24, 39, 0.92)"
                  : "rgba(255, 255, 255, 0.96)",
              },
            ]}
          >
            <MaterialCommunityIcons
              name="folder-outline"
              size={18}
              color={theme.colors.onSurface}
            />
            <Text
              variant="labelMedium"
              style={[
                styles.buttonGroupText,
                { color: theme.colors.onSurface },
              ]}
              numberOfLines={1}
            >
              {activeProject?.name ?? "Select Project"}
            </Text>
            <MaterialCommunityIcons
              name="chevron-down"
              size={16}
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
              size={18}
              color={theme.colors.onSurface}
            />
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
        style={styles.keyboardContainer}
      >
        <View style={styles.messagesContainer}>
          {messagesLoading && activeSessionId ? (
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
                    {activeProject
                      ? "Start a conversation..."
                      : "Select a project to begin"}
                  </Text>
                </View>
              }
              ListFooterComponent={isSending ? <TypingIndicator /> : null}
            />
          )}
        </View>
        <ChatComposer
          activeProject={Boolean(activeProject)}
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
          onSelectionChange={handleInputSelectionChange}
          onSelectFileSuggestion={handleSelectFileSuggestion}
          onSend={() => void handleSend()}
          showMentionSuggestions={showMentionSuggestions}
          trimmedInput={trimmedInput}
        />
      </KeyboardAvoidingView>

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
                data={projects ?? []}
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
              Select Provider
            </Text>
            {providersLoading ? (
              <View style={styles.sheetLoading}>
                <ActivityIndicator />
              </View>
            ) : (
              <FlatList
                data={providers ?? []}
                keyExtractor={(item) => item.id}
                style={styles.sheetList}
                renderItem={({ item }) => {
                  const isActiveProvider = activeProvider?.id === item.id;
                  return (
                    <Pressable
                      onPress={() => {
                        if (item.id !== activeProvider?.id) {
                          setActiveProvider(item);
                        }
                        setShowProviderSheet(false);
                      }}
                      style={[
                        styles.sheetItem,
                        {
                          backgroundColor: isActiveProvider
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
                              backgroundColor: isActiveProvider
                                ? "#00FF41"
                                : "#6366F1",
                            },
                          ]}
                        />
                        <View style={styles.sheetItemContent}>
                          <Text
                            variant="bodyLarge"
                            style={{
                              fontWeight: isActiveProvider ? "600" : "500",
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
                            {item.models.length} models
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
                      No providers found
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
  buttonGroupText: {
    fontWeight: "500",
    flexShrink: 1,
  },
  buttonGroupDivider: {
    width: 1,
    height: "100%",
  },
  projectSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
  },
  projectTitle: {
    fontWeight: "600",
    flexShrink: 1,
  },
  providerSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
  },
  providerTitle: {
    fontWeight: "500",
    flexShrink: 1,
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
  errorText: {
    textAlign: "center",
  },
  errorMessage: {
    textAlign: "center",
    marginBottom: 12,
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
});
