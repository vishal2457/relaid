import { useQuery } from "@tanstack/react-query";
import baseApi from "../axios/base";
import type { Agent as OpenCodeAgent } from "../opencode-types";

export type Agent = OpenCodeAgent;

export const agentsKeys = {
  all: ["agents"] as const,
  lists: () => [...agentsKeys.all, "list"] as const,
  list: (projectId: string) => [...agentsKeys.lists(), projectId] as const,
};

export function useAgents(projectId: string, enabled = true) {
  return useQuery<Agent[]>({
    queryKey: agentsKeys.list(projectId),
    enabled: Boolean(projectId) && enabled,
    queryFn: async () => {
      const response = await baseApi.get<{ agents: Agent[] }>("/agents", {
        suppressErrorToast: true,
        params: { projectId },
      });
      const agents = response.data.agents ?? [];
      const primaryAgents = agents.filter((agent) => agent.mode === "primary");

      if (primaryAgents.length > 0) {
        return primaryAgents;
      }

      return agents.filter((agent) => agent.mode !== "subagent");
    },
  });
}
