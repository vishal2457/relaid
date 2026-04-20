import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import baseApi from "../axios/base";
import { chatServerApiUrl } from "../axios/base";

const GITHUB_SESSION_KEY = "GITHUB_SESSION";

export type GithubSession = {
  username: string;
};

export type GithubStatusResponse = {
  connected: boolean;
  username: string | null;
};

export type GithubReposResponse = {
  repos: Array<{
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
    private: boolean;
    html_url: string;
    description: string | null;
    updated_at: string;
  }>;
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
  try {
    const response = await baseApi.get<GithubReposResponse>("/github/repos", {
      timeout: 8000,
    });
    const username = currentGithubSession?.username ?? null;
    return { connected: true, username };
  } catch {
    return { connected: false, username: null };
  }
}

export async function startGithubOAuth(): Promise<GithubSession | null> {
  const baseUrl = chatServerApiUrl.replace(/\/+$/, "");
  const redirectUrl = Linking.createURL("auth");
  const authUrl = `${baseUrl}/api/github/auth?redirect_uri=${encodeURIComponent(redirectUrl)}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

  WebBrowser.dismissBrowser();

  if (result.type !== "success" || !result.url) {
    return null;
  }

  const url = new URL(result.url);
  const success = url.searchParams.get("success");
  const username = url.searchParams.get("username");
  const error = url.searchParams.get("error");

  if (success !== "true" || !username) {
    throw new Error(error || "GitHub authentication failed");
  }

  const session: GithubSession = { username };
  await saveGithubSession(session);
  return session;
}
