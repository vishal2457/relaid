import { Router, Request, Response } from "express";
import {
  requestConnectedServer,
  requestUntilMatch,
  requireUserId,
  RouteError,
} from "../services/local-server-proxy";
import { logger } from "../shared/logger";
import type { MessagePayload, SessionPayload } from "../shared/types";

type SessionResponse = {
  session: SessionPayload | null;
  error?: string;
};

type SessionMessagesResponse = {
  messages: MessagePayload[];
  error?: string;
};

const router: Router = Router();

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

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const sessionId =
      typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    const agentProviderId =
      typeof req.query.agentProviderId === "string"
        ? req.query.agentProviderId
        : undefined;

    if (!sessionId) {
      res.status(400).json({ error: "sessionId is required" });
      return;
    }

    const sessionLookup = await requestUntilMatch<SessionResponse>(
      userId,
      "session_get_request",
      "session_get_response",
      { agentProviderId, sessionId },
      (response) => Boolean(response.session),
    );

    if (!sessionLookup?.response.session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const limit =
      typeof req.query.limit === "string"
        ? Number.parseInt(req.query.limit, 10)
        : undefined;

    const result = await requestConnectedServer<SessionMessagesResponse>(
      userId,
      "session_messages_request",
      "session_messages_response",
      {
        agentProviderId,
        sessionId,
        limit,
      },
      sessionLookup.serverId,
    );

    res.json({ messages: result.response.messages || [] });
  } catch (error) {
    handleRouteError(res, "Failed to get messages", error);
  }
});

export { router as messagesRouter };
