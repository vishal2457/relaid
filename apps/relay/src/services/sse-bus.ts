import type { Response } from "express";
import { logger } from "../shared/logger";

type SseClient = {
  res: Response;
  userId: string;
  connectionId: string;
};

type SseEnvelope = {
  id: string;
  event: string;
  payload: Record<string, unknown>;
};

const clients = new Map<string, SseClient[]>();
const recentEvents = new Map<string, SseEnvelope[]>();
const eventSequenceByUser = new Map<string, number>();
let connectionIdCounter = 0;
const MAX_BUFFERED_EVENTS_PER_USER = 200;

function getConnections(userId: string): SseClient[] {
  return clients.get(userId) ?? [];
}

function encodeSseMessage(envelope: SseEnvelope): string {
  const data = JSON.stringify(envelope.payload);
  return `id: ${envelope.id}\nevent: ${envelope.event}\ndata: ${data}\n\n`;
}

function writeToClient(client: SseClient, message: string): boolean {
  if (client.res.writableEnded || client.res.destroyed) {
    removeSseClient(client.userId, client.connectionId);
    return false;
  }

  try {
    client.res.write(message);
    return true;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.warn("Failed to write SSE event", {
      userId: client.userId,
      connectionId: client.connectionId,
      error: errMsg,
    });
    removeSseClient(client.userId, client.connectionId);
    return false;
  }
}

function nextEventId(userId: string): string {
  const next = (eventSequenceByUser.get(userId) ?? 0) + 1;
  eventSequenceByUser.set(userId, next);
  return String(next);
}

function rememberEvent(userId: string, envelope: SseEnvelope): void {
  const events = recentEvents.get(userId) ?? [];
  events.push(envelope);

  if (events.length > MAX_BUFFERED_EVENTS_PER_USER) {
    events.splice(0, events.length - MAX_BUFFERED_EVENTS_PER_USER);
  }

  recentEvents.set(userId, events);
}

export function addSseClient(userId: string, res: Response): string {
  const connectionId = `sse_${++connectionIdCounter}_${Date.now()}`;
  const client: SseClient = { res, userId, connectionId };

  const existing = clients.get(userId) ?? [];
  existing.push(client);
  clients.set(userId, existing);

  logger.info("SSE client connected", {
    userId,
    connectionId,
    total: existing.length,
  });
  return connectionId;
}

export function removeSseClient(userId: string, connectionId: string): void {
  const existing = clients.get(userId);
  if (!existing) return;

  const filtered = existing.filter((c) => c.connectionId !== connectionId);
  if (filtered.length === existing.length) {
    return;
  }

  if (filtered.length === 0) {
    clients.delete(userId);
  } else {
    clients.set(userId, filtered);
  }

  logger.info("SSE client disconnected", {
    userId,
    connectionId,
    remaining: filtered.length,
  });
}

export function broadcastToUser(
  userId: string,
  event: string,
  payload: Record<string, unknown>,
): void {
  const connections = getConnections(userId);
  const envelope: SseEnvelope = {
    id: nextEventId(userId),
    event,
    payload,
  };
  rememberEvent(userId, envelope);

  for (const client of connections) {
    writeToClient(client, encodeSseMessage(envelope));
  }
}

export function sendHeartbeat(userId: string): void {
  const connections = getConnections(userId);
  for (const client of connections) {
    writeToClient(client, ": heartbeat\n\n");
  }
}

export function getSseClientCount(userId: string): number {
  return getConnections(userId).length;
}

export function getSseClientsForUser(
  userId: string,
): Array<{ connectionId: string }> {
  const connections = getConnections(userId);
  return connections.map((c) => ({ connectionId: c.connectionId }));
}

export function replayMissedEvents(
  userId: string,
  lastEventId: string | null,
  emit: (event: string, payload: Record<string, unknown>, id: string) => void,
): void {
  if (!lastEventId) {
    return;
  }

  const lastSeen = Number.parseInt(lastEventId, 10);
  if (!Number.isFinite(lastSeen)) {
    logger.warn("Ignoring invalid Last-Event-ID header", {
      userId,
      lastEventId,
    });
    return;
  }

  const events = recentEvents.get(userId) ?? [];
  let replayed = 0;

  for (const event of events) {
    const eventId = Number.parseInt(event.id, 10);
    if (!Number.isFinite(eventId) || eventId <= lastSeen) {
      continue;
    }

    emit(event.event, event.payload, event.id);
    replayed++;
  }

  if (replayed > 0) {
    logger.info("Replayed missed SSE events", {
      userId,
      replayed,
      lastEventId,
    });
  }
}
