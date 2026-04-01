import { Router, Request, Response } from "express";
import {
  requestAllConnectedServers,
  requestConnectedServer,
  requestUntilMatch,
  requireUserId,
  RouteError,
} from "../services/local-server-proxy";
import { logger } from "../shared/logger";
import type {
  MessagePayload,
  ProjectPayload,
  SessionPayload,
} from "../shared/types";

type SessionsListResponse = {
  sessions: SessionPayload[];
  error?: string;
};

type SessionResponse = {
  session: SessionPayload | null;
  error?: string;
};

type SessionMessagesResponse = {
  messages: MessagePayload[];
  error?: string;
};

type SessionCreateResponse = {
  session: SessionPayload;
  requestId: string;
  error?: string;
};

type SessionAbortResponse = {
  sessionId: string;
  success: boolean;
  error?: string;
};

type ProjectResponse = {
  project: ProjectPayload | null;
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
    const results = await requestAllConnectedServers<SessionsListResponse>(
      userId,
      "sessions_list_request",
      "sessions_list_response",
      {
        projectId:
          typeof req.query.projectId === "string" ? req.query.projectId : undefined,
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        limit:
          typeof req.query.limit === "string"
            ? Number.parseInt(req.query.limit, 10)
            : undefined,
      },
    );

    const sessions = results.flatMap((result) => result.response.sessions || []);
    const projectId =
      typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    const status =
      typeof req.query.status === "string" ? req.query.status : undefined;
    const filteredSessions = sessions
      .filter((session) => (projectId ? session.projectId === projectId : true))
      .filter((session) => (status ? session.status === status : true))
      .sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      );

    res.json({ sessions: filteredSessions });
  } catch (error) {
    handleRouteError(res, "Failed to get sessions", error);
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const result = await requestUntilMatch<SessionResponse>(
      userId,
      "session_get_request",
      "session_get_response",
      { sessionId: req.params.id },
      (response) => Boolean(response.session),
    );

    if (!result?.response.session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    res.json({ session: result.response.session });
  } catch (error) {
    handleRouteError(res, "Failed to get session", error);
  }
});

router.get("/:id/messages", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const sessionLookup = await requestUntilMatch<SessionResponse>(
      userId,
      "session_get_request",
      "session_get_response",
      { sessionId: req.params.id },
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
        sessionId: req.params.id,
        limit,
      },
      sessionLookup.serverId,
    );

    res.json({ messages: result.response.messages || [] });
  } catch (error) {
    handleRouteError(res, "Failed to get session messages", error);
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const { projectId, prompt, resumeSessionId, localServerId } = req.body;

    if (!projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }

    let targetServerId = localServerId as string | undefined;

    if (!targetServerId) {
      const projectResult = await requestUntilMatch<ProjectResponse>(
        userId,
        "project_get_request",
        "project_get_response",
        { projectId },
        (response) => Boolean(response.project),
      );

      if (!projectResult?.response.project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      targetServerId = projectResult.serverId;
    }

    const result = await requestConnectedServer<SessionCreateResponse>(
      userId,
      "session_create_request",
      "session_create_response",
      {
        projectId,
        prompt: typeof prompt === "string" ? prompt : "",
        sessionId: resumeSessionId,
        userId,
      },
      targetServerId,
    );

    res.status(201).json({
      session: result.response.session,
      requestId: result.response.requestId || result.requestId,
    });
  } catch (error) {
    handleRouteError(res, "Failed to create session", error);
  }
});

router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const result = await requestUntilMatch<SessionResponse>(
      userId,
      "session_update_request",
      "session_update_response",
      {
        sessionId: req.params.id,
        status: req.body.status,
        output: req.body.output,
        error: req.body.error,
        exitCode: req.body.exitCode,
        duration: req.body.duration,
        sessionId_data: req.body.sessionId,
      },
      (response) => Boolean(response.session),
    );

    if (!result?.response.session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    res.json({ session: result.response.session });
  } catch (error) {
    handleRouteError(res, "Failed to update session status", error);
  }
});

router.post("/:id/abort", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const sessionLookup = await requestUntilMatch<SessionResponse>(
      userId,
      "session_get_request",
      "session_get_response",
      { sessionId: req.params.id },
      (response) => Boolean(response.session),
    );

    if (!sessionLookup?.response.session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const result = await requestConnectedServer<SessionAbortResponse>(
      userId,
      "session_abort",
      "session_aborted",
      {
        sessionId: req.params.id,
        projectId: sessionLookup.response.session.projectId,
      },
      sessionLookup.serverId,
    );

    res.json({
      sessionId: result.response.sessionId,
      success: result.response.success,
      error: result.response.error,
      requestId: result.requestId,
    });
  } catch (error) {
    handleRouteError(res, "Failed to abort session", error);
  }
});

export { router as sessionsRouter };
