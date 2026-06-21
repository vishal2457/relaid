import { Router } from "express";
import { execSync } from "node:child_process";

interface Harness {
  id: string;
  name: string;
  label: string;
  available: boolean;
  version?: string;
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

export function createHarnessRoutes(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    const harnesses: Harness[] = [
      {
        id: "claude",
        name: "claude",
        label: "Claude Code",
        ...detectBinary("claude"),
      },
      {
        id: "codex",
        name: "codex",
        label: "Codex CLI",
        ...detectBinary("codex"),
      },
      {
        id: "opencode",
        name: "opencode",
        label: "Opencode",
        ...detectBinary("opencode"),
      },
    ];

    res.json({ harnesses });
  });

  return router;
}
