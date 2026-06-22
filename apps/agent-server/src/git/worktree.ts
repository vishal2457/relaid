import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface GitResult {
  ok: boolean;
  output: string;
  error?: string;
}

export interface Worktree {
  ticketId: string;
  goalId: string;
  path: string;
  branch: string;
  baseBranch: string;
}

export interface GitDiff {
  files: string[];
  summary: string;
}

function run(cwd: string, args: string[], timeoutMs = 30_000): GitResult {
  try {
    const output = execFileSync("git", args, {
      cwd,
      timeout: timeoutMs,
      encoding: "utf-8",
      maxBuffer: 5 * 1024 * 1024,
      env: { ...process.env },
    });
    return { ok: true, output: output.trim() };
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    return {
      ok: false,
      output: (e.stdout || "").trim(),
      error: (e.stderr || e.message || "").trim(),
    };
  }
}

export async function ensureGitRepository(repoPath: string, baseBranch: string): Promise<GitResult> {
  try {
    await fs.mkdir(repoPath, { recursive: true });
  } catch (error) {
    return { ok: false, output: "", error: error instanceof Error ? error.message : String(error) };
  }

  const existing = run(repoPath, ["rev-parse", "--is-inside-work-tree"]);
  if (!existing.ok) {
    let initialized = run(repoPath, ["init", "-b", baseBranch]);
    if (!initialized.ok) {
      initialized = run(repoPath, ["init"]);
      if (!initialized.ok) return initialized;
      const branchResult = run(repoPath, ["checkout", "-b", baseBranch]);
      if (!branchResult.ok) return branchResult;
    }
  }

  const head = run(repoPath, ["rev-parse", "--verify", "HEAD"]);
  if (!head.ok) {
    const commit = run(repoPath, [
      "-c", "user.name=Agent Workbench",
      "-c", "user.email=agent-workbench@local",
      "commit", "--allow-empty", "-m", "chore: initialize repository",
    ]);
    if (!commit.ok) return commit;
  }

  return { ok: true, output: repoPath };
}

function sanitizeBranch(name: string): string {
  return name.replace(/[^a-zA-Z0-9._/-]/g, "-").slice(0, 200);
}

function worktreeBase(goalId: string): string {
  return path.join(os.homedir(), ".agent-workbench", "worktrees", goalId);
}

export async function ensureWorktreeBase(goalId: string): Promise<string> {
  const base = worktreeBase(goalId);
  await fs.mkdir(base, { recursive: true });
  return base;
}

export function createBranchName(goalId: string, ticketId: string): string {
  return sanitizeBranch(`agent/${goalId}/${ticketId}`);
}

export function createWorktreePath(goalId: string, ticketId: string): string {
  return path.join(worktreeBase(goalId), ticketId);
}

export async function createWorktree(
  repoPath: string,
  baseBranch: string,
  goalId: string,
  ticketId: string,
): Promise<GitResult> {
  const branch = createBranchName(goalId, ticketId);
  const wtPath = createWorktreePath(goalId, ticketId);

  await fs.mkdir(path.dirname(wtPath), { recursive: true });

  const remoteResult = run(repoPath, ["fetch", "origin", baseBranch], 60_000);

  const createResult = run(repoPath, [
    "worktree",
    "add",
    "-b",
    branch,
    wtPath,
    `origin/${baseBranch}`,
  ], 60_000);

  if (!createResult.ok) {
    const fallback1 = run(repoPath, [
      "worktree", "add", "-b", branch, wtPath, baseBranch,
    ], 60_000);
    if (!fallback1.ok) {
      const fallback2 = run(repoPath, [
        "worktree", "add", wtPath, "HEAD",
      ], 60_000);
      if (!fallback2.ok) {
        return fallback2;
      }
      run(wtPath, ["checkout", "-b", branch], 30_000);
    }
  }

  return { ok: true, output: wtPath };
}

export async function commitChanges(
  wtPath: string,
  message: string,
): Promise<GitResult> {
  const addResult = run(wtPath, ["add", "-A"], 10_000);
  if (!addResult.ok && addResult.error && !addResult.error.includes("nothing")) {
    return addResult;
  }

  const status = run(wtPath, ["status", "--porcelain"], 10_000);
  if (!status.output) {
    return { ok: true, output: "No changes to commit" };
  }

  return run(wtPath, [
    "commit",
    "-m", message,
    "--no-verify",
  ], 15_000);
}

export function getDiff(wtPath: string): GitResult {
  const diffResult = run(wtPath, [
    "diff", "HEAD~1", "--stat",
  ], 10_000);
  if (!diffResult.ok) {
    return run(wtPath, ["diff", "--stat"], 10_000);
  }
  return diffResult;
}

export function getStatus(wtPath: string): GitResult {
  return run(wtPath, ["status", "--porcelain"], 10_000);
}

export async function removeWorktree(
  repoPath: string,
  wtPath: string,
  force = false,
): Promise<GitResult> {
  try {
    await fs.stat(wtPath);
  } catch {
    return { ok: true, output: "Worktree path does not exist" };
  }

  const args = ["worktree", "remove"];
  if (force) args.push("--force");
  args.push(wtPath);

  const result = run(repoPath, args, 30_000);
  if (!result.ok && force) {
    await fs.rm(wtPath, { recursive: true, force: true });
    return { ok: true, output: "Force removed worktree directory" };
  }
  return result;
}

export function getActiveWorktrees(repoPath: string): GitResult {
  return run(repoPath, ["worktree", "list", "--porcelain"], 10_000);
}

export function mergeWorktree(
  repoPath: string,
  branch: string,
  targetBranch: string,
): GitResult {
  run(repoPath, ["checkout", targetBranch], 15_000);
  run(repoPath, ["fetch", "origin"], 30_000);
  const mergeResult = run(repoPath, [
    "merge", branch, "--no-ff", "--no-edit",
  ], 30_000);
  return mergeResult;
}

export function pushBranch(
  wtPath: string,
  branch: string,
): GitResult {
  return run(wtPath, ["push", "origin", branch], 60_000);
}
