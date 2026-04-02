import { useQuery } from "@tanstack/react-query";
import baseApi from "../axios/base";

export type GitStagedFile = {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
};

export const gitKeys = {
  all: ["git"] as const,
  staged: () => [...gitKeys.all, "staged"] as const,
  stagedFiles: (projectId: string) => [...gitKeys.staged(), projectId] as const,
};

export function useGitStagedFiles(projectId: string, enabled = true) {
  return useQuery<GitStagedFile[]>({
    queryKey: gitKeys.stagedFiles(projectId),
    enabled: Boolean(projectId) && enabled,
    queryFn: async () => {
      const response = await baseApi.get<{ files: GitStagedFile[] }>(
        `/git/${projectId}/staged`,
      );
      return response.data.files ?? [];
    },
  });
}
