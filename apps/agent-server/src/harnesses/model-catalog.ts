import { spawn } from "node:child_process";
import readline from "node:readline";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { createOpencode } from "@opencode-ai/sdk";
import type { HarnessProvider } from "../models/domain.js";

export interface ModelCatalogEntry {
  models: string[];
  source: "sdk" | "app-server" | "environment" | "fallback";
  error?: string;
}

const FALLBACKS: Record<HarnessProvider, string[]> = {
  claude: ["default", "sonnet", "opus", "haiku"],
  codex: ["gpt-5.3-codex"],
  opencode: ["opencode/big-pickle"],
};

let catalog: Record<HarnessProvider, ModelCatalogEntry> = {
  claude: { models: FALLBACKS.claude, source: "fallback" },
  codex: { models: FALLBACKS.codex, source: "fallback" },
  opencode: { models: FALLBACKS.opencode, source: "fallback" },
};

export function uniqueModels(models: string[]): string[] {
  return [...new Set(models.map((model) => model.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function flattenOpencodeModels(providers: Array<{ id: string; models: Record<string, { id: string }> }>): string[] {
  return uniqueModels(providers.flatMap((provider) => Object.values(provider.models).map((model) => `${provider.id}/${model.id}`)));
}

function environmentModels(provider: HarnessProvider): string[] | null {
  const value = process.env[`${provider.toUpperCase()}_MODELS`];
  return value ? uniqueModels(value.split(",")) : null;
}

async function discoverClaudeModels(): Promise<string[]> {
  const sdkQuery = query({ prompt: "", options: { cwd: process.cwd() } });
  try {
    const models = await withTimeout(sdkQuery.supportedModels(), 12_000, "Claude model discovery timed out");
    return uniqueModels(models.map((model) => model.value));
  } finally {
    sdkQuery.close();
  }
}

async function discoverOpencodeModels(): Promise<string[]> {
  const instance = await withTimeout(createOpencode({ port: 0 }), 12_000, "OpenCode startup timed out");
  try {
    const response = await withTimeout(instance.client.config.providers(), 12_000, "OpenCode model discovery timed out");
    return flattenOpencodeModels(response.data?.providers ?? []);
  } finally {
    instance.server.close();
  }
}

interface RpcResponse { id?: number; result?: unknown; error?: { message?: string } }

async function discoverCodexModels(): Promise<string[]> {
  const child = spawn(process.env.CODEX_BIN || "codex", ["app-server", "--listen", "stdio://"], {
    stdio: ["pipe", "pipe", "pipe"], env: { ...process.env },
  });
  const lines = readline.createInterface({ input: child.stdout });
  let requestId = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  child.on("error", (error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  });
  lines.on("line", (line) => {
    try {
      const response = JSON.parse(line) as RpcResponse;
      if (response.id === undefined) return;
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      if (response.error) request.reject(new Error(response.error.message || "Codex app-server request failed"));
      else request.resolve(response.result);
    } catch { /* Ignore non-protocol output. */ }
  });
  const request = (method: string, params: unknown) => new Promise<unknown>((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });

  try {
    await withTimeout(request("initialize", { clientInfo: { name: "agentloop", version: "0.0.0" }, capabilities: {} }), 12_000, "Codex initialization timed out");
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "initialized", params: {} })}\n`);
    const models: string[] = [];
    let cursor: string | null = null;
    do {
      const result = await withTimeout(request("model/list", { cursor, limit: 100, includeHidden: false }), 12_000, "Codex model discovery timed out") as { data?: Array<{ model?: string; id?: string }>; nextCursor?: string | null };
      models.push(...(result.data ?? []).map((model) => model.model || model.id || ""));
      cursor = result.nextCursor ?? null;
    } while (cursor);
    return uniqueModels(models);
  } finally {
    for (const pendingRequest of pending.values()) pendingRequest.reject(new Error("Codex app-server stopped"));
    pending.clear(); lines.close(); child.kill();
  }
}

async function discover(provider: HarnessProvider, fn: () => Promise<string[]>, source: ModelCatalogEntry["source"]): Promise<ModelCatalogEntry> {
  const overridden = environmentModels(provider);
  if (overridden?.length) return { models: overridden, source: "environment" };
  try {
    const models = await fn();
    if (models.length === 0) throw new Error("No models returned");
    return { models, source };
  } catch (error) {
    return { models: FALLBACKS[provider], source: "fallback", error: error instanceof Error ? error.message : String(error) };
  }
}

export async function initializeModelCatalog(): Promise<Record<HarnessProvider, ModelCatalogEntry>> {
  const [claude, codex, opencode] = await Promise.all([
    discover("claude", discoverClaudeModels, "sdk"),
    discover("codex", discoverCodexModels, "app-server"),
    discover("opencode", discoverOpencodeModels, "sdk"),
  ]);
  catalog = { claude, codex, opencode };
  return catalog;
}

export function getModelCatalog(): Record<HarnessProvider, ModelCatalogEntry> {
  return catalog;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}
