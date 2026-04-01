import { and, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db";
import { localServers } from "../db/schema";
import { logger } from "../shared/logger";
import { emitRequestToServer } from "../socket/request-broker";

export class RouteError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "RouteError";
  }
}

export async function getConnectedServersForUser(userId: string) {
  const db = getDb();

  return db
    .select()
    .from(localServers)
    .where(
      and(
        eq(localServers.userId, userId),
        eq(localServers.isConnected, true),
      ),
    );
}

export async function getConnectedServerForUser(
  userId: string,
  serverId?: string,
) {
  const servers = await getConnectedServersForUser(userId);

  if (servers.length === 0) {
    throw new RouteError(503, "No local server connected");
  }

  if (!serverId) {
    return servers[0];
  }

  const matchedServer = servers.find((server) => server.id === serverId);
  if (!matchedServer) {
    throw new RouteError(
      404,
      "Requested local server is not connected for this user",
    );
  }

  return matchedServer;
}

export async function requestServer<TResponse>(
  serverId: string,
  requestEvent: string,
  responseEvent: string,
  payload: Record<string, unknown>,
): Promise<{ requestId: string; response: TResponse }> {
  const requestId = uuidv4();
  const response = await emitRequestToServer<TResponse>(
    serverId,
    requestEvent,
    responseEvent,
    { ...payload, requestId },
  );

  return { requestId, response };
}

export async function requestConnectedServer<TResponse>(
  userId: string,
  requestEvent: string,
  responseEvent: string,
  payload: Record<string, unknown>,
  serverId?: string,
): Promise<{ requestId: string; response: TResponse; serverId: string }> {
  const server = await getConnectedServerForUser(userId, serverId);
  const result = await requestServer<TResponse>(
    server.id,
    requestEvent,
    responseEvent,
    payload,
  );

  return {
    ...result,
    serverId: server.id,
  };
}

export async function requestAllConnectedServers<TResponse>(
  userId: string,
  requestEvent: string,
  responseEvent: string,
  payload: Record<string, unknown>,
): Promise<Array<{ requestId: string; response: TResponse; serverId: string }>> {
  const servers = await getConnectedServersForUser(userId);

  if (servers.length === 0) {
    throw new RouteError(503, "No local server connected");
  }

  const results = await Promise.all(
    servers.map(async (server) => {
      const result = await requestServer<TResponse>(
        server.id,
        requestEvent,
        responseEvent,
        payload,
      );

      return {
        ...result,
        serverId: server.id,
      };
    }),
  );

  return results;
}

export async function requestUntilMatch<TResponse>(
  userId: string,
  requestEvent: string,
  responseEvent: string,
  payload: Record<string, unknown>,
  matches: (response: TResponse) => boolean,
): Promise<{ requestId: string; response: TResponse; serverId: string } | null> {
  const servers = await getConnectedServersForUser(userId);

  if (servers.length === 0) {
    throw new RouteError(503, "No local server connected");
  }

  for (const server of servers) {
    try {
      const result = await requestServer<TResponse>(
        server.id,
        requestEvent,
        responseEvent,
        payload,
      );

      if (matches(result.response)) {
        return {
          ...result,
          serverId: server.id,
        };
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn("Local server request failed while scanning for match", {
        userId,
        serverId: server.id,
        requestEvent,
        responseEvent,
        error: errMsg,
      });
    }
  }

  return null;
}

export function requireUserId(headerValue: unknown): string {
  if (typeof headerValue !== "string" || !headerValue.trim()) {
    throw new RouteError(401, "x-user-id header is required");
  }

  return headerValue;
}
