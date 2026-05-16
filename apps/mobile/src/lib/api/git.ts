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

type GitMutationStatusResponse = {
  success: boolean;
  staged?: GitFileStatus[];
  unstaged?: GitFileStatus[];
  branch?: string;
  error?: string;
};

type GitPushMutationResponse = GitMutationStatusResponse & {
  output?: string;
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
  fileDiff: (projectId: string, filePath?: string) =>
    [...gitKeys.files(), projectId, "diff", filePath ?? "__all__"] as const,
  fileContent: (projectId: string, filePath: string) =>
    [...gitKeys.files(), projectId, "content", filePath] as const,
};

const gitStatusAliases: Record<string, string> = {
  a: "added",
  added: "added",
  c: "copied",
  copied: "copied",
  conflict: "unmerged",
  conflicted: "unmerged",
  d: "deleted",
  deleted: "deleted",
  i: "ignored",
  ignored: "ignored",
  m: "modified",
  modified: "modified",
  r: "renamed",
  renamed: "renamed",
  t: "typechanged",
  typechanged: "typechanged",
  u: "unmerged",
  um: "unmerged",
  unmerged: "unmerged",
  untracked: "untracked",
  updated: "unmerged",
  "!": "ignored",
  "!!": "ignored",
  "?": "untracked",
  "??": "untracked",
};

function normalizeGitStatus(status: string | undefined): string {
  const trimmed = status?.trim();
  if (!trimmed) {
    return "modified";
  }

  const directMatch =
    gitStatusAliases[trimmed] ??
    gitStatusAliases[trimmed.toLowerCase()] ??
    gitStatusAliases[trimmed.toUpperCase()];

  if (directMatch) {
    return directMatch;
  }

  return trimmed.toLowerCase();
}

function normalizeGitFileStatus(
  file: GitFileStatus | null | undefined,
): GitFileStatus | null {
  const path = file?.path?.trim();
  if (!path) {
    return null;
  }

  return {
    path,
    status: normalizeGitStatus(file?.status),
  };
}

function normalizeGitFiles(
  files: GitFileStatus[] | undefined,
): GitFileStatus[] {
  return (files ?? [])
    .map((file) => normalizeGitFileStatus(file))
    .filter((file): file is GitFileStatus => file !== null);
}

function normalizeGitStatusResponse(
  data: GitMutationStatusResponse | GitFileStatusResponse,
) {
  return {
    staged: normalizeGitFiles(data.staged),
    unstaged: normalizeGitFiles(data.unstaged),
    branch: data.branch?.trim() || "HEAD",
  };
}

export function useGitFileStatus(projectId: string, enabled = true) {
  return useQuery<GitFileStatusResponse>({
    queryKey: gitKeys.fileStatus(projectId),
    enabled: Boolean(projectId) && enabled,
    queryFn: async () => {
      const response = await baseApi.get<GitFileStatusResponse>(
        `/git/${projectId}/staged`,
      );
      return normalizeGitStatusResponse(response.data);
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
      const response = await baseApi.post<GitMutationStatusResponse>(
        `/git/${projectId}/stage`,
        { files },
      );
      if (!response.data.success) {
        throw new Error(response.data.error ?? "Failed to stage files");
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<GitFileStatusResponse>(
        gitKeys.fileStatus(projectId),
        normalizeGitStatusResponse(data),
      );
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
      const response = await baseApi.post<GitMutationStatusResponse>(
        `/git/${projectId}/unstage`,
        { files },
      );
      if (!response.data.success) {
        throw new Error(response.data.error ?? "Failed to unstage files");
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<GitFileStatusResponse>(
        gitKeys.fileStatus(projectId),
        normalizeGitStatusResponse(data),
      );
      onSuccessCallback?.();
    },
  });
}

export function useFileDiff(
  projectId: string,
  filePath?: string,
  enabled = true,
) {
  return useQuery<GitFileDiffResponse>({
    queryKey: gitKeys.fileDiff(projectId, filePath),
    enabled: Boolean(projectId) && enabled,
    queryFn: async () => {
      const response = await baseApi.get<GitFileDiffResponse>(
        `/git/${projectId}/diff`,
        filePath ? { params: { filePath } } : undefined,
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
    enabled: Boolean(projectId) && enabled,
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

export function useGitCommit(
  projectId: string,
  onSuccessCallback?: () => void,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      message,
      files,
    }: {
      message: string;
      files: string[];
    }) => {
      const response = await baseApi.post<
        GitMutationStatusResponse & {
          hash?: string;
        }
      >(`/git/${projectId}/commit`, { message, files });
      if (!response.data.success) {
        throw new Error(response.data.error ?? "Failed to commit");
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<GitFileStatusResponse>(
        gitKeys.fileStatus(projectId),
        normalizeGitStatusResponse(data),
      );
      onSuccessCallback?.();
    },
  });
}

export function useGitPush(projectId: string, onSuccessCallback?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      remote = "origin",
      branch,
      setUpstream = false,
    }: {
      remote?: string;
      branch?: string;
      setUpstream?: boolean;
    }) => {
      const response = await baseApi.post<GitPushMutationResponse>(
        `/git/${projectId}/push`,
        { remote, branch, setUpstream },
      );
      if (!response.data.success) {
        throw new Error(response.data.error ?? "Failed to push changes");
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<GitFileStatusResponse>(
        gitKeys.fileStatus(projectId),
        normalizeGitStatusResponse(data),
      );
      onSuccessCallback?.();
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
