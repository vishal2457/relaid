// Types that match the server's message format

export type ToolStatus = "pending" | "running" | "completed" | "error";

export interface ToolState {
  status: ToolStatus;
  input: Record<string, any>;
  output?: string;
  error?: string;
  metadata?: Record<string, any>;
  title?: string;
}

export interface BasePart {
  id: string;
  type: "text" | "reasoning" | "tool" | "step" | "file" | "agent";
}

export interface TextPart extends BasePart {
  type: "text";
  text: string;
}

export interface ReasoningPart extends BasePart {
  type: "reasoning";
  text: string;
}

export interface ToolPart extends BasePart {
  type: "tool";
  tool: string;
  state: ToolState;
}

export interface FilePart extends BasePart {
  type: "file";
  filename: string;
  url: string;
}

export interface AgentPart extends BasePart {
  type: "agent";
  agent: string;
}

export type Part = TextPart | ReasoningPart | ToolPart | FilePart | AgentPart;

// Helper to parse raw content from server
export function parsePartContent(
  type: "text" | "reasoning" | "tool" | "step" | "other",
  content: string,
  durationSeconds: number | null,
): Part | null {
  // For text and reasoning, content is just the text itself
  if (type === "text" || type === "reasoning") {
    return {
      id: `${type}-${Date.now()}`,
      type,
      text: content,
    } as TextPart | ReasoningPart;
  }

  // For tools, content is JSON
  if (type === "tool") {
    try {
      const parsed = JSON.parse(content);
      return {
        id: parsed.id || `tool-${Date.now()}`,
        type: "tool",
        tool: parsed.tool || "unknown",
        state: {
          status: parsed.status || parsed.state?.status || "completed",
          input: parsed.input || parsed.state?.input || {},
          output: parsed.output || parsed.state?.output,
          error: parsed.error || parsed.state?.error,
          metadata: parsed.metadata || parsed.state?.metadata,
          title: parsed.title || parsed.state?.title,
        },
      } as ToolPart;
    } catch {
      return null;
    }
  }

  // For step, can be similar to tool or its own format
  if (type === "step") {
    try {
      const parsed = JSON.parse(content);
      return {
        id: `step-${Date.now()}`,
        type: "step",
        text: parsed.text || content,
      } as any;
    } catch {
      return null;
    }
  }

  return null;
}

// Context tools are read, glob, grep, list
export const CONTEXT_TOOLS = new Set(["read", "glob", "grep", "list"]);

export interface ProcessedPart {
  type: "text" | "reasoning" | "tool" | "context-group";
  part?: Part;
  parts?: ToolPart[];
}

export function processMessageParts(
  rawParts: Array<{
    type: "text" | "reasoning" | "tool" | "step" | "other";
    content: string;
    durationSeconds: number | null;
  }>,
): ProcessedPart[] {
  const result: ProcessedPart[] = [];
  const contextBuffer: ToolPart[] = [];

  // Parse all parts first
  const parsedParts = rawParts
    .map((p) => parsePartContent(p.type, p.content, p.durationSeconds))
    .filter((p): p is Part => p !== null);

  for (const part of parsedParts) {
    // Group context tools together
    if (part.type === "tool" && CONTEXT_TOOLS.has(part.tool)) {
      contextBuffer.push(part);
      continue;
    }

    // Flush context buffer before adding other parts
    if (contextBuffer.length > 0) {
      result.push({
        type: "context-group",
        parts: [...contextBuffer],
      });
      contextBuffer.length = 0;
    }

    // Add non-context parts
    if (part.type === "text") {
      if (part.text.trim()) {
        result.push({ type: "text", part });
      }
    } else if (part.type === "reasoning") {
      if (part.text.trim()) {
        result.push({ type: "reasoning", part });
      }
    } else if (part.type === "tool") {
      result.push({ type: "tool", part });
    }
  }

  // Flush remaining context buffer
  if (contextBuffer.length > 0) {
    result.push({
      type: "context-group",
      parts: [...contextBuffer],
    });
  }

  return result;
}
