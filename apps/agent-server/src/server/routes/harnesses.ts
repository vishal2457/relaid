import { Router } from "express";
import { execSync } from "node:child_process";
import { getModelCatalog } from "../../harnesses/model-catalog.js";

interface Harness {
  id: string;
  name: string;
  label: string;
  available: boolean;
  version?: string;
  models: string[];
  modelSource: "sdk" | "app-server" | "environment" | "fallback";
  modelError?: string;
}

function detectBinary(bin: string): { available: boolean; version?: string } {
  try {
    const result = execSync(`"${bin}" --version`, {
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    const version = result.toString().trim().split("\n")[0] || undefined;
    return { available: true, version };
  } catch {
    // Try `which` as a fallback
    try {
      execSync(`which "${bin}"`, { timeout: 5000, stdio: "ignore" });
      return { available: true };
    } catch {
      return { available: false };
    }
  }
}

export function detectHarnesses(): Harness[] {
  const catalog = getModelCatalog();
  return [
    {
      id: "claude",
      name: "claude",
      label: "Claude Code",
      models: catalog.claude.models,
      modelSource: catalog.claude.source,
      modelError: catalog.claude.error,
      ...detectBinary("claude"),
    },
    {
      id: "codex",
      name: "codex",
      label: "Codex CLI",
      models: catalog.codex.models,
      modelSource: catalog.codex.source,
      modelError: catalog.codex.error,
      ...detectBinary("codex"),
    },
    {
      id: "opencode",
      name: "opencode",
      label: "Opencode",
      models: catalog.opencode.models,
      modelSource: catalog.opencode.source,
      modelError: catalog.opencode.error,
      ...detectBinary("opencode"),
    },
  ];
}

export function createHarnessRoutes(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ harnesses: detectHarnesses() });
  });

  return router;
}
