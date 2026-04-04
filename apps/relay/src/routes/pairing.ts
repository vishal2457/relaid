import { Router, Request, Response } from "express";
import {
  authenticateLocalServer,
  claimPairingSession,
  createPairingSessionForServer,
  getServerHeaders,
} from "../services/auth";
import { RouteError } from "../services/local-server-proxy";
import { logger } from "../shared/logger";

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

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolvePublicBaseUrl(req: Request): string {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL;
  if (publicBaseUrl?.trim()) {
    return trimTrailingSlashes(publicBaseUrl.trim());
  }

  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol =
    typeof forwardedProto === "string" && forwardedProto.trim()
      ? forwardedProto.trim()
      : req.protocol;

  return trimTrailingSlashes(`${protocol}://${req.get("host")}`);
}

router.post("/sessions", async (req: Request, res: Response) => {
  try {
    const { serverId, serverSecret } = getServerHeaders(req);
    const serverName =
      typeof req.body?.serverName === "string"
        ? req.body.serverName
        : undefined;

    await authenticateLocalServer(serverId, serverSecret, serverName);

    const pairingSession = await createPairingSessionForServer(serverId);
    const pairingUrl = new URL("relaid://pair");
    pairingUrl.searchParams.set("relayUrl", resolvePublicBaseUrl(req));
    pairingUrl.searchParams.set("pairingId", pairingSession.pairingId);
    pairingUrl.searchParams.set("pairingSecret", pairingSession.pairingSecret);
    pairingUrl.searchParams.set("serverId", pairingSession.serverId);
    pairingUrl.searchParams.set("serverName", pairingSession.serverName);
    pairingUrl.searchParams.set("expiresAt", pairingSession.expiresAt);

    res.status(201).json({
      ...pairingSession,
      pairingUrl: pairingUrl.toString(),
    });
  } catch (error) {
    handleRouteError(res, "Failed to create pairing session", error);
  }
});

router.post("/claim", async (req: Request, res: Response) => {
  try {
    const {
      pairingId,
      pairingSecret,
      deviceName,
      platform,
    }: {
      pairingId?: string;
      pairingSecret?: string;
      deviceName?: string;
      platform?: string;
    } = req.body ?? {};

    const claimedSession = await claimPairingSession(
      pairingId || "",
      pairingSecret || "",
      deviceName,
      platform,
    );

    res.status(201).json(claimedSession);
  } catch (error) {
    handleRouteError(res, "Failed to claim pairing session", error);
  }
});

export { router as pairingRouter };
