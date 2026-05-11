import { useQuery } from "@tanstack/react-query";
import baseApi from "../axios/base";
import type {
  Project as OpenCodeProject,
  ProjectDirectoryNode as OpenCodeDirectoryNode,
  ProjectFileMatch as OpenCodeFileMatch,
} from "../opencode-types";

// Mobile app representation of a workspace/project exposed by relay.
export interface Project {
  id: string;
  name: string;
  description: string;
  folder: string;
  localServerId?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

// Convert relay workspace payload to the mobile project shape.
export function adaptProject(project: OpenCodeProject): Project {
  // Relay now serves DB-backed workspaces and still preserves the older
  // OpenCode-shaped fields where useful for compatibility.
  const folder = project.folder ?? project.worktree ?? "";

  let createdAt: number | undefined;
  let updatedAt: number | undefined;

  if (typeof project.createdAt === "string") {
    createdAt = new Date(project.createdAt).getTime();
  } else if (project.time?.created) {
    createdAt = project.time.created;
  }

  if (typeof project.updatedAt === "string") {
    updatedAt = new Date(project.updatedAt).getTime();
  } else {
    updatedAt = project.time?.initialized ?? project.time?.created ?? createdAt;
  }

  const pathParts = folder.split("/");
  const name =
    project.name || pathParts[pathParts.length - 1] || "Unnamed Project";

  return {
    id: project.id,
    name,
    description: project.description ?? "",
    folder,
    localServerId: project.localServerId ?? null,
    createdAt,
    updatedAt,
  };
}

export type ProjectDirectoryNode = OpenCodeDirectoryNode;
export type ProjectFileMatch = OpenCodeFileMatch;

export const projectsKeys = {
  all: ["projects"] as const,
  lists: () => [...projectsKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...projectsKeys.lists(), filters] as const,
  details: () => [...projectsKeys.all, "detail"] as const,
  detail: (id: string) => [...projectsKeys.details(), id] as const,
  directories: () => [...projectsKeys.all, "directory"] as const,
  directory: (id: string, path = "") =>
    [...projectsKeys.directories(), id, path] as const,
  searches: () => [...projectsKeys.all, "search"] as const,
  search: (id: string, query: string, agentProviderId = "opencode") =>
    [...projectsKeys.searches(), id, query, agentProviderId] as const,
};

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: projectsKeys.lists(),
    staleTime: 0,
    queryFn: async () => {
      const response = await baseApi.get<{ projects: OpenCodeProject[] }>(
        "/projects",
        { suppressErrorToast: true },
      );
      return (response.data.projects ?? []).map(adaptProject);
    },
  });
}

export function useProject(projectId: string) {
  return useQuery<Project | null>({
    queryKey: projectsKeys.detail(projectId),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const response = await baseApi.get<{ project: OpenCodeProject | null }>(
        `/projects/${projectId}`,
      );
      return response.data.project ? adaptProject(response.data.project) : null;
    },
  });
}

export function useProjectDirectory(
  projectId: string,
  path = "",
  enabled = true,
) {
  return useQuery<ProjectDirectoryNode[]>({
    queryKey: projectsKeys.directory(projectId, path),
    enabled: Boolean(projectId) && enabled,
    queryFn: async () => {
      const response = await baseApi.get<{ tree: ProjectDirectoryNode[] }>(
        `/projects/${projectId}/directory`,
        {
          params: path ? { path } : undefined,
        },
      );
      return response.data.tree ?? [];
    },
  });
}

export function useProjectFileSearch(
  projectId: string,
  query: string,
  agentProviderId?: string,
  enabled = true,
) {
  return useQuery<ProjectFileMatch[]>({
    queryKey: projectsKeys.search(projectId, query, agentProviderId),
    enabled: Boolean(projectId) && enabled,
    queryFn: async () => {
      const response = await baseApi.get<{ results: ProjectFileMatch[] }>(
        `/projects/${projectId}/file-search`,
        {
          params: { q: query, limit: 30, agentProviderId },
        },
      );
      return response.data.results ?? [];
    },
  });
}
