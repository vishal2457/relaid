import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { AppState, AppStateStatus, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { router } from "expo-router";
import { registerPushToken } from "./sse/manager";
import { getCurrentAccessToken } from "./pairing/session";
import {
  processLastPermissionNotificationResponse,
  registerPermissionNotificationCategories,
} from "./permission-notifications";

const EXPO_PUSH_TOKEN_KEY = "expo_push_token";
const EXPO_PUSH_TOKEN_REGISTERED_KEY = "expo_push_token_registered";
const DEFAULT_ANDROID_NOTIFICATION_CHANNEL_ID = "default";

const isNotificationsEnabled =
  process.env.EXPO_PUBLIC_NOTIFICATIONS_ENABLED !== "false";

let isAppForeground = true;
let initialized = false;
const handledNavigationResponseKeys = new Set<string>();

function getNavigationResponseKey(
  response: Notifications.NotificationResponse,
): string {
  return `${response.notification.request.identifier}:${response.actionIdentifier}`;
}

function getSessionRouteFromNotificationData(data: unknown): {
  projectId: string;
  sessionId: string;
  agentProviderId?: string;
} | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const candidate = data as Record<string, unknown>;
  const projectId = candidate.projectId;
  const sessionId = candidate.sessionId;
  const agentProviderId = candidate.agentProviderId;

  if (typeof projectId !== "string" || typeof sessionId !== "string") {
    return null;
  }

  switch (candidate.type) {
    case "new_message":
    case "permission_request":
    case "question_request":
    case "request_completed":
      return {
        projectId,
        sessionId,
        agentProviderId:
          typeof agentProviderId === "string" && agentProviderId
            ? agentProviderId
            : undefined,
      };
    default:
      return null;
  }
}

function handleNotificationNavigation(
  response: Notifications.NotificationResponse,
): boolean {
  if (
    response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
  ) {
    return false;
  }

  const route = getSessionRouteFromNotificationData(
    response.notification.request.content.data,
  );

  if (!route) {
    return false;
  }

  const responseKey = getNavigationResponseKey(response);
  if (handledNavigationResponseKeys.has(responseKey)) {
    return true;
  }

  handledNavigationResponseKeys.add(responseKey);
  router.push({ pathname: "/", params: route } as any);
  return true;
}

async function processLastNotificationNavigationResponse(): Promise<void> {
  const response = Notifications.getLastNotificationResponse();

  if (!response) {
    return;
  }

  if (handleNotificationNavigation(response)) {
    Notifications.clearLastNotificationResponse();
  }
}

export function initializeNotifications(): void {
  if (initialized || !isNotificationsEnabled) {
    return;
  }
  initialized = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  registerPermissionNotificationCategories().catch((err) => {
    console.error(
      "Failed to register permission notification categories:",
      err,
    );
  });

  processLastNotificationNavigationResponse().catch((err) => {
    console.error("Failed to process last notification navigation response:", err);
  });

  processLastPermissionNotificationResponse().catch((err) => {
    console.error("Failed to process last permission notification response:", err);
  });

  AppState.addEventListener("change", (state: AppStateStatus) => {
    isAppForeground = state === "active";
  });

  Notifications.addNotificationResponseReceivedListener((response) => {
    handleNotificationNavigation(response);
  });
}

async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(
    DEFAULT_ANDROID_NOTIFICATION_CHANNEL_ID,
    {
      name: "Relaid",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2563EB",
    },
  );
}

export function isAppInForeground(): boolean {
  return isAppForeground;
}

export async function requestNotificationPermissions(): Promise<boolean> {
  initializeNotifications();

  if (!isNotificationsEnabled) {
    return false;
  }

  if (!Device.isDevice) {
    return false;
  }

  try {
    await ensureAndroidNotificationChannel();

    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === "granted";
  } catch {
    return false;
  }
}

export async function getExpoPushToken(): Promise<string | null> {
  try {
    const cached = await AsyncStorage.getItem(EXPO_PUSH_TOKEN_KEY);
    if (cached) {
      return cached;
    }

    await ensureAndroidNotificationChannel();

    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;

    if (!projectId) {
      console.error("Missing EAS projectId for Expo push token registration");
      return null;
    }

    const { data: tokenData } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    if (tokenData) {
      await AsyncStorage.setItem(EXPO_PUSH_TOKEN_KEY, tokenData);
      return tokenData;
    }

    return null;
  } catch (error) {
    console.error("Failed to get Expo push token:", error);
    return null;
  }
}

export async function registerPushTokenWithServer(): Promise<boolean> {
  try {
    const accessToken = getCurrentAccessToken();
    if (!accessToken) {
      return false;
    }

    const token = await getExpoPushToken();

    if (!token) {
      return false;
    }

    await registerPushToken({
      token,
      platform: Platform.OS,
    });

    await AsyncStorage.setItem(EXPO_PUSH_TOKEN_REGISTERED_KEY, "true");
    return true;
  } catch (error) {
    console.error("Failed to register push token with server:", error);
    return false;
  }
}

export async function showNewMessageNotification(
  title: string,
  body: string,
  params: {
    projectId: string;
    sessionId: string;
    agentProviderId?: string;
  },
): Promise<void> {
  if (!isNotificationsEnabled) {
    return;
  }

  if (isAppForeground) {
    return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          type: "new_message",
          projectId: params.projectId,
          sessionId: params.sessionId,
          agentProviderId: params.agentProviderId,
        },
        ...(Platform.OS === "android"
          ? { channelId: DEFAULT_ANDROID_NOTIFICATION_CHANNEL_ID }
          : {}),
      },
      trigger: null,
    });
  } catch {
    // silent fail
  }
}
