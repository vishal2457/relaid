import { OpencodeSdk } from "../sdk/opencode-sdk";
import type {
  FileDiff,
  Project,
  Session,
  Message,
  Provider,
  Agent,
} from "@opencode-ai/sdk/v2" with {
  "resolution-mode": "import",
};
import Fuse from "fuse.js";
import fg from "fast-glob";
import { promises as fs } from "fs";
import path from "path";
import ignore from "ignore";
import { compareAsc } from "date-fns";

export type { Project, Session, Message, Provider, Agent };

export type OpencodeProjectDirectoryNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: OpencodeProjectDirectoryNode[];
};

export type OpencodeProjectFileMatch = {
  name: string;
  path: string;
  type: "file" | "directory";
};

const COMMON_IGNORED_DIRECTORIES = [
  ".git",
  ".next",
  ".turbo",
  ".expo",
  ".idea",
  ".vscode",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "out",
  "tmp",
  "temp",
];

const PROJECT_FILE_SEARCH_LIMIT = 30;
const PROJECT_FILE_CACHE_TTL_MS = 30_000;

type ProjectFileCacheEntry = {
  fetchedAt: number;
  topLevelEntries: OpencodeProjectFileMatch[];
  allEntries: OpencodeProjectFileMatch[];
};

class OpencodeCatalogService {
  private sdk = new OpencodeSdk();
  private projectFileCache = new Map<string, ProjectFileCacheEntry>();

  private async getProjectIgnoreMatcher(projectFolder: string) {
    const ig = ignore();
    const gitignorePath = path.join(projectFolder, ".gitignore");

    try {
      const gitignore = await fs.readFile(gitignorePath, "utf8");
      ig.add(gitignore);
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : undefined;

      if (code !== "ENOENT") {
        throw error;
      }
    }

    ig.add(
      COMMON_IGNORED_DIRECTORIES.flatMap((directory) => [
        directory,
        `${directory}/`,
        `**/${directory}`,
        `**/${directory}/`,
      ]),
    );

    return ig;
  }

  private async getProjectFileCache(
    projectId: string,
    projectFolder: string,
  ): Promise<ProjectFileCacheEntry> {
    const cached = this.projectFileCache.get(projectId);
    if (cached && Date.now() - cached.fetchedAt < PROJECT_FILE_CACHE_TTL_MS) {
      return cached;
    }

    const ignoreMatcher = await this.getProjectIgnoreMatcher(projectFolder);
    const entries = await fg(["**/*"], {
      cwd: projectFolder,
      objectMode: true,
      onlyFiles: false,
      dot: true,
      unique: true,
      followSymbolicLinks: false,
      markDirectories: true,
    });

    const allEntries = entries
      .map((entry) => ({
        name: entry.name,
        path: entry.path.replace(/\/$/, ""),
        type: entry.path.endsWith("/") ? "directory" : "file",
      }))
      .filter((entry) => entry.path.length > 0)
      .filter(
        (entry) => !ignoreMatcher.ignores(entry.path),
      ) as OpencodeProjectFileMatch[];

    const topLevelEntries = allEntries.filter(
      (entry) => !entry.path.includes("/"),
    ) as OpencodeProjectFileMatch[];

    const sortEntries = (items: OpencodeProjectFileMatch[]) =>
      [...items].sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === "directory" ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });

    const cacheEntry = {
      fetchedAt: Date.now(),
      topLevelEntries: sortEntries(topLevelEntries),
      allEntries: sortEntries(allEntries),
    };

    this.projectFileCache.set(projectId, cacheEntry);
    return cacheEntry;
  }

  private buildProjectDirectoryTree(
    entries: Array<{ path: string; isDirectory: boolean }>,
  ): OpencodeProjectDirectoryNode[] {
    const root: OpencodeProjectDirectoryNode[] = [];

    for (const entry of entries) {
      const relativePath = entry.path.replace(/\/$/, "");
      const segments = relativePath.split("/").filter(Boolean);
      let currentLevel = root;
      let currentPath = "";

      if (segments.length === 0) {
        continue;
      }

      segments.forEach((segment, index) => {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        const isDirectory =
          index < segments.length - 1 ||
          (index === segments.length - 1 && entry.isDirectory);

        let node = currentLevel.find((entry) => entry.path === currentPath);
        if (!node) {
          node = {
            name: segment,
            path: currentPath,
            type: isDirectory ? "directory" : "file",
            children: isDirectory ? [] : undefined,
          };
          currentLevel.push(node);
        }

        if (isDirectory) {
          if (!node.children) {
            node.children = [];
          }
          currentLevel = node.children;
          return;
        }
      });
    }

    const sortNodes = (nodes: OpencodeProjectDirectoryNode[]) => {
      nodes.sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === "directory" ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });

      nodes.forEach((node) => {
        if (node.children?.length) {
          sortNodes(node.children);
        }
      });
    };

    sortNodes(root);
    return root;
  }

  async listProjects() {
    const projects = await this.sdk.listProjects();
    return projects;
  }

  async getProject(projectId: string) {
    const project = await this.sdk.getProject(projectId);
    return project;
  }

  async getProjectDirectory(projectId: string) {
    const project = await this.getProject(projectId);
    if (!project) {
      return null;
    }

    const cache = await this.getProjectFileCache(projectId, project.worktree);

    return this.buildProjectDirectoryTree(
      cache.allEntries
        .filter((entry) => entry.path.split("/").length <= 2)
        .map((entry) => ({
          path: entry.path,
          isDirectory: entry.type === "directory",
        })),
    );
  }

  async searchProjectFiles(
    projectId: string,
    query?: string,
    limit = PROJECT_FILE_SEARCH_LIMIT,
  ): Promise<OpencodeProjectFileMatch[] | null> {
    const project = await this.getProject(projectId);
    if (!project) {
      return null;
    }

    const cache = await this.getProjectFileCache(projectId, project.worktree);
    const normalizedLimit =
      Number.isFinite(limit) && limit > 0
        ? Math.min(Math.floor(limit), PROJECT_FILE_SEARCH_LIMIT)
        : PROJECT_FILE_SEARCH_LIMIT;
    const normalizedQuery = query?.trim() ?? "";

    if (!normalizedQuery) {
      return [];
    }

    const fuse = new Fuse(cache.allEntries, {
      keys: [
        { name: "name", weight: 0.65 },
        { name: "path", weight: 0.35 },
      ],
      threshold: 0.35,
      ignoreLocation: true,
      includeScore: true,
    });

    return fuse
      .search(normalizedQuery, { limit: normalizedLimit })
      .map((result) => result.item);
  }

  async createSession(projectId: string) {
    const project = await this.getProject(projectId);
    if (!project) {
      return null;
    }

    const session = await this.sdk.createSession(project.worktree);
    return session;
  }

  async listSessions(filters: {
    cwd?: string;
    limit?: number;
    status?: string;
  }) {
    const sessions = await this.sdk.listSessions(filters.limit);
    if (!sessions) {
      return [];
    }
    return sessions
      .filter((session) =>
        filters.cwd ? session.directory === filters.cwd : true,
      )
      .filter((session) =>
        filters.status ? session.status === filters.status : true,
      )
      .sort((left, right) =>
        compareAsc(new Date(right.time.updated), new Date(left.time.updated)),
      );
  }

  async getSession(sessionId: string) {
    const session = await this.sdk.getSession(sessionId);
    return session;
  }

  async getSessionMessages(sessionId: string, limit?: number) {
    const messages = await this.sdk.getSessionMessages(sessionId, limit);
    return messages.sort((left, right) =>
      compareAsc(
        new Date(left.info.time.created),
        new Date(right.info.time.created),
      ),
    );
  }

  async getSessionDiff(
    sessionId: string,
    messageId?: string,
  ): Promise<FileDiff[]> {
    return this.sdk.getSessionDiff(sessionId, messageId);
  }

  async listProviders() {
    const providers = await this.sdk.listProviders();
    return providers;
  }

  async listAgents(directory?: string) {
    const agents = await this.sdk.listAgents(directory);
    return agents;
  }
}

export const opencodeCatalogService = new OpencodeCatalogService();
