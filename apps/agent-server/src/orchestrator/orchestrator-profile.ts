import type { AgentProfile } from "../models/domain.js";
import { getModelCatalog } from "../harnesses/model-catalog.js";
import { getStore, markDirty, now } from "../server/store.js";
import { DEFAULT_ORCHESTRATOR_SYSTEM_PROMPT, DEFAULT_PLANNING_AGENT_SYSTEM_PROMPT } from "./workflow-constants.js";

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
      systemPrompt: DEFAULT_ORCHESTRATOR_SYSTEM_PROMPT,
      permissionMode: "plan", enabled: true, createdAt: timestamp, updatedAt: timestamp,
    };
    store.agents.set(orchestrator.id, orchestrator);
  }
  for (const duplicate of managers.slice(1)) duplicate.role = "worker";
  for (const goal of store.goals.values()) goal.managerAgentId = orchestrator.id;
  markDirty();
  return orchestrator;
}

export function ensurePlanningAgent(): AgentProfile {
  const store = getStore();
  const planners = [...store.agents.values()].filter((agent) => agent.role === "planner")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let planner = planners[0];
  if (!planner) {
    const orchestrator = ensureOrchestrator();
    const timestamp = now();
    planner = {
      ...orchestrator,
      id: "planning-agent",
      name: "Planning Agent",
      role: "planner",
      systemPrompt: DEFAULT_PLANNING_AGENT_SYSTEM_PROMPT,
      permissionMode: "plan",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    store.agents.set(planner.id, planner);
  }
  for (const duplicate of planners.slice(1)) duplicate.role = "worker";
  for (const goal of store.goals.values()) goal.plannerAgentId = planner.id;
  markDirty();
  return planner;
}
