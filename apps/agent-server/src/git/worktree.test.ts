import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensureGitRepository } from "./worktree.js";

test("ensureGitRepository initializes a usable repository with HEAD", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "agent-workbench-git-"));
  try {
    const result = await ensureGitRepository(directory, "main");
    assert.equal(result.ok, true, result.error);
    assert.equal(execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: directory, encoding: "utf8" }).trim(), "true");
    assert.equal(execFileSync("git", ["branch", "--show-current"], { cwd: directory, encoding: "utf8" }).trim(), "main");
    assert.ok(execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim());
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
