import { Router, Request, Response } from "express";
import {
  requestAllConnectedServers,
  requestConnectedServer,
  requestUntilMatch,
  requireUserId,
  RouteError,
} from "../services/local-server-proxy";
import { logger } from "../shared/logger";
import type {
  ProjectDirectoryNode,
  ProjectFileMatch,
  ProjectPayload,
} from "../shared/types";

type ProjectsListResponse = {
  projects: ProjectPayload[];
  error?: string;
};

type ProjectResponse = {
  project: ProjectPayload | null;
  error?: string;
};

type ProjectDirectoryResponse = {
  tree: ProjectDirectoryNode[] | null;
  error?: string;
};

type ProjectFileSearchResponse = {
  results: ProjectFileMatch[] | null;
  error?: string;
};

type ProjectDeleteResponse = {
  success: boolean;
  error?: string;
};

const router: Router = Router();

function getAgentProviderId(req: Request): string | undefined {
  if (typeof req.query.agentProviderId === "string") {
    return req.query.agentProviderId;
  }
  if (
    req.body &&
    typeof (req.body as Record<string, unknown>).agentProviderId === "string"
  ) {
    return (req.body as Record<string, string>).agentProviderId;
  }
  return undefined;
}

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

    const results = await requestAllConnectedServers<ProjectsListResponse>(
      userId,
      "projects_list_request",
      "projects_list_response",
      {},
    );

    const projects = results.flatMap(
      (result) => result.response.projects || [],
    );

    const uniqueProjects = Array.from(
      new Map(projects.map((project) => [project.id, project])).values(),
    );

    res.json({ projects: uniqueProjects });
  } catch (error) {
    handleRouteError(res, "Failed to get projects", error);
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const projectResult = await requestUntilMatch<ProjectResponse>(
      userId,
      "project_get_request",
      "project_get_response",
      { projectId: req.params.id },
      (response) => Boolean(response.project),
    );

    if (!projectResult?.response.project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json({ project: projectResult.response.project });
  } catch (error) {
    handleRouteError(res, "Failed to get project", error);
  }
});

router.get("/:id/directory", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const path = typeof req.query.path === "string" ? req.query.path : undefined;
    const result = await requestUntilMatch<ProjectDirectoryResponse>(
      userId,
      "project_directory_request",
      "project_directory_response",
      { projectId: req.params.id, path },
      (response) => Array.isArray(response.tree),
    );

    if (!result?.response.tree) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json({ tree: result.response.tree });
  } catch (error) {
    handleRouteError(res, "Failed to get project directory", error);
  }
});

router.get("/:id/file-search", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const agentProviderId = getAgentProviderId(req);
    const rawQuery =
      typeof req.query.q === "string"
        ? req.query.q
        : typeof req.query.query === "string"
          ? req.query.query
          : "";
    const rawLimit =
      typeof req.query.limit === "string"
        ? Number.parseInt(req.query.limit, 10)
        : undefined;

    const result = await requestUntilMatch<ProjectFileSearchResponse>(
      userId,
      "project_file_search_request",
      "project_file_search_response",
      {
        projectId: req.params.id,
        agentProviderId,
        query: rawQuery,
        limit: Number.isFinite(rawLimit) ? rawLimit : undefined,
      },
      (response) => Array.isArray(response.results),
    );

    if (!result?.response.results) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json({ results: result.response.results });
  } catch (error) {
    handleRouteError(res, "Failed to search project files", error);
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const { localServerId, name, description, folder } = req.body;

    if (!name || !folder) {
      res.status(400).json({ error: "name and folder are required" });
      return;
    }

    const result = await requestConnectedServer<{ project: ProjectPayload }>(
      userId,
      "project_create_request",
      "project_create_response",
      {
        name,
        description: typeof description === "string" ? description : "",
        folder,
        localServerId,
      },
      localServerId,
    );

    res.status(201).json({ project: result.response.project });
  } catch (error) {
    handleRouteError(res, "Failed to create project", error);
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const result = await requestUntilMatch<ProjectResponse>(
      userId,
      "project_update_request",
      "project_update_response",
      {
        projectId: req.params.id,
        name: req.body.name,
        description: req.body.description,
        folder: req.body.folder,
      },
      (response) => Boolean(response.project),
    );

    if (!result?.response.project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json({ project: result.response.project });
  } catch (error) {
    handleRouteError(res, "Failed to update project", error);
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const result = await requestUntilMatch<ProjectDeleteResponse>(
      userId,
      "project_delete_request",
      "project_delete_response",
      { projectId: req.params.id },
      (response) => response.success,
    );

    if (!result?.response.success) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    handleRouteError(res, "Failed to delete project", error);
  }
});

type BranchesResponse = {
  branches: Array<{ name: string; isCurrent: boolean }>;
  error?: string;
};

router.get("/:id/branches", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const result = await requestUntilMatch<BranchesResponse>(
      userId,
      "project_branches_request",
      "project_branches_response",
      { projectId: req.params.id },
      (response) => Array.isArray(response.branches),
    );

    if (!result?.response.branches) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json({ branches: result.response.branches });
  } catch (error) {
    handleRouteError(res, "Failed to get branches", error);
  }
});

type BranchSwitchResponse = {
  branch: string;
  error?: string;
};

router.post("/:id/branches/switch", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const { branch } = req.body;

    if (!branch) {
      res.status(400).json({ error: "Branch name is required" });
      return;
    }

    const result = await requestUntilMatch<BranchSwitchResponse>(
      userId,
      "project_branch_switch_request",
      "project_branch_switch_response",
      { projectId: req.params.id, branch },
      (response) => Boolean(response.branch),
    );

    if (!result?.response.branch) {
      res.status(404).json({ error: "Failed to switch branch" });
      return;
    }

    res.json({ branch: result.response.branch });
  } catch (error) {
    handleRouteError(res, "Failed to switch branch", error);
  }
});

export { router as projectsRouter };
