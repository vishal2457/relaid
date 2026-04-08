import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { AppState, AppStateStatus, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { registerPushToken } from "./sse/manager";
import { getCurrentAccessToken } from "./pairing/session";

const EXPO_PUSH_TOKEN_KEY = "expo_push_token";
const EXPO_PUSH_TOKEN_REGISTERED_KEY = "expo_push_token_registered";

const isNotificationsEnabled =
  process.env.EXPO_PUBLIC_NOTIFICATIONS_ENABLED !== "false" && __DEV__ !== true;

let isAppForeground = true;
let initialized = false;

function initializeNotifications(): void {
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

  AppState.addEventListener("change", (state: AppStateStatus) => {
    isAppForeground = state === "active";
  });

  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.type === "request_completed") {
      // Navigate or refresh handled by the app
    }
  });
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

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;

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
        data: { type: "new_message" },
      },
      trigger: null,
    });
  } catch {
    // silent fail
  }
}
