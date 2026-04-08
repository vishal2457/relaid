import { logger } from "../shared/logger";

const PENDING_PERMISSION_EXPIRY_MS = 120_000;

type BufferedInteraction = {
  userId: string;
  event: string;
  payload: Record<string, unknown>;
  expiresAt: number;
};

const pendingInteractions = new Map<string, BufferedInteraction>();

export function bufferInteraction(
  userId: string,
  event: string,
  payload: { requestId: string } & Record<string, unknown>,
): void {
  pendingInteractions.set(payload.requestId, {
    userId,
    event,
    payload,
    expiresAt: Date.now() + PENDING_PERMISSION_EXPIRY_MS,
  });
}

export function clearBufferedInteraction(requestId: string): void {
  pendingInteractions.delete(requestId);
}

export function deliverBufferedInteractions(
  userId: string,
  emit: (event: string, payload: Record<string, unknown>) => void,
): void {
  const now = Date.now();
  let delivered = 0;

  for (const [requestId, entry] of pendingInteractions) {
    if (entry.expiresAt <= now) {
      pendingInteractions.delete(requestId);
      continue;
    }
    if (entry.userId !== userId) {
      continue;
    }
    emit(entry.event, entry.payload);
    delivered++;
  }

  if (delivered > 0) {
    logger.info("Delivered buffered interactions", {
      count: delivered,
    });
  }
}
