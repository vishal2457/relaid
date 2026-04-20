import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db";
import { githubTokens } from "../db/github-schema";
import { encrypt, decrypt } from "../utils/crypto";
import { logger } from "../shared/logger";
import {
  getUserRepos,
  getRepoPRs,
  getPRDetails,
  getPRDiff,
  submitPRReview,
  getAuthenticatedUser,
} from "../services/github";

const router: Router = Router();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const GITHUB_REDIRECT_URI =
  process.env.GITHUB_REDIRECT_URI || "";
const GITHUB_OAUTH_AUTHORIZE_URL =
  "https://github.com/login/oauth/authorize";
const GITHUB_OAUTH_TOKEN_URL =
  "https://github.com/login/oauth/access_token";
const GITHUB_SCOPE = "repo";
const APP_DEEP_LINK_SCHEME = process.env.APP_DEEP_LINK_SCHEME || "relaid";

function buildAuthRedirect(
  mobileRedirectUri: string | null,
  params: Record<string, string>,
): string {
  const base = mobileRedirectUri || `${APP_DEEP_LINK_SCHEME}://auth`;
  const qs = new URLSearchParams(params).toString();
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${qs}`;
}

function requireUserId(req: Request): string {
  const userId = req.headers["x-user-id"] as string | undefined;
  if (!userId) {
    throw Object.assign(new Error("Authentication required"), {
      statusCode: 401,
    });
  }
  return userId;
}

async function getDecryptedGithubToken(
  userId: string,
): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(githubTokens)
    .where(eq(githubTokens.userId, userId))
    .limit(1);

  if (!row) {
    throw Object.assign(
      new Error("GitHub not connected. Visit /api/github/auth"),
      { statusCode: 401 },
    );
  }

  return decrypt(row.encryptedToken);
}

async function upsertGithubToken(
  userId: string,
  accessToken: string,
  username: string,
  scope: string,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  const encryptedToken = encrypt(accessToken);

  const [existing] = await db
    .select({ id: githubTokens.id })
    .from(githubTokens)
    .where(eq(githubTokens.userId, userId))
    .limit(1);

  if (existing) {
    await db
      .update(githubTokens)
      .set({
        encryptedToken,
        githubUsername: username,
        scope,
        updatedAt: now,
      })
      .where(eq(githubTokens.id, existing.id));
  } else {
    await db.insert(githubTokens).values({
      id: uuidv4(),
      userId,
      encryptedToken,
      githubUsername: username,
      scope,
      createdAt: now,
      updatedAt: now,
    });
  }
}

router.get("/auth", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req);
    const state = encrypt(userId);
    const mobileRedirectUri = req.query.redirect_uri as string | undefined;
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      scope: GITHUB_SCOPE,
      state,
    });
    if (GITHUB_REDIRECT_URI) {
      params.set("redirect_uri", GITHUB_REDIRECT_URI);
    }
    const url = `${GITHUB_OAUTH_AUTHORIZE_URL}?${params.toString()}`;

    if (mobileRedirectUri) {
      const stateWithRedirect = encrypt(
        JSON.stringify({ userId, redirectUri: mobileRedirectUri }),
      );
      params.set("state", stateWithRedirect);
      const urlWithRedirect = `${GITHUB_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
      res.redirect(urlWithRedirect);
      return;
    }

    res.redirect(url);
  } catch (error) {
    const statusCode = (error as any).statusCode || 500;
    const message =
      error instanceof Error ? error.message : String(error);
    res.status(statusCode).json({ error: message, status: statusCode });
  }
});

router.get("/auth/callback", async (req: Request, res: Response) => {
  let mobileRedirectUri: string | null = null;

  try {
    const { code, state, error: oauthError } = req.query as Record<
      string,
      string
    >;

    if (oauthError) {
      logger.error("GitHub OAuth error", { error: oauthError });
      res.redirect(buildAuthRedirect(null, { success: "false", error: oauthError }));
      return;
    }

    if (!code || !state) {
      res.redirect(buildAuthRedirect(null, { success: "false", error: "missing_code_or_state" }));
      return;
    }

    let userId: string;
    try {
      const decrypted = decrypt(state);
      try {
        const parsed = JSON.parse(decrypted) as {
          userId: string;
          redirectUri: string;
        };
        userId = parsed.userId;
        mobileRedirectUri = parsed.redirectUri;
      } catch {
        userId = decrypted;
      }
    } catch {
      logger.error("Failed to decrypt OAuth state");
      res.redirect(buildAuthRedirect(mobileRedirectUri, { success: "false", error: "invalid_state" }));
      return;
    }

    const tokenResponse = await fetch(GITHUB_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      logger.error("GitHub token exchange failed", {
        status: tokenResponse.status,
        body: text,
      });
      res.redirect(buildAuthRedirect(mobileRedirectUri, { success: "false", error: "token_exchange_failed" }));
      return;
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
      scope?: string;
    };

    if (tokenData.error || !tokenData.access_token) {
      logger.error("GitHub token response error", {
        error: tokenData.error,
        description: tokenData.error_description,
      });
      res.redirect(
        buildAuthRedirect(mobileRedirectUri, {
          success: "false",
          error: tokenData.error || "no_access_token",
        }),
      );
      return;
    }

    const ghUser = await getAuthenticatedUser(tokenData.access_token);
    await upsertGithubToken(
      userId,
      tokenData.access_token,
      ghUser.login,
      tokenData.scope || GITHUB_SCOPE,
    );

    logger.info("GitHub account connected", {
      userId,
      username: ghUser.login,
    });

    res.redirect(
      buildAuthRedirect(mobileRedirectUri, {
        success: "true",
        username: ghUser.login,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    logger.error("GitHub OAuth callback failed", { error: message });
    res.redirect(
      buildAuthRedirect(mobileRedirectUri, {
        success: "false",
        error: message,
      }),
    );
  }
});

router.get("/repos", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req);
    const token = await getDecryptedGithubToken(userId);
    const repos = await getUserRepos(token);
    res.json({ repos });
  } catch (error) {
    const statusCode = (error as any).statusCode || 502;
    const message =
      error instanceof Error ? error.message : String(error);
    res.status(statusCode).json({ error: message, status: statusCode });
  }
});

router.get("/repos/:owner/:repo/pulls", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req);
    const { owner, repo } = req.params;
    const state = (req.query.state as string) || "open";

    if (!["open", "closed", "all"].includes(state)) {
      res.status(400).json({
        error: "state must be open, closed, or all",
        status: 400,
      });
      return;
    }

    const token = await getDecryptedGithubToken(userId);
    const pulls = await getRepoPRs(
      token,
      owner,
      repo,
      state as "open" | "closed" | "all",
    );
    res.json({ pulls });
  } catch (error) {
    const statusCode = (error as any).statusCode || 502;
    const message =
      error instanceof Error ? error.message : String(error);
    res.status(statusCode).json({ error: message, status: statusCode });
  }
});

router.get(
  "/repos/:owner/:repo/pulls/:pr_id",
  async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      const { owner, repo, pr_id } = req.params;
      const pullNumber = parseInt(pr_id, 10);

      if (isNaN(pullNumber)) {
        res.status(400).json({ error: "Invalid PR number", status: 400 });
        return;
      }

      const token = await getDecryptedGithubToken(userId);
      const pull = await getPRDetails(token, owner, repo, pullNumber);
      res.json({ pull });
    } catch (error) {
      const statusCode = (error as any).statusCode || 502;
      const message =
        error instanceof Error ? error.message : String(error);
      res.status(statusCode).json({ error: message, status: statusCode });
    }
  },
);

router.post(
  "/repos/:owner/:repo/pulls/:pr_id/review",
  async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      const { owner, repo, pr_id } = req.params;
      const pullNumber = parseInt(pr_id, 10);
      const { body, event } = req.body as {
        body: string;
        event: string;
      };

      if (isNaN(pullNumber)) {
        res.status(400).json({ error: "Invalid PR number", status: 400 });
        return;
      }

      if (!body || typeof body !== "string") {
        res
          .status(400)
          .json({ error: "body is required", status: 400 });
        return;
      }

      if (
        !event ||
        !["APPROVE", "REQUEST_CHANGES", "COMMENT"].includes(event)
      ) {
        res.status(400).json({
          error:
            "event must be APPROVE, REQUEST_CHANGES, or COMMENT",
          status: 400,
        });
        return;
      }

      const token = await getDecryptedGithubToken(userId);
      const review = await submitPRReview(
        token,
        owner,
        repo,
        pullNumber,
        body,
        event as "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
      );
      res.status(201).json({ review });
    } catch (error) {
      const statusCode = (error as any).statusCode || 502;
      const message =
        error instanceof Error ? error.message : String(error);
      res.status(statusCode).json({ error: message, status: statusCode });
    }
  },
);

export { router as githubRouter };
