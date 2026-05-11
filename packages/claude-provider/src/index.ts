import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  type AgentInfo,
  type CanUseTool,
  type McpServerStatus,
  type ModelInfo,
  type PermissionResult,
  type PermissionMode,
  type Query,
  type SDKMessage,
  type SDKSessionInfo,
  getSessionInfo,
  getSessionMessages,
  listSessions,
  query,
} from "@anthropic-ai/claude-agent-sdk";

export interface ClaudeEnv {
  ANTHROPIC_API_KEY?: string;
  CLAUDE_API_KEY?: string;
}

export interface ClaudeProviderInfo {
  id: string;
  name: string;
  models: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
}

export interface ClaudeAgentConfig {
  name: string;
  description: string;
  mode: string;
  builtIn: boolean;
  hidden: boolean;
  tools: string[];
}

export interface ClaudeAppInfo {
  id: string;
  name: string;
  description: string;
  isAccessible: boolean;
  isEnabled: boolean;
  labels: string[];
}

export interface ClaudeSessionInfoRecord {
  id: string;
  title: string;
  directory: string;
  createdAt: number;
  updatedAt: number;
  status: "pending" | "running" | "completed" | "failed" | "aborted";
}

export interface ClaudeMessageRecord {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  kind: "text" | "reasoning" | "tool" | "status";
  toolName?: string;
  data?: Record<string, unknown>;
}

export interface ClaudeRunChunk {
  type: "text" | "reasoning" | "status";
  content: string;
  messageId?: string;
  isComplete?: boolean;
}

export interface ClaudeRunResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
  durationMs: number;
  sessionId: string;
}

export interface ClaudePermissionRequest {
  id: string;
  requestId: string;
  sessionId: string;
  toolName: string;
  title: string;
  description: string;
}

export interface ClaudePermissionResponse {
  requestId: string;
  behavior: "allow" | "deny";
  message?: string;
}

export interface ClaudeRunInput {
  requestId: string;
  cwd: string;
  sessionId?: string;
  prompt: string;
  agent?: string;
  systemPrompt?: string;
  model?: string;
  permissionMode?: PermissionMode;
}

export interface ClaudeBridgeNotification {
  method: string;
  params: unknown;
}

type NotifyFn = (notification: ClaudeBridgeNotification) => void;

interface PendingSession {
  id: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  title: string;
}

interface ActiveRun {
  query: Query;
  startedAt: number;
}

interface MetadataSnapshot {
  models: ModelInfo[];
  agents: AgentInfo[];
  mcpServers: McpServerStatus[];
}

const BUILT_IN_MODES: ClaudeAgentConfig[] = [
  {
    name: "default",
    description: "Prompts for permission the first time a tool is used",
    mode: "primary",
    builtIn: true,
    hidden: false,
    tools: [],
  },
  {
    name: "acceptEdits",
    description: "Automatically approves edit-focused tools without prompting",
    mode: "primary",
    builtIn: true,
    hidden: false,
    tools: [],
  },
  {
    name: "plan",
    description: "Analyze the codebase without executing tools or edits",
    mode: "primary",
    builtIn: true,
    hidden: false,
    tools: [],
  },
  {
    name: "bypassPermissions",
    description: "Skip all permission prompts",
    mode: "primary",
    builtIn: true,
    hidden: false,
    tools: [],
  },
];

export class ClaudeProviderRuntime {
  private readonly pendingSessions = new Map<string, PendingSession>();
  private readonly activeRuns = new Map<string, ActiveRun>();
  private readonly pendingPermissions = new Map<
    string,
    { resolve: (value: PermissionResult) => void; reject: (reason?: unknown) => void }
  >();

  async listProjects(directories: string[]): Promise<ClaudeSessionInfoRecord[]> {
    const now = Date.now();
    return directories.map((directory) => ({
      id: directory,
      title: path.basename(directory) || directory,
      directory,
      createdAt: now,
      updatedAt: now,
      status: "completed",
    }));
  }

  async getProject(directory: string): Promise<ClaudeSessionInfoRecord | null> {
    const normalized = directory.trim();
    if (!normalized) {
      return null;
    }
    const now = Date.now();
    return {
      id: normalized,
      title: path.basename(normalized) || normalized,
      directory: normalized,
      createdAt: now,
      updatedAt: now,
      status: "completed",
    };
  }

  async searchFiles(root: string, needle: string, limit = 50): Promise<Array<{ name: string; path: string; type: string }>> {
    const trimmedRoot = root.trim();
    const trimmedNeedle = needle.trim().toLowerCase();
    if (!trimmedRoot || !trimmedNeedle) {
      return [];
    }

    const matches: Array<{ name: string; path: string; type: string }> = [];
    await this.walk(trimmedRoot, async (entryPath, entryType) => {
      if (limit > 0 && matches.length >= limit) {
        return false;
      }
      const name = path.basename(entryPath);
      if (name.toLowerCase().includes(trimmedNeedle)) {
        matches.push({
          name,
          path: entryPath,
          type: entryType,
        });
      }
      return true;
    });
    return matches;
  }

  async listProviders(cwd: string): Promise<ClaudeProviderInfo[]> {
    const meta = await this.inspect(cwd);
    return [
      {
        id: "anthropic",
        name: "Anthropic",
        models: meta.models.map((model) => ({
          id: model.value,
          name: model.displayName || model.value,
          description: model.description,
        })),
      },
    ];
  }

  async listAgents(cwd: string): Promise<ClaudeAgentConfig[]> {
    const meta = await this.inspect(cwd);
    const dynamicAgents = meta.agents.map((agent) => ({
      name: agent.name,
      description: agent.description,
      mode: "subagent",
      builtIn: true,
      hidden: false,
      tools: [],
    }));
    return [...BUILT_IN_MODES, ...dynamicAgents];
  }

  async listApps(cwd: string): Promise<ClaudeAppInfo[]> {
    const meta = await this.inspect(cwd);
    return meta.mcpServers.map((server) => ({
      id: server.name,
      name: server.name,
      description: `MCP server (${server.status})`,
      isAccessible: server.status === "connected",
      isEnabled: server.status !== "failed",
      labels: ["mcp", server.status],
    }));
  }

  async listSessions(cwd: string, limit: number, offset: number): Promise<ClaudeSessionInfoRecord[]> {
    const persisted = await listSessions({
      dir: cwd,
      limit: limit > 0 ? limit : undefined,
      offset: offset > 0 ? offset : undefined,
    });
    const pending = [...this.pendingSessions.values()]
      .filter((item) => samePath(item.cwd, cwd))
      .map((item) => this.mapPendingSession(item));
    const result = [...pending, ...persisted.map((item) => this.mapSessionInfo(item))]
      .sort((left, right) => right.updatedAt - left.updatedAt);
    if (offset > 0) {
      return result.slice(offset, limit > 0 ? offset + limit : undefined);
    }
    if (limit > 0) {
      return result.slice(0, limit);
    }
    return result;
  }

  async getSession(cwd: string, sessionId: string): Promise<ClaudeSessionInfoRecord | null> {
    const pending = this.pendingSessions.get(sessionId);
    if (pending && samePath(pending.cwd, cwd)) {
      return this.mapPendingSession(pending);
    }
    const info = await getSessionInfo(sessionId, { dir: cwd });
    return info ? this.mapSessionInfo(info) : null;
  }

  createSession(cwd: string, sessionId?: string): ClaudeSessionInfoRecord {
    const id = sessionId?.trim() || randomUUID();
    const now = Date.now();
    const pending: PendingSession = {
      id,
      cwd,
      createdAt: now,
      updatedAt: now,
      title: `Claude session ${id.slice(0, 8)}`,
    };
    this.pendingSessions.set(id, pending);
    return this.mapPendingSession(pending);
  }

  async getSessionMessages(cwd: string, sessionId: string, limit: number): Promise<ClaudeMessageRecord[]> {
    const pending = this.pendingSessions.get(sessionId);
    if (pending && samePath(pending.cwd, cwd)) {
      return [];
    }
    const messages = await getSessionMessages(sessionId, { dir: cwd });
    const normalized = messages.flatMap((message) => normalizeSessionMessage(message));
    if (limit > 0 && normalized.length > limit) {
      return normalized.slice(normalized.length - limit);
    }
    return normalized;
  }

  async runSession(input: ClaudeRunInput, notify: NotifyFn): Promise<ClaudeRunResult> {
    const startedAt = Date.now();
    const sessionId = input.sessionId?.trim() || randomUUID();
    const permissionMode = normalizePermissionMode(input.permissionMode, input.agent);
    const canUseTool: CanUseTool = async (toolName, _toolInput, options) => {
      const requestId = randomUUID();
      notify({
        method: "claude/permission/request",
        params: {
          id: input.requestId,
          requestId,
          sessionId,
          toolName,
          title: options.title || toolName,
          description: options.description || options.displayName || toolName,
        } satisfies ClaudePermissionRequest,
      });
      return await new Promise<PermissionResult>((resolve, reject) => {
        this.pendingPermissions.set(requestId, { resolve, reject });
        options.signal.addEventListener(
          "abort",
          () => {
            this.pendingPermissions.delete(requestId);
            reject(new Error("permission request aborted"));
          },
          { once: true },
        );
      });
    };

    const resumeExisting = await this.shouldResume(input.cwd, sessionId);

    const q = query({
      prompt: buildPrompt(input.prompt, input.systemPrompt),
      options: {
        cwd: input.cwd,
        model: input.model,
        permissionMode,
        allowDangerouslySkipPermissions: permissionMode === "bypassPermissions",
        agent: isMainAgent(input.agent) ? undefined : input.agent,
        resume: resumeExisting ? sessionId : undefined,
        sessionId: resumeExisting ? undefined : sessionId,
        persistSession: true,
        includePartialMessages: true,
        canUseTool,
      },
    });

    this.pendingSessions.delete(sessionId);
    this.activeRuns.set(sessionId, { query: q, startedAt });

    let output = "";
    try {
      for await (const message of q) {
        for (const chunk of normalizeStreamMessage(message)) {
          if (chunk.type === "text" && chunk.content) {
            output += chunk.content;
          }
          notify({
            method: "claude/sessions/run/chunk",
            params: {
              id: input.requestId,
              sessionId,
              chunk,
            },
          });
        }
        if (message.type === "result") {
          const durationMs = message.duration_ms ?? Date.now() - startedAt;
          if (message.subtype === "success") {
            return {
              success: true,
              output: message.result || output,
              exitCode: 0,
              durationMs,
              sessionId,
            };
          }
          return {
            success: false,
            output,
            error: message.errors?.join("\n") || "Claude run failed",
            exitCode: -1,
            durationMs,
            sessionId,
          };
        }
      }
      return {
        success: true,
        output,
        exitCode: 0,
        durationMs: Date.now() - startedAt,
        sessionId,
      };
    } finally {
      this.activeRuns.delete(sessionId);
      q.close();
    }
  }

  async abortSession(sessionId: string): Promise<boolean> {
    const active = this.activeRuns.get(sessionId);
    if (!active) {
      return false;
    }
    await active.query.interrupt();
    return true;
  }

  respondToPermission(response: ClaudePermissionResponse): boolean {
    const pending = this.pendingPermissions.get(response.requestId);
    if (!pending) {
      return false;
    }
    this.pendingPermissions.delete(response.requestId);
    if (response.behavior === "allow") {
      pending.resolve({ behavior: "allow" });
    } else {
      pending.resolve({
        behavior: "deny",
        message: response.message || "Permission denied by user",
      });
    }
    return true;
  }

  private async inspect(cwd: string): Promise<MetadataSnapshot> {
    const inspector = query({
      prompt: "Reply with READY.",
      options: {
        cwd,
        permissionMode: "plan",
        persistSession: false,
        maxTurns: 1,
      },
    });
    try {
      const [models, agents, mcpServers] = await Promise.all([
        inspector.supportedModels(),
        inspector.supportedAgents(),
        inspector.mcpServerStatus(),
      ]);
      return { models, agents, mcpServers };
    } finally {
      inspector.close();
    }
  }

  private mapPendingSession(value: PendingSession): ClaudeSessionInfoRecord {
    return {
      id: value.id,
      title: value.title,
      directory: value.cwd,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      status: this.activeRuns.has(value.id) ? "running" : "pending",
    };
  }

  private mapSessionInfo(value: SDKSessionInfo): ClaudeSessionInfoRecord {
    const createdAt = value.createdAt ?? value.lastModified;
    const status = this.activeRuns.has(value.sessionId) ? "running" : "completed";
    return {
      id: value.sessionId,
      title: value.customTitle || value.summary || value.firstPrompt || `Claude session ${value.sessionId.slice(0, 8)}`,
      directory: value.cwd || "",
      createdAt,
      updatedAt: value.lastModified,
      status,
    };
  }

  private async shouldResume(cwd: string, sessionId: string): Promise<boolean> {
    if (this.pendingSessions.has(sessionId)) {
      return false;
    }
    const info = await getSessionInfo(sessionId, { dir: cwd });
    return Boolean(info);
  }

  private async walk(
    root: string,
    visit: (entryPath: string, entryType: "file" | "directory") => Promise<boolean>,
  ): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(root, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }
      const entryPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        const keepGoing = await visit(entryPath, "directory");
        if (keepGoing === false) {
          return;
        }
        await this.walk(entryPath, visit);
        continue;
      }
      if (entry.isFile()) {
        const keepGoing = await visit(entryPath, "file");
        if (keepGoing === false) {
          return;
        }
      }
    }
  }
}

function buildPrompt(prompt: string, systemPrompt?: string): string {
  const trimmedSystem = systemPrompt?.trim();
  const trimmedPrompt = prompt.trim();
  if (!trimmedSystem) {
    return trimmedPrompt;
  }
  return `${trimmedSystem}\n\n${trimmedPrompt}`;
}

function normalizePermissionMode(mode?: PermissionMode, agentName?: string): PermissionMode | undefined {
  if (mode) {
    return mode;
  }
  const normalized = agentName?.trim();
  switch (normalized) {
    case "default":
    case "acceptEdits":
    case "plan":
    case "bypassPermissions":
    case "dontAsk":
    case "auto":
      return normalized;
    default:
      return "default";
  }
}

function isMainAgent(agentName?: string): boolean {
  const normalized = agentName?.trim();
  return (
    normalized === undefined ||
    normalized === "" ||
    normalized === "default" ||
    normalized === "acceptEdits" ||
    normalized === "plan" ||
    normalized === "bypassPermissions" ||
    normalized === "dontAsk" ||
    normalized === "auto"
  );
}

function normalizeSessionMessage(message: {
  type: "user" | "assistant" | "system";
  uuid: string;
  message: unknown;
}): ClaudeMessageRecord[] {
  if (message.type === "assistant") {
    return normalizeAssistantBlocks(message.uuid, message.message);
  }
  const content = extractContentText(message.message);
  if (!content) {
    return [];
  }
  return [
    {
      id: message.uuid,
      role: message.type,
      content,
      kind: "text",
    },
  ];
}

function normalizeAssistantBlocks(id: string, raw: unknown): ClaudeMessageRecord[] {
  const record = asRecord(raw);
  const content = Array.isArray(record?.content) ? record.content : [];
  const parts: ClaudeMessageRecord[] = [];
  for (const block of content) {
    const item = asRecord(block);
    const type = typeof item?.type === "string" ? item.type : "";
    if (type === "text") {
      const text = readString(item?.text);
      if (text) {
        parts.push({ id, role: "assistant", content: text, kind: "text" });
      }
      continue;
    }
    if (type === "thinking") {
      const thinking = readString(item?.thinking);
      if (thinking) {
        parts.push({ id, role: "assistant", content: thinking, kind: "reasoning" });
      }
      continue;
    }
    if (type === "tool_use" || type.endsWith("tool_use")) {
      const toolName = readString(item?.name) || "tool";
      parts.push({
        id,
        role: "assistant",
        content: JSON.stringify(item?.input ?? {}),
        kind: "tool",
        toolName,
      });
    }
  }
  if (parts.length > 0) {
    return parts;
  }
  const text = extractContentText(raw);
  return text ? [{ id, role: "assistant", content: text, kind: "text" }] : [];
}

function normalizeStreamMessage(message: SDKMessage): ClaudeRunChunk[] {
  if (message.type === "stream_event") {
    const event = asRecord(message.event);
    if (event?.type === "content_block_delta") {
      const delta = asRecord(event.delta);
      if (delta?.type === "text_delta") {
        const text = readString(delta.text);
        return text ? [{ type: "text", content: text, messageId: message.uuid }] : [];
      }
      if (delta?.type === "thinking_delta") {
        const text = readString(delta.thinking);
        return text ? [{ type: "reasoning", content: text, messageId: message.uuid }] : [];
      }
    }
    return [];
  }

  if (message.type === "assistant") {
    const text = normalizeAssistantBlocks(message.uuid, message.message)
      .filter((item) => item.kind === "text")
      .map((item) => item.content)
      .join("");
    return text ? [{ type: "text", content: text, messageId: message.uuid, isComplete: true }] : [];
  }

  if (message.type === "system") {
    switch (message.subtype) {
      case "status":
        return message.status
          ? [{ type: "status", content: message.status, messageId: message.uuid }]
          : [];
      case "task_progress":
        return [{ type: "status", content: message.description, messageId: message.uuid }];
      case "task_notification":
        return [{ type: "status", content: message.summary, messageId: message.uuid }];
      case "local_command_output":
        return [{ type: "status", content: message.content, messageId: message.uuid }];
      case "notification":
        return [{ type: "status", content: message.text, messageId: message.uuid }];
      case "permission_denied":
        return [{ type: "status", content: message.message, messageId: message.uuid }];
      default:
        return [];
    }
  }

  if (message.type === "tool_progress") {
    return [
      {
        type: "status",
        content: `${message.tool_name} running`,
        messageId: message.uuid,
      },
    ];
  }

  return [];
}

function extractContentText(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  const record = asRecord(raw);
  if (!record) {
    return "";
  }
  if (typeof record.content === "string") {
    return record.content;
  }
  if (Array.isArray(record.content)) {
    const text = record.content
      .map((item) => {
        const block = asRecord(item);
        if (!block) {
          return "";
        }
        if (typeof block.text === "string") {
          return block.text;
        }
        if (typeof block.content === "string") {
          return block.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
    if (text) {
      return text;
    }
  }
  if (typeof record.text === "string") {
    return record.text;
  }
  return "";
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left) === path.resolve(right);
}

function asRecord(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, any>;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
