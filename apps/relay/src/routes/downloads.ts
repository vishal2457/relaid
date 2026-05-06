import { Router, type Request, type Response } from "express";
import { logger } from "../shared/logger";

const router: Router = Router();

type DownloadTarget =
  | "android"
  | "mac-silicon"
  | "mac-intel"
  | "linux"
  | "windows";

type GithubReleaseAsset = {
  id: number;
  name: string;
  size: number;
  content_type: string | null;
  url: string;
};

type GithubRelease = {
  tag_name: string;
  assets: GithubReleaseAsset[];
};

type ReleaseCheckResponse = {
  currentVersion: string;
  latestVersion: string;
  releaseTag: string;
  target: DownloadTarget;
  fileName: string;
  downloadUrl: string;
  isUpdateAvailable: boolean;
};

type CachedBuild = {
  filename: string;
  contentType: string;
  buffer: Buffer;
  releaseTag: string;
};

const cachedBuilds = new Map<DownloadTarget, CachedBuild>();
const pendingDownloads = new Map<DownloadTarget, Promise<CachedBuild>>();

const targetMatchers: Record<DownloadTarget, RegExp[]> = {
  android: [/\.apk$/i, /android/i],
  "mac-silicon": [/darwin-arm64/i, /mac.*(arm64|silicon|apple)/i],
  "mac-intel": [/darwin-amd64/i, /mac.*(amd64|x64|intel)/i],
  linux: [/linux-amd64/i, /linux/i],
  windows: [/(windows|win32|win)-?(amd64|x64)?/i, /\.exe$/i],
};

function getGithubToken(): string {
  return (
    process.env.GITHUB_RELEASE_TOKEN ||
    process.env.RELAY_GITHUB_RELEASE_TOKEN ||
    process.env.GITHUB_TOKEN ||
    ""
  );
}

function getGithubRepository(): { owner: string; repo: string } {
  const repository =
    process.env.GITHUB_RELEASE_REPOSITORY ||
    process.env.RELAY_GITHUB_RELEASE_REPOSITORY ||
    process.env.GITHUB_REPOSITORY ||
    "vishal2457/relaid";
  const [owner, repo] = repository.split("/");

  if (!owner || !repo) {
    throw Object.assign(
      new Error("GITHUB_RELEASE_REPOSITORY must use owner/repo format"),
      { statusCode: 500 },
    );
  }

  return { owner, repo };
}

function parseTarget(value: string | undefined): DownloadTarget | null {
  if (
    value === "android" ||
    value === "mac-silicon" ||
    value === "mac-intel" ||
    value === "linux" ||
    value === "windows"
  ) {
    return value;
  }

  return null;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveBaseUrl(req: Request): string {
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

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, "");
}

function parseVersion(value: string): number[] {
  return normalizeVersion(value)
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

function compareVersions(a: string, b: string): number {
  const aParts = parseVersion(a);
  const bParts = parseVersion(b);
  const length = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < length; index += 1) {
    const aPart = aParts[index] ?? 0;
    const bPart = bParts[index] ?? 0;

    if (aPart > bPart) {
      return 1;
    }
    if (aPart < bPart) {
      return -1;
    }
  }

  return 0;
}

function findAssetForTarget(
  release: GithubRelease,
  target: DownloadTarget,
): GithubReleaseAsset | null {
  const matchers = targetMatchers[target];

  return (
    release.assets.find((asset) =>
      matchers.some((matcher) => matcher.test(asset.name)),
    ) ?? null
  );
}

async function fetchGithubJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "relaid-relay",
    },
  });

  if (!response.ok) {
    throw Object.assign(
      new Error(`GitHub request failed with status ${response.status}`),
      { statusCode: response.status },
    );
  }

  return response.json() as Promise<T>;
}

async function downloadGithubAsset(
  asset: GithubReleaseAsset,
  token: string,
): Promise<Buffer> {
  const response = await fetch(asset.url, {
    headers: {
      Accept: "application/octet-stream",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "relaid-relay",
    },
  });

  if (!response.ok) {
    throw Object.assign(
      new Error(`GitHub asset download failed with status ${response.status}`),
      { statusCode: response.status },
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

async function fetchLatestBuild(target: DownloadTarget): Promise<CachedBuild> {
  const token = getGithubToken();
  if (!token) {
    throw Object.assign(new Error("GITHUB_RELEASE_TOKEN is not configured"), {
      statusCode: 500,
    });
  }

  const { owner, repo } = getGithubRepository();
  const release = await fetchGithubJson<GithubRelease>(
    `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
    token,
  );
  const asset = findAssetForTarget(release, target);

  if (!asset) {
    throw Object.assign(
      new Error(`No latest release asset found for ${target}`),
      { statusCode: 404 },
    );
  }

  const buffer = await downloadGithubAsset(asset, token);
  const cachedBuild: CachedBuild = {
    filename: asset.name,
    contentType: asset.content_type || "application/octet-stream",
    buffer,
    releaseTag: release.tag_name,
  };

  cachedBuilds.set(target, cachedBuild);
  logger.info("Cached latest GitHub release build", {
    target,
    filename: asset.name,
    size: buffer.length,
    releaseTag: release.tag_name,
  });

  return cachedBuild;
}

async function getBuild(target: DownloadTarget): Promise<CachedBuild> {
  const cachedBuild = cachedBuilds.get(target);
  if (cachedBuild) {
    return cachedBuild;
  }

  const pendingDownload = pendingDownloads.get(target);
  if (pendingDownload) {
    return pendingDownload;
  }

  const download = fetchLatestBuild(target).finally(() => {
    pendingDownloads.delete(target);
  });
  pendingDownloads.set(target, download);
  return download;
}

function sendBuild(res: Response, build: CachedBuild): void {
  res.setHeader("Content-Type", build.contentType);
  res.setHeader("Content-Length", build.buffer.length);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${build.filename.replaceAll('"', "'")}"`,
  );
  res.setHeader("X-Release-Tag", build.releaseTag);
  res.send(build.buffer);
}

router.get("/check", async (req: Request, res: Response) => {
  const target = parseTarget(
    typeof req.query.target === "string" ? req.query.target : undefined,
  );
  const currentVersion =
    typeof req.query.currentVersion === "string"
      ? req.query.currentVersion
      : "";

  if (!target) {
    res.status(400).json({
      error:
        "Invalid download target. Use android, mac-silicon, mac-intel, linux, or windows.",
    });
    return;
  }

  if (!currentVersion.trim()) {
    res.status(400).json({
      error: "currentVersion query parameter is required.",
    });
    return;
  }

  try {
    const token = getGithubToken();
    if (!token) {
      throw Object.assign(new Error("GITHUB_RELEASE_TOKEN is not configured"), {
        statusCode: 500,
      });
    }

    const { owner, repo } = getGithubRepository();
    const release = await fetchGithubJson<GithubRelease>(
      `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
      token,
    );
    const asset = findAssetForTarget(release, target);

    if (!asset) {
      throw Object.assign(
        new Error(`No latest release asset found for ${target}`),
        { statusCode: 404 },
      );
    }

    const latestVersion = normalizeVersion(release.tag_name);
    const normalizedCurrentVersion = normalizeVersion(currentVersion);
    const payload: ReleaseCheckResponse = {
      currentVersion: normalizedCurrentVersion,
      latestVersion,
      releaseTag: release.tag_name,
      target,
      fileName: asset.name,
      downloadUrl: `${resolveBaseUrl(req)}/api/downloads/latest/${target}`,
      isUpdateAvailable:
        compareVersions(latestVersion, normalizedCurrentVersion) > 0,
    };

    res.json(payload);
  } catch (error) {
    const statusCode =
      error instanceof Error && "statusCode" in error
        ? Number((error as Error & { statusCode: number }).statusCode)
        : 500;
    const message = error instanceof Error ? error.message : String(error);

    logger.error("Failed to check latest GitHub release version", {
      target,
      error: message,
    });
    res.status(Number.isFinite(statusCode) ? statusCode : 500).json({
      error: message,
    });
  }
});

router.get("/latest/:target", async (req: Request, res: Response) => {
  const target = parseTarget(req.params.target);

  if (!target) {
    res.status(400).json({
      error:
        "Invalid download target. Use android, mac-silicon, mac-intel, linux, or windows.",
    });
    return;
  }

  try {
    const build = await getBuild(target);
    sendBuild(res, build);
  } catch (error) {
    const statusCode =
      error instanceof Error && "statusCode" in error
        ? Number((error as Error & { statusCode: number }).statusCode)
        : 500;
    const message = error instanceof Error ? error.message : String(error);

    logger.error("Failed to serve latest GitHub release build", {
      target,
      error: message,
    });
    res.status(Number.isFinite(statusCode) ? statusCode : 500).json({
      error: message,
    });
  }
});

export { router as downloadsRouter };
