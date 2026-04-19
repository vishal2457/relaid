import { Router, Request, Response } from "express";
import { requestAllConnectedServers } from "../services/local-server-proxy";
import type { SkillPayload } from "../shared/types";

type SkillsListResponse = {
  skills: SkillPayload[];
  error?: string;
};

const router: Router = Router();

function handleRouteError(
  res: Response,
  defaultMessage: string,
  error: unknown,
): void {
  const errMsg = error instanceof Error ? error.message : String(error);
  res.status(500).json({ error: errMsg || defaultMessage });
}

router.get("/:projectId", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    const rawQuery = typeof req.query.q === "string" ? req.query.q : "";

    const results = await requestAllConnectedServers<SkillsListResponse>(
      userId,
      "skills_list_request",
      "skills_list_response",
      {
        projectId: req.params.projectId,
        query: rawQuery,
      },
    );

    const skills = results.flatMap((result) => result.response.skills || []);

    res.json({ skills });
  } catch (error) {
    handleRouteError(res, "Failed to get skills", error);
  }
});

export { router as skillsRouter };
