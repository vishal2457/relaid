import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import baseApi from "../axios/base";

export type GitFileStatus = {
  path: string;
  status: string;
};

export type GitFileStatusResponse = {
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
  branch: string;
};

export const gitKeys = {
  all: ["git"] as const,
  files: () => [...gitKeys.all, "files"] as const,
  fileStatus: (projectId: string) => [...gitKeys.files(), projectId] as const,
};

export function useGitFileStatus(projectId: string, enabled = true) {
  return useQuery<GitFileStatusResponse>({
    queryKey: gitKeys.fileStatus(projectId),
    enabled: Boolean(projectId) && enabled,
    queryFn: async () => {
      const response = await baseApi.get<GitFileStatusResponse>(
        `/git/${projectId}/staged`,
      );
      return {
        staged: response.data.staged ?? [],
        unstaged: response.data.unstaged ?? [],
        branch: response.data.branch ?? "HEAD",
      };
    },
  });
}

export function useGitStageFiles(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (files: string[]) => {
      const response = await baseApi.post<{ success: boolean; error?: string }>(
        `/git/${projectId}/stage`,
        { files },
      );
      if (!response.data.success) {
        throw new Error(response.data.error ?? "Failed to stage files");
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: gitKeys.fileStatus(projectId),
      });
    },
  });
}

export function useGitUnstageFiles(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (files: string[]) => {
      const response = await baseApi.post<{ success: boolean; error?: string }>(
        `/git/${projectId}/unstage`,
        { files },
      );
      if (!response.data.success) {
        throw new Error(response.data.error ?? "Failed to unstage files");
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: gitKeys.fileStatus(projectId),
      });
    },
  });
}
