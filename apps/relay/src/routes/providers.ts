import { Router, Request, Response } from "express";
import {
  requestAllConnectedServers,
  requestConnectedServer,
  requestUntilMatch,
  RouteError,
} from "../services/local-server-proxy";
import { logger } from "../shared/logger";
import type { AppPayload, ProviderPayload } from "../shared/types";

type ProvidersListResponse = {
  providers: ProviderPayload[];
  error?: string;
};

type AppsListResponse = {
  apps: AppPayload[];
  error?: string;
};

type ProjectResponse = {
  project: Record<string, unknown> | null;
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
    const userId = req.headers["x-user-id"] as string;

    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    const results = await requestAllConnectedServers<ProvidersListResponse>(
      userId,
      "providers_list_request",
      "providers_list_response",
      {},
    );

    const providers = results.flatMap(
      (result) => result.response.providers || [],
    );

    // Deduplicate by runtime provider and model provider. Different runtimes
    // can expose the same underlying provider id, such as openai.
    const uniqueProviders = Array.from(
      new Map(
        providers.map((provider) => [
          `${provider.agentProviderId ?? "opencode"}:${provider.id}`,
          provider,
        ]),
      ).values(),
    );

    res.json({ providers: uniqueProviders });
  } catch (error) {
    handleRouteError(res, "Failed to get providers", error);
  }
});

router.get("/:provider/apps", async (req: Request, res: Response) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) {
      res.status(401).json({ error: "x-user-id header is required" });
      return;
    }

    const providerId = req.params.provider;
    const sessionId =
      typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    const projectId =
      typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    const forceRefetch = req.query.forceRefetch === "true";
    const rawLimit =
      typeof req.query.limit === "string"
        ? Number.parseInt(req.query.limit, 10)
        : undefined;

    let targetServerId: string | undefined;
    if (projectId) {
      const projectResult = await requestUntilMatch<ProjectResponse>(
        userId,
        "project_get_request",
        "project_get_response",
        { projectId },
        (response) => Boolean(response.project),
      );
      targetServerId = projectResult?.serverId;
    }

    const result = await requestConnectedServer<AppsListResponse>(
      userId,
      "apps_list_request",
      "apps_list_response",
      {
        agentProviderId: providerId,
        sessionId,
        limit: Number.isFinite(rawLimit) ? rawLimit : undefined,
        forceRefetch,
      },
      targetServerId,
    );

    res.json({ apps: result.response.apps ?? [] });
  } catch (error) {
    handleRouteError(res, "Failed to get apps", error);
  }
});

export { router as providersRouter };
