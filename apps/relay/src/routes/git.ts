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
  branch: string;
};

type GitStageFilesResponse = {
  success: boolean;
  error?: string;
};

type DiffLine = {
  type: "add" | "remove" | "context";
  content: string;
};

type DiffHunk = {
  header: string;
  lines: DiffLine[];
};

type FileDiff = {
  fileName: string;
  hunks: DiffHunk[];
};

type GitFileDiffResponse = {
  files: FileDiff[];
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
      branch: result.response.branch || "HEAD",
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

router.get("/:projectId/diff", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    const { projectId } = req.params;
    const filePath = req.query.filePath as string;
    const serverId = req.headers["x-server-id"] as string | undefined;

    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    if (!projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }

    if (!filePath) {
      res.status(400).json({ error: "filePath query param is required" });
      return;
    }

    const result = await requestConnectedServer<GitFileDiffResponse>(
      userId,
      "git_file_diff_request",
      "git_file_diff_response",
      { projectId, filePath },
      serverId,
    );

    res.json({
      files: result.response.files || [],
      success: result.response.success,
      error: result.response.error,
    });
  } catch (error) {
    handleRouteError(res, "Failed to get file diff", error);
  }
});

router.post("/:projectId/discard", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    const { projectId } = req.params;
    const { filePath } = req.body as { filePath: string };
    const serverId = req.headers["x-server-id"] as string | undefined;

    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    if (!projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }

    if (!filePath) {
      res.status(400).json({ error: "filePath is required" });
      return;
    }

    const result = await requestConnectedServer<GitStageFilesResponse>(
      userId,
      "git_discard_file_request",
      "git_discard_file_response",
      { projectId, filePath },
      serverId,
    );

    res.json({
      success: result.response.success,
      error: result.response.error,
    });
  } catch (error) {
    handleRouteError(res, "Failed to discard changes", error);
  }
});

export { router as gitRouter };
