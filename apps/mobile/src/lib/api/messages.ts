import { useQuery } from "@tanstack/react-query";
import baseApi from "../axios/base";
import type {
  AssistantMessage,
  Part,
  ReasoningPart,
  TextPart,
  ToolPart,
  SessionMessageResponse,
  UserMessage,
} from "../opencode-types";

export type SessionMessageRole = "user" | "assistant" | "system";

export type SessionMessagePart = {
  type: "text" | "reasoning" | "tool" | "step" | "other";
  content: string;
  durationSeconds: number | null;
};

// Token usage information
export interface SessionMessageTokens {
  input: number;
  output: number;
  reasoning: number;
  cache: {
    read: number;
    write: number;
  };
}

export interface SessionAssistantSummary {
  mode: string | null;
  model: string | null;
  provider: string | null;
  durationMs: number | null;
  activities: SessionAssistantActivity[];
  blocks: SessionAssistantBlock[];
}

export type SessionAssistantBlock =
  | {
      id: string;
      type: "text";
      content: string;
      durationSeconds: number | null;
    }
  | {
      id: string;
      type: "tool";
      activity: SessionAssistantActivity;
    };

export interface SessionAssistantActivityItem {
  id: string;
  label: string;
  detail: string | null;
  filename?: string | null;
  directory?: string | null;
  additions?: number | null;
  deletions?: number | null;
  oldContent?: string | null;
  newContent?: string | null;
  patch?: string | null;
}

export interface SessionAssistantActivity {
  id: string;
  kind: "explored" | "write" | "edit" | "shell" | "tool";
  label: string;
  detail: string | null;
  output: string | null;
  filename: string | null;
  directory: string | null;
  additions: number | null;
  deletions: number | null;
  tool: string | null;
  items?: SessionAssistantActivityItem[];
  oldContent?: string | null;
  newContent?: string | null;
  patch?: string | null;
}

export interface FileDiff {
  file: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface MessageSummary {
  title?: string;
  body?: string;
  diffs: FileDiff[];
}

// Mobile app representation of a session message
export interface SessionMessage {
  id: string;
  sessionID: string;
  role: SessionMessageRole;
  content: string;
  visibleContent: string;
  thinkingContent: string | null;
  thinkingDurationSeconds: number | null;
  parts: SessionMessagePart[];
  createdAt: number;
  time?: {
    created: number;
    completed?: number;
  };
  // Token usage (only for assistant messages)
  tokens?: SessionMessageTokens;
  // Cost information (only for assistant messages)
  cost?: number;
  // Assistant summary (only for assistant messages)
  assistant?: SessionAssistantSummary;
  // Message summary with diffs (only for user messages)
  summary?: MessageSummary;
}

function getToolLabel(part: ToolPart): string {
  const state = asRecord(part.state);
  const title = getStringValue(state, ["title"]);
  return title || part.tool;
}

function getToolErrorSummary(toolParts: ToolPart[]): string {
  const failedTool = toolParts.find(
    (part) => {
      const state = asRecord(part.state);
      return (
        getStringValue(state, ["status"]) === "error" &&
        Boolean(getStringValue(state, ["error"]))
      );
    },
  );

  if (!failedTool) {
    return "";
  }

  const error = getStringValue(asRecord(failedTool.state), ["error"]) ?? "";

  return error ? `${getToolLabel(failedTool)} failed: ${error}` : "";
}

function getReasoningState(reasoningParts: ReasoningPart[]): {
  thinkingContent: string | null;
  thinkingDurationSeconds: number | null;
} {
  const content = reasoningParts
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");

  const durations = reasoningParts
    .map((part) =>
      typeof part.time?.end === "number"
        ? part.time.end - part.time.start
        : null,
    )
    .filter(
      (duration): duration is number => duration !== null && duration >= 0,
    );

  return {
    thinkingContent: content || null,
    thinkingDurationSeconds:
      durations.length > 0
        ? durations.reduce((total, duration) => total + duration, 0)
        : null,
  };
}

const TOOL_LABELS: Record<string, string> = {
  bash: "Shell",
  shell: "Shell",
  read: "Read",
  write: "Write",
  edit: "Edit",
  glob: "Glob",
  grep: "Grep",
  list: "List",
  webfetch: "Fetch",
  websearch: "Search",
  task: "Task",
  todowrite: "Plan",
  question: "Question",
};

const EXPLORATION_TOOLS = new Set([
  "read",
  "glob",
  "grep",
  "list",
  "webfetch",
  "websearch",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getStringValue(
  source: Record<string, unknown> | null | undefined,
  keys: string[],
): string | null {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
}

function getNumberValue(
  source: Record<string, unknown> | null | undefined,
  keys: string[],
): number | null {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function getArrayValue(
  source: Record<string, unknown> | null | undefined,
  keys: string[],
): unknown[] | null {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

function getNormalizedPath(pathValue: string | null): {
  filename: string | null;
  directory: string | null;
} {
  if (!pathValue) {
    return {
      filename: null,
      directory: null,
    };
  }

  const normalized = pathValue.replace(/\\/g, "/").replace(/\/+/g, "/");
  const trimmed = normalized.endsWith("/")
    ? normalized.slice(0, -1)
    : normalized;
  const segments = trimmed.split("/").filter(Boolean);

  if (segments.length === 0) {
    return {
      filename: trimmed || pathValue,
      directory: null,
    };
  }

  return {
    filename: segments[segments.length - 1] ?? null,
    directory:
      segments.length > 1 ? `/${segments.slice(0, -1).join("/")}/` : "/",
  };
}

function getToolStateMetadata(part: ToolPart): Record<string, unknown> | null {
  const state = asRecord(part.state);

  return (
    asRecord(state?.metadata) ??
    asRecord(part.metadata)
  );
}

function getToolStateInput(part: ToolPart): Record<string, unknown> | null {
  const state = asRecord(part.state);
  return asRecord(state?.input);
}

function getToolStateTime(part: ToolPart): Record<string, unknown> | null {
  const state = asRecord(part.state);
  return asRecord(state?.time);
}

function getToolPath(part: ToolPart): string | null {
  const input = getToolStateInput(part);
  const metadata = getToolStateMetadata(part);

  return (
    getStringValue(input, [
      "filePath",
      "filepath",
      "file_path",
      "path",
      "targetFile",
      "target_file",
      "file",
      "filename",
    ]) ??
    getStringValue(metadata, ["filePath", "filepath", "file_path", "path"])
  );
}

function getLineDiffCounts(patch: string | null): {
  additions: number | null;
  deletions: number | null;
} {
  if (!patch) {
    return {
      additions: null,
      deletions: null,
    };
  }

  let additions = 0;
  let deletions = 0;

  for (const line of patch.split("\n")) {
    if (
      line.startsWith("+++") ||
      line.startsWith("---") ||
      line.startsWith("@@")
    ) {
      continue;
    }

    if (line.startsWith("+")) {
      additions += 1;
    } else if (line.startsWith("-")) {
      deletions += 1;
    }
  }

  return {
    additions,
    deletions,
  };
}

type NormalizedEditChange = {
  path: string | null;
  filename: string | null;
  directory: string | null;
  additions: number | null;
  deletions: number | null;
  oldContent: string | null;
  newContent: string | null;
  patch: string | null;
  kind: string | null;
  movePath: string | null;
};

type NormalizedEditData = {
  additions: number | null;
  deletions: number | null;
  oldContent: string | null;
  newContent: string | null;
  patch: string | null;
  items: SessionAssistantActivityItem[] | undefined;
  path: string | null;
};

function getWriteDiffData(part: ToolPart): NormalizedEditData {
  const metadata = getToolStateMetadata(part);
  const metadataDiff = asRecord(metadata?.diff);
  const input = getToolStateInput(part);
  const patch =
    getStringValue(metadataDiff, ["patch", "diff"]) ??
    getStringValue(metadata, ["patch", "diff"]);
  const countsFromDiff = getLineDiffCounts(patch);
  const additions =
    getNumberValue(metadata, ["additions", "added", "linesAdded"]) ??
    getNumberValue(metadataDiff, ["additions", "added", "linesAdded"]) ??
    countsFromDiff.additions;
  const deletions =
    getNumberValue(metadata, ["deletions", "removed", "linesRemoved"]) ??
    getNumberValue(metadataDiff, ["deletions", "removed", "linesRemoved"]) ??
    countsFromDiff.deletions;
  const oldContent =
    getStringValue(input, [
      "oldContent",
      "old_content",
      "oldString",
      "old_string",
      "oldText",
      "old",
      "before",
    ]) ??
    getStringValue(metadata, [
      "oldContent",
      "old_content",
      "oldString",
      "old_string",
      "oldText",
      "old",
      "before",
    ]);
  const newContent =
    getStringValue(input, [
      "content",
      "text",
      "newContent",
      "new_content",
      "newString",
      "new_string",
      "newText",
      "new",
      "after",
    ]) ??
    getStringValue(metadata, [
      "content",
      "text",
      "newContent",
      "new_content",
      "newString",
      "new_string",
      "newText",
      "new",
      "after",
    ]);

  return {
    additions,
    deletions,
    oldContent,
    newContent,
    patch,
    items: undefined,
    path: getToolPath(part),
  };
}

function getNormalizedEditChangeKey(change: NormalizedEditChange): string {
  return JSON.stringify({
    path: change.path,
    additions: change.additions,
    deletions: change.deletions,
    oldContent: change.oldContent,
    newContent: change.newContent,
    patch: change.patch,
    kind: change.kind,
    movePath: change.movePath,
  });
}

function getEditDiffCounts(part: ToolPart): NormalizedEditData {
  const metadata = getToolStateMetadata(part);
  const metadataDiff = asRecord(metadata?.diff);
  const input = getToolStateInput(part);
  const changes = [
    ...(getArrayValue(input, ["changes"]) ?? []),
    ...(getArrayValue(metadata, ["changes"]) ?? []),
  ];

  const normalizedChanges = changes
    .map((change): NormalizedEditChange | null => {
      const record = asRecord(change);
      if (!record) {
        return null;
      }

      const kind = asRecord(record.kind);
      const diff = getStringValue(record, ["diff", "patch"]);
      const countsFromDiff = getLineDiffCounts(diff);
      const path =
        getStringValue(record, [
          "path",
          "filePath",
          "filepath",
          "file_path",
          "targetFile",
          "target_file",
          "file",
          "filename",
        ]) ?? null;
      const pathDetails = getNormalizedPath(path);

      return {
        path,
        filename: pathDetails.filename,
        directory: pathDetails.directory,
        additions:
          getNumberValue(record, ["additions", "added", "linesAdded"]) ??
          countsFromDiff.additions,
        deletions:
          getNumberValue(record, ["deletions", "removed", "linesRemoved"]) ??
          countsFromDiff.deletions,
        oldContent:
          getStringValue(record, [
            "before",
            "oldContent",
            "old_content",
            "oldString",
            "old_string",
            "oldText",
            "old",
          ]) ?? null,
        newContent:
          getStringValue(record, [
            "after",
            "newContent",
            "new_content",
            "newString",
            "new_string",
            "newText",
            "new",
          ]) ?? null,
        patch: diff,
        kind:
          getStringValue(kind, ["type"]) ??
          getStringValue(record, ["type", "kind"]) ??
          null,
        movePath: getStringValue(kind, ["move_path", "movePath"]),
      };
    })
    .filter((change): change is NormalizedEditChange => change !== null)
    .filter((change, index, list) => {
      const key = getNormalizedEditChangeKey(change);
      return (
        list.findIndex(
          (candidate) => getNormalizedEditChangeKey(candidate) === key,
        ) === index
      );
    });

  if (normalizedChanges.length > 0) {
    const additions = normalizedChanges.reduce(
      (total, change) => total + (change.additions ?? 0),
      0,
    );
    const deletions = normalizedChanges.reduce(
      (total, change) => total + (change.deletions ?? 0),
      0,
    );
    const [firstChange] = normalizedChanges;
    if (normalizedChanges.length === 1) {
      return {
        additions: firstChange?.additions ?? null,
        deletions: firstChange?.deletions ?? null,
        oldContent: firstChange?.oldContent ?? null,
        newContent: firstChange?.newContent ?? null,
        patch: firstChange?.patch ?? null,
        items: undefined,
        path: firstChange?.path ?? null,
      };
    }

    const items = normalizedChanges.map((change, index) => ({
      id: `${part.id}-change-${index}`,
      label: change.filename ?? change.path ?? "Edited file",
      detail:
        change.movePath && change.movePath !== change.path
          ? `Moved to ${change.movePath}`
          : null,
      filename: change.filename,
      directory: null,
      additions: change.additions,
      deletions: change.deletions,
      oldContent: change.oldContent,
      newContent: change.newContent,
      patch: change.patch,
    }));

    return {
      additions,
      deletions,
      oldContent: null,
      newContent: null,
      patch: null,
      items,
      path: null,
    };
  }

  const additions =
    getNumberValue(metadata, ["additions", "added", "linesAdded"]) ??
    getNumberValue(metadataDiff, ["additions", "added", "linesAdded"]);
  const deletions =
    getNumberValue(metadata, ["deletions", "removed", "linesRemoved"]) ??
    getNumberValue(metadataDiff, ["deletions", "removed", "linesRemoved"]);

  const before =
    getStringValue(input, ["old_string", "oldString", "oldText", "old"]) ?? "";
  const after =
    getStringValue(input, ["new_string", "newString", "newText", "new"]) ?? "";
  const patch = getStringValue(metadataDiff, ["patch", "diff"]);

  if (additions !== null || deletions !== null) {
    return {
      additions: additions ?? 0,
      deletions: deletions ?? 0,
      oldContent: before || null,
      newContent: after || null,
      patch,
      items: undefined,
      path: getToolPath(part),
    };
  }

  if (!before && !after) {
    return {
      additions: null,
      deletions: null,
      oldContent: null,
      newContent: null,
      patch,
      items: undefined,
      path: getToolPath(part),
    };
  }

  return {
    additions: null,
    deletions: null,
    oldContent: before || null,
    newContent: after || null,
    patch,
    items: undefined,
    path: getToolPath(part),
  };
}

function getShellDetail(part: ToolPart): string | null {
  const metadata = getToolStateMetadata(part);
  const input = getToolStateInput(part);
  const command = getStringValue(input, [
    "description",
    "command",
    "cmd",
    "script",
    "prompt",
    "text",
  ]);
  const cwd = getStringValue(input, ["cwd"]);
  const exitCode = getNumberValue(metadata, ["exitCode"]);
  const durationMs = getNumberValue(metadata, ["durationMs"]);
  const extras: string[] = [];

  if (cwd) {
    extras.push(cwd);
  }
  if (exitCode !== null) {
    extras.push(`exit ${exitCode}`);
  }
  if (durationMs !== null) {
    extras.push(`${Math.round(durationMs)}ms`);
  }

  return (
    getStringValue(metadata, ["description", "title", "summary"]) ??
    (command
      ? extras.length > 0
        ? `${command} • ${extras.join(" • ")}`
        : command
      : null) ??
    getStringValue(asRecord(part.state), ["title"])
  );
}

function getGenericToolDetail(part: ToolPart): string | null {
  const metadata = getToolStateMetadata(part);
  const input = getToolStateInput(part);
  const primary =
    getStringValue(metadata, ["description", "title", "summary"]) ??
    getStringValue(input, [
      "description",
      "pattern",
      "query",
      "url",
      "path",
      "filePath",
      "file_path",
      "server",
      "namespace",
    ]);
  const codexType = getStringValue(metadata, ["codexType"]);
  const argumentsValue = input?.arguments;
  const formattedArguments =
    argumentsValue !== undefined ? JSON.stringify(argumentsValue) : null;
  const secondary = [
    getStringValue(input, ["server"]),
    getStringValue(input, ["namespace"]),
    codexType,
  ]
    .filter(
      (value, index, values) =>
        Boolean(value) && values.indexOf(value) === index,
    )
    .join(" • ");

  return (
    (primary && secondary
      ? primary === secondary
        ? primary
        : `${primary} • ${secondary}`
      : primary ?? secondary) ??
    formattedArguments ??
    getToolLabel(part)
  );
}

function getToolOutput(part: ToolPart): string | null {
  const state = asRecord(part.state);
  const output = getStringValue(state, ["output"]);
  if (output) {
    return output;
  }

  const error = getStringValue(state, ["error"]);
  if (error) {
    return error;
  }

  return null;
}

function getExplorationItemDetail(part: ToolPart): string | null {
  const input = getToolStateInput(part);

  switch (part.tool) {
    case "read": {
      const pathDetails = getNormalizedPath(getToolPath(part));
      return pathDetails.filename ?? getToolPath(part);
    }
    case "list":
      return (
        getStringValue(input, ["path", "filePath", "file_path"]) ??
        getGenericToolDetail(part)
      );
    case "glob":
    case "grep":
      return getStringValue(input, ["pattern"]) ?? getGenericToolDetail(part);
    case "websearch":
      return (
        getStringValue(input, ["query", "url"]) ?? getGenericToolDetail(part)
      );
    case "webfetch":
      return (
        getStringValue(input, ["url", "query"]) ?? getGenericToolDetail(part)
      );
    default:
      return getGenericToolDetail(part);
  }
}

function getExplorationItems(
  parts: ToolPart[],
): SessionAssistantActivityItem[] {
  return parts.map((part, index) => ({
    id: `${part.id}-${index}`,
    label: TOOL_LABELS[part.tool] ?? getToolLabel(part),
    detail: getExplorationItemDetail(part),
  }));
}

function getAssistantDurationMs(
  message: AssistantMessage | undefined,
): number | null {
  if (!message || typeof message.time.completed !== "number") {
    return null;
  }

  const duration = message.time.completed - message.time.created;
  return duration >= 0 ? duration : null;
}

function formatExplorationSummary(parts: ToolPart[]): string {
  let reads = 0;
  let searches = 0;

  for (const part of parts) {
    if (part.tool === "read") {
      reads += 1;
    } else {
      searches += 1;
    }
  }

  const summary: string[] = [];
  if (reads > 0) {
    summary.push(`${reads} ${reads === 1 ? "read" : "reads"}`);
  }
  if (searches > 0) {
    summary.push(`${searches} ${searches === 1 ? "search" : "searches"}`);
  }

  return summary.join(", ");
}

function getToolActivity(part: ToolPart): SessionAssistantActivity {
  if (part.tool === "write" || part.tool === "edit") {
    const diffCounts =
      part.tool === "edit" ? getEditDiffCounts(part) : getWriteDiffData(part);
    const metadata = getToolStateMetadata(part);
    const isCodexFileChange = getStringValue(metadata, ["codexType"]) === "fileChange";
    const pathDetails = getNormalizedPath(
      diffCounts?.path ?? getToolPath(part),
    );

    return {
      id: part.id,
      kind: part.tool,
      label: TOOL_LABELS[part.tool] ?? getToolLabel(part),
      detail: null,
      output: null,
      filename: pathDetails.filename,
      directory: isCodexFileChange ? null : pathDetails.directory,
      additions: diffCounts?.additions ?? null,
      deletions: diffCounts?.deletions ?? null,
      tool: part.tool,
      items: diffCounts?.items,
      oldContent: diffCounts?.oldContent ?? null,
      newContent: diffCounts?.newContent ?? null,
      patch: diffCounts?.patch ?? null,
    };
  }

  if (part.tool === "bash" || part.tool === "shell") {
    return {
      id: part.id,
      kind: "shell",
      label: "Shell",
      detail: getShellDetail(part),
      output: getToolOutput(part),
      filename: null,
      directory: null,
      additions: null,
      deletions: null,
      tool: part.tool,
    };
  }

  return {
    id: part.id,
    kind: "tool",
    label: TOOL_LABELS[part.tool] ?? getToolLabel(part),
    detail: getGenericToolDetail(part),
    output: null,
    filename: null,
    directory: null,
    additions: null,
    deletions: null,
    tool: part.tool,
  };
}

function getAssistantActivities(parts: Part[]): SessionAssistantActivity[] {
  return getAssistantBlocks(parts)
    .filter(
      (
        block,
      ): block is Extract<SessionAssistantBlock, { type: "tool" }> =>
        block.type === "tool",
    )
    .map((block) => block.activity);
}

function getAssistantBlocks(parts: Part[]): SessionAssistantBlock[] {
  const activities: SessionAssistantActivity[] = [];
  const blocks: SessionAssistantBlock[] = [];
  const explorationBuffer: ToolPart[] = [];
  const textBuffer: {
    id: string | null;
    content: string;
    durationSeconds: number | null;
  } = {
    id: null,
    content: "",
    durationSeconds: null,
  };

  const flushTextBuffer = () => {
    if (!textBuffer.content.trim()) {
      textBuffer.id = null;
      textBuffer.content = "";
      textBuffer.durationSeconds = null;
      return;
    }

    blocks.push({
      id: textBuffer.id ?? `text-${blocks.length}`,
      type: "text",
      content: textBuffer.content,
      durationSeconds: textBuffer.durationSeconds,
    });
    textBuffer.id = null;
    textBuffer.content = "";
    textBuffer.durationSeconds = null;
  };

  const flushExplorationBuffer = () => {
    if (explorationBuffer.length === 0) {
      return;
    }

    const activity = {
      id: `explored-${explorationBuffer[0]?.id ?? activities.length}`,
      kind: "explored",
      label: "Explored",
      detail: formatExplorationSummary(explorationBuffer),
      output: null,
      filename: null,
      directory: null,
      additions: null,
      deletions: null,
      tool: null,
      items: getExplorationItems(explorationBuffer),
    } satisfies SessionAssistantActivity;
    activities.push(activity);
    blocks.push({
      id: activity.id,
      type: "tool",
      activity,
    });
    explorationBuffer.length = 0;
  };

  for (const part of parts) {
    if (part.type === "step-start" || part.type === "step-finish") {
      continue;
    }

    if (part.type === "text") {
      flushExplorationBuffer();
      textBuffer.id = textBuffer.id ?? part.id;
      textBuffer.content += part.text;
      if (textBuffer.durationSeconds === null) {
        textBuffer.durationSeconds = getPartDurationSeconds(part);
      } else {
        const duration = getPartDurationSeconds(part);
        if (duration !== null) {
          textBuffer.durationSeconds += duration;
        }
      }
      continue;
    }

    if (part.type === "reasoning") {
      continue;
    }

    if (part.type !== "tool") {
      continue;
    }

    flushTextBuffer();

    if (EXPLORATION_TOOLS.has(part.tool)) {
      explorationBuffer.push(part);
      continue;
    }

    flushExplorationBuffer();
    const activity = getToolActivity(part);
    activities.push(activity);
    blocks.push({
      id: activity.id,
      type: "tool",
      activity,
    });
  }

  flushTextBuffer();
  flushExplorationBuffer();

  return blocks;
}

function getPartDurationSeconds(part: TextPart | ReasoningPart): number | null {
  if (typeof part.time?.end !== "number") {
    return null;
  }

  return part.time.end - part.time.start;
}

function parseStreamedActivityPart(
  type: "tool" | "step",
  content: string,
): ToolPart | null {
  try {
    const parsed = JSON.parse(content) as ToolPart;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.id !== "string" ||
      typeof parsed.type !== "string"
    ) {
      return null;
    }

    if (type === "tool" && parsed.type === "tool") {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

function inferStreamActivityFromText(
  detail: string,
): SessionAssistantActivity | null {
  const trimmed = detail.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed === "Editing files") {
    return {
      id: "stream-edit",
      kind: "edit",
      label: "Edit",
      detail: trimmed,
      output: null,
      filename: null,
      directory: null,
      additions: null,
      deletions: null,
      tool: "edit",
    };
  }

  if (
    trimmed.startsWith("Running command") ||
    /[|&;<>()$`]/.test(trimmed) ||
    trimmed.includes("pnpm ") ||
    trimmed.includes("npm ") ||
    trimmed.includes("git ") ||
    trimmed.includes("node ")
  ) {
    return {
      id: "stream-shell",
      kind: "shell",
      label: "Shell",
      detail: trimmed,
      output: null,
      filename: null,
      directory: null,
      additions: null,
      deletions: null,
      tool: "shell",
    };
  }

  return null;
}

export function adaptStreamActivity(
  type: "tool" | "step",
  content: string,
): SessionAssistantActivity | null {
  if (type === "step") {
    return null;
  }

  const parsed = parseStreamedActivityPart(type, content);
  if (parsed) {
    return getToolActivity(parsed);
  }

  const detail = content.trim();
  if (!detail) {
    return null;
  }

  if (type === "tool") {
    const inferred = inferStreamActivityFromText(detail);
    if (inferred) {
      return inferred;
    }

    return {
      id: "stream-tool",
      kind: "tool",
      label: "Tool",
      detail,
      output: null,
      filename: null,
      directory: null,
      additions: null,
      deletions: null,
      tool: null,
    };
  }

  return null;
}

// Convert OpenCode MessageResponse to mobile SessionMessage
export function adaptMessage(
  messageResponse: SessionMessageResponse,
): SessionMessage {
  const message = messageResponse.info;
  const parts = messageResponse.parts ?? [];

  const textParts = parts.filter((p): p is TextPart => p.type === "text");
  const reasoningParts = parts.filter(
    (p): p is ReasoningPart => p.type === "reasoning",
  );
  const toolParts = parts.filter((p): p is ToolPart => p.type === "tool");

  const textContent = textParts.map((p) => p.text).join("");
  const toolErrorSummary = getToolErrorSummary(toolParts);
  const content = textContent || toolErrorSummary;
  const visibleContent = content;
  const { thinkingContent, thinkingDurationSeconds } =
    getReasoningState(reasoningParts);

  const convertedParts = parts.flatMap<SessionMessagePart>((part) => {
    if (part.type === "text") {
      return [
        {
          type: "text" as const,
          content: part.text,
          durationSeconds: getPartDurationSeconds(part),
        },
      ];
    }

    if (part.type === "reasoning") {
      return [
        {
          type: "reasoning" as const,
          content: part.text,
          durationSeconds: getPartDurationSeconds(part),
        },
      ];
    }

    if (part.type === "tool") {
      return [
        {
          type: "tool" as const,
          content: JSON.stringify(part),
          durationSeconds: (() => {
            const time = getToolStateTime(part);
            const end = getNumberValue(time, ["end"]);
            const start = getNumberValue(time, ["start"]);

            if (end === null || start === null) {
              return null;
            }

            return end - start;
          })(),
        },
      ];
    }

    if (part.type === "step-start" || part.type === "step-finish") {
      return [
        {
          type: "step" as const,
          content: JSON.stringify(part),
          durationSeconds: null,
        },
      ];
    }

    return [];
  });

  // Extract token info from assistant message
  const assistantMessage =
    message.role === "assistant" ? (message as AssistantMessage) : undefined;
  const tokens = assistantMessage?.tokens
    ? {
        input: assistantMessage.tokens.input,
        output: assistantMessage.tokens.output,
        reasoning: assistantMessage.tokens.reasoning,
        cache: {
          read: assistantMessage.tokens.cache.read,
          write: assistantMessage.tokens.cache.write,
        },
      }
    : undefined;

  const assistant =
    assistantMessage && message.role === "assistant"
      ? (() => {
          const activities = getAssistantActivities(parts);
          const blocks = getAssistantBlocks(parts);

          return {
            mode: assistantMessage.mode ?? null,
            model: assistantMessage.modelID ?? null,
            provider: assistantMessage.providerID ?? null,
            durationMs: getAssistantDurationMs(assistantMessage),
            activities,
            blocks,
          };
        })()
      : undefined;

  // Extract summary from user message
  const userMessage =
    message.role === "user" ? (message as UserMessage) : undefined;

  return {
    id: message.id,
    sessionID: message.sessionID,
    role: message.role,
    content,
    visibleContent,
    thinkingContent,
    thinkingDurationSeconds,
    parts: convertedParts,
    createdAt: message.time.created,
    time: message.time,
    tokens,
    cost: assistantMessage?.cost,
    assistant,
    summary: userMessage?.summary,
  };
}

export const messageKeys = {
  all: ["messages"] as const,
  lists: () => [...messageKeys.all, "list"] as const,
  list: (sessionId: string, agentProviderId?: string) =>
    [...messageKeys.lists(), sessionId, agentProviderId ?? "opencode"] as const,
  diffs: () => [...messageKeys.all, "diff"] as const,
  diff: (sessionId: string, messageId: string) =>
    [...messageKeys.diffs(), sessionId, messageId] as const,
};

export function useSessionMessages(
  sessionId: string,
  limit = 100,
  agentProviderId?: string,
) {
  return useQuery<SessionMessage[]>({
    queryKey: messageKeys.list(sessionId, agentProviderId),
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const response = await baseApi.get<{
        messages: SessionMessageResponse[];
      }>(`/sessions/${sessionId}/messages`, {
        params: { limit, agentProviderId },
      });

      return (response.data.messages ?? []).map(adaptMessage);
    },
  });
}
