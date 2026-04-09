import { Router, type Request, type Response } from "express";
import {
  authenticateMobileAccessToken,
  getBearerToken,
} from "../services/auth";
import {
  addSseClient,
  removeSseClient,
  replayMissedEvents,
} from "../services/sse-bus";
import { logger } from "../shared/logger";
import { deliverBufferedInteractions } from "../services/interaction-buffer";
import { RouteError } from "../services/local-server-proxy";

const router: Router = Router();

const HEARTBEAT_INTERVAL_MS = 30_000;
const CLIENT_RETRY_MS = 1_000;

function getLastEventId(req: Request): string | null {
  const header = req.headers["last-event-id"];
  if (Array.isArray(header)) {
    return header[0] ?? null;
  }
  return typeof header === "string" && header.trim() ? header.trim() : null;
}

router.get("/stream", async (req: Request, res: Response) => {
  const accessToken = getBearerToken(req.headers.authorization);
  if (!accessToken) {
    res.status(401).json({ error: "Authorization header required" });
    return;
  }

  let userId: string;
  try {
    const auth = await authenticateMobileAccessToken(accessToken);
    userId = auth.server.id;
  } catch (error) {
    if (error instanceof RouteError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const lastEventId = getLastEventId(req);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.socket?.setKeepAlive(true);
  res.socket?.setNoDelay(true);
  res.socket?.setTimeout(0);

  res.write(`retry: ${CLIENT_RETRY_MS}\n: connected\n\n`);

  const connectionId = addSseClient(userId, res);

  replayMissedEvents(userId, lastEventId, (event, payload, id) => {
    const data = JSON.stringify(payload);
    res.write(`id: ${id}\nevent: ${event}\ndata: ${data}\n\n`);
  });

  if (!lastEventId) {
    deliverBufferedInteractions(userId, (event, payload) => {
      const data = JSON.stringify(payload);
      res.write(`event: ${event}\ndata: ${data}\n\n`);
    });
  }

  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch {
      clearInterval(heartbeat);
      removeSseClient(userId, connectionId);
    }
  }, HEARTBEAT_INTERVAL_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeSseClient(userId, connectionId);
    logger.info("SSE client closed connection", { userId, connectionId });
  });
});

export { router as sseRouter };
