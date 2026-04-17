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
}

export interface SessionAssistantActivityItem {
  id: string;
  label: string;
  detail: string | null;
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
  const title =
    "title" in part.state && typeof part.state.title === "string"
      ? part.state.title
      : undefined;
  return title || part.tool;
}

function getToolErrorSummary(toolParts: ToolPart[]): string {
  const failedTool = toolParts.find(
    (part) =>
      part.state.status === "error" &&
      "error" in part.state &&
      typeof part.state.error === "string" &&
      part.state.error.trim().length > 0,
  );

  if (!failedTool) {
    return "";
  }

  const error =
    failedTool.state.status === "error" && "error" in failedTool.state
      ? failedTool.state.error.trim()
      : "";

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
  return "metadata" in part.state ? asRecord(part.state.metadata) : null;
}

function getToolPath(part: ToolPart): string | null {
  const input = asRecord(part.state.input);
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

function getEditDiffCounts(part: ToolPart): {
  additions: number | null;
  deletions: number | null;
  oldContent: string | null;
  newContent: string | null;
} {
  const metadata = getToolStateMetadata(part);
  const metadataDiff = asRecord(metadata?.diff);
  const input = asRecord(part.state.input);

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

  if (additions !== null || deletions !== null) {
    return {
      additions: additions ?? 0,
      deletions: deletions ?? 0,
      oldContent: before || null,
      newContent: after || null,
    };
  }

  if (!before && !after) {
    return {
      additions: null,
      deletions: null,
      oldContent: null,
      newContent: null,
    };
  }

  return {
    additions: null,
    deletions: null,
    oldContent: before || null,
    newContent: after || null,
  };
}

function getShellDetail(part: ToolPart): string | null {
  const metadata = getToolStateMetadata(part);
  const input = asRecord(part.state.input);

  return (
    getStringValue(metadata, ["description", "title", "summary"]) ??
    getStringValue(input, [
      "description",
      "command",
      "cmd",
      "script",
      "prompt",
      "text",
    ]) ??
    ("title" in part.state && typeof part.state.title === "string"
      ? part.state.title
      : null)
  );
}

function getGenericToolDetail(part: ToolPart): string | null {
  const metadata = getToolStateMetadata(part);
  const input = asRecord(part.state.input);

  return (
    getStringValue(metadata, ["description", "title", "summary"]) ??
    getStringValue(input, [
      "description",
      "pattern",
      "query",
      "url",
      "path",
      "filePath",
      "file_path",
    ]) ??
    getToolLabel(part)
  );
}

function getToolOutput(part: ToolPart): string | null {
  if ("output" in part.state && typeof part.state.output === "string") {
    const output = part.state.output.trim();
    return output.length > 0 ? output : null;
  }

  if ("error" in part.state && typeof part.state.error === "string") {
    const error = part.state.error.trim();
    return error.length > 0 ? error : null;
  }

  return null;
}

function getExplorationItemDetail(part: ToolPart): string | null {
  const input = asRecord(part.state.input);

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
    const pathDetails = getNormalizedPath(getToolPath(part));
    const diffCounts = part.tool === "edit" ? getEditDiffCounts(part) : null;

    return {
      id: part.id,
      kind: part.tool,
      label: TOOL_LABELS[part.tool] ?? getToolLabel(part),
      detail: null,
      output: null,
      filename: pathDetails.filename,
      directory: pathDetails.directory,
      additions: diffCounts?.additions ?? null,
      deletions: diffCounts?.deletions ?? null,
      tool: part.tool,
      oldContent: diffCounts?.oldContent ?? null,
      newContent: diffCounts?.newContent ?? null,
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
  const activities: SessionAssistantActivity[] = [];
  const explorationBuffer: ToolPart[] = [];

  const flushExplorationBuffer = () => {
    if (explorationBuffer.length === 0) {
      return;
    }

    activities.push({
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
    });
    explorationBuffer.length = 0;
  };

  for (const part of parts) {
    if (part.type === "step-start" || part.type === "step-finish") {
      continue;
    }

    if (part.type !== "tool") {
      continue;
    }

    if (EXPLORATION_TOOLS.has(part.tool)) {
      explorationBuffer.push(part);
      continue;
    }

    flushExplorationBuffer();
    activities.push(getToolActivity(part));
  }

  flushExplorationBuffer();

  return activities;
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
          durationSeconds:
            "time" in part.state && typeof part.state.time === "object"
              ? "end" in part.state.time
                ? part.state.time.end - part.state.time.start
                : null
              : null,
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

          return {
            mode: assistantMessage.mode ?? null,
            model: assistantMessage.modelID ?? null,
            provider: assistantMessage.providerID ?? null,
            durationMs: getAssistantDurationMs(assistantMessage),
            activities,
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
  list: (sessionId: string) => [...messageKeys.lists(), sessionId] as const,
  diffs: () => [...messageKeys.all, "diff"] as const,
  diff: (sessionId: string, messageId: string) =>
    [...messageKeys.diffs(), sessionId, messageId] as const,
};

export function useSessionMessages(sessionId: string, limit = 100) {
  return useQuery<SessionMessage[]>({
    queryKey: messageKeys.list(sessionId),
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const response = await baseApi.get<{
        messages: SessionMessageResponse[];
      }>(`/sessions/${sessionId}/messages`, {
        params: { limit },
      });

      return (response.data.messages ?? []).map(adaptMessage);
    },
  });
}
