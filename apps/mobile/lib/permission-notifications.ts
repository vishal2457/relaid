import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { formatPermissionType } from "../src/components/PermissionCard";
import { sendPermissionResponse } from "./sse/manager";

const PERMISSION_CATEGORY = "PERMISSION_REQUEST";
const DEFAULT_ANDROID_NOTIFICATION_CHANNEL_ID = "default";

const ACTION_REJECT = "reject";
const ACTION_ONCE = "once";
const ACTION_ALWAYS = "always";

let categoriesRegistered = false;
const handledResponseKeys = new Set<string>();

function getResponseKey(
  response: Notifications.NotificationResponse,
  reply: "once" | "always" | "reject",
): string {
  return `${response.notification.request.identifier}:${reply}`;
}

async function processPermissionNotificationResponse(
  response: Notifications.NotificationResponse,
): Promise<boolean> {
  const category = response.notification.request.content.categoryIdentifier;

  if (category !== PERMISSION_CATEGORY) {
    return false;
  }

  const actionId = response.actionIdentifier as string;
  const data = response.notification.request.content.data;

  if (
    actionId === Notifications.DEFAULT_ACTION_IDENTIFIER ||
    !data?.requestId ||
    !data?.sessionId
  ) {
    return false;
  }

  const reply =
    actionId === ACTION_REJECT
      ? "reject"
      : actionId === ACTION_ALWAYS
        ? "always"
        : actionId === ACTION_ONCE
          ? "once"
          : null;

  if (!reply) {
    return false;
  }

  const responseKey = getResponseKey(response, reply);

  if (handledResponseKeys.has(responseKey)) {
    return true;
  }

  handledResponseKeys.add(responseKey);

  try {
    await sendPermissionResponse({
      requestId: data.requestId as string,
      sessionId: data.sessionId as string,
      jobId: (data.jobId as string) || "",
      reply,
    });
    return true;
  } catch (error) {
    handledResponseKeys.delete(responseKey);
    console.error("[PermissionNotification] Failed to send response:", error);
    return false;
  }
}

export async function registerPermissionNotificationCategories(): Promise<void> {
  if (categoriesRegistered) {
    return;
  }
  categoriesRegistered = true;

  await Notifications.setNotificationCategoryAsync(PERMISSION_CATEGORY, [
    {
      identifier: ACTION_REJECT,
      buttonTitle: "Reject",
      options: {
        isDestructive: true,
        opensAppToForeground: false,
      },
    },
    {
      identifier: ACTION_ONCE,
      buttonTitle: "Allow Once",
      options: {
        opensAppToForeground: false,
      },
    },
    {
      identifier: ACTION_ALWAYS,
      buttonTitle: "Allow Always",
      options: {
        opensAppToForeground: false,
      },
    },
  ]);

  Notifications.addNotificationResponseReceivedListener((response) => {
    void processPermissionNotificationResponse(response);
  });
}

export async function processLastPermissionNotificationResponse(): Promise<void> {
  const response = Notifications.getLastNotificationResponse();

  if (!response) {
    return;
  }

  const handled = await processPermissionNotificationResponse(response);
  if (handled) {
    Notifications.clearLastNotificationResponse();
  }
}

export async function showPermissionNotification(params: {
  requestId: string;
  projectId: string;
  sessionId: string;
  jobId: string;
  permission: string;
  patterns: string[];
  title?: string;
}): Promise<void> {
  const { requestId, sessionId, jobId, permission, patterns, title } = params;

  const bodyParts: string[] = [];
  if (title) {
    bodyParts.push(title);
  } else if (patterns.length > 0 && patterns[0] !== "*") {
    const maxPatterns = Math.min(patterns.length, 3);
    for (let i = 0; i < maxPatterns; i++) {
      const p = patterns[i];
      bodyParts.push(p.length > 50 ? "..." + p.slice(p.length - 47) : p);
    }
    if (patterns.length > 3) {
      bodyParts.push(`+${patterns.length - 3} more`);
    }
  }

  const body = bodyParts.join("\n") || "Agent needs your approval";

  await Notifications.scheduleNotificationAsync({
    content: {
      title: formatPermissionType(permission),
      body,
      data: {
        type: "permission_request",
        requestId,
        projectId: params.projectId,
        sessionId,
        jobId,
        permission,
      },
      categoryIdentifier: PERMISSION_CATEGORY,
      ...(Platform.OS === "android"
        ? { channelId: DEFAULT_ANDROID_NOTIFICATION_CHANNEL_ID }
        : {}),
    },
    trigger: null,
  });
}
