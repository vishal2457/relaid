import { Socket } from "socket.io";
import { logger } from "../shared/logger";

const REQUEST_TIMEOUT_MS =
  Number(process.env.SOCKET_REQUEST_TIMEOUT_MS) || 30000;

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  refreshTimeout: () => void;
};

const localServerSockets = new Map<string, Socket>();
const pendingRequests = new Map<string, PendingRequest>();

function getPendingRequestKey(
  responseEvent: string,
  requestId: string,
): string {
  return `${responseEvent}:${requestId}`;
}

export function registerLocalServerSocket(
  serverId: string,
  socket: Socket,
): void {
  localServerSockets.set(serverId, socket);
}

export function unregisterLocalServerSocket(
  serverId: string,
  socketId?: string,
): void {
  const existingSocket = localServerSockets.get(serverId);
  if (!existingSocket) {
    return;
  }

  if (socketId && existingSocket.id !== socketId) {
    return;
  }

  localServerSockets.delete(serverId);
}

export function getLocalServerSocket(serverId: string): Socket | undefined {
  return localServerSockets.get(serverId);
}

export async function emitRequestToServer<TResponse>(
  serverId: string,
  requestEvent: string,
  responseEvent: string,
  payload: { requestId: string } & Record<string, unknown>,
): Promise<TResponse> {
  const socket = localServerSockets.get(serverId);

  if (!socket) {
    throw new Error(`Local server ${serverId} is not connected`);
  }

  const pendingKey = getPendingRequestKey(responseEvent, payload.requestId);

  return new Promise<TResponse>((resolve, reject) => {
    const onTimeout = () => {
      pendingRequests.delete(pendingKey);
      reject(
        new Error(
          `Timed out waiting for ${responseEvent} from local server ${serverId}`,
        ),
      );
    };

    let timeout = setTimeout(onTimeout, REQUEST_TIMEOUT_MS);
    const refreshTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(onTimeout, REQUEST_TIMEOUT_MS);
    };

    pendingRequests.set(pendingKey, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value as TResponse);
      },
      reject: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
      timeout,
      refreshTimeout,
    });

    socket.emit(requestEvent, payload);
  });
}

export function resolvePendingRequest(
  responseEvent: string,
  payload: { requestId?: string } & Record<string, unknown>,
): boolean {
  if (!payload.requestId) {
    return false;
  }

  const pendingKey = getPendingRequestKey(responseEvent, payload.requestId);
  const pendingRequest = pendingRequests.get(pendingKey);

  if (!pendingRequest) {
    return false;
  }

  pendingRequests.delete(pendingKey);
  clearTimeout(pendingRequest.timeout);
  pendingRequest.resolve(payload);
  return true;
}

export function refreshPendingRequest(
  responseEvent: string,
  requestId: string | undefined,
): boolean {
  if (!requestId) {
    return false;
  }

  const pendingKey = getPendingRequestKey(responseEvent, requestId);
  const pendingRequest = pendingRequests.get(pendingKey);

  if (!pendingRequest) {
    return false;
  }

  pendingRequest.refreshTimeout();
  return true;
}

export function rejectPendingRequest(payload: {
  requestId?: string;
  code?: string;
  message?: string;
}): boolean {
  if (!payload.requestId) {
    return false;
  }

  let rejected = false;

  for (const [pendingKey, pendingRequest] of pendingRequests.entries()) {
    if (!pendingKey.endsWith(`:${payload.requestId}`)) {
      continue;
    }

    pendingRequests.delete(pendingKey);
    clearTimeout(pendingRequest.timeout);
    pendingRequest.reject(
      new Error(
        payload.message || payload.code || "Local server request failed",
      ),
    );
    rejected = true;
  }

  if (rejected) {
    logger.warn("Rejected pending local-server request", {
      requestId: payload.requestId,
      code: payload.code,
      message: payload.message,
    });
  }

  return rejected;
}
