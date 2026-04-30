import { Router, type Request, type Response } from "express";
import { logger } from "../shared/logger";

const router: Router = Router();

type DownloadTarget = "android" | "mac-silicon" | "mac-intel" | "linux" | "windows";

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
