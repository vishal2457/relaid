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

export type DiffLine = {
  type: "add" | "remove" | "context";
  content: string;
};

export type DiffHunk = {
  header: string;
  lines: DiffLine[];
};

export type FileDiff = {
  fileName: string;
  hunks: DiffHunk[];
};

export type GitFileDiffResponse = {
  files: FileDiff[];
  success: boolean;
  error?: string;
};

export const gitKeys = {
  all: ["git"] as const,
  files: () => [...gitKeys.all, "files"] as const,
  fileStatus: (projectId: string) => [...gitKeys.files(), projectId] as const,
  fileDiff: (projectId: string, filePath: string) =>
    [...gitKeys.files(), projectId, "diff", filePath] as const,
  fileContent: (projectId: string, filePath: string) =>
    [...gitKeys.files(), projectId, "content", filePath] as const,
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

export function useGitStageFiles(
  projectId: string,
  onSuccessCallback?: () => void,
) {
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
      onSuccessCallback?.();
    },
  });
}

export function useGitUnstageFiles(
  projectId: string,
  onSuccessCallback?: () => void,
) {
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
      onSuccessCallback?.();
    },
  });
}

export function useFileDiff(
  projectId: string,
  filePath: string,
  enabled = true,
) {
  return useQuery<GitFileDiffResponse>({
    queryKey: gitKeys.fileDiff(projectId, filePath),
    enabled: Boolean(projectId) && Boolean(filePath) && enabled,
    queryFn: async () => {
      const response = await baseApi.get<GitFileDiffResponse>(
        `/git/${projectId}/diff`,
        { params: { filePath } },
      );
      return {
        files: response.data.files ?? [],
        success: response.data.success,
        error: response.data.error,
      };
    },
  });
}

export type FileContentResponse = {
  content: string;
  truncated: boolean;
};

export function useFileContent(
  projectId: string,
  filePath: string,
  enabled = true,
) {
  return useQuery<FileContentResponse>({
    queryKey: gitKeys.fileContent(projectId, filePath),
    enabled: Boolean(projectId) && Boolean(filePath) && enabled,
    queryFn: async () => {
      const response = await baseApi.get<FileContentResponse>(
        `/git/${projectId}/file-content`,
        { params: { filePath } },
      );
      return {
        content: response.data.content ?? "",
        truncated: response.data.truncated ?? false,
      };
    },
  });
}

export function useGitDiscardFile(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (filePath: string) => {
      const response = await baseApi.post<{ success: boolean; error?: string }>(
        `/git/${projectId}/discard`,
        { filePath },
      );
      if (!response.data.success) {
        throw new Error(response.data.error ?? "Failed to discard changes");
      }
      return response.data;
    },
    onSuccess: (_data, _variables, _context) => {
      queryClient.invalidateQueries({
        queryKey: gitKeys.fileStatus(projectId),
      });
    },
  });
}
