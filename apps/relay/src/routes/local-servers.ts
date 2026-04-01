import { Router, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db";
import { localServers } from "../db/schema";
import { logger } from "../shared/logger";

const router: Router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.headers["x-user-id"] as string;

    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    const servers = await db
      .select()
      .from(localServers)
      .where(eq(localServers.userId, userId));

    res.json({ servers });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to get local servers", { error: errMsg });
    res.status(500).json({ error: "Failed to get local servers" });
  }
});

router.get("/connected", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.headers["x-user-id"] as string;

    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    const servers = await db
      .select()
      .from(localServers)
      .where(
        and(
          eq(localServers.userId, userId),
          eq(localServers.isConnected, true),
        ),
      );

    res.json({ servers });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to get connected local servers", { error: errMsg });
    res.status(500).json({ error: "Failed to get connected local servers" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const userId = req.headers["x-user-id"] as string;

    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    const [server] = await db
      .select()
      .from(localServers)
      .where(eq(localServers.id, id))
      .limit(1);

    if (!server) {
      res.status(404).json({ error: "Local server not found" });
      return;
    }

    if (server.userId !== userId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    res.json({ server });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to get local server", { error: errMsg });
    res.status(500).json({ error: "Failed to get local server" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const userId = req.headers["x-user-id"] as string;

    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    const { name } = req.body;

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const serverId = uuidv4();
    const now = new Date();

    const [server] = await db
      .insert(localServers)
      .values({
        id: serverId,
        userId,
        name,
        isConnected: false,
        createdAt: now,
      })
      .returning();

    logger.info("Created local server", { serverId, userId, name });

    res.status(201).json({ server });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to create local server", { error: errMsg });
    res.status(500).json({ error: "Failed to create local server" });
  }
});

router.patch("/:id/connection", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const userId = req.headers["x-user-id"] as string;
    const { isConnected } = req.body;

    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    if (typeof isConnected !== "boolean") {
      res.status(400).json({ error: "isConnected (boolean) is required" });
      return;
    }

    const [existingServer] = await db
      .select()
      .from(localServers)
      .where(eq(localServers.id, id))
      .limit(1);

    if (!existingServer) {
      res.status(404).json({ error: "Local server not found" });
      return;
    }

    if (existingServer.userId !== userId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    const [server] = await db
      .update(localServers)
      .set({
        isConnected,
        lastConnected: isConnected ? new Date() : existingServer.lastConnected,
      })
      .where(eq(localServers.id, id))
      .returning();

    logger.info("Updated local server connection", {
      serverId: id,
      isConnected,
    });

    res.json({ server });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to update local server connection", { error: errMsg });
    res.status(500).json({ error: "Failed to update local server connection" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const userId = req.headers["x-user-id"] as string;

    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    const [existingServer] = await db
      .select()
      .from(localServers)
      .where(eq(localServers.id, id))
      .limit(1);

    if (!existingServer) {
      res.status(404).json({ error: "Local server not found" });
      return;
    }

    if (existingServer.userId !== userId) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    await db.delete(localServers).where(eq(localServers.id, id));

    logger.info("Deleted local server", { serverId: id });

    res.json({ success: true });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to delete local server", { error: errMsg });
    res.status(500).json({ error: "Failed to delete local server" });
  }
});

export { router as localServersRouter };
