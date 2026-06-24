import type { Response } from "express";
import type { SsePayload } from "../events/event-types.js";

type SseClient = {
  res: Response;
  connectionId: string;
};

type SseEnvelope = {
  id: string;
  event: string;
  payload: Record<string, unknown>;
};

const clients: SseClient[] = [];
const recentEvents: SseEnvelope[] = [];
let eventSequence = 0;
let connectionIdCounter = 0;
const MAX_BUFFERED_EVENTS = 200;

function nextEventId(): string {
  eventSequence += 1;
  return String(eventSequence);
}

function encodeSseMessage(envelope: SseEnvelope): string {
  const data = JSON.stringify(envelope.payload);
  return `id: ${envelope.id}\nevent: ${envelope.event}\ndata: ${data}\n\n`;
}

function rememberEvent(envelope: SseEnvelope): void {
  recentEvents.push(envelope);
  if (recentEvents.length > MAX_BUFFERED_EVENTS) {
    recentEvents.splice(0, recentEvents.length - MAX_BUFFERED_EVENTS);
  }
}

export function addSseClient(res: Response): string {
  const connectionId = `sse_${++connectionIdCounter}_${Date.now()}`;
  clients.push({ res, connectionId });
  return connectionId;
}

export function removeSseClient(connectionId: string): void {
  const index = clients.findIndex((c) => c.connectionId === connectionId);
  if (index !== -1) {
    clients.splice(index, 1);
  }
}

export function broadcast(payload: SsePayload): void {
  const event = `${payload.provider}:${payload.type}`;
  const envelope: SseEnvelope = {
    id: nextEventId(),
    event,
    payload: payload.data as unknown as Record<string, unknown>,
  };
  broadcastEnvelope(envelope);
}

export function broadcastRaw(event: string, payload: Record<string, unknown>): void {
  const envelope: SseEnvelope = {
    id: nextEventId(),
    event,
    payload,
  };
  broadcastEnvelope(envelope);
}

function broadcastEnvelope(envelope: SseEnvelope): void {
  rememberEvent(envelope);
  const message = encodeSseMessage(envelope);
  for (let i = clients.length - 1; i >= 0; i--) {
    const client = clients[i]!;
    if (client.res.writableEnded || client.res.destroyed) {
      clients.splice(i, 1);
      continue;
    }
    try {
      client.res.write(message);
    } catch {
      clients.splice(i, 1);
    }
  }
}

export function sendHeartbeat(): void {
  const message = ": heartbeat\n\n";
  for (let i = clients.length - 1; i >= 0; i--) {
    const client = clients[i]!;
    if (client.res.writableEnded || client.res.destroyed) {
      clients.splice(i, 1);
      continue;
    }
    try {
      client.res.write(message);
    } catch {
      clients.splice(i, 1);
    }
  }
}

export function replayMissedEvents(
  lastEventId: string | null,
  write: (event: string, payload: Record<string, unknown>, id: string) => void,
): void {
  if (!lastEventId) return;
  const lastSeen = Number.parseInt(lastEventId, 10);
  if (!Number.isFinite(lastSeen)) return;

  for (const event of recentEvents) {
    const eventId = Number.parseInt(event.id, 10);
    if (!Number.isFinite(eventId) || eventId <= lastSeen) continue;
    write(event.event, event.payload, event.id);
  }
}
