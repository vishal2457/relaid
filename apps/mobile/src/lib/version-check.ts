import * as Application from "expo-application";

export interface VersionCheckData {
  latestVersion: string;
  minimumSupportedVersion: string;
  forceUpdate: boolean;
  playStoreUrl: string;
  appStoreUrl?: string;
}

export interface VersionCheckResult {
  isForceUpdateRequired: boolean;
  versionData: VersionCheckData | null;
  currentVersion: string | null;
}

// Numeric semantic version comparison — avoids lexicographic pitfalls like "1.0.10" < "1.0.2"
export function compareVersions(a: string, b: string): number {
  const aParts = a.split(".").map(Number);
  const bParts = b.split(".").map(Number);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function fetchVersionData(): Promise<VersionCheckData> {
  // TODO: Replace with real API call:
  // const response = await fetch('https://api.yourapp.com/app-version');
  // return response.json() as Promise<VersionCheckData>;
  await new Promise<void>((resolve) => setTimeout(resolve, 300));
  return {
    latestVersion: "1.0.5",
    minimumSupportedVersion: "1.0.4",
    forceUpdate: true,
    playStoreUrl:
      "https://play.google.com/store/apps/details?id=com.myapp",
  };
}

export const VersionCheckService = {
  getCurrentVersion(): string | null {
    return Application.nativeApplicationVersion;
  },

  async checkVersion(): Promise<VersionCheckResult> {
    const currentVersion = this.getCurrentVersion();
    const versionData = await fetchVersionData();

    if (!currentVersion) {
      return { isForceUpdateRequired: false, versionData, currentVersion: null };
    }

    const isForceUpdateRequired =
      compareVersions(currentVersion, versionData.minimumSupportedVersion) < 0;

    return { isForceUpdateRequired, versionData, currentVersion };
  },
};
