import { Router, Response as ExpressResponse } from "express";
import { opencodeCatalogService } from "../services/opencode-catalog-service";
import { success } from "../shared/api-response";

export function createHealthRouter(): Router {
  const router = Router();

  router.get("/", async (_req, res: ExpressResponse) => {
    const projects = await opencodeCatalogService.listProjects();

    success(
      res,
      {
        status: "ok",
        uptime: process.uptime(),
        projects: projects.length,
      },
      "Health check successful",
    );
  });

  return router;
}
