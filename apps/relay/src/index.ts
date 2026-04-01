import express from "express";
import { createServer } from "http";
import cors from "cors";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { createSocketServer } from "./socket";
import { projectsRouter } from "./routes/projects";
import { sessionsRouter } from "./routes/sessions";
import { localServersRouter } from "./routes/local-servers";
import { usersRouter } from "./routes/users";
import { messagesRouter } from "./routes/messages";
import { providersRouter } from "./routes/providers";
import { logger } from "./shared/logger";
import { getDb } from "./db";
import { localServers } from "./db/schema";

dotenv.config();

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";
export const SRC_SERVER_URL =
  process.env.SRC_SERVER_URL || "http://localhost:3006";

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  logger.info("Incoming request", {
    method: req.method,
    path: req.path,
    userId: req.headers["x-user-id"],
  });
  next();
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/users", usersRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/local-servers", localServersRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/providers", providersRouter);



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

cleanupStaleConnections();

httpServer.listen(PORT, HOST, () => {
  logger.info(`Chat server started`, {
    port: PORT,
    host: HOST,
    srcServerUrl: SRC_SERVER_URL,
  });
});

export { io };
