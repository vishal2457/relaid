import * as Notifications from "expo-notifications";
import { sendPermissionResponse } from "./sse/manager";
import { formatPermissionType } from "../components/PermissionCard";

const PERMISSION_CATEGORY = "PERMISSION_REQUEST";

const ACTION_REJECT = "reject";
const ACTION_ONCE = "once";
const ACTION_ALWAYS = "always";

let categoriesRegistered = false;

export async function registerPermissionNotificationCategories(): Promise<void> {
  if (categoriesRegistered) {
    return;
  }
  categoriesRegistered = true;

  await Notifications.setNotificationCategoryAsync(PERMISSION_CATEGORY, [
    {
      identifier: ACTION_REJECT,
      buttonTitle: "Deny",
      options: {
        destructive: true,
      },
    },
    {
      identifier: ACTION_ONCE,
      buttonTitle: "Once",
      options: {
        foreground: true,
      },
    },
    {
      identifier: ACTION_ALWAYS,
      buttonTitle: "Always",
      options: {
        foreground: true,
      },
    },
  ]);

  Notifications.addNotificationResponseReceivedListener(
    handleNotificationResponse,
  );
}

function handleNotificationResponse(
  response: Notifications.NotificationResponse,
): void {
  const category = response.notification.request.content.categoryIdentifier;

  if (category !== PERMISSION_CATEGORY) {
    return;
  }

  const actionId = response.actionIdentifier as "reject" | "once" | "always";
  const data = response.notification.request.content.data;

  if (!actionId || !data?.requestId || !data?.sessionId) {
    return;
  }

  const reply: "once" | "always" | "reject" =
    actionId === "reject"
      ? "reject"
      : actionId === "always"
        ? "always"
        : "once";

  sendPermissionResponse({
    requestId: data.requestId as string,
    sessionId: data.sessionId as string,
    jobId: (data.jobId as string) || "",
    reply,
  }).catch((error) => {
    console.error("[PermissionNotification] Failed to send response:", error);
  });
}

export async function showPermissionNotification(params: {
  requestId: string;
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
        sessionId,
        jobId,
        permission,
      },
      categoryIdentifier: PERMISSION_CATEGORY,
    },
    trigger: null,
  });
}
