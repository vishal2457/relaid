import { Router } from "express";
import {
  addSseClient,
  removeSseClient,
  replayMissedEvents,
  sendHeartbeat,
  broadcastRaw,
} from "../sse-bus.js";
import { onOrchestrationEvent } from "../sse-orchestration.js";

const router = Router();

router.get("/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write("retry: 3000\n\n");

  const connectionId = addSseClient(res);

  const lastEventId = req.headers["last-event-id"] as string | undefined;
  if (lastEventId) {
    replayMissedEvents(lastEventId, (event: string, payload: Record<string, unknown>, id: string) => {
      const data = JSON.stringify(payload);
      res.write(`id: ${id}\nevent: ${event}\ndata: ${data}\n\n`);
    });
  }

  res.write(`event: claude:status\ndata: ${JSON.stringify({ sessionId: "", content: "SSE connected" })}\n\n`);

  const unsubOrch = onOrchestrationEvent((event) => {
    broadcastRaw(`orchestration:${event.type}`, event as unknown as Record<string, unknown>);
  });

  const heartbeatTimer = setInterval(() => {
    sendHeartbeat();
  }, 30_000);

  req.on("close", () => {
    clearInterval(heartbeatTimer);
    unsubOrch();
    removeSseClient(connectionId);
  });
});

export default router;
