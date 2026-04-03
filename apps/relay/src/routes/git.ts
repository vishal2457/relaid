import { Router, Request, Response } from "express";
import {
  requestConnectedServer,
  RouteError,
} from "../services/local-server-proxy";
import { logger } from "../shared/logger";

const router: Router = Router();

type GitFileStatus = {
  path: string;
  status: string;
};

type GitStagedFilesResponse = {
  staged: GitFileStatus[];
  unstaged: GitFileStatus[];
};

type GitStageFilesResponse = {
  success: boolean;
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

    res.json({
      staged: result.response.staged || [],
      unstaged: result.response.unstaged || [],
    });
  } catch (error) {
    handleRouteError(res, "Failed to get file status", error);
  }
});

router.post("/:projectId/stage", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    const { projectId } = req.params;
    const serverId = req.headers["x-server-id"] as string | undefined;
    const { files } = req.body as { files: string[] };

    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    if (!projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: "files array is required" });
      return;
    }

    const result = await requestConnectedServer<GitStageFilesResponse>(
      userId,
      "git_stage_files_request",
      "git_stage_files_response",
      { projectId, files },
      serverId,
    );

    res.json({
      success: result.response.success,
      error: result.response.error,
    });
  } catch (error) {
    handleRouteError(res, "Failed to stage files", error);
  }
});

router.post("/:projectId/unstage", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    const { projectId } = req.params;
    const serverId = req.headers["x-server-id"] as string | undefined;
    const { files } = req.body as { files: string[] };

    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    if (!projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }

    if (!files || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: "files array is required" });
      return;
    }

    const result = await requestConnectedServer<GitStageFilesResponse>(
      userId,
      "git_unstage_files_request",
      "git_unstage_files_response",
      { projectId, files },
      serverId,
    );

    res.json({
      success: result.response.success,
      error: result.response.error,
    });
  } catch (error) {
    handleRouteError(res, "Failed to unstage files", error);
  }
});

export { router as gitRouter };
