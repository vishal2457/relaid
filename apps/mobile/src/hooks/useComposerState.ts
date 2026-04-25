import React from "react";
import {
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
  type LayoutChangeEvent,
} from "react-native";
import {
  MIN_INPUT_HEIGHT,
} from "@/src/components/ChatComposer";
import {
  useProjectFileSearch,
  type ProjectFileMatch,
} from "@/src/lib/api/projects";
import { useProjectSkills, type Skill } from "@/src/lib/api/skills";

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

export function useComposerState(activeProjectId: string | undefined) {
  const [inputText, setInputText] = React.useState("");
  const [inputSelection, setInputSelection] = React.useState<ComposerSelection>(
    { start: 0, end: 0 },
  );
  const [inputHeight, setInputHeight] = React.useState(MIN_INPUT_HEIGHT);
  const [composerLayoutHeight, setComposerLayoutHeight] = React.useState(0);

  const activeMention = React.useMemo(
    () => getActiveMention(inputText, inputSelection),
    [inputSelection, inputText],
  );
  const deferredMentionQuery = React.useDeferredValue(
    activeMention?.query ?? "",
  );
  const { data: fileSuggestions, isLoading: fileSuggestionsLoading } =
    useProjectFileSearch(
      activeProjectId ?? "",
      deferredMentionQuery,
      Boolean(activeProjectId && activeMention && deferredMentionQuery.trim()),
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
      activeProjectId ?? "",
      deferredSlashQuery,
      Boolean(activeProjectId && activeSlash),
    );

  const trimmedInput = inputText.trim();
  const showMentionSuggestions = Boolean(activeProjectId && activeMention);
  const showSkillSuggestions = Boolean(activeProjectId && activeSlash);

  const handleInputSelectionChange = React.useCallback(
    (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setInputSelection(event.nativeEvent.selection);
    },
    [],
  );

  const handleComposerLayout = React.useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = Math.ceil(event.nativeEvent.layout.height);
      setComposerLayoutHeight((current) =>
        current === nextHeight ? current : nextHeight,
      );
    },
    [],
  );

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

  const resetInput = React.useCallback(() => {
    setInputText("");
    setInputSelection({ start: 0, end: 0 });
    setInputHeight(MIN_INPUT_HEIGHT);
  }, []);

  const restoreInput = React.useCallback(
    (text: string) => {
      setInputText(text);
      setInputSelection({ start: text.length, end: text.length });
      setInputHeight(MIN_INPUT_HEIGHT);
    },
    [],
  );

  return {
    inputText,
    setInputText,
    inputSelection,
    inputHeight,
    setInputHeight,
    composerLayoutHeight,
    trimmedInput,
    // Mention
    activeMention,
    fileSuggestions,
    fileSuggestionsLoading,
    showMentionSuggestions,
    // Slash/Skill
    activeSlash,
    skillSuggestions,
    skillSuggestionsLoading,
    showSkillSuggestions,
    // Handlers
    handleInputSelectionChange,
    handleComposerLayout,
    handleSelectFileSuggestion,
    handleSelectSkillSuggestion,
    resetInput,
    restoreInput,
  };
}
