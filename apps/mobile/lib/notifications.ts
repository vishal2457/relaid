import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { AppState, AppStateStatus } from "react-native";

const isNotificationsEnabled =
  process.env.EXPO_PUBLIC_NOTIFICATIONS_ENABLED !== "false" && __DEV__ !== true;

if (isNotificationsEnabled) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

let isAppForeground = true;

AppState.addEventListener("change", (state: AppStateStatus) => {
  isAppForeground = state === "active";
});

export function isAppInForeground(): boolean {
  return isAppForeground;
}

export async function requestNotificationPermissions(): Promise<boolean> {
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
