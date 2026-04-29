import express from "express";
import { createServer } from "http";
import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { createSocketServer } from "./socket";
import { getSseClientsForUser } from "./services/sse-bus";
import { localServersRouter } from "./routes/local-servers";
import { pairingRouter } from "./routes/pairing";
import { usersRouter } from "./routes/users";
import { providersRouter } from "./routes/providers";
import { agentsRouter } from "./routes/agents";
import { gitRouter } from "./routes/git";
import { projectsRouter } from "./routes/projects";
import { sessionsRouter } from "./routes/sessions";
import { messagesRouter } from "./routes/messages";
import { messageQueueRouter } from "./routes/message-queue";
import { sseRouter } from "./routes/sse";
import { mobileActionsRouter } from "./routes/mobile-actions";
import { skillsRouter } from "./routes/skills";
import { githubRouter } from "./routes/github";
import { logger, stream } from "./shared/logger";
import { getDb } from "./db";
import { expoPushTokens, localServers, users } from "./db/schema";
import { authenticateMobileAccessToken, getBearerToken } from "./services/auth";
import { RouteError } from "./services/local-server-proxy";

dotenv.config();

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(morgan("combined", { stream }));
app.use(express.json());
app.use(async (req: Request, res: Response, next: NextFunction) => {
  let accessToken = getBearerToken(req.headers.authorization);

  const userIdFromQuery = req.query.x_user_id as string | undefined;

  if (userIdFromQuery) {
    req.headers["x-user-id"] = userIdFromQuery;
    req.headers["x-server-id"] = userIdFromQuery;
    next();
    return;
  }

  if (!accessToken) {
    next();
    return;
  }

  try {
    const auth = await authenticateMobileAccessToken(accessToken);
    req.headers["x-user-id"] = auth.server.id;
    req.headers["x-server-id"] = auth.server.id;
    req.headers["x-device-id"] = auth.device.id;
    next();
  } catch (error) {
    if (error instanceof RouteError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to authenticate request", { error: errMsg });
    res.status(401).json({ error: "Unauthorized" });
  }
});

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

app.get("/api/debug/connections", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    const mobileClients = getSseClientsForUser(userId);

    res.json({
      userId,
      mobileClients: mobileClients.map((client) => ({
        connectionId: client.connectionId,
      })),
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: errMsg });
  }
});

app.use("/api/users", usersRouter);
app.use("/api/pairing", pairingRouter);
app.use("/api/local-servers", localServersRouter);
app.use("/api/providers", providersRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/git", gitRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/message-queue", messageQueueRouter);
app.use("/api/skills", skillsRouter);
app.use("/api/github", githubRouter);
app.use("/api/sse", sseRouter);
app.use("/api/mobile", mobileActionsRouter);

const publicDir = path.join(process.cwd(), "public");
const publicIndex = path.join(publicDir, "index.html");

if (existsSync(publicDir)) {
  app.use(express.static(publicDir, { index: false }));

  if (existsSync(publicIndex)) {
    app.get("/", (_req, res) => {
      res.sendFile(publicIndex);
    });
  }
}

const io = createSocketServer(httpServer);

async function verifyDbConnection() {
  try {
    const db = getDb();
    await db.select().from(users).limit(1);
    logger.info("Database connected");
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Database connection failed", { error: errMsg });
    process.exit(1);
  }
}

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

verifyDbConnection();

cleanupStaleConnections();

httpServer.listen(PORT, HOST, () => {
  logger.info(`Chat server started`, {
    port: PORT,
    host: HOST,
  });
});

export { io };
