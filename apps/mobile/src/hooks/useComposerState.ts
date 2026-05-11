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
import { useProviderApps, type ProviderApp } from "@/src/lib/api/providers";

type ComposerSelection = {
  start: number;
  end: number;
};

type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

type AppMention = {
  id: string;
  name: string;
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

export function useComposerState(
  activeProjectId: string | undefined,
  activeAgentProviderId: string | undefined,
  activeSessionId: string | null,
) {
  const [inputText, setInputTextState] = React.useState("");
  const [inputSelection, setInputSelection] = React.useState<ComposerSelection>(
    { start: 0, end: 0 },
  );
  const [inputHeight, setInputHeight] = React.useState(MIN_INPUT_HEIGHT);
  const [composerLayoutHeight, setComposerLayoutHeight] = React.useState(0);
  const [appMentions, setAppMentions] = React.useState<AppMention[]>([]);

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
      activeAgentProviderId,
      Boolean(activeProjectId && activeMention && deferredMentionQuery.trim()),
    );
  const isAppMentionContext =
    activeAgentProviderId === "codex" || activeAgentProviderId === "claude";
  const { data: availableApps, isLoading: appSuggestionsLoading } =
    useProviderApps(
      activeAgentProviderId === "claude" ? "claude" : "codex",
      activeSessionId ?? undefined,
      activeProjectId,
      Boolean(activeMention && isAppMentionContext),
    );
  const appSuggestions = React.useMemo(() => {
    if (!isAppMentionContext) {
      return [];
    }

    const query = deferredMentionQuery.trim().toLowerCase();
    const apps = (availableApps ?? []).filter(
      (item) => item.isAccessible && item.isEnabled,
    );

    if (!query) {
      return apps.slice(0, 12);
    }

    const score = (app: ProviderApp) => {
      const haystacks = [
        app.name,
        app.id,
        app.description,
        ...(app.labels ?? []),
      ]
        .join(" ")
        .toLowerCase();

      if (app.id.toLowerCase() === query) return 1000;
      if (app.name.toLowerCase() === query) return 950;
      if (app.id.toLowerCase().startsWith(query)) return 900;
      if (app.name.toLowerCase().startsWith(query)) return 850;
      if (haystacks.includes(query)) return 700;
      return -1;
    };

    return apps
      .map((app) => ({ app, score: score(app) }))
      .filter((entry) => entry.score >= 0)
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.app)
      .slice(0, 12);
  }, [availableApps, deferredMentionQuery, isAppMentionContext]);

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

  const handleSelectAppSuggestion = React.useCallback(
    (app: ProviderApp) => {
      if (!activeMention) {
        return;
      }

      const replacement = `$${app.id} `;
      const nextText = [
        inputText.slice(0, activeMention.start),
        replacement,
        inputText.slice(activeMention.end),
      ].join("");
      const cursor = activeMention.start + replacement.length;

      setInputTextState(nextText);
      setInputSelection({ start: cursor, end: cursor });
      setAppMentions((current) => {
        const next = current.filter((item) => item.id !== app.id);
        next.push({ id: app.id, name: app.name });
        return next.filter((item) => nextText.includes(`$${item.id}`));
      });
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
    setInputTextState("");
    setInputSelection({ start: 0, end: 0 });
    setInputHeight(MIN_INPUT_HEIGHT);
    setAppMentions([]);
  }, []);

  const restoreInput = React.useCallback(
    (text: string, nextAppMentions: AppMention[] = []) => {
      setInputTextState(text);
      setInputSelection({ start: text.length, end: text.length });
      setInputHeight(MIN_INPUT_HEIGHT);
      setAppMentions(
        nextAppMentions.filter((item) => text.includes(`$${item.id}`)),
      );
    },
    [],
  );

  const setInputText = React.useCallback((value: string) => {
    setInputTextState(value);
    setAppMentions((current) =>
      current.filter((item) => value.includes(`$${item.id}`)),
    );
  }, []);

  const selectedAppMentions = React.useMemo(() => {
    const byId = new Map(appMentions.map((item) => [item.id, item]));
    for (const app of availableApps ?? []) {
      if (inputText.includes(`$${app.id}`)) {
        byId.set(app.id, { id: app.id, name: app.name });
      }
    }
    return Array.from(byId.values()).filter((item) =>
      inputText.includes(`$${item.id}`),
    );
  }, [appMentions, availableApps, inputText]);

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
    appSuggestions,
    appSuggestionsLoading,
    selectedAppMentions,
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
    handleSelectAppSuggestion,
    handleSelectSkillSuggestion,
    resetInput,
    restoreInput,
  };
}
