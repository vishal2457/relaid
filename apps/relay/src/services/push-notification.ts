import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { expoPushTokens } from "../db/schema";
import { logger } from "../shared/logger";

interface ExpoPushMessage {
  to: string;
  sound?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  categoryId?: string;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

export async function savePushToken(
  userId: string,
  token: string,
  platform: string,
): Promise<void> {
  const db = getDb();
  const now = new Date();

  const [existing] = await db
    .select()
    .from(expoPushTokens)
    .where(eq(expoPushTokens.token, token))
    .limit(1);

  if (existing) {
    await db
      .update(expoPushTokens)
      .set({
        userId,
        token,
        platform,
        updatedAt: now,
      })
      .where(eq(expoPushTokens.id, existing.id));

    logger.info("Updated push token for scope", { userId, platform });
  } else {
    await db.insert(expoPushTokens).values({
      id: `token_${Date.now()}`,
      userId,
      token,
      platform,
      createdAt: now,
      updatedAt: now,
    });

    logger.info("Saved new push token for scope", { userId, platform });
  }
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  options?: {
    categoryId?: string;
  },
): Promise<void> {
  const db = getDb();

  const tokens = await db
    .select()
    .from(expoPushTokens)
    .where(eq(expoPushTokens.userId, userId));

  if (tokens.length === 0) {
    logger.debug("No push tokens found for scope", { userId });
    return;
  }

  const messages: ExpoPushMessage[] = tokens.map((t) => ({
    to: t.token,
    sound: "default",
    title,
    body,
    data,
    categoryId: options?.categoryId,
  }));

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const raw: unknown = await response.json();
    const tickets: ExpoPushTicket[] =
      raw !== null &&
      typeof raw === "object" &&
      "data" in raw &&
      Array.isArray((raw as { data: unknown }).data)
        ? (raw as { data: ExpoPushTicket[] }).data
        : [raw as ExpoPushTicket];

    for (const ticket of tickets) {
      if (ticket.status === "error") {
        logger.error("Push notification failed", {
          userId,
          error: ticket.message,
          details: ticket.details,
        });

        if (ticket.details?.error === "DeviceNotRegistered") {
          await db
            .delete(expoPushTokens)
            .where(eq(expoPushTokens.userId, userId));
          logger.info("Removed invalid push token for scope", { userId });
        }
      } else {
        logger.info("Push notification sent", {
          userId,
          ticketId: ticket.id,
        });
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to send push notification", {
      userId,
      error: errMsg,
    });
  }
}
