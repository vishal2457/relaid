import express from "express";
import { ClaudeAgent } from "../agents/claude-agent.js";
import { CodexAgent } from "../agents/codex-agent.js";
import { OpencodeAgent } from "../agents/opencode-agent.js";
import { createApiRouter } from "./routes/api.js";
import { createProjectRoutes } from "./routes/projects.js";
import { createGoalRoutes } from "./routes/goals.js";
import { createHarnessRoutes } from "./routes/harnesses.js";
import sseRouter from "./routes/sse.js";
import { setAgentInstances } from "../orchestrator/scheduler.js";

export function createServer() {
  const app = express();
  app.use(express.json());

  const claude = new ClaudeAgent();
  const codex = new CodexAgent();
  const opencode = new OpencodeAgent();

  setAgentInstances(claude, codex, opencode);

  app.use("/api/sse", sseRouter);
  app.use("/api/agent", createApiRouter(claude, codex, opencode));
  app.use("/api/projects", createProjectRoutes());
  app.use("/api/goals", createGoalRoutes());
  app.use("/api/harnesses", createHarnessRoutes());

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      claudeSessions: claude.getActiveSessionIds(),
      codexSessions: codex.getActiveSessionIds(),
      opencodeSessions: opencode.getActiveSessionIds(),
    });
  });

  return { app, claude, codex, opencode };
}
