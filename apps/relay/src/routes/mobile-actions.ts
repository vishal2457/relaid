import { Router, type Request, type Response } from "express";
import {
  requestConnectedServer,
  requestConnectedServerWithRequestId,
  sendConnectedServerEvent,
  requestUntilMatch,
  requireUserId,
  RouteError,
} from "../services/local-server-proxy";
import { broadcastToUser } from "../services/sse-bus";
import { clearBufferedInteraction } from "../services/interaction-buffer";
import { savePushToken } from "../services/push-notification";
import { logger } from "../shared/logger";
import type {
  PermissionResponseEvent,
  QuestionResponseEvent,
  SessionPromptResponseEvent,
} from "../shared/types";

type SessionResponse = {
  session: Record<string, unknown> | null;
  error?: string;
};

type ProjectResponse = {
  project: Record<string, unknown> | null;
  error?: string;
};

type SessionPromptRequest = {
  requestId: string;
  agentProviderId?: string;
  projectId: string;
  sessionId: string;
  prompt: string;
  agent?: string;
  appMentions?: Array<{ id: string; name: string }>;
  model?: { providerId: string; modelId: string };
};

type SessionAbortRequest = {
  requestId: string;
  agentProviderId?: string;
  sessionId: string;
  projectId: string;
};

const router: Router = Router();

function shouldSkipSessionPreflight(agentProviderId?: string): boolean {
  return agentProviderId === "codex";
}

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

router.post(
  "/sessions/:sessionId/prompt",
  async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req.headers["x-user-id"]);
      const sessionId = req.params.sessionId;
      const {
        requestId,
        agentProviderId,
        projectId,
        prompt,
        agent,
        appMentions,
        model,
      } =
        req.body as SessionPromptRequest;

      if (!requestId || !projectId) {
        res.status(400).json({ error: "requestId, projectId are required" });
        return;
      }

      const sessionResult = await requestUntilMatch<SessionResponse>(
        userId,
        "session_get_request",
        "session_get_response",
        { agentProviderId, sessionId },
        (response) => Boolean(response.session),
      );

      if (
        !sessionResult?.response.session &&
        !shouldSkipSessionPreflight(agentProviderId)
      ) {
        broadcastToUser(userId, "session_prompt_response", {
          requestId,
          projectId,
          sessionId,
          success: false,
          output: "",
          error: "Session not found",
          exitCode: -1,
          duration: 0,
          messages: [],
        } satisfies Partial<SessionPromptResponseEvent> as Record<
          string,
          unknown
        >);
        res.json({ accepted: true, requestId });
        return;
      }

      let targetServerId = sessionResult?.serverId;
      if (!targetServerId) {
        const projectResult = await requestUntilMatch<ProjectResponse>(
          userId,
          "project_get_request",
          "project_get_response",
          { projectId },
          (response) => Boolean(response.project),
        );
        targetServerId = projectResult?.serverId;
      }

      if (!targetServerId) {
        broadcastToUser(userId, "session_prompt_response", {
          requestId,
          projectId,
          sessionId,
          success: false,
          output: "",
          error: "Local server not found for project",
          exitCode: -1,
          duration: 0,
          messages: [],
        } satisfies Partial<SessionPromptResponseEvent> as Record<
          string,
          unknown
        >);
        res.json({ accepted: true, requestId });
        return;
      }

      res.json({ accepted: true, requestId });

      try {
        await requestConnectedServerWithRequestId<SessionPromptResponseEvent>(
          userId,
          "session_prompt_request",
          "session_prompt_response",
          {
            requestId,
            agentProviderId,
            projectId,
            sessionId,
            prompt,
            agent,
            appMentions,
            model,
            userId,
          },
          targetServerId,
        );
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        broadcastToUser(userId, "session_prompt_response", {
          requestId,
          projectId,
          sessionId,
          success: false,
          output: "",
          exitCode: -1,
          duration: 0,
          messages: [],
          error: errMsg || "Local server request failed",
        } satisfies Partial<SessionPromptResponseEvent> as Record<
          string,
          unknown
        >);
      }
    } catch (error) {
      handleRouteError(res, "Failed to send prompt", error);
    }
  },
);

router.post(
  "/sessions/:sessionId/abort",
  async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req.headers["x-user-id"]);
      const sessionId = req.params.sessionId;
      const { requestId, agentProviderId, projectId } =
        req.body as SessionAbortRequest;

      const sessionResult = await requestUntilMatch<SessionResponse>(
        userId,
        "session_get_request",
        "session_get_response",
        { agentProviderId, sessionId },
        (response) => Boolean(response.session),
      );

      if (!sessionResult?.response.session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      const session = sessionResult.response.session;
      const resolvedProjectId =
        projectId ||
        (session.projectID as string) ||
        (session.projectId as string);

      const response = await requestConnectedServer<{
        sessionId: string;
        success: boolean;
        error?: string;
      }>(
        userId,
        "session_abort",
        "session_aborted",
        {
          requestId: requestId || `abort_${Date.now()}`,
          agentProviderId,
          sessionId,
          projectId: resolvedProjectId,
        },
        sessionResult.serverId,
      );

      res.json({
        sessionId: response.response.sessionId,
        success: response.response.success,
        error: response.response.error,
        requestId: response.requestId,
      });
    } catch (error) {
      handleRouteError(res, "Failed to abort session", error);
    }
  },
);

router.post(
  "/sessions/:sessionId/permission-response",
  async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req.headers["x-user-id"]);
      const sessionId = req.params.sessionId;
      const data = req.body as PermissionResponseEvent;

      const sessionResult = await requestUntilMatch<SessionResponse>(
        userId,
        "session_get_request",
        "session_get_response",
        { agentProviderId: data.agentProviderId, sessionId },
        (response) => Boolean(response.session),
      );

      if (!sessionResult?.response.session) {
        logger.warn("Session not found for permission_response", {
          sessionId,
          requestId: data.requestId,
        });
        res.status(404).json({ error: "Session not found" });
        return;
      }

      await sendConnectedServerEvent(
        userId,
        "permission_response",
        data,
        sessionResult.serverId,
      );
      clearBufferedInteraction(data.requestId);

      logger.info("Permission response forwarded to local server", {
        sessionId,
        jobId: data.jobId,
        reply: data.reply,
      });

      res.json({ success: true });
    } catch (error) {
      handleRouteError(res, "Failed to send permission response", error);
    }
  },
);

router.post(
  "/sessions/:sessionId/question-response",
  async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req.headers["x-user-id"]);
      const sessionId = req.params.sessionId;
      const data = req.body as QuestionResponseEvent;

      const sessionResult = await requestUntilMatch<SessionResponse>(
        userId,
        "session_get_request",
        "session_get_response",
        { agentProviderId: data.agentProviderId, sessionId },
        (response) => Boolean(response.session),
      );

      if (!sessionResult?.response.session) {
        logger.warn("Session not found for question_response", {
          sessionId,
          requestId: data.requestId,
        });
        res.status(404).json({ error: "Session not found" });
        return;
      }

      await sendConnectedServerEvent(
        userId,
        "question_response",
        data,
        sessionResult.serverId,
      );
      clearBufferedInteraction(data.requestId);

      logger.info("Question response forwarded to local server", {
        sessionId,
        jobId: data.jobId,
      });

      res.json({ success: true });
    } catch (error) {
      handleRouteError(res, "Failed to send question response", error);
    }
  },
);

router.post("/push-token", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req.headers["x-user-id"]);
    const { token, platform } = req.body as { token: string; platform: string };

    if (!token) {
      res.status(400).json({ error: "token is required" });
      return;
    }

    await savePushToken(userId, token, platform || "unknown");
    logger.info("Push token registered via HTTP", { userId, platform });
    res.json({ success: true });
  } catch (error) {
    handleRouteError(res, "Failed to register push token", error);
  }
});

export { router as mobileActionsRouter };
