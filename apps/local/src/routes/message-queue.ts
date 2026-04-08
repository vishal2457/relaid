import {
  Router,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { randomUUID } from "crypto";
import { eq, and, max } from "drizzle-orm";
import { logger } from "../shared/logger";
import { success, error, StatusCodes } from "../shared/api-response";
import { getDb } from "../db";
import { messageQueue } from "../db/schema";
import type { QueueItemPayload } from "../types";

function rowToPayload(row: typeof messageQueue.$inferSelect): QueueItemPayload {
  return {
    id: row.id,
    projectId: row.projectId,
    prompt: row.prompt,
    status: row.status as QueueItemPayload["status"],
    sessionId: row.sessionId,
    error: row.error,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

export function createMessageQueueRouter(): Router {
  const router = Router();

  router.get("/", async (req: ExpressRequest, res: ExpressResponse) => {
    const projectId = req.query.projectId as string | undefined;

    if (!projectId) {
      return error(res, "projectId is required", StatusCodes.BAD_REQUEST);
    }

    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(messageQueue)
        .where(eq(messageQueue.projectId, projectId))
        .orderBy(messageQueue.position);

      const items = rows.map(rowToPayload);
      success(res, { items }, "Queue items fetched successfully");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Failed to get message queue", { error: msg });
      error(res, msg, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  });

  router.post("/", async (req: ExpressRequest, res: ExpressResponse) => {
    const { projectId, prompt } = req.body as {
      projectId?: string;
      prompt?: string;
    };

    if (!projectId) {
      return error(res, "projectId is required", StatusCodes.BAD_REQUEST);
    }

    if (!prompt || !prompt.trim()) {
      return error(res, "prompt is required", StatusCodes.BAD_REQUEST);
    }

    try {
      const db = getDb();
      const id = randomUUID();
      const now = new Date();

      // Get the max position for ordering
      const maxResult = await db
        .select({ maxPos: max(messageQueue.position) })
        .from(messageQueue)
        .where(eq(messageQueue.projectId, projectId));

      const nextPosition = (maxResult[0]?.maxPos ?? -1) + 1;

      await db.insert(messageQueue).values({
        id,
        projectId,
        prompt: prompt.trim(),
        status: "pending",
        position: nextPosition,
        createdAt: now,
        updatedAt: now,
      });

      const row = await db
        .select()
        .from(messageQueue)
        .where(eq(messageQueue.id, id))
        .get();

      if (!row) {
        throw new Error("Failed to retrieve created queue item");
      }

      success(
        res,
        { item: rowToPayload(row) },
        "Queue item added successfully",
        StatusCodes.CREATED,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Failed to add queue item", { error: msg });
      error(res, msg, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  });

  router.put("/:id", async (req: ExpressRequest, res: ExpressResponse) => {
    const { id } = req.params;
    const { prompt, position } = req.body as {
      prompt?: string;
      position?: number;
    };

    try {
      const db = getDb();

      const existing = await db
        .select()
        .from(messageQueue)
        .where(eq(messageQueue.id, id))
        .get();

      if (!existing) {
        return error(res, "Queue item not found", StatusCodes.NOT_FOUND);
      }

      if (existing.status === "running") {
        return error(
          res,
          "Cannot update a running queue item",
          StatusCodes.BAD_REQUEST,
        );
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (prompt !== undefined) updates.prompt = prompt.trim();
      if (position !== undefined) updates.position = position;

      await db.update(messageQueue).set(updates).where(eq(messageQueue.id, id));

      const updated = await db
        .select()
        .from(messageQueue)
        .where(eq(messageQueue.id, id))
        .get();

      success(
        res,
        { item: updated ? rowToPayload(updated) : null },
        "Queue item updated successfully",
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Failed to update queue item", { error: msg });
      error(res, msg, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  });

  router.delete("/:id", async (req: ExpressRequest, res: ExpressResponse) => {
    const { id } = req.params;

    try {
      const db = getDb();

      const existing = await db
        .select()
        .from(messageQueue)
        .where(eq(messageQueue.id, id))
        .get();

      if (!existing) {
        return error(res, "Queue item not found", StatusCodes.NOT_FOUND);
      }

      if (existing.status === "running") {
        return error(
          res,
          "Cannot delete a running queue item",
          StatusCodes.BAD_REQUEST,
        );
      }

      await db.delete(messageQueue).where(eq(messageQueue.id, id));

      success(res, { success: true }, "Queue item deleted successfully");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Failed to delete queue item", { error: msg });
      error(res, msg, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  });

  return router;
}
