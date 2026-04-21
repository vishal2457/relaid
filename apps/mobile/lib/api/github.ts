import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import baseApi, { chatServerApiUrl } from "../axios/base";
import { getCurrentPairingSession } from "../pairing/session";

const GITHUB_SESSION_KEY = "GITHUB_SESSION";

WebBrowser.maybeCompleteAuthSession();

export type GithubSession = {
  username: string;
};

export type GithubStatusResponse = {
  connected: boolean;
  username: string | null;
};

let currentGithubSession: GithubSession | null = null;

export function getCurrentGithubSession(): GithubSession | null {
  return currentGithubSession;
}

export async function loadStoredGithubSession(): Promise<GithubSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(GITHUB_SESSION_KEY);
    if (!raw) {
      currentGithubSession = null;
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as GithubSession).username !== "string"
    ) {
      currentGithubSession = null;
      await SecureStore.deleteItemAsync(GITHUB_SESSION_KEY);
      return null;
    }
    currentGithubSession = parsed as GithubSession;
    return currentGithubSession;
  } catch {
    currentGithubSession = null;
    return null;
  }
}

export async function saveGithubSession(session: GithubSession): Promise<void> {
  currentGithubSession = session;
  await SecureStore.setItemAsync(GITHUB_SESSION_KEY, JSON.stringify(session));
}

export async function clearGithubSession(): Promise<void> {
  currentGithubSession = null;
  await SecureStore.deleteItemAsync(GITHUB_SESSION_KEY);
}

export async function checkGithubStatus(): Promise<GithubStatusResponse> {
  const response = await baseApi.get<GithubStatusResponse>("/github/status", {
    timeout: 8000,
  });
  const status = response.data;

  if (status.connected && status.username) {
    const session: GithubSession = { username: status.username };
    await saveGithubSession(session);
    return status;
  }

  await clearGithubSession();
  return { connected: false, username: null };
}

export async function disconnectGithub(): Promise<void> {
  if (getCurrentPairingSession()) {
    await baseApi.delete("/github/session", { timeout: 8000 });
  }

  await clearGithubSession();
}

export async function startGithubOAuth(): Promise<GithubSession | null> {
  const baseUrl = chatServerApiUrl.replace(/\/+$/, "");
  const redirectUrl = Linking.createURL("auth");
  const session = getCurrentPairingSession();
  const userId = session?.serverId;

  if (!userId) {
    throw new Error("Device must be paired before connecting GitHub");
  }

  const authUrl = `${baseUrl}/api/github/auth?redirect_uri=${encodeURIComponent(redirectUrl)}${userId ? `&x_user_id=${encodeURIComponent(userId)}` : ""}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

  WebBrowser.dismissBrowser();

  if (result.type !== "success" || !result.url) {
    return null;
  }

  const { queryParams } = Linking.parse(result.url);
  const success =
    typeof queryParams?.success === "string" ? queryParams.success : null;
  const username =
    typeof queryParams?.username === "string" ? queryParams.username : null;
  const error =
    typeof queryParams?.error === "string" ? queryParams.error : null;

  if (success !== "true" || !username) {
    throw new Error(error || "GitHub authentication failed");
  }

  const githubSession: GithubSession = { username };
  await saveGithubSession(githubSession);
  return githubSession;
}
