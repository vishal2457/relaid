import simpleGit, {
  type SimpleGit,
  type CommitResult,
  type BranchSummary,
  type LogResult,
  type RemoteWithRefs,
} from "simple-git";
import { logger } from "../shared/logger";

export interface GitFileStatus {
  path: string;
  index: string;
  worktree: string;
  from?: string;
}

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  message: string;
}

export interface GitBranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  commit?: string;
}

export interface GitRemoteInfo {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export interface GitResult<T = string> {
  success: boolean;
  data?: T;
  error?: string;
}

export class GitService {
  private git: SimpleGit;
  private cwd: string;

  constructor(projectPath: string) {
    this.cwd = projectPath;
    this.git = simpleGit({ baseDir: projectPath, binary: "git" });
  }

  private handleError(operation: string, error: unknown): GitResult<never> {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`GitService.${operation} failed`, {
      error: errMsg,
      cwd: this.cwd,
    });
    return { success: false, error: errMsg };
  }

  // =====================
  // Repository
  // =====================

  async isGitRepository(): Promise<boolean> {
    try {
      return await this.git.checkIsRepo();
    } catch {
      return false;
    }
  }

  async isClean(): Promise<boolean> {
    try {
      return (await this.git.status()).isClean();
    } catch {
      return false;
    }
  }

  async init(): Promise<GitResult<string>> {
    try {
      await this.git.init();
      logger.info("Initialized git repo", { cwd: this.cwd });
      return { success: true, data: "Initialized" };
    } catch (error) {
      return this.handleError("init", error);
    }
  }

  async clone(url: string, localPath: string): Promise<GitResult<string>> {
    try {
      await this.git.clone(url, localPath);
      logger.info("Cloned repo", { url, localPath });
      return { success: true, data: localPath };
    } catch (error) {
      return this.handleError("clone", error);
    }
  }

  // =====================
  // Branches
  // =====================

  async getCurrentBranch(): Promise<GitResult<string>> {
    try {
      const branch = await this.git.revparse(["--abbrev-ref", "HEAD"]);
      return { success: true, data: branch.trim() };
    } catch (error) {
      return this.handleError("getCurrentBranch", error);
    }
  }

  async listBranches(
    includeRemote = false,
  ): Promise<GitResult<GitBranchInfo[]>> {
    try {
      const summary: BranchSummary = await this.git.branch(
        includeRemote ? ["-a"] : [],
      );
      const branches: GitBranchInfo[] = Object.values(summary.branches).map(
        (b) => ({
          name: b.name,
          isCurrent: b.current,
          isRemote: b.name.startsWith("remotes/"),
          commit: b.commit,
        }),
      );
      return { success: true, data: branches };
    } catch (error) {
      return this.handleError("listBranches", error);
    }
  }

  async createBranch(
    name: string,
    startPoint?: string,
  ): Promise<GitResult<string>> {
    try {
      await this.git.checkoutBranch(name, startPoint ?? "HEAD");
      logger.info("Created and switched to branch", { name, cwd: this.cwd });
      return { success: true, data: name };
    } catch (error) {
      return this.handleError("createBranch", error);
    }
  }

  async switchBranch(name: string): Promise<GitResult<string>> {
    try {
      await this.git.checkout(name);
      logger.info("Switched to branch", { name, cwd: this.cwd });
      return { success: true, data: name };
    } catch (error) {
      return this.handleError("switchBranch", error);
    }
  }

  async deleteBranch(name: string, force = false): Promise<GitResult<string>> {
    try {
      await this.git.deleteLocalBranch(name, force);
      logger.info("Deleted branch", { name, cwd: this.cwd });
      return { success: true, data: name };
    } catch (error) {
      return this.handleError("deleteBranch", error);
    }
  }

  // =====================
  // Staging
  // =====================

  async getStatus(): Promise<GitResult<GitFileStatus[]>> {
    try {
      const status = await this.git.status();
      const files: GitFileStatus[] = status.files.map((f) => ({
        path: f.path,
        index: f.index ?? " ",
        worktree: f.working_dir ?? " ",
        from: f.from,
      }));
      return { success: true, data: files };
    } catch (error) {
      return this.handleError("getStatus", error);
    }
  }

  async getStagedFiles(): Promise<GitResult<string[]>> {
    try {
      const status = await this.git.status();
      return { success: true, data: status.staged };
    } catch (error) {
      return this.handleError("getStagedFiles", error);
    }
  }

  async getStagedFilesWithStatus(): Promise<
    GitResult<
      Array<{
        path: string;
        status: "added" | "modified" | "deleted" | "renamed";
      }>
    >
  > {
    try {
      const status = await this.git.status();
      const files = status.files
        .filter((f) => f.index && f.index !== " " && f.index !== "?")
        .map((f) => {
          let fileStatus: "added" | "modified" | "deleted" | "renamed" =
            "modified";
          if (f.index === "A") {
            fileStatus = "added";
          } else if (f.index === "M") {
            fileStatus = "modified";
          } else if (f.index === "D") {
            fileStatus = "deleted";
          } else if (f.index === "R") {
            fileStatus = "renamed";
          }
          return { path: f.path, status: fileStatus };
        });
      return { success: true, data: files };
    } catch (error) {
      return this.handleError("getStagedFilesWithStatus", error);
    }
  }

  async getUnstagedFiles(): Promise<GitResult<string[]>> {
    try {
      const status = await this.git.status();
      const files = status.modified.filter((f) => !status.staged.includes(f));
      return { success: true, data: files };
    } catch (error) {
      return this.handleError("getUnstagedFiles", error);
    }
  }

  async getUntrackedFiles(): Promise<GitResult<string[]>> {
    try {
      const status = await this.git.status();
      return { success: true, data: status.not_added };
    } catch (error) {
      return this.handleError("getUntrackedFiles", error);
    }
  }

  async addFiles(files: string[]): Promise<GitResult<string>> {
    if (files.length === 0) {
      return { success: false, error: "No files specified" };
    }
    try {
      await this.git.add(files);
      logger.info("Staged files", { files, cwd: this.cwd });
      return { success: true, data: `Staged ${files.length} file(s)` };
    } catch (error) {
      return this.handleError("addFiles", error);
    }
  }

  async addAll(): Promise<GitResult<string>> {
    try {
      await this.git.add(["-A"]);
      logger.info("Staged all changes", { cwd: this.cwd });
      return { success: true, data: "Staged all changes" };
    } catch (error) {
      return this.handleError("addAll", error);
    }
  }

  async unstageFiles(files: string[]): Promise<GitResult<string>> {
    if (files.length === 0) {
      return { success: false, error: "No files specified" };
    }
    try {
      await this.git.reset(["HEAD", ...files]);
      logger.info("Unstaged files", { files, cwd: this.cwd });
      return { success: true, data: `Unstaged ${files.length} file(s)` };
    } catch (error) {
      return this.handleError("unstageFiles", error);
    }
  }

  // =====================
  // Commit
  // =====================

  async commit(message: string): Promise<GitResult<string>> {
    try {
      const result: CommitResult = await this.git.commit(message);
      const hash = result.commit;
      logger.info("Created commit", { hash, cwd: this.cwd });
      return { success: true, data: hash };
    } catch (error) {
      return this.handleError("commit", error);
    }
  }

  // =====================
  // Push / Pull / Fetch
  // =====================

  async push(
    remote = "origin",
    branch?: string,
    setUpstream = false,
  ): Promise<GitResult<string>> {
    try {
      const result = await this.git.push(
        remote,
        branch,
        setUpstream ? ["-u"] : undefined,
      );
      const summary =
        result.pushed.length > 0
          ? `Pushed ${result.pushed.length} update(s)`
          : "Push complete";
      logger.info("Pushed", { remote, branch, cwd: this.cwd });
      return { success: true, data: summary };
    } catch (error) {
      return this.handleError("push", error);
    }
  }

  async pull(remote = "origin", branch?: string): Promise<GitResult<string>> {
    try {
      const result = await this.git.pull(remote, branch);
      const parts = [
        result.summary.changes ? `${result.summary.changes} changed` : "",
        result.summary.insertions
          ? `${result.summary.insertions} insertions`
          : "",
        result.summary.deletions ? `${result.summary.deletions} deletions` : "",
      ].filter(Boolean);
      logger.info("Pulled", { remote, branch, cwd: this.cwd });
      return { success: true, data: parts.join(", ") || "Pull complete" };
    } catch (error) {
      return this.handleError("pull", error);
    }
  }

  async fetch(remote = "origin"): Promise<GitResult<string>> {
    try {
      await this.git.fetch(remote);
      logger.info("Fetched", { remote, cwd: this.cwd });
      return { success: true, data: `Fetched from ${remote}` };
    } catch (error) {
      return this.handleError("fetch", error);
    }
  }

  // =====================
  // Log
  // =====================

  async log(count = 10): Promise<GitResult<GitCommitInfo[]>> {
    try {
      const result: LogResult = await this.git.log({ maxCount: count });
      const commits: GitCommitInfo[] = result.all.map((c) => ({
        hash: c.hash,
        shortHash: c.hash.slice(0, 7),
        author: c.author_name,
        date: c.date,
        message: c.message,
      }));
      return { success: true, data: commits };
    } catch (error) {
      return this.handleError("log", error);
    }
  }

  // =====================
  // Remotes
  // =====================

  async getRemotes(): Promise<GitResult<GitRemoteInfo[]>> {
    try {
      const remotes: RemoteWithRefs[] = await this.git.getRemotes(true);
      const result: GitRemoteInfo[] = remotes.map((r) => ({
        name: r.name,
        fetchUrl: r.refs.fetch ?? "",
        pushUrl: r.refs.push ?? "",
      }));
      return { success: true, data: result };
    } catch (error) {
      return this.handleError("getRemotes", error);
    }
  }

  async addRemote(name: string, url: string): Promise<GitResult<string>> {
    try {
      await this.git.addRemote(name, url);
      logger.info("Added remote", { name, url, cwd: this.cwd });
      return { success: true, data: name };
    } catch (error) {
      return this.handleError("addRemote", error);
    }
  }

  async removeRemote(name: string): Promise<GitResult<string>> {
    try {
      await this.git.removeRemote(name);
      logger.info("Removed remote", { name, cwd: this.cwd });
      return { success: true, data: name };
    } catch (error) {
      return this.handleError("removeRemote", error);
    }
  }

  // =====================
  // Diff
  // =====================

  async diffStaged(): Promise<GitResult<string>> {
    try {
      const diff = await this.git.diff(["--cached"]);
      return { success: true, data: diff };
    } catch (error) {
      return this.handleError("diffStaged", error);
    }
  }

  async diffUnstaged(): Promise<GitResult<string>> {
    try {
      const diff = await this.git.diff();
      return { success: true, data: diff };
    } catch (error) {
      return this.handleError("diffUnstaged", error);
    }
  }

  // =====================
  // Stash
  // =====================

  async stash(message?: string): Promise<GitResult<string>> {
    try {
      const args = message ? ["save", message] : [];
      const result = await this.git.stash(args);
      logger.info("Stashed changes", { cwd: this.cwd });
      return { success: true, data: result };
    } catch (error) {
      return this.handleError("stash", error);
    }
  }

  async stashPop(): Promise<GitResult<string>> {
    try {
      const result = await this.git.stash(["pop"]);
      logger.info("Popped stash", { cwd: this.cwd });
      return { success: true, data: result };
    } catch (error) {
      return this.handleError("stashPop", error);
    }
  }

  // =====================
  // Merge
  // =====================

  async merge(branch: string, message?: string): Promise<GitResult<string>> {
    try {
      const args: string[] = [];
      if (message) args.push("-m", message);
      args.push(branch);
      const result = await this.git.merge(args);
      logger.info("Merged branch", { branch, cwd: this.cwd });
      return { success: true, data: result.result ?? "Merged" };
    } catch (error) {
      return this.handleError("merge", error);
    }
  }

  // =====================
  // Rebase
  // =====================

  async rebase(branch: string): Promise<GitResult<string>> {
    try {
      await this.git.rebase([branch]);
      logger.info("Rebased onto", { branch, cwd: this.cwd });
      return { success: true, data: "Rebased" };
    } catch (error) {
      return this.handleError("rebase", error);
    }
  }

  async rebaseAbort(): Promise<GitResult<string>> {
    try {
      await this.git.rebase(["--abort"]);
      logger.info("Aborted rebase", { cwd: this.cwd });
      return { success: true, data: "Rebase aborted" };
    } catch (error) {
      return this.handleError("rebaseAbort", error);
    }
  }

  // =====================
  // Tags
  // =====================

  async createTag(name: string, message?: string): Promise<GitResult<string>> {
    try {
      if (message) {
        await this.git.tag(["-a", name, "-m", message]);
      } else {
        await this.git.tag([name]);
      }
      logger.info("Created tag", { name, cwd: this.cwd });
      return { success: true, data: name };
    } catch (error) {
      return this.handleError("createTag", error);
    }
  }

  async listTags(): Promise<GitResult<string[]>> {
    try {
      const tags = await this.git.tag(["--sort=-creatordate"]);
      return { success: true, data: tags.split("\n").filter(Boolean) };
    } catch (error) {
      return this.handleError("listTags", error);
    }
  }

  // =====================
  // Reset
  // =====================

  async reset(
    mode: "soft" | "mixed" | "hard",
    ref = "HEAD",
  ): Promise<GitResult<string>> {
    try {
      await this.git.reset([`--${mode}`, ref]);
      logger.info("Reset", { mode, ref, cwd: this.cwd });
      return { success: true, data: `Reset ${mode} to ${ref}` };
    } catch (error) {
      return this.handleError("reset", error);
    }
  }

  // =====================
  // Convenience: Add + Commit + Push
  // =====================

  async commitAndPush(
    message: string,
    options?: {
      remote?: string;
      branch?: string;
      addAll?: boolean;
      setUpstream?: boolean;
    },
  ): Promise<GitResult<{ commitHash: string; pushOutput: string }>> {
    if (options?.addAll) {
      const addResult = await this.addAll();
      if (!addResult.success) return { success: false, error: addResult.error };
    }

    const commitResult = await this.commit(message);
    if (!commitResult.success)
      return { success: false, error: commitResult.error };

    const pushResult = await this.push(
      options?.remote,
      options?.branch,
      options?.setUpstream,
    );
    if (!pushResult.success) return { success: false, error: pushResult.error };

    return {
      success: true,
      data: {
        commitHash: commitResult.data!,
        pushOutput: pushResult.data!,
      },
    };
  }
}

export function createGitService(projectPath: string): GitService {
  return new GitService(projectPath);
}
