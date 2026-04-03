import express from "express";
import { createServer } from "http";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import { eq } from "drizzle-orm";
import { createSocketServer } from "./socket";
import { localServersRouter } from "./routes/local-servers";
import { usersRouter } from "./routes/users";
import { providersRouter } from "./routes/providers";
import { gitRouter } from "./routes/git";
import { projectsRouter } from "./routes/projects";
import { sessionsRouter } from "./routes/sessions";
import { messagesRouter } from "./routes/messages";
import { logger, stream } from "./shared/logger";
import { getDb } from "./db";
import { expoPushTokens, localServers } from "./db/schema";

dotenv.config();

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";
export const SRC_SERVER_URL =
  process.env.SRC_SERVER_URL || "http://localhost:3006";

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(morgan("combined", { stream }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/debug/servers", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    const db = getDb();
    const servers = await db
      .select()
      .from(localServers)
      .where(eq(localServers.userId, userId));

    res.json({
      userId,
      totalServers: servers.length,
      connectedServers: servers.filter((s) => s.isConnected).length,
      servers: servers.map((s) => ({
        id: s.id,
        name: s.name,
        isConnected: s.isConnected,
        lastConnected: s.lastConnected,
      })),
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: errMsg });
  }
});

app.use("/api/users", usersRouter);
app.use("/api/local-servers", localServersRouter);
app.use("/api/providers", providersRouter);
app.use("/api/git", gitRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/messages", messagesRouter);

const io = createSocketServer(httpServer);

async function cleanupStaleConnections() {
  try {
    const db = getDb();
    await db
      .update(localServers)
      .set({ isConnected: false })
      .where(eq(localServers.isConnected, true));
    logger.info("Cleaned up stale local server connections");
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to cleanup stale connections", { error: errMsg });
  }
}

async function ensurePushTokensTable() {
  try {
    const db = getDb();
    await db.select({ id: expoPushTokens.id }).from(expoPushTokens).limit(1);
    logger.info("Push tokens table exists");
  } catch {
    try {
      const db = getDb();
      const sqlite = db.$client;
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS expo_push_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          token TEXT NOT NULL,
          platform TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
      logger.info("Created expo_push_tokens table");
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to create push tokens table", { error: errMsg });
    }
  }
}

cleanupStaleConnections();
ensurePushTokensTable();

httpServer.listen(PORT, HOST, () => {
  logger.info(`Chat server started`, {
    port: PORT,
    host: HOST,
    srcServerUrl: SRC_SERVER_URL,
  });
});

export { io };
