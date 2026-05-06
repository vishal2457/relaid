import { router } from "expo-router";

export type SessionInvalidationReason = "unauthorized";

type SessionInvalidationHandler = (
  reason: SessionInvalidationReason,
) => Promise<void> | void;

let handler: SessionInvalidationHandler | null = null;
let invalidationPromise: Promise<void> | null = null;

export function isUnauthorizedStatus(status?: number): boolean {
  return status === 401 || status === 403;
}

export function registerSessionInvalidationHandler(
  nextHandler: SessionInvalidationHandler,
): () => void {
  handler = nextHandler;

  return () => {
    if (handler === nextHandler) {
      handler = null;
    }
  };
}

export async function invalidateSession(
  reason: SessionInvalidationReason = "unauthorized",
): Promise<void> {
  if (invalidationPromise) {
    return invalidationPromise;
  }

  invalidationPromise = (async () => {
    try {
      await handler?.(reason);
    } finally {
      router.replace("/pair");
    }
  })();

  try {
    await invalidationPromise;
  } finally {
    invalidationPromise = null;
  }
}
