import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  Project,
  Goal,
  Ticket,
  AgentRun,
  TddEvidence,
  AgentProfile,
} from "../models/domain.js";

interface SerializableStore {
  projects: Record<string, Project>;
  goals: Record<string, Goal>;
  tickets: Record<string, Ticket>;
  agentRuns: Record<string, AgentRun>;
  tddEvidence: Record<string, TddEvidence>;
  agents: Record<string, AgentProfile>;
}

interface Store {
  projects: Map<string, Project>;
  goals: Map<string, Goal>;
  tickets: Map<string, Ticket>;
  agentRuns: Map<string, AgentRun>;
  tddEvidence: Map<string, TddEvidence>;
  agents: Map<string, AgentProfile>;
}

function makeStore(): Store {
  return {
    projects: new Map(),
    goals: new Map(),
    tickets: new Map(),
    agentRuns: new Map(),
    tddEvidence: new Map(),
    agents: new Map(),
  };
}

function toSerializable(store: Store): SerializableStore {
  return {
    projects: Object.fromEntries(store.projects),
    goals: Object.fromEntries(store.goals),
    tickets: Object.fromEntries(store.tickets),
    agentRuns: Object.fromEntries(store.agentRuns),
    tddEvidence: Object.fromEntries(store.tddEvidence),
    agents: Object.fromEntries(store.agents),
  };
}

function fromSerializable(data: SerializableStore): Store {
  return {
    projects: new Map(Object.entries(data.projects)),
    goals: new Map(Object.entries(data.goals)),
    tickets: new Map(Object.entries(data.tickets)),
    agentRuns: new Map(Object.entries(data.agentRuns)),
    tddEvidence: new Map(Object.entries(data.tddEvidence || {})),
    agents: new Map(Object.entries(data.agents || {})),
  };
}

const STORE_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || "/tmp",
  ".agent-workbench",
);
const STORE_FILE = process.env.WORKBENCH_STORE_PATH || path.join(STORE_DIR, "store.json");

const store: Store = makeStore();

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savePromise: Promise<void> | null = null;

async function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (savePromise) return savePromise;

  savePromise = (async () => {
    try {
      await fs.mkdir(STORE_DIR, { recursive: true });
      const tmpFile = `${STORE_FILE}.tmp`;
      const data = JSON.stringify(toSerializable(store), null, 2);
      await fs.writeFile(tmpFile, data, "utf-8");
      await fs.rename(tmpFile, STORE_FILE);
    } catch (err) {
      console.error("Failed to persist store:", err);
    } finally {
      savePromise = null;
    }
  })();

  return savePromise;
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 200);
}

async function loadStore(): Promise<void> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf-8");
    const data = JSON.parse(raw) as SerializableStore;
    if (data.projects) {
      const loaded = fromSerializable(data);
      for (const [k, v] of loaded.projects) store.projects.set(k, v);
      for (const [k, v] of loaded.goals) store.goals.set(k, v);
      for (const [k, v] of loaded.tickets) store.tickets.set(k, v);
      for (const [k, v] of loaded.agentRuns) store.agentRuns.set(k, v);
      for (const [k, v] of loaded.tddEvidence) store.tddEvidence.set(k, v);
      for (const [k, v] of loaded.agents) store.agents.set(k, v);
    }
    console.log(`Store loaded from ${STORE_FILE}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Failed to load store:", err);
    }
  }
}

const loadPromise = loadStore();

export function getStore(): Store {
  return store;
}

export function markDirty(): void {
  scheduleSave();
}

export async function waitForSave(): Promise<void> {
  await flushSave();
}

export function isStoreLoaded(): Promise<void> {
  return loadPromise;
}

export function createId(): string {
  return randomUUID().slice(0, 8);
}

export function now(): string {
  return new Date().toISOString();
}

export function findProject(id: string): Project | undefined {
  return store.projects.get(id);
}

export function findGoal(id: string): Goal | undefined {
  return store.goals.get(id);
}

export function findTicket(id: string): Ticket | undefined {
  return store.tickets.get(id);
}

export function findTicketsByGoal(goalId: string): Ticket[] {
  return [...store.tickets.values()].filter((t) => t.goalId === goalId);
}

export function findAgentRun(id: string): AgentRun | undefined {
  return store.agentRuns.get(id);
}

export function findAgentRunsByGoal(goalId: string): AgentRun[] {
  return [...store.agentRuns.values()].filter((r) => r.goalId === goalId);
}
