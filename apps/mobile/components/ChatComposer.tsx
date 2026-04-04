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
} from "react-native";
import { ActivityIndicator, Text, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type ProjectFileMatch } from "@/lib/api/projects";

export const MIN_INPUT_HEIGHT = 44;
export const MAX_INPUT_HEIGHT = 150;
export const COMPOSER_TOP_PADDING = 12;
export const COMPOSER_BOTTOM_PADDING = 12;
export const KEYBOARD_ADDITIONAL_PADDING = 16;

type ComposerSelection = {
  start: number;
  end: number;
};

type ChatComposerProps = {
  activeProject: boolean;
  borderColor: string;
  fileSuggestions?: ProjectFileMatch[];
  fileSuggestionsLoading: boolean;
  inputHeight: number;
  inputSelection: ComposerSelection;
  inputText: string;
  isSending: boolean;
  mentionQuery: string;
  metaColor: string;
  onChangeText: (value: string) => void;
  onInputHeightChange: (height: number) => void;
  onSelectionChange: (
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>,
  ) => void;
  onSelectFileSuggestion: (match: ProjectFileMatch) => void;
  onSend: () => void;
  showMentionSuggestions: boolean;
  trimmedInput: string;
};

export function ChatComposer({
  activeProject,
  borderColor,
  fileSuggestions,
  fileSuggestionsLoading,
  inputHeight,
  inputSelection,
  inputText,
  isSending,
  mentionQuery,
  metaColor,
  onChangeText,
  onInputHeightChange,
  onSelectionChange,
  onSelectFileSuggestion,
  onSend,
  showMentionSuggestions,
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

  return (
    <View
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
          {!mentionQuery.trim() ? (
            <View style={styles.mentionEmptyState}>
              <Text variant="bodySmall" style={{ color: metaColor }}>
                Type to search for files
              </Text>
            </View>
          ) : fileSuggestionsLoading ? (
            <View style={styles.mentionEmptyState}>
              <ActivityIndicator size="small" />
            </View>
          ) : fileSuggestions && fileSuggestions.length > 0 ? (
            <ScrollView
              style={styles.mentionResults}
              contentContainerStyle={styles.mentionResultsContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {fileSuggestions.map((item) => (
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
            </ScrollView>
          ) : (
            <View style={styles.mentionEmptyState}>
              <Text variant="bodySmall" style={{ color: metaColor }}>
                No matching files or folders
              </Text>
            </View>
          )}
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <View style={[styles.textInputWrap, { height: composerInputHeight }]}>
          <TextInput
            ref={inputRef}
            style={[
              styles.textInput,
              {
                backgroundColor: theme.colors.background,
                borderColor,
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
        </View>

        <Pressable
          disabled={!trimmedInput || isSending || !activeProject}
          onPress={onSend}
          style={[
            styles.sendButton,
            {
              backgroundColor: theme.colors.primary,
              opacity: !trimmedInput || isSending || !activeProject ? 0.7 : 1,
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: COMPOSER_TOP_PADDING,
    borderTopWidth: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  mentionEmptyState: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
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
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: "top",
  },
  textInputWrap: {
    flex: 1,
  },
});
