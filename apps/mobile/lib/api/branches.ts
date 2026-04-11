import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import baseApi from "../axios/base";

export interface Branch {
  name: string;
  isCurrent: boolean;
}

export const branchesKeys = {
  all: ["branches"] as const,
  lists: () => [...branchesKeys.all, "list"] as const,
  list: (projectId: string) => [...branchesKeys.lists(), projectId] as const,
};

export function useBranches(projectId: string, enabled = true) {
  return useQuery<Branch[]>({
    queryKey: branchesKeys.list(projectId),
    enabled: Boolean(projectId) && enabled,
    queryFn: async () => {
      const response = await baseApi.get<{ branches: Branch[] }>(
        `/projects/${projectId}/branches`,
      );
      return response.data.branches ?? [];
    },
  });
}

export function useSwitchBranch(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (branch: string) => {
      const response = await baseApi.post<{ branch: string }>(
        `/projects/${projectId}/branches/switch`,
        { branch },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchesKeys.list(projectId) });
    },
  });
}
