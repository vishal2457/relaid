import {
  Router,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { success, error, StatusCodes } from "../shared/api-response";
import { opencodeCatalogService } from "../services/opencode-catalog-service";
import { GitService } from "../services/git-service";

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

  router.get(
    "/:id/branches",
    async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const projectId = req.params.id;
        const project = await opencodeCatalogService.getProject(projectId);
        if (!project) {
          error(res, "Project not found", StatusCodes.NOT_FOUND);
          return;
        }
        const gitService = new GitService(project.worktree);
        const result = await gitService.listBranches(false);
        if (!result.success) {
          error(
            res,
            result.error ?? "Failed to list branches",
            StatusCodes.INTERNAL_SERVER_ERROR,
          );
          return;
        }
        const branches =
          result.data
            ?.filter((b) => !b.isRemote)
            .map((b) => ({
              name: b.name,
              isCurrent: b.isCurrent,
            })) ?? [];
        success(res, { branches }, "Branches fetched successfully");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        error(res, msg, StatusCodes.INTERNAL_SERVER_ERROR);
      }
    },
  );

  router.post(
    "/:id/branches/switch",
    async (req: ExpressRequest, res: ExpressResponse) => {
      try {
        const projectId = req.params.id;
        const { branch } = req.body;
        if (!branch) {
          error(res, "Branch name is required", StatusCodes.BAD_REQUEST);
          return;
        }
        const project = await opencodeCatalogService.getProject(projectId);
        if (!project) {
          error(res, "Project not found", StatusCodes.NOT_FOUND);
          return;
        }
        const gitService = new GitService(project.worktree);
        const result = await gitService.switchBranch(branch);
        if (!result.success) {
          error(
            res,
            result.error ?? "Failed to switch branch",
            StatusCodes.INTERNAL_SERVER_ERROR,
          );
          return;
        }
        success(res, { branch }, "Branch switched successfully");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        error(res, msg, StatusCodes.INTERNAL_SERVER_ERROR);
      }
    },
  );

  return router;
}
