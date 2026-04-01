import {
  Router,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { logger } from "../shared/logger";
import { success, error, StatusCodes } from "../shared/api-response";
import { opencodeCatalogService } from "../services/opencode-catalog-service";

export function createSessionsRouter(): Router {
  const router = Router();

  router.get("/", async (req: ExpressRequest, res: ExpressResponse) => {
    const projectId = req.query.projectId as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string, 10) || 50;

    try {
      if (!projectId) {
        return error(
          res,
          "projectId is required",
          StatusCodes.BAD_REQUEST,
        );
      }

      const sessions = await opencodeCatalogService.listSessions({
        projectId,
        limit,
        status,
      });
      success(res, { sessions }, "Sessions fetched successfully");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Failed to get sessions", { error: msg });
      error(res, msg, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  });

  router.get("/:id", async (req: ExpressRequest, res: ExpressResponse) => {
    const { id } = req.params;

    try {
      const session = await opencodeCatalogService.getSession(id);

      if (!session) {
        error(res, "Session not found", StatusCodes.NOT_FOUND);
        return;
      }

      success(res, { session }, "Session fetched successfully");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Failed to get session", { error: msg });
      error(res, msg, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  });

  router.get(
    "/:id/messages",
    async (req: ExpressRequest, res: ExpressResponse) => {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string, 10) || 100;

      try {
        const session = await opencodeCatalogService.getSession(id);

        if (!session) {
          error(res, "Session not found", StatusCodes.NOT_FOUND);
          return;
        }

        const messages = await opencodeCatalogService.getSessionMessages(
          id,
          limit,
        );

        success(
          res,
          { messages },
          "Session messages fetched successfully",
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Failed to get session messages", {
          sessionId: id,
          error: msg,
        });
        error(res, msg, StatusCodes.INTERNAL_SERVER_ERROR);
      }
    },
  );

  router.post("/", async (req: ExpressRequest, res: ExpressResponse) => {
    const { projectId, prompt, resumeSessionId, userId } = req.body as {
      projectId?: string;
      prompt?: string;
      resumeSessionId?: string;
      userId?: string;
    };

    if (!projectId) {
      error(res, "projectId is required", StatusCodes.BAD_REQUEST);
      return;
    }

    try {
      if (resumeSessionId) {
        error(
          res,
          "resumeSessionId is deprecated for this endpoint",
          StatusCodes.BAD_REQUEST,
        );
        return;
      }

      if (prompt && prompt.trim()) {
        error(
          res,
          "prompt is deprecated for this endpoint; create the session first and send prompts through the run/session prompt APIs",
          StatusCodes.BAD_REQUEST,
        );
        return;
      }

      const project = await opencodeCatalogService.getProject(projectId);
      if (!project) {
        error(res, `Project "${projectId}" not found`, StatusCodes.NOT_FOUND);
        return;
      }

      const createdSession = await opencodeCatalogService.createSession(projectId);

      if (!createdSession) {
        error(
          res,
          `Unable to create session for project "${projectId}"`,
          StatusCodes.INTERNAL_SERVER_ERROR,
        );
        return;
      }

      const session = {
        id: createdSession.id,
        projectId: createdSession.projectId,
        userId: userId || null,
        status: createdSession.status as any,
        prompt: createdSession.prompt,
        output: createdSession.output,
        error: createdSession.error,
        exitCode: createdSession.exitCode,
        duration: createdSession.duration,
        sessionId: createdSession.sessionId,
        createdAt: new Date(createdSession.createdAt),
        updatedAt: new Date(createdSession.updatedAt),
        startedAt: createdSession.startedAt
          ? new Date(createdSession.startedAt)
          : null,
        completedAt: createdSession.completedAt
          ? new Date(createdSession.completedAt)
          : null,
      };

      logger.info("Created session", {
        sessionId: session.id,
        projectId,
        resumeSessionId,
      });

      success(
        res,
        {
          session,
          requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        },
        "Session created successfully",
        StatusCodes.CREATED,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Failed to create session", { error: msg });
      error(res, msg, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  });

  router.patch("/:id/status", (req: ExpressRequest, res: ExpressResponse) => {
    error(
      res,
      "Session status updates via the app database are deprecated; OpenCode owns session state",
      StatusCodes.GONE,
    );
  });

  router.post("/:id/abort", (req: ExpressRequest, res: ExpressResponse) => {
    error(
      res,
      "Session abort via this deprecated app endpoint is no longer supported",
      StatusCodes.GONE,
    );
  });

  return router;
}
