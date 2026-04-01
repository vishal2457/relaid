import {
  Router,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { runOpenCode } from "../services/open-code-runner";
import { opencodeCatalogService } from "../services/opencode-catalog-service";
import { logger } from "../shared/logger";
import { success, error, StatusCodes } from "../shared/api-response";

export function createRunRouter(): Router {
  const router = Router();

  router.post(
    "/:projectId",
    async (req: ExpressRequest, res: ExpressResponse) => {
      const { projectId } = req.params;
      const { prompt, sessionId } = req.body as {
        prompt?: string;
        sessionId?: string;
      };

      if (!prompt) {
        error(res, "prompt is required", StatusCodes.BAD_REQUEST);
        return;
      }

      const project = await opencodeCatalogService.getProject(projectId);
      if (!project) {
        error(res, `Project "${projectId}" not found`, StatusCodes.NOT_FOUND);
        return;
      }

      logger.info("OpenCode run triggered via HTTP", { projectId, sessionId });

      const result = await runOpenCode(prompt, project.folder, sessionId);

      success(
        res,
        {
          projectId,
          success: result.success,
          output: result.output,
          error: result.error,
          exitCode: result.exitCode,
          duration: result.duration,
          sessionId: result.sessionId,
        },
        "Run completed successfully",
      );
    },
  );

  return router;
}
