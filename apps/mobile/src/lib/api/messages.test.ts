import {
  adaptMessage,
  adaptStreamActivity,
  type SessionAssistantActivity,
} from "./messages";
import type { SessionMessageResponse } from "../opencode-types";
import { getAssistantResponseSummaryContext } from "@/src/components/Message/getAssistantResponseSummary";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

function createAssistantMessageResponse(parts: any[]): SessionMessageResponse {
  return {
    info: {
      id: "assistant-1",
      sessionID: "session-1",
      role: "assistant",
      time: {
        created: 1000,
        completed: 2000,
      },
      parentID: "user-1",
      modelID: "gpt-test",
      providerID: "openai",
      mode: "chat",
      path: {
        cwd: "/repo",
        root: "/repo",
      },
      cost: 0,
      tokens: {
        input: 1,
        output: 1,
        reasoning: 1,
        cache: {
          read: 0,
          write: 0,
        },
      },
    },
    parts,
  };
}

function createUserMessageResponse(summary?: {
  title?: string;
  body?: string;
  diffs: Array<{
    file: string;
    before: string;
    after: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;
}): SessionMessageResponse {
  return {
    info: {
      id: "user-1",
      sessionID: "session-1",
      role: "user",
      time: {
        created: 500,
      },
      summary,
      agent: "test-agent",
      model: {
        providerID: "openai",
        modelID: "gpt-test",
      },
    },
    parts: [],
  };
}

function completedState<T extends Record<string, unknown>>(state: T) {
  return state as any;
}

function getActivityByKind(
  activities: SessionAssistantActivity[] | undefined,
  kind: SessionAssistantActivity["kind"],
) {
  return activities?.find((activity) => activity.kind === kind);
}

function testOpenCodeEdit() {
  const message = adaptMessage(
    createAssistantMessageResponse([
      {
        id: "tool-edit-1",
        callID: "call-edit-1",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "tool",
        tool: "edit",
        state: completedState({
          status: "completed",
          input: {
            filePath: "src/example.ts",
            old_string: "const a = 1;",
            new_string: "const a = 2;",
          },
          metadata: {
            additions: 1,
            deletions: 1,
          },
        }),
      },
    ]),
  );

  const edit = getActivityByKind(message.assistant?.activities, "edit");
  assert(edit, "Expected OpenCode edit activity");
  assertEqual(edit.filename, "example.ts", "OpenCode filename");
  assertEqual(edit.additions, 1, "OpenCode additions");
  assertEqual(edit.deletions, 1, "OpenCode deletions");
  assertEqual(edit.oldContent, "const a = 1;", "OpenCode old content");
  assertEqual(edit.newContent, "const a = 2;", "OpenCode new content");
}

function testCodexShell() {
  const message = adaptMessage(
    createAssistantMessageResponse([
      {
        id: "tool-shell-1",
        callID: "call-shell-1",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "tool",
        tool: "shell",
        state: completedState({
          status: "completed",
          title: "pnpm check-types",
          input: {
            command: "pnpm check-types",
            cwd: "/repo/apps/mobile",
          },
          output: "done",
          metadata: {
            codexType: "commandExecution",
            exitCode: 0,
            durationMs: 245,
          },
        }),
      },
    ]),
  );

  const shell = getActivityByKind(message.assistant?.activities, "shell");
  assert(shell, "Expected Codex shell activity");
  assert(
    shell.detail?.includes("pnpm check-types"),
    "Codex shell should include command detail",
  );
  assert(
    shell.detail?.includes("/repo/apps/mobile"),
    "Codex shell should include cwd detail",
  );
}

function testOpenCodeWrite() {
  const message = adaptMessage(
    createAssistantMessageResponse([
      {
        id: "tool-write-1",
        callID: "call-write-1",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "tool",
        tool: "write",
        state: completedState({
          status: "completed",
          input: {
            filePath: "src/new-file.ts",
            content: "export const value = 1;\n",
          },
          metadata: {
            additions: 1,
            deletions: 0,
          },
        }),
      },
    ]),
  );

  const write = getActivityByKind(message.assistant?.activities, "write");
  assert(write, "Expected OpenCode write activity");
  assertEqual(write.filename, "new-file.ts", "OpenCode write filename");
  assertEqual(write.additions, 1, "OpenCode write additions");
  assertEqual(write.deletions, 0, "OpenCode write deletions");
  assertEqual(
    write.newContent,
    "export const value = 1;\n",
    "OpenCode write content",
  );
}

function testOpenCodeReadSearchDoNotProduceDiffActivity() {
  const message = adaptMessage(
    createAssistantMessageResponse([
      {
        id: "tool-read-1",
        callID: "call-read-1",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "tool",
        tool: "read",
        state: completedState({
          status: "completed",
          input: {
            path: "src/example.ts",
          },
        }),
      },
      {
        id: "tool-grep-1",
        callID: "call-grep-1",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "tool",
        tool: "grep",
        state: completedState({
          status: "completed",
          input: {
            pattern: "value",
          },
        }),
      },
    ]),
  );

  const fileChangeActivities = (message.assistant?.activities ?? []).filter(
    (activity) => activity.kind === "edit" || activity.kind === "write",
  );
  assertEqual(
    fileChangeActivities.length,
    0,
    "Read/search tools should not produce file-change activities",
  );
}

function testCodexSingleFileChange() {
  const message = adaptMessage(
    createAssistantMessageResponse([
      {
        id: "tool-file-change-1",
        callID: "call-file-change-1",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "tool",
        tool: "edit",
        state: completedState({
          status: "completed",
          input: {
            changes: [
              {
                path: "apps/mobile/src/foo.ts",
                diff: "@@ -1 +1 @@\n-const a = 1;\n+const a = 2;",
                before: "const a = 1;",
                after: "const a = 2;",
                kind: {
                  type: "update",
                  move_path: null,
                },
              },
            ],
          },
          metadata: {
            codexType: "fileChange",
          },
        }),
      },
    ]),
  );

  const edit = getActivityByKind(message.assistant?.activities, "edit");
  assert(edit, "Expected Codex edit activity");
  assertEqual(edit.filename, "foo.ts", "Codex single-file filename");
  assertEqual(edit.additions, 1, "Codex single-file additions");
  assertEqual(edit.deletions, 1, "Codex single-file deletions");
  assertEqual(
    Array.isArray(edit.items),
    false,
    "Codex single-file edit should not create duplicate child diffs",
  );
  assertEqual(edit.oldContent, "const a = 1;", "Codex single-file old content");
  assertEqual(edit.newContent, "const a = 2;", "Codex single-file new content");
  assert(edit.patch?.includes("+const a = 2;"), "Codex single-file patch");
}

function testCodexMultiFileChange() {
  const message = adaptMessage(
    createAssistantMessageResponse([
      {
        id: "tool-file-change-2",
        callID: "call-file-change-2",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "tool",
        tool: "edit",
        state: completedState({
          status: "completed",
          input: {
            changes: [
              {
                path: "src/a.ts",
                diff: "@@ -1 +1 @@\n-oldA\n+newA",
                before: "oldA",
                after: "newA",
                kind: {
                  type: "update",
                  move_path: null,
                },
              },
              {
                path: "src/b.ts",
                diff: "@@ -1 +1 @@\n-oldB\n+newB",
                before: "oldB",
                after: "newB",
                kind: {
                  type: "update",
                  move_path: null,
                },
              },
            ],
          },
          metadata: {
            codexType: "fileChange",
          },
        }),
      },
    ]),
  );

  const edit = getActivityByKind(message.assistant?.activities, "edit");
  assert(edit, "Expected multi-file Codex edit activity");
  assertEqual(edit.filename, null, "Multi-file edit should not collapse to one filename");
  assertEqual(edit.additions, 2, "Multi-file additions should aggregate");
  assertEqual(edit.deletions, 2, "Multi-file deletions should aggregate");
  assertEqual(edit.items?.length, 2, "Multi-file edit should expose per-file items");
  assertEqual(edit.items?.[0]?.filename ?? null, "a.ts", "First per-file item");
  assertEqual(edit.items?.[1]?.filename ?? null, "b.ts", "Second per-file item");
  assertEqual(edit.items?.[0]?.directory ?? null, null, "Codex multi-file rows should not show full paths");
}

function testOrdering() {
  const message = adaptMessage(
    createAssistantMessageResponse([
      {
        id: "text-1",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "text",
        text: "Before tool. ",
      },
      {
        id: "tool-read-1",
        callID: "call-read-1",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "tool",
        tool: "read",
        state: completedState({
          status: "completed",
          input: {
            path: "src/one.ts",
          },
        }),
      },
      {
        id: "tool-grep-1",
        callID: "call-grep-1",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "tool",
        tool: "grep",
        state: completedState({
          status: "completed",
          input: {
            pattern: "foo",
          },
        }),
      },
      {
        id: "tool-shell-2",
        callID: "call-shell-2",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "tool",
        tool: "shell",
        state: completedState({
          status: "completed",
          input: {
            command: "git status",
          },
        }),
      },
      {
        id: "text-2",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "text",
        text: "After first tool. ",
      },
      {
        id: "tool-read-2",
        callID: "call-read-2",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "tool",
        tool: "read",
        state: completedState({
          status: "completed",
          input: {
            path: "src/two.ts",
          },
        }),
      },
    ]),
  );

  const activities = message.assistant?.activities ?? [];
  const blocks = message.assistant?.blocks ?? [];
  assertEqual(activities.length, 3, "Ordering should preserve contiguous grouping");
  assertEqual(activities[0]?.kind, "explored", "First activity should be explored");
  assertEqual(activities[1]?.kind, "shell", "Second activity should be shell");
  assertEqual(activities[2]?.kind, "explored", "Third activity should restart explored block");
  assertEqual(blocks.length, 5, "Blocks should preserve text/tool interleaving");
  assertEqual(blocks[0]?.type, "text", "First block should be text");
  assertEqual(blocks[1]?.type, "tool", "Second block should be tool");
  assertEqual(blocks[2]?.type, "text", "Third block should be text");
  assertEqual(blocks[3]?.type, "tool", "Fourth block should be tool");
  assertEqual(blocks[4]?.type, "tool", "Fifth block should be tool");
}

function testStreamJsonTool() {
  const activity = adaptStreamActivity(
    "tool",
    JSON.stringify({
      id: "tool-stream-json",
      type: "tool",
      tool: "edit",
      state: completedState({
        status: "completed",
        input: {
          changes: [
            {
              path: "src/live.ts",
              diff: "@@ -1 +1 @@\n-old\n+new",
              before: "old",
              after: "new",
            },
          ],
        },
      }),
    }),
  );

  assert(activity, "Expected stream JSON tool activity");
  assertEqual(activity.kind, "edit", "Stream JSON tool kind");
  assertEqual(activity.filename, "live.ts", "Stream JSON filename");
}

function testStreamCodexEditText() {
  const activity = adaptStreamActivity("tool", "Editing files");
  assert(activity, "Expected inferred stream edit activity");
  assertEqual(activity.kind, "edit", "Inferred stream edit kind");
  assertEqual(activity.label, "Edit", "Inferred stream edit label");
}

function testStreamFallback() {
  const activity = adaptStreamActivity("tool", "Some custom tool");
  assert(activity, "Expected fallback stream tool activity");
  assertEqual(activity.kind, "tool", "Fallback stream kind");
  assertEqual(activity.label, "Tool", "Fallback stream label");
}

function testDiffSummaryRequiresFileChangeActivity() {
  const user = adaptMessage(
    createUserMessageResponse({
      diffs: [
        {
          file: "src/example.ts",
          before: "old",
          after: "new",
          additions: 1,
          deletions: 1,
        },
      ],
    }),
  );
  const assistant = adaptMessage(
    createAssistantMessageResponse([
      {
        id: "tool-shell-1",
        callID: "call-shell-1",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "tool",
        tool: "shell",
        state: completedState({
          status: "completed",
          input: {
            command: "git status",
          },
          metadata: {
            codexType: "commandExecution",
          },
        }),
      },
    ]),
  );

  const context = getAssistantResponseSummaryContext([user, assistant], 1);
  assertEqual(
    context,
    undefined,
    "Non-file-change assistant segments should not inherit diff summaries",
  );
}

function testTextOnlySummaryStillAttachesWithoutFileDiffs() {
  const user = adaptMessage(
    createUserMessageResponse({
      title: "Summary",
      body: "Read files and prepared a response.",
      diffs: [],
    }),
  );
  const assistant = adaptMessage(
    createAssistantMessageResponse([
      {
        id: "tool-read-1",
        callID: "call-read-1",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "tool",
        tool: "read",
        state: completedState({
          status: "completed",
          input: {
            path: "src/example.ts",
          },
        }),
      },
    ]),
  );

  const context = getAssistantResponseSummaryContext([user, assistant], 1);
  assert(context, "Text-only summaries should still attach");
  assertEqual(context.summary.title, "Summary", "Text-only summary title");
}

function testZeroCountPlaceholderDoesNotCountAsFileChange() {
  const user = adaptMessage(
    createUserMessageResponse({
      diffs: [
        {
          file: "src/example.ts",
          before: "old",
          after: "new",
          additions: 1,
          deletions: 1,
        },
      ],
    }),
  );
  const assistant = adaptMessage(
    createAssistantMessageResponse([
      {
        id: "tool-edit-1",
        callID: "call-edit-1",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "tool",
        tool: "edit",
        state: completedState({
          status: "completed",
          input: {
            filePath: "src/example.ts",
          },
          metadata: {
            additions: 0,
            deletions: 0,
          },
        }),
      },
    ]),
  );

  const edit = getActivityByKind(assistant.assistant?.activities, "edit");
  assert(edit, "Expected placeholder edit activity");
  assertEqual(edit.additions, 0, "Placeholder additions");
  assertEqual(edit.deletions, 0, "Placeholder deletions");

  const context = getAssistantResponseSummaryContext([user, assistant], 1);
  assertEqual(
    context,
    undefined,
    "Zero-count placeholder edits should not trigger diff summaries",
  );
}

function testDiffSummaryMovesToFinalAssistantMessage() {
  const user = adaptMessage(
    createUserMessageResponse({
      diffs: [
        {
          file: "src/example.ts",
          before: "old",
          after: "new",
          additions: 1,
          deletions: 1,
        },
      ],
    }),
  );
  const editAssistant = adaptMessage(
    createAssistantMessageResponse([
      {
        id: "tool-edit-1",
        callID: "call-edit-1",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "tool",
        tool: "edit",
        state: completedState({
          status: "completed",
          input: {
            filePath: "src/example.ts",
            old_string: "old",
            new_string: "new",
          },
          metadata: {
            additions: 1,
            deletions: 1,
          },
        }),
      },
    ]),
  );
  const readAssistant = adaptMessage(
    createAssistantMessageResponse([
      {
        id: "tool-read-1",
        callID: "call-read-1",
        messageID: "assistant-1",
        sessionID: "session-1",
        type: "tool",
        tool: "read",
        state: completedState({
          status: "completed",
          input: {
            path: "src/example.ts",
          },
        }),
      },
    ]),
  );

  const messages = [user, editAssistant, readAssistant];
  const editContext = getAssistantResponseSummaryContext(messages, 1);
  const readContext = getAssistantResponseSummaryContext(messages, 2);

  assertEqual(
    editContext,
    undefined,
    "Intermediate edit message should not receive diff summary",
  );
  assert(readContext, "Final assistant message should receive diff summary");
  assertEqual(
    readContext.summary.diffs.length,
    1,
    "Final assistant message should carry the end-of-response diff summary",
  );
}

function run() {
  testOpenCodeEdit();
  testOpenCodeWrite();
  testOpenCodeReadSearchDoNotProduceDiffActivity();
  testCodexShell();
  testCodexSingleFileChange();
  testCodexMultiFileChange();
  testOrdering();
  testStreamJsonTool();
  testStreamCodexEditText();
  testStreamFallback();
  testDiffSummaryRequiresFileChangeActivity();
  testTextOnlySummaryStillAttachesWithoutFileDiffs();
  testZeroCountPlaceholderDoesNotCountAsFileChange();
  testDiffSummaryMovesToFinalAssistantMessage();
  console.log("messages.test.ts passed");
}

run();
