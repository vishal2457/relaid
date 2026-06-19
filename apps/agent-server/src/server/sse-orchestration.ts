import type { OrchestrationEvent } from "../models/domain.js";

let orchestrationSeq = 0;
const listeners: Array<(event: OrchestrationEvent) => void> = [];

export function onOrchestrationEvent(fn: (event: OrchestrationEvent) => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

export function broadcastOrchestration(event: OrchestrationEvent): void {
  orchestrationSeq++;
  event.sequence = orchestrationSeq;
  for (const fn of listeners) {
    try { fn(event); } catch { /* ignore */ }
  }
}
