import { Router, Request, Response } from "express";
import {
  requestAllConnectedServers,
  RouteError,
} from "../services/local-server-proxy";
import { logger } from "../shared/logger";
import type { ProviderPayload } from "../shared/types";

type ProvidersListResponse = {
  providers: ProviderPayload[];
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

    const uniqueProviders = Array.from(
      new Map(providers.map((provider) => [provider.id, provider])).values(),
    );

    res.json({ providers: uniqueProviders });
  } catch (error) {
    handleRouteError(res, "Failed to get providers", error);
  }
});

export { router as providersRouter };
