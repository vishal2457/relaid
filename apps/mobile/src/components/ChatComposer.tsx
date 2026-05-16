import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TextInputSelectionChangeEventData,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type ProjectFileMatch } from "@/src/lib/api/projects";
import { type Skill } from "@/src/lib/api/skills";
import { type ProviderApp } from "@/src/lib/api/providers";

export const MIN_INPUT_HEIGHT = 44;
export const MAX_INPUT_HEIGHT = 150;
export const COMPOSER_TOP_PADDING = 12;
export const COMPOSER_BOTTOM_PADDING = 12;
export const KEYBOARD_ADDITIONAL_PADDING = 16;

const SendButton = ({
  isSending,
  disabled,
  onPress,
}: {
  isSending: boolean;
  disabled: boolean;
  onPress: () => void;
}) => {
  const theme = useTheme();

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.sendButton,
        {
          backgroundColor: isSending ? "#EF4444" : theme.colors.primary,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <MaterialCommunityIcons
        name={isSending ? "stop" : "arrow-up"}
        size={20}
        color={theme.colors.onPrimary}
      />
    </Pressable>
  );
};

type ComposerSelection = {
  start: number;
  end: number;
};

type ChatComposerProps = {
  activeAgentName: string;
  activeAgentProviderName: string;
  activeProject: boolean;
  activeProjectConnected?: boolean;
  activeProjectName: string;
  appSuggestions?: ProviderApp[];
  appSuggestionsLoading: boolean;
  agentProviderLocked?: boolean;
  borderColor: string;
  branchName?: string;
  fileSuggestions?: ProjectFileMatch[];
  fileSuggestionsLoading: boolean;
  inputHeight: number;
  inputSelection: ComposerSelection;
  inputText: string;
  isSending: boolean;
  mentionQuery: string;
  metaColor: string;
  onChangeText: (value: string) => void;
  onComposerLayout?: (event: LayoutChangeEvent) => void;
  onInputHeightChange: (height: number) => void;
  onPressAgent: () => void;
  onPressAgentProvider: () => void;
  onPressBranch: () => void;
  onSelectionChange: (
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) => void;
  onSelectFileSuggestion: (match: ProjectFileMatch) => void;
  onSelectAppSuggestion: (app: ProviderApp) => void;
  onSend: () => void;
  onAbort?: () => void;
  onPressModel: () => void;
  onPressProject: () => void;
  selectedModelDisplayName: string;
  showMentionSuggestions: boolean;
  showSkillSuggestions: boolean;
  skillSuggestions?: Skill[];
  skillSuggestionsLoading: boolean;
  onSelectSkillSuggestion: (skill: Skill) => void;
  trimmedInput: string;
};

export function ChatComposer({
  activeAgentName,
  activeAgentProviderName,
  activeProject,
  activeProjectConnected = false,
  activeProjectName,
  appSuggestions,
  appSuggestionsLoading,
  agentProviderLocked = false,
  borderColor,
  branchName,
  fileSuggestions,
  fileSuggestionsLoading,
  inputHeight,
  inputSelection,
  inputText,
  isSending,
  mentionQuery,
  metaColor,
  onChangeText,
  onComposerLayout,
  onInputHeightChange,
  onPressAgent,
  onPressAgentProvider,
  onPressBranch,
  onSelectionChange,
  onSelectFileSuggestion,
  onSelectAppSuggestion,
  onSend,
  onAbort,
  onPressModel,
  onPressProject,
  selectedModelDisplayName,
  showMentionSuggestions,
  showSkillSuggestions,
  skillSuggestions,
  skillSuggestionsLoading,
  onSelectSkillSuggestion,
  trimmedInput,
}: ChatComposerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const inputRef = React.useRef<TextInput>(null);
  const composerInputHeight = Math.min(
    MAX_INPUT_HEIGHT,
    Math.max(MIN_INPUT_HEIGHT, inputHeight),
  );

  const updateInputHeight = React.useCallback(
    (nextHeight: number) => {
      const normalizedHeight = Math.max(
        MIN_INPUT_HEIGHT,
        Math.ceil(nextHeight),
      );
      if (normalizedHeight !== inputHeight) {
        onInputHeightChange(normalizedHeight);
      }
    },
    [inputHeight, onInputHeightChange],
  );

  React.useEffect(() => {
    if (!inputText && inputHeight !== MIN_INPUT_HEIGHT) {
      onInputHeightChange(MIN_INPUT_HEIGHT);
    }
  }, [inputHeight, inputText, onInputHeightChange]);

  const handleInputContentSizeChange = React.useCallback(
    (event: NativeSyntheticEvent<{ contentSize: { height: number } }>) => {
      updateInputHeight(event.nativeEvent.contentSize.height);
    },
    [updateInputHeight],
  );

  const handleSuggestionPress = React.useCallback(
    (match: ProjectFileMatch) => {
      onSelectFileSuggestion(match);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    },
    [onSelectFileSuggestion],
  );

  const handleSkillSuggestionPress = React.useCallback(
    (skill: Skill) => {
      onSelectSkillSuggestion(skill);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    },
    [onSelectSkillSuggestion],
  );

  const handleAppSuggestionPress = React.useCallback(
    (app: ProviderApp) => {
      onSelectAppSuggestion(app);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    },
    [onSelectAppSuggestion],
  );

  const hasFileSuggestions = Boolean(
    fileSuggestions && fileSuggestions.length > 0,
  );
  const hasAppSuggestions = Boolean(appSuggestions && appSuggestions.length > 0);
  const projectStatusColor = activeProject
    ? activeProjectConnected
      ? "#22C55E"
      : "#EF4444"
    : metaColor;
  const showMentionLoading =
    fileSuggestionsLoading || (appSuggestionsLoading && !hasFileSuggestions);

  return (
    <View
      onLayout={onComposerLayout}
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor,
          paddingBottom: Math.max(insets.bottom, COMPOSER_BOTTOM_PADDING),
        },
      ]}
    >
      {showMentionSuggestions ? (
        <View
          style={[
            styles.mentionPanel,
            {
              backgroundColor: theme.colors.background,
              borderColor,
            },
          ]}
        >
          {showMentionLoading ? (
            <View style={styles.mentionEmptyState}>
              <ActivityIndicator size="small" />
            </View>
          ) : hasFileSuggestions || hasAppSuggestions ? (
            <ScrollView
              style={styles.mentionResults}
              contentContainerStyle={styles.mentionResultsContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {!mentionQuery.trim() ? (
                <Text
                  variant="bodySmall"
                  style={[styles.mentionHint, { color: metaColor }]}
                >
                  Type after `@` to search files. Codex apps are available below.
                </Text>
              ) : null}
              {hasFileSuggestions ? (
                <>
                  <Text
                    variant="labelSmall"
                    style={[styles.mentionSectionLabel, { color: metaColor }]}
                  >
                    Files
                  </Text>
                  {fileSuggestions?.map((item) => (
                    <Pressable
                      key={`${item.type}:${item.path}`}
                      onPress={() => handleSuggestionPress(item)}
                      style={styles.mentionItem}
                    >
                      <MaterialCommunityIcons
                        name={
                          item.type === "directory"
                            ? "folder-outline"
                            : "file-outline"
                        }
                        size={18}
                        color={
                          item.type === "directory"
                            ? theme.colors.primary
                            : theme.colors.onSurfaceVariant
                        }
                      />
                      <View style={styles.mentionItemContent}>
                        <Text
                          variant="bodyMedium"
                          style={{ color: theme.colors.onSurface }}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        <Text
                          variant="bodySmall"
                          style={{ color: metaColor }}
                          numberOfLines={1}
                        >
                          {item.path}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </>
              ) : null}
              {hasFileSuggestions && hasAppSuggestions ? (
                <View
                  style={[
                    styles.mentionSectionDivider,
                    { backgroundColor: borderColor },
                  ]}
                />
              ) : null}
              {hasAppSuggestions ? (
                <>
                  <Text
                    variant="labelSmall"
                    style={[styles.mentionSectionLabel, { color: metaColor }]}
                  >
                    Codex Apps
                  </Text>
                  {appSuggestions?.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => handleAppSuggestionPress(item)}
                      style={styles.mentionItem}
                    >
                      <MaterialCommunityIcons
                        name="connection"
                        size={18}
                        color={theme.colors.primary}
                      />
                      <View style={styles.mentionItemContent}>
                        <Text
                          variant="bodyMedium"
                          style={{ color: theme.colors.onSurface }}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>
                        <Text
                          variant="bodySmall"
                          style={{ color: metaColor }}
                          numberOfLines={2}
                        >
                          {item.description || item.id}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </>
              ) : appSuggestionsLoading && !hasFileSuggestions ? (
                <View style={styles.mentionEmptyState}>
                  <ActivityIndicator size="small" />
                </View>
              ) : null}
            </ScrollView>
          ) : !mentionQuery.trim() ? (
            <View style={styles.mentionEmptyState}>
              <Text variant="bodySmall" style={{ color: metaColor }}>
                Type to search for files or Codex apps
              </Text>
            </View>
          ) : (
            <View style={styles.mentionEmptyState}>
              <Text variant="bodySmall" style={{ color: metaColor }}>
                No matching files or Codex apps
              </Text>
            </View>
          )}
        </View>
      ) : null}
      {showSkillSuggestions ? (
        <View
          style={[
            styles.mentionPanel,
            {
              backgroundColor: theme.colors.background,
              borderColor,
            },
          ]}
        >
          {skillSuggestionsLoading ? (
            <View style={styles.mentionEmptyState}>
              <ActivityIndicator size="small" />
            </View>
          ) : skillSuggestions && skillSuggestions.length > 0 ? (
            <ScrollView
              style={styles.mentionResults}
              contentContainerStyle={styles.mentionResultsContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {skillSuggestions.map((item) => (
                <Pressable
                  key={item.name}
                  onPress={() => handleSkillSuggestionPress(item)}
                  style={styles.mentionItem}
                >
                  <View style={styles.mentionItemContent}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Text
                        variant="bodyMedium"
                        style={{ color: theme.colors.onSurface }}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      {item.source ? (
                        <Text
                          variant="labelSmall"
                          style={{
                            color: theme.colors.onSurfaceVariant,
                            opacity: 0.6,
                            fontSize: 10,
                          }}
                          numberOfLines={1}
                        >
                          {item.source}
                        </Text>
                      ) : null}
                    </View>
                    <Text
                      variant="bodySmall"
                      style={{ color: metaColor }}
                      numberOfLines={2}
                    >
                      {item.description}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.mentionEmptyState}>
              <Text variant="bodySmall" style={{ color: metaColor }}>
                No skills found
              </Text>
            </View>
          )}
        </View>
      ) : null}

      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: theme.colors.background,
            borderColor,
          },
        ]}
      >
        <TextInput
          ref={inputRef}
          style={[
            styles.textInput,
            {
              backgroundColor: "transparent",
              color: theme.colors.onSurface,
              height: composerInputHeight,
            },
          ]}
          cursorColor={theme.colors.primary}
          multiline
          onChangeText={onChangeText}
          onContentSizeChange={handleInputContentSizeChange}
          onSelectionChange={onSelectionChange}
          placeholder="Send a message..."
          placeholderTextColor={theme.colors.onSurfaceVariant}
          scrollEnabled={composerInputHeight >= MAX_INPUT_HEIGHT}
          selection={inputSelection}
          selectionColor={theme.colors.primary}
          value={inputText}
        />
        <View style={styles.bottomRow}>
          <View style={styles.metaRow}>
            <Pressable
              onPress={onPressProject}
              style={({ pressed }) => [
                styles.metaButton,
                styles.metaButtonLeft,
                { borderColor },
                pressed && styles.metaButtonPressed,
              ]}
            >
              <View
                style={[
                  styles.projectStatusDot,
                  { backgroundColor: projectStatusColor },
                ]}
              />
              <Text
                variant="bodySmall"
                style={[
                  styles.metaButtonText,
                  { color: theme.colors.onSurface },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {activeProjectName}
              </Text>
            </Pressable>
            <Pressable
              onPress={onPressModel}
              style={({ pressed }) => [
                styles.metaButton,
                styles.metaButtonMiddle,
                { borderColor },
                pressed && styles.metaButtonPressed,
              ]}
            >
              <MaterialCommunityIcons
                name="cube-outline"
                size={14}
                color={metaColor}
              />
              <Text
                variant="bodySmall"
                style={[
                  styles.metaButtonText,
                  { color: theme.colors.onSurface },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {selectedModelDisplayName}
              </Text>
            </Pressable>
            <Pressable
              onPress={onPressAgent}
              style={({ pressed }) => [
                styles.metaButton,
                styles.metaButtonRight,
                { borderColor },
                pressed && styles.metaButtonPressed,
              ]}
            >
              <MaterialCommunityIcons
                name="account-switch-outline"
                size={14}
                color={metaColor}
              />
              <Text
                variant="bodySmall"
                style={[
                  styles.metaButtonText,
                  { color: theme.colors.onSurface },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {activeAgentName}
              </Text>
            </Pressable>
          </View>
          <SendButton
            isSending={isSending}
            disabled={!trimmedInput && !isSending}
            onPress={isSending ? (onAbort ?? onSend) : onSend}
          />
        </View>
      </View>
      <View style={styles.footerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: agentProviderLocked }}
          disabled={agentProviderLocked}
          onPress={onPressAgentProvider}
          style={({ pressed }) => [
            styles.footerMetaRow,
            pressed && !agentProviderLocked && styles.metaButtonPressed,
            agentProviderLocked && styles.footerMetaRowDisabled,
          ]}
        >
          <MaterialCommunityIcons
            name="server-outline"
            size={14}
            color={metaColor}
          />
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurface }}
            numberOfLines={1}
          >
            {activeAgentProviderName}
          </Text>
        </Pressable>
        <Pressable
          onPress={onPressBranch}
          style={({ pressed }) => [
            styles.footerMetaRow,
            pressed && styles.metaButtonPressed,
          ]}
        >
          <MaterialCommunityIcons
            name="source-branch"
            size={14}
            color={metaColor}
          />
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurface }}
            numberOfLines={1}
          >
            {branchName}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: COMPOSER_TOP_PADDING,
  },
  inputWrapper: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
  },
  metaRow: {
    flexDirection: "row",
    gap: 0,
    marginRight: 12,
    flexShrink: 1,
    overflow: "hidden",
  },
  metaButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "transparent",
    borderWidth: 1,
    gap: 6,
    maxWidth: 200,
    flexShrink: 1,
  },
  metaButtonLeft: {
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    borderRightWidth: 0,
  },
  metaButtonMiddle: {
    borderRadius: 0,
    borderRightWidth: 0,
  },
  metaButtonRight: {
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    borderLeftWidth: 0,
  },
  metaButtonPressed: {
    opacity: 0.7,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 5,
    gap: 12,
  },
  footerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
    minWidth: 0,
  },
  footerMetaRowDisabled: {
    opacity: 0.7,
  },
  metaButtonText: {
    fontSize: 12,
    flexShrink: 1,
  },
  projectStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  mentionEmptyState: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  mentionHint: {
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  mentionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mentionItemContent: {
    flex: 1,
  },
  mentionSectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  mentionSectionLabel: {
    fontWeight: "700",
    letterSpacing: 0.6,
    marginVertical: 6,
    marginLeft: 12,
    textTransform: "uppercase",
  },
  mentionPanel: {
    borderWidth: 1,
    borderRadius: 14,
    maxHeight: 220,
    overflow: "hidden",
  },
  mentionResults: {
    maxHeight: 180,
  },
  mentionResultsContent: {
    paddingBottom: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  textInput: {
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: "top",
  },
});
