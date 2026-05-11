import { Router, Request, Response } from "express";
import {
  requestConnectedServer,
  requestUntilMatch,
  requireUserId,
  RouteError,
} from "../services/local-server-proxy";
import { logger } from "../shared/logger";

type AgentPayload = {
  name: string;
  description?: string;
  mode: "subagent" | "primary" | "all";
  builtIn: boolean;
  model?: {
    providerID: string;
    modelID: string;
  };
};

type ProjectResponse = {
  project: {
    id: string;
    folder?: string;
  } | null;
  error?: string;
};

type AgentsListResponse = {
  agents: AgentPayload[];
  error?: string;
};

const router: Router = Router();

function handleRouteError(
  res: Response,
  defaultMessage: string,
  error: unknown,
): void {
  if (error instanceof RouteError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  const errMsg = error instanceof Error ? error.message : String(error);
  logger.error(defaultMessage, { error: errMsg });
  res.status(500).json({ error: defaultMessage });
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const projectId =
      typeof req.query.projectId === "string" ? req.query.projectId : "";
    const directory =
      typeof req.query.directory === "string" ? req.query.directory : "";
    const agentProviderId =
      typeof req.query.agentProviderId === "string"
        ? req.query.agentProviderId
        : undefined;

    if (!projectId && !directory) {
      res.status(400).json({ error: "projectId or directory is required" });
      return;
    }

    if (projectId) {
      const projectResult = await requestUntilMatch<ProjectResponse>(
        userId,
        "project_get_request",
        "project_get_response",
        { projectId },
        (response) => Boolean(response.project),
      );

      if (!projectResult?.response.project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const result = await requestConnectedServer<AgentsListResponse>(
        userId,
        "agents_list_request",
        "agents_list_response",
        { projectId, agentProviderId },
        projectResult.serverId,
      );

      res.json({ agents: result.response.agents ?? [] });
      return;
    }

    const result = await requestConnectedServer<AgentsListResponse>(
      userId,
      "agents_list_request",
      "agents_list_response",
      { directory, agentProviderId },
    );

    res.json({ agents: result.response.agents ?? [] });
  } catch (error) {
    handleRouteError(res, "Failed to get agents", error);
  }
});

export { router as agentsRouter };
