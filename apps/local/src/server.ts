import cors from "cors";
import express, {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from "express";
import * as fs from "fs";
import morgan from "morgan";
import * as path from "path";
import {
  createAgentRouter,
  healthRouter,
  createLogsRouter,
  createProjectsRouter,
  createRunRouter,
  createSecretsRouter,
  createSessionsRouter,
  createTelemetryRouter,
  createMessageQueueRouter,
} from "./routes";
import { error, StatusCodes } from "./shared/api-response";
import { stream } from "./shared/logger";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

export function createServer(): express.Application {
  const app = express();

  const webBuildPath = path.join(__dirname, "..", "dist", "web");

  app.use(cors());
  app.use(morgan("combined", { stream }));
  app.use(express.json());

  function requireSecret(
    req: ExpressRequest,
    res: ExpressResponse,
    next: NextFunction,
  ): void {
    if (!WEBHOOK_SECRET) {
      next();
      return;
    }
    const sig = req.headers["x-webhook-secret"];
    if (sig !== WEBHOOK_SECRET) {
      error(res, "Unauthorized", StatusCodes.UNAUTHORIZED);
      return;
    }
    next();
  }

  app.use("/health", healthRouter);
  app.use("/api/logs", createLogsRouter());
  app.use("/api/project", createProjectsRouter());
  app.use("/api/sessions", createSessionsRouter());
  app.use("/run", requireSecret, createRunRouter());
  app.use("/api/secrets", createSecretsRouter());
  app.use("/api/agent", createAgentRouter());
  app.use("/api/telemetry", createTelemetryRouter());
  app.use("/api/message-queue", createMessageQueueRouter());

  if (fs.existsSync(webBuildPath)) {
    app.use("/web", express.static(webBuildPath));

    app.get("/web/*", (_req, res) => {
      res.sendFile(path.join(webBuildPath, "index.html"));
    });
  }

  return app;
}
