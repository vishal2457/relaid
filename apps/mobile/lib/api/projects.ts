import { useQuery } from "@tanstack/react-query";
import baseApi from "../axios/base";

export type Project = {
  id: string;
  name: string;
  description: string;
  folder: string;
  localServerId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ProjectDirectoryNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: ProjectDirectoryNode[];
};

export type ProjectFileMatch = {
  name: string;
  path: string;
  type: "file" | "directory";
};

export const projectsKeys = {
  all: ["projects"] as const,
  lists: () => [...projectsKeys.all, "list"] as const,
  list: (filters: Record<string, unknown>) =>
    [...projectsKeys.lists(), filters] as const,
  details: () => [...projectsKeys.all, "detail"] as const,
  detail: (id: string) => [...projectsKeys.details(), id] as const,
  directories: () => [...projectsKeys.all, "directory"] as const,
  directory: (id: string) => [...projectsKeys.directories(), id] as const,
  searches: () => [...projectsKeys.all, "search"] as const,
  search: (id: string, query: string) => [...projectsKeys.searches(), id, query] as const,
};

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: projectsKeys.lists(),
    queryFn: async () => {
      const response = await baseApi.get<{ projects: Project[] }>("/projects");
      return response.data.projects ?? [];
    },
  });
}

export function useProjectDirectory(projectId: string, enabled = true) {
  return useQuery<ProjectDirectoryNode[]>({
    queryKey: projectsKeys.directory(projectId),
    enabled: Boolean(projectId) && enabled,
    queryFn: async () => {
      const response = await baseApi.get<{ tree: ProjectDirectoryNode[] }>(
        `/projects/${projectId}/directory`,
      );
      return response.data.tree ?? [];
    },
  });
}

export function useProjectFileSearch(
  projectId: string,
  query: string,
  enabled = true,
) {
  return useQuery<ProjectFileMatch[]>({
    queryKey: projectsKeys.search(projectId, query),
    enabled: Boolean(projectId) && enabled,
    queryFn: async () => {
      const response = await baseApi.get<{ results: ProjectFileMatch[] }>(
        `/projects/${projectId}/file-search`,
        {
          params: { q: query, limit: 30 },
        },
      );
      return response.data.results ?? [];
    },
  });
}
