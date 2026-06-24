import assert from "node:assert/strict";
import test from "node:test";
import { isInterruptedRun, selectAgentForTicket } from "./scheduling.js";
import { parseBoardDecision, parseTicketPlan } from "./scheduler.js";
import { DEFAULT_BOARD_STEPS } from "./workflow-constants.js";

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

test("orchestrator board decisions preserve step and agent assignments", () => {
  const [action] = parseBoardDecision(JSON.stringify({ actions: [{
    action: "move", ticketId: "ticket-1", targetStepId: "review", agentId: "reviewer",
    agentName: "", provider: "codex", model: "gpt-5", reason: "Implementation completed",
  }] }));
  assert.equal(action?.targetStepId, "review");
  assert.equal(action?.agentId, "reviewer");
});

test("orchestrator board decisions accept fenced JSON with common action aliases", () => {
  const [action] = parseBoardDecision(`Only one ticket is runnable.\n\n\`\`\`json
  {"actions":[{"action":"dispatch","ticketId":"ticket-1","agentId":null,"agentName":"Worker","provider":"opencode","model":"model","instructions":"Start implementation"}]}
  \`\`\``);
  assert.equal(action?.action, "run");
  assert.equal(action?.targetStepId, "");
  assert.equal(action?.agentId, "");
  assert.equal(action?.reason, "Start implementation");
});

test("orchestrator board decisions infer run from an agent assignment", () => {
  const [action] = parseBoardDecision(JSON.stringify({ actions: [{
    ticketId: "ticket-1", targetStepId: "implementation", agentId: null,
    agentName: "Worker", agentProvider: "opencode", agentModel: "model", reason: "Ready",
  }] }));
  assert.equal(action?.action, "run");
  assert.equal(action?.provider, "opencode");
  assert.equal(action?.model, "model");
});

test("orchestrator board decisions normalize a moves wrapper", () => {
  const [action] = parseBoardDecision(`\`\`\`json
  {"moves":[{"ticketId":"ticket-1","fromStepId":"implementation","toStepId":"implementation","stepStatus":"in_progress","agentId":"worker-1"}],"reasoning":"Ready to start"}
  \`\`\``);
  assert.equal(action?.action, "run");
  assert.equal(action?.ticketId, "ticket-1");
  assert.equal(action?.agentId, "worker-1");
  assert.equal(action?.reason, "Ready to start");
});

test("default workflow follows the software delivery lifecycle", () => {
  assert.deepEqual(DEFAULT_BOARD_STEPS.map((step) => step.id), ["implementation", "review", "verification", "done"]);
  assert.deepEqual(DEFAULT_BOARD_STEPS.map((step) => step.allowedNextStepIds), [["review"], ["verification"], ["done"], []]);
  assert.equal(DEFAULT_BOARD_STEPS.at(-1)?.isTerminal, true);
});
