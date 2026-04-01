import {
  Router,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { success, error, StatusCodes } from "../shared/api-response";
import { opencodeCatalogService } from "../services/opencode-catalog-service";

export function createProjectsRouter(): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const projects = await opencodeCatalogService.listProjects();
      success(res, { projects }, "Projects fetched successfully");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      error(res, msg, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  });

  router.post("/", async (req: ExpressRequest, res: ExpressResponse) => {
    error(
      res,
      "Project creation via the app database is deprecated; OpenCode owns projects",
      StatusCodes.GONE,
    );
  });

  return router;
}
