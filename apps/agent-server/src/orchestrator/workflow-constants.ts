import type { AgentProfile, BoardStep, Goal, Project, Ticket } from "../models/domain.js";

export const DEFAULT_ORCHESTRATOR_SYSTEM_PROMPT =
  "You are the engineering orchestrator. Manage the workflow board only. Never inspect or edit repository files and never implement tickets yourself. Move and block tickets through allowed steps, choose safe parallel work, and delegate every executable step to a worker agent. Complete the goal only when every ticket reaches a terminal step.";

export const DEFAULT_PLANNING_AGENT_SYSTEM_PROMPT =
  "You are the dedicated planning agent. Inspect the goal and repository, then create a complete dependency-aware ticket plan. Do not execute tickets or manage the board.";

export const PLANNING_SYSTEM_INSTRUCTIONS =
  "You are the only planning agent. Inspect the repository without editing it. Produce the complete ticket plan as valid JSON only. You do not manage or execute tickets.";

export const PLANNING_REPAIR_SYSTEM_INSTRUCTIONS =
  "Your response is machine-consumed. Return only JSON matching the supplied schema, with no Markdown or commentary.";

export const ORCHESTRATOR_BOARD_SYSTEM_INSTRUCTIONS =
  "You manage the board only. Never inspect or edit repository files and never execute ticket work yourself. Every executable run or retry must be delegated to a worker agent. Decide safe parallel work, blocking, retries, and worker assignment. Ticket steps advance automatically after a successful worker run. Respect maxAgents and dependencies. Request a new worker by leaving agentId empty and supplying agentName/provider/model; use an existing worker ID only when intentionally reusing it. Return only schema-valid JSON.";

export const ORCHESTRATOR_BOARD_REPAIR_SYSTEM_INSTRUCTIONS =
  "Your response is machine-consumed. Return only JSON matching the supplied schema, with no Markdown, prose, or tool calls. Use action run to dispatch a ready ticket.";

export const DELEGATED_WORKER_SYSTEM_INSTRUCTIONS =
  "You are a worker delegated by the orchestrator. Execute only the assigned ticket and current workflow step. You may inspect and edit repository files and run the required verification commands. Do not manage the board or work on other tickets.";

export const BOARD_STATE_CHANGED_TRIGGER =
  "Board state changed or an agent run completed";

export const ORCHESTRATOR_ANALYSIS_FAILED_MESSAGE =
  "Orchestrator board analysis failed";

export const WORKFLOW_ACTIONS = ["run", "move", "retry", "block", "complete"] as const;

export const WORKFLOW_EVENTS = {
  agentCreated: "agent.created",
  goalCompleted: "goal.completed",
  orchestratorAnalysisStarted: "orchestrator.analysis_started",
  orchestratorAnalysisCompleted: "orchestrator.analysis_completed",
  orchestratorAnalysisFailed: "orchestrator.analysis_failed",
  ticketCompleted: "ticket.completed",
  ticketStepStarted: "ticket.step_started",
  ticketStepCompleted: "ticket.step_completed",
  ticketStepFailed: "ticket.step_failed",
  ticketStepBlocked: "ticket.step_blocked",
  ticketStepChanged: "ticket.step_changed",
} as const;

export const DEFAULT_BOARD_STEPS: Array<Omit<BoardStep, "createdAt" | "updatedAt">> = [
  {
    id: "implementation",
    name: "Implementation",
    instructions: "Implement the ticket using strict TDD. Run the ticket verification commands and summarize the changes.",
    allowedNextStepIds: ["review"],
    allowedPreviousStepIds: [],
    isTerminal: false,
    color: "blue",
    position: 0,
  },
  {
    id: "review",
    name: "Code Review",
    instructions: "Review the implementation against acceptance criteria, architecture, security, maintainability, and test quality. Fix issues and rerun focused checks.",
    allowedNextStepIds: ["verification"],
    allowedPreviousStepIds: ["implementation"],
    isTerminal: false,
    color: "amber",
    position: 1,
  },
  {
    id: "verification",
    name: "QA & Verification",
    instructions: "Run the ticket verification commands, type checks, lint, and relevant integration tests. Fix regressions and report concrete evidence.",
    allowedNextStepIds: ["done"],
    allowedPreviousStepIds: ["review"],
    isTerminal: false,
    color: "amber",
    position: 2,
  },
  {
    id: "done",
    name: "Done",
    instructions: "The ticket has completed every required workflow step.",
    allowedNextStepIds: [],
    allowedPreviousStepIds: ["verification"],
    isTerminal: true,
    color: "green",
    position: 3,
  },
];

export function buildPlanningPrompt(goal: Goal, verification: string): string {
  return `Plan this goal into small dependency-aware tickets. Identify work that can safely progress in parallel, but do not assign agents and do not manage workflow steps; the orchestrator owns those decisions. Every implementation ticket must require a failing test first and every ticket must have concrete verification commands.

Goal: ${goal.title}
${goal.description}

Acceptance criteria:
${goal.acceptanceCriteria.join("\n") || "Infer them from the goal."}

Constraints:
${goal.constraints.join("\n") || "None"}

Project verification commands:
${verification}

Return a JSON object with a tickets array. Each item must contain: key, title, description, type, priority, acceptanceCriteria, technicalNotes, relevantFiles, dependencyKeys, testPlan, verificationCommands. All list fields must be JSON arrays, even when they contain one item. dependencyKeys must reference keys in the same array.`;
}

export function buildPlanningRepairPrompt(goal: Goal, verification: string, validationMessage: string): string {
  return `Regenerate the complete ticket plan for this goal. The previous response failed validation with: ${validationMessage}

Goal: ${goal.title}
${goal.description}

Acceptance criteria:
${goal.acceptanceCriteria.join("\n") || "Infer them from the goal."}

Constraints:
${goal.constraints.join("\n") || "None"}

Project verification commands:
${verification}`;
}

export function buildBoardAnalysisPrompt(board: unknown): string {
  return `Analyze this board and choose the next safe actions.\n\n${JSON.stringify(board, null, 2)}`;
}

export function buildBoardRepairPrompt(board: unknown, validationMessage: string, invalidOutput: string): string {
  return `Regenerate the board actions as valid JSON. The previous response failed validation with: ${validationMessage}\n\nBoard:\n${JSON.stringify(board, null, 2)}\n\nInvalid response:\n${invalidOutput.slice(0, 8000)}`;
}

export function buildTicketPrompt(ticket: Ticket): string {
  return `## Ticket: ${ticket.title}

**Type:** ${ticket.type}
**Priority:** ${ticket.priority}

### Description
${ticket.description}

### Acceptance Criteria
${ticket.acceptanceCriteria.map((criterion, index) => `${index + 1}. ${criterion}`).join("\n")}

### Relevant Files
${ticket.relevantFiles.length > 0 ? ticket.relevantFiles.join("\n") : "Explore the codebase to find relevant files."}

### Test Plan
${ticket.testPlan.length > 0 ? ticket.testPlan.map((step, index) => `${index + 1}. ${step}`).join("\n") : "Write and run tests to verify the changes."}

### Verification Commands
${ticket.verificationCommands.length > 0 ? ticket.verificationCommands.join("\n") : "Run the project test suite."}

### Instructions
1. Follow the current workflow step instructions exactly
2. Make minimal changes; do not refactor unrelated code
3. Do not modify files outside the ticket scope
4. Do not disable existing tests
5. Do not use force git operations
6. Summarize your changes and evidence when done`;
}

export function buildAgentSystemPrompt(goal: Goal, project: Project, profile: AgentProfile): string {
  return `${profile.systemPrompt}

You are an agent working on: ${goal.title}
Project: ${project.name} at ${project.location}
Base branch: ${project.baseBranch}
Goal: ${goal.description}

Project commands:
- Tests: ${project.testCommand || "infer the test command"}
- Lint: ${project.lintCommand || "infer the lint command"}
- Type check: ${project.typeCheckCommand || "infer the type-check command"}

Goal acceptance criteria:
${goal.acceptanceCriteria.map((criterion, index) => `${index + 1}. ${criterion}`).join("\n")}
${goal.technicalInstructions ? `\nTechnical notes:\n${goal.technicalInstructions}` : ""}
${goal.outOfScopeItems.length > 0 ? `\nOut of scope:\n${goal.outOfScopeItems.map((item) => `- ${item}`).join("\n")}` : ""}`;
}

export function buildStepExecutionPrompt(ticket: Ticket, step: BoardStep): string {
  return `${buildTicketPrompt(ticket)}

## Current workflow step: ${step.name}
${step.instructions}

Work only in the context of this step. Report what you completed and any evidence the orchestrator needs for its next board analysis.`;
}
