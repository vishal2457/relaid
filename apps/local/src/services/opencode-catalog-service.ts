import {
  OpencodeSdk,
  type OpencodeMessagePartRecord,
  type OpencodeMessageRecord,
  type OpencodeProjectRecord,
  type OpencodeSessionRecord
} from "../sdk/opencode-sdk";
import Fuse from "fuse.js";
import fg from "fast-glob";
import { promises as fs } from "fs";
import path from "path";
import ignore from "ignore";

export type OpencodeProjectSummary = {
  id: string;
  name: string;
  description: string;
  folder: string;
  createdAt: string;
  updatedAt: string;
};

export type OpencodeSessionSummary = {
  id: string;
  projectId: string;
  status: string;
  prompt: string;
  output: string | null;
  error: string | null;
  exitCode: number | null;
  duration: number | null;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type OpencodeMessageSummary = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  visibleContent: string;
  thinkingContent: string | null;
  thinkingDurationSeconds: number | null;
  parts: OpencodeMessagePartSummary[];
  createdAt: string;
};

export type OpencodeMessagePartSummary = {
  type: OpencodeMessagePartRecord["type"];
  content: string;
  durationSeconds: number | null;
};

export type OpencodeProviderModelSummary = {
  id: string;
  name: string;
};

export type OpencodeProviderSummary = {
  id: string;
  name: string;
  models: OpencodeProviderModelSummary[];
};

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

function toIsoDate(value?: number): string {
  if (!value) {
    return new Date().toISOString();
  }

  return new Date(value).toISOString();
}

function mapProject(project: OpencodeProjectRecord): OpencodeProjectSummary {
  return {
    id: project.id,
    name:
      project.name?.trim() ||
      project.worktree.split("/").filter(Boolean).pop() ||
      project.id,
    description: "",
    folder: project.worktree,
    createdAt: toIsoDate(project.time?.created),
    updatedAt: toIsoDate(project.time?.updated),
  };
}

function mapSession(session: OpencodeSessionRecord): OpencodeSessionSummary {
  return {
    id: session.id,
    projectId: session.projectID,
    status: session.status || "completed",
    prompt: session.title || "Untitled session",
    output: null,
    error: null,
    exitCode: null,
    duration: null,
    sessionId: session.id,
    createdAt: toIsoDate(session.time?.created),
    updatedAt: toIsoDate(session.time?.updated),
    startedAt: toIsoDate(session.time?.created),
    completedAt:
      session.status === "running" || session.status === "pending"
        ? null
        : toIsoDate(session.time?.updated),
  };
}

function mapMessage(message: OpencodeMessageRecord): OpencodeMessageSummary {
  return {
    id: message.id,
    sessionId: message.sessionId,
    role: message.role,
    content: message.content,
    visibleContent: message.visibleContent,
    thinkingContent: message.thinkingContent,
    thinkingDurationSeconds: message.thinkingDurationSeconds,
    parts: message.parts.map((part) => ({
      type: part.type,
      content: part.content,
      durationSeconds: part.durationSeconds,
    })),
    createdAt: message.createdAt,
  };
}

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
      .filter((entry) => !ignoreMatcher.ignores(entry.path));

    const topLevelEntries = allEntries.filter(
      (entry) => !entry.path.includes("/"),
    );

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

  async listProjects(): Promise<OpencodeProjectSummary[]> {
    const projects = await this.sdk.listProjects();
    return projects.map(mapProject);
  }

  async getProject(projectId: string): Promise<OpencodeProjectSummary | null> {
    const project = await this.sdk.getProject(projectId);
    return project ? mapProject(project) : null;
  }

  async getProjectDirectory(
    projectId: string,
  ): Promise<OpencodeProjectDirectoryNode[] | null> {
    const project = await this.getProject(projectId);
    if (!project) {
      return null;
    }

    const cache = await this.getProjectFileCache(projectId, project.folder);

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

    const cache = await this.getProjectFileCache(projectId, project.folder);
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

  async createSession(
    projectId: string,
  ): Promise<OpencodeSessionSummary | null> {
    const project = await this.getProject(projectId);
    if (!project) {
      return null;
    }

    const session = await this.sdk.createSession(project.folder);
    return session ? mapSession(session) : null;
  }

  async listSessions(filters: {
    projectId?: string;
    limit?: number;
    status?: string;
  }): Promise<OpencodeSessionSummary[]> {
    const sessions = await this.sdk.listSessions(filters.limit);

    return sessions
      .filter((session) =>
        filters.projectId ? session.projectID === filters.projectId : true,
      )
      .filter((session) =>
        filters.status ? session.status === filters.status : true,
      )
      .map(mapSession)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getSession(sessionId: string): Promise<OpencodeSessionSummary | null> {
    const session = await this.sdk.getSession(sessionId);
    return session ? mapSession(session) : null;
  }

  async getSessionMessages(
    sessionId: string,
    limit?: number,
  ): Promise<OpencodeMessageSummary[]> {
    const messages = await this.sdk.getSessionMessages(sessionId, limit);
    return messages
      .map(mapMessage)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async listProviders(): Promise<OpencodeProviderSummary[]> {
    const providers = await this.sdk.listProviders();
    console.log(providers, "providers");
    
    return providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      models: provider.models.map((model) => ({
        id: model.id,
        name: model.name,
      })),
    }));
  }
}

export const opencodeCatalogService = new OpencodeCatalogService();
