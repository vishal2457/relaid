import assert from "node:assert/strict";
import test from "node:test";
import type { Ticket } from "../models/domain.js";
import { isInterruptedRun, resolveDependencyStatus, selectAgentForTicket } from "./scheduling.js";
import { parseTicketPlan } from "./scheduler.js";

const ticket = (id: string, dependencyIds: string[] = []): Ticket => ({
  id, projectId: "project", goalId: "goal", title: id, description: "",
  type: "implementation", status: "backlog", priority: "medium",
  acceptanceCriteria: [], technicalNotes: [], relevantFiles: [], dependencyIds,
  blockingTicketIds: [], testPlan: [], verificationCommands: [], retryCount: 0,
  maximumRetries: 1, createdAt: "now", updatedAt: "now",
});

test("dependency resolution blocks a ticket until every dependency completes", () => {
  const dependency = { ...ticket("dep"), status: "in_progress" as const };
  const candidate = ticket("candidate", [dependency.id]);
  const result = resolveDependencyStatus(candidate, new Map([[dependency.id, dependency]]));
  assert.deepEqual(result, { ready: false, blockingTicketIds: ["dep"], invalidDependencyIds: [] });
});

test("dependency resolution allows speculative work while a dependency is in review", () => {
  const dependency = { ...ticket("dep"), status: "review" as const };
  const candidate = ticket("candidate", [dependency.id]);
  const result = resolveDependencyStatus(candidate, new Map([[dependency.id, dependency]]));
  assert.deepEqual(result, { ready: true, blockingTicketIds: [], invalidDependencyIds: [] });
});

test("dependency resolution reports references outside the goal", () => {
  const result = resolveDependencyStatus(ticket("candidate", ["missing"]), new Map());
  assert.deepEqual(result, { ready: false, blockingTicketIds: [], invalidDependencyIds: ["missing"] });
});

test("agent selection skips managers, disabled agents, and busy agents", () => {
  const agents = [
    { id: "manager", role: "manager" as const, enabled: true },
    { id: "disabled", role: "worker" as const, enabled: false },
    { id: "busy", role: "worker" as const, enabled: true },
    { id: "free", role: "worker" as const, enabled: true },
  ];
  assert.equal(selectAgentForTicket(agents, new Set(["busy"]))?.id, "free");
});

test("resume recovery only requeues runs whose harness session disappeared", () => {
  const run = { status: "running" as const, ticketId: "ticket", sessionId: "session" };
  assert.equal(isInterruptedRun(run, new Set(["session"])), false);
  assert.equal(isInterruptedRun(run, new Set()), true);
  assert.equal(isInterruptedRun({ ...run, status: "completed" as const }, new Set()), false);
  assert.equal(isInterruptedRun({ ...run, sessionId: undefined }, new Set(["ticket"])), false);
});

test("orchestrator ticket plans require valid dependency keys", () => {
  const plan = parseTicketPlan(JSON.stringify([{ key: "test", title: "Add test", description: "Prove behavior", type: "test", priority: "high", acceptanceCriteria: ["Fails first"], technicalNotes: [], relevantFiles: [], dependencyKeys: [], testPlan: ["Run focused test"], verificationCommands: ["pnpm test"] }]));
  assert.equal(plan[0]?.key, "test");
  assert.throws(() => parseTicketPlan(JSON.stringify([{ ...plan[0], dependencyKeys: ["missing"] }])), /Invalid dependencies/);
});

test("orchestrator ticket plans accept fenced JSON and a tickets wrapper", () => {
  const item = { key: "test", title: "Add test", description: "Prove behavior", type: "test", priority: "high", acceptanceCriteria: ["Fails first"], technicalNotes: [], relevantFiles: [], dependencyKeys: [], testPlan: ["Run focused test"], verificationCommands: ["pnpm test"] };
  assert.equal(parseTicketPlan(`Here is the plan:\n\`\`\`json\n${JSON.stringify([item])}\n\`\`\``)[0]?.key, "test");
  assert.equal(parseTicketPlan(JSON.stringify({ tickets: [item] }))[0]?.key, "test");
});

test("orchestrator ticket plans normalize common ticket type aliases", () => {
  const item = { key: "app", title: "Build app", description: "Implement behavior", type: "feature", priority: "high", acceptanceCriteria: ["Works"], dependencyKeys: [], testPlan: ["Test it"], verificationCommands: ["pnpm test"] };
  assert.equal(parseTicketPlan(JSON.stringify([item]))[0]?.type, "implementation");
  assert.equal(parseTicketPlan(JSON.stringify([{ ...item, type: "infrastructure" }]))[0]?.type, "integration");
  assert.equal(parseTicketPlan(JSON.stringify([{ ...item, priority: "P0" }]))[0]?.priority, "critical");
});

test("orchestrator ticket plans normalize scalar test instructions", () => {
  const item = { key: "test", title: "Add test", description: "Prove behavior", type: "test", priority: "high", acceptanceCriteria: "Fails first", technicalNotes: "Use renderHook", relevantFiles: "src/test.ts", dependencyKeys: [], testPlan: "Run the focused test", verificationCommands: "pnpm test" };
  const implementation = { ...item, key: "implementation", title: "Implement behavior", dependencyKeys: "test" };
  const plan = parseTicketPlan(JSON.stringify([item, implementation]));
  assert.deepEqual(plan[0]?.acceptanceCriteria, ["Fails first"]);
  assert.deepEqual(plan[0]?.technicalNotes, ["Use renderHook"]);
  assert.deepEqual(plan[0]?.relevantFiles, ["src/test.ts"]);
  assert.deepEqual(plan[0]?.testPlan, ["Run the focused test"]);
  assert.deepEqual(plan[0]?.verificationCommands, ["pnpm test"]);
  assert.deepEqual(plan[1]?.dependencyKeys, ["test"]);
});

test("orchestrator ticket plan errors identify the invalid field", () => {
  assert.throws(() => parseTicketPlan(JSON.stringify([{ key: "broken" }])), /0\.title/);
});

test("orchestrator ticket plans preserve meaningful agent and harness assignments", () => {
  const item = {
    key: "api-review", title: "Review API contract", description: "Check compatibility",
    type: "research", priority: "high", acceptanceCriteria: ["Contract is compatible"],
    dependencyKeys: [], testPlan: ["Inspect contract tests"], verificationCommands: ["pnpm test"],
    agentName: "API Contract Reviewer", provider: "claude", model: "sonnet",
  };
  const [planned] = parseTicketPlan(JSON.stringify([item]));
  assert.equal(planned?.agentName, "API Contract Reviewer");
  assert.equal(planned?.provider, "claude");
  assert.equal(planned?.model, "sonnet");
});
