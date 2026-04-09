import { Router, Request, Response } from "express";
import {
  requestConnectedServer,
  requireUserId,
  RouteError,
} from "../services/local-server-proxy";
import { logger } from "../shared/logger";
import type {
  QueueItemPayload,
  MessageQueueListResponse,
  MessageQueueAddResponse,
  MessageQueueRemoveResponse,
  MessageQueueUpdateResponse,
} from "../shared/types";

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

const router: Router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const projectId = req.query.projectId as string;
    const serverId = req.headers["x-server-id"] as string | undefined;

    if (!projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }

    const result = await requestConnectedServer<MessageQueueListResponse>(
      userId,
      "message_queue_list_request",
      "message_queue_list_response",
      { projectId },
      serverId,
    );

    res.json({ items: result.response.items || [] });
  } catch (error) {
    handleRouteError(res, "Failed to get message queue", error);
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const { projectId, prompt } = req.body as {
      projectId?: string;
      prompt?: string;
    };
    const serverId = req.headers["x-server-id"] as string | undefined;

    if (!projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }

    if (!prompt || !prompt.trim()) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const result = await requestConnectedServer<MessageQueueAddResponse>(
      userId,
      "message_queue_add_request",
      "message_queue_add_response",
      { projectId, prompt: prompt.trim() },
      serverId,
    );

    res.status(201).json({ item: result.response.item });
  } catch (error) {
    handleRouteError(res, "Failed to add queue item", error);
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const { id } = req.params;
    const { prompt, position } = req.body as {
      prompt?: string;
      position?: number;
    };
    const serverId = req.headers["x-server-id"] as string | undefined;

    const result = await requestConnectedServer<MessageQueueUpdateResponse>(
      userId,
      "message_queue_update_request",
      "message_queue_update_response",
      { queueItemId: id, prompt, position },
      serverId,
    );

    if (result.response.error) {
      res.status(400).json({ error: result.response.error });
      return;
    }

    res.json({ item: result.response.item });
  } catch (error) {
    handleRouteError(res, "Failed to update queue item", error);
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const { id } = req.params;
    const serverId = req.headers["x-server-id"] as string | undefined;

    const result = await requestConnectedServer<MessageQueueRemoveResponse>(
      userId,
      "message_queue_remove_request",
      "message_queue_remove_response",
      { queueItemId: id },
      serverId,
    );

    if (!result.response.success) {
      res.status(400).json({
        error: result.response.error || "Failed to delete queue item",
      });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    handleRouteError(res, "Failed to delete queue item", error);
  }
});

router.post("/:id/execute", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const { id } = req.params;
    const { sessionId, createNewSession, projectId } = req.body as {
      sessionId?: string;
      createNewSession?: boolean;
      projectId?: string;
    };
    const serverId = req.headers["x-server-id"] as string | undefined;

    if (!projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }

    const result = await requestConnectedServer<{
      success: boolean;
      sessionId?: string;
      error?: string;
    }>(
      userId,
      "message_queue_execute_request",
      "message_queue_execute_response",
      { queueItemId: id, sessionId, createNewSession, projectId },
      serverId,
    );

    if (!result.response.success) {
      res.status(400).json({
        error: result.response.error || "Failed to execute queue item",
      });
      return;
    }

    res.json({
      success: true,
      sessionId: result.response.sessionId,
    });
  } catch (error) {
    handleRouteError(res, "Failed to execute queue item", error);
  }
});

export { router as messageQueueRouter };
