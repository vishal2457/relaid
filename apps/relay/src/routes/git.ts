import { Router, Request, Response } from "express";
import {
  requestConnectedServer,
  RouteError,
} from "../services/local-server-proxy";
import { logger } from "../shared/logger";

const router: Router = Router();

type GitStagedFile = {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
};

type GitStagedFilesResponse = {
  files: GitStagedFile[];
  error?: string;
};

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

router.get("/:projectId/staged", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    const { projectId } = req.params;
    const serverId = req.headers["x-server-id"] as string | undefined;

    logger.info("Git staged files request", { userId, projectId, serverId });

    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    if (!projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }

    const result = await requestConnectedServer<GitStagedFilesResponse>(
      userId,
      "git_staged_files_request",
      "git_staged_files_response",
      { projectId },
      serverId,
    );

    logger.info("Git staged files response received", {
      requestId: result.requestId,
      serverId: result.serverId,
      response: result.response,
    });

    res.json({ files: result.response.files || [] });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to get staged files", {
      error: errMsg,
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.headers["x-user-id"],
      projectId: req.params.projectId,
    });
    handleRouteError(res, "Failed to get staged files", error);
  }
});

export { router as gitRouter };
