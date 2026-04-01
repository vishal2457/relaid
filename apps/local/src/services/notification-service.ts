import type { JobPlatform } from "../db/job.schema";

export interface NotificationMessage {
  threadId: string;
  content: string;
}

export interface NotificationService {
  notify(threadId: string, message: string): Promise<void>;
  typing(threadId: string): Promise<void>;
  getPlatformType(): JobPlatform;
}

export function createNotificationService(
  platform: JobPlatform,
): NotificationService {
  throw new Error(
    `Notification service for platform '${platform}' is not implemented`,
  );
}
