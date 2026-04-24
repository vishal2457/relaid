import { useQuery } from "@tanstack/react-query";
import baseApi from "../axios/base";

export interface Skill {
  name: string;
  description: string;
  source?: string;
}

export const skillsKeys = {
  all: ["skills"] as const,
  lists: () => [...skillsKeys.all, "list"] as const,
  list: (projectId: string, query: string) =>
    [...skillsKeys.lists(), projectId, query] as const,
};

export function useProjectSkills(
  projectId: string,
  query: string,
  enabled = true,
) {
  return useQuery<Skill[]>({
    queryKey: skillsKeys.list(projectId, query),
    enabled: Boolean(projectId) && enabled,
    queryFn: async () => {
      const response = await baseApi.get<{ skills: Skill[] }>(
        `/skills/${projectId}`,
        {
          params: { q: query },
        },
      );
      return response.data.skills ?? [];
    },
  });
}
