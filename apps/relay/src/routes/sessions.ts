import { Router, Request, Response } from "express";
import { getMobileDeviceById } from "../services/auth";
import {
  requestAllConnectedServers,
  requestConnectedServer,
  requestUntilMatch,
  requireUserId,
  RouteError,
} from "../services/local-server-proxy";
import { logger } from "../shared/logger";
import type { ProjectPayload, SessionPayload } from "../shared/types";

type SessionsListResponse = {
  sessions: SessionPayload[];
  error?: string;
};

type SessionResponse = {
  session: SessionPayload | null;
  error?: string;
};

type SessionMessagesResponse = {
  messages: any[];
  error?: string;
};

type SessionDiffFile = {
  file: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
};

type SessionDiffResponse = {
  diff: SessionDiffFile[];
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

function getAgentProviderId(req: Request): string | undefined {
  if (typeof req.query.agentProviderId === "string") {
    return req.query.agentProviderId;
  }
  if (
    req.body &&
    typeof (req.body as Record<string, unknown>).agentProviderId === "string"
  ) {
    return (req.body as Record<string, string>).agentProviderId;
  }
  return undefined;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const device = await getMobileDeviceById(String(req.headers["x-device-id"] || ""));
    const cwd = typeof req.query.cwd === "string" ? req.query.cwd : undefined;
    const agentProviderId = getAgentProviderId(req);

    console.log(userId, "user id");
    console.log(cwd, "cwd");

    const results = await requestAllConnectedServers<SessionsListResponse>(
      userId,
      "sessions_list_request",
      "sessions_list_response",
      {
        agentProviderId,
        cwd,
        status:
          typeof req.query.status === "string" ? req.query.status : undefined,
        limit:
          typeof req.query.limit === "string"
            ? Number.parseInt(req.query.limit, 10)
            : undefined,
      },
    );

    const sessions = results.flatMap(
      (result) => result.response.sessions || [],
    );
    const status =
      typeof req.query.status === "string" ? req.query.status : undefined;

    const filteredSessions = sessions
      .filter((session) => {
        const sessionStatus = (session as Record<string, unknown>).status;
        return status ? sessionStatus === status : true;
      })
      .sort((left, right) => {
        const leftTime = (left as Record<string, unknown>).time as
          | { created?: number }
          | undefined;
        const rightTime = (right as Record<string, unknown>).time as
          | { created?: number }
          | undefined;
        const leftCreated =
          leftTime?.created ??
          ((left as Record<string, unknown>).createdAt as string);
        const rightCreated =
          rightTime?.created ??
          ((right as Record<string, unknown>).createdAt as string);
        if (
          typeof leftCreated === "number" &&
          typeof rightCreated === "number"
        ) {
          return rightCreated - leftCreated;
        }
        return String(rightCreated).localeCompare(String(leftCreated));
      });

    res.json({ sessions: filteredSessions });
  } catch (error) {
    handleRouteError(res, "Failed to get sessions", error);
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const agentProviderId = getAgentProviderId(req);
    const result = await requestUntilMatch<SessionResponse>(
      userId,
      "session_get_request",
      "session_get_response",
      { agentProviderId, sessionId: req.params.id },
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
    const device = await getMobileDeviceById(String(req.headers["x-device-id"] || ""));
    const agentProviderId = getAgentProviderId(req);
    console.log(userId, "user id");
    console.log(req.params.id, "id");

    const sessionLookup = await requestUntilMatch<SessionResponse>(
      userId,
      "session_get_request",
      "session_get_response",
      { agentProviderId, sessionId: req.params.id },
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
        sessionId: req.params.id,
        limit,
        deviceId: device.id,
        deviceKeyId: device.deviceKeyId,
        devicePublicKey: device.devicePublicKey,
      },
      sessionLookup.serverId,
    );

    res.json({ messages: result.response.messages || [] });
  } catch (error) {
    handleRouteError(res, "Failed to get session messages", error);
  }
});

router.get("/:id/diff", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const agentProviderId = getAgentProviderId(req);
    const sessionLookup = await requestUntilMatch<SessionResponse>(
      userId,
      "session_get_request",
      "session_get_response",
      { agentProviderId, sessionId: req.params.id },
      (response) => Boolean(response.session),
    );

    if (!sessionLookup?.response.session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const messageId =
      typeof req.query.messageID === "string" ? req.query.messageID : undefined;

    const result = await requestConnectedServer<SessionDiffResponse>(
      userId,
      "session_diff_request",
      "session_diff_response",
      {
        agentProviderId,
        sessionId: req.params.id,
        messageId,
      },
      sessionLookup.serverId,
    );

    res.json({ diff: result.response.diff || [] });
  } catch (error) {
    handleRouteError(res, "Failed to get session diff", error);
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const {
      projectId,
      prompt,
      resumeSessionId,
      localServerId,
      agentProviderId,
    } = req.body;

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
        agentProviderId,
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
    const agentProviderId = getAgentProviderId(req);
    const result = await requestUntilMatch<SessionResponse>(
      userId,
      "session_update_request",
      "session_update_response",
      {
        sessionId: req.params.id,
        agentProviderId,
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
    const agentProviderId = getAgentProviderId(req);
    const sessionLookup = await requestUntilMatch<SessionResponse>(
      userId,
      "session_get_request",
      "session_get_response",
      { agentProviderId, sessionId: req.params.id },
      (response) => Boolean(response.session),
    );

    if (!sessionLookup?.response.session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const session = sessionLookup.response.session as Record<string, unknown>;
    const projectId = session.projectID ?? session.projectId;

    const result = await requestConnectedServer<SessionAbortResponse>(
      userId,
      "session_abort",
      "session_aborted",
      {
        agentProviderId,
        sessionId: req.params.id,
        projectId: projectId as string,
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
