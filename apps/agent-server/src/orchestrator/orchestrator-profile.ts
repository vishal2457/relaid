import type { AgentProfile } from "../models/domain.js";
import { getModelCatalog } from "../harnesses/model-catalog.js";
import { getStore, markDirty, now } from "../server/store.js";

export function ensureOrchestrator(): AgentProfile {
  const store = getStore();
  const managers = [...store.agents.values()].filter((agent) => agent.role === "manager")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let orchestrator = managers[0];
  if (!orchestrator) {
    const timestamp = now();
    orchestrator = {
      id: "orchestrator", name: "Orchestrator", role: "manager", provider: "codex",
      model: getModelCatalog().codex.models[0] || "gpt-5.3-codex",
      systemPrompt: "You are the sole engineering orchestrator. Break goals into dependency-aware tickets, delegate work, enforce strict TDD, review results, and complete the goal only after verification.",
      permissionMode: "plan", enabled: true, createdAt: timestamp, updatedAt: timestamp,
    };
    store.agents.set(orchestrator.id, orchestrator);
  }
  for (const duplicate of managers.slice(1)) duplicate.role = "worker";
  for (const goal of store.goals.values()) goal.managerAgentId = orchestrator.id;
  markDirty();
  return orchestrator;
}
