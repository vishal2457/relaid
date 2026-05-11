import { ClaudeProviderRuntime } from "@relaid/claude-provider";

type JSONRPCID = number | string | null;

interface JSONRPCRequest {
  jsonrpc?: string;
  id?: JSONRPCID;
  method?: string;
  params?: any;
}

interface JSONRPCResponse {
  jsonrpc: "2.0";
  id?: JSONRPCID;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

const protocolVersion = 1;
const claude = new ClaudeProviderRuntime();

function send(response: JSONRPCResponse) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function sendResult(id: JSONRPCID, result: unknown) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id: JSONRPCID, code: number, message: string) {
  send({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

function notify(method: string, params: unknown) {
  send({
    jsonrpc: "2.0",
    method,
    params,
  });
}

function log(message: string) {
  process.stderr.write(`${message}\n`);
}

async function handleRequest(request: JSONRPCRequest) {
  if (request.jsonrpc !== "2.0" || !request.method) {
    sendError(request.id ?? null, -32600, "Invalid request");
    return;
  }

  try {
    switch (request.method) {
      case "initialize": {
        sendResult(request.id ?? null, {
          protocolVersion,
          name: "relaid-node-bridge",
          transport: "stdio",
        });
        return;
      }
      case "health/check": {
        sendResult(request.id ?? null, {
          ok: true,
          pid: process.pid,
          uptimeSeconds: Math.floor(process.uptime()),
        });
        return;
      }
      case "bridge/shutdown": {
        sendResult(request.id ?? null, { ok: true });
        setImmediate(() => process.exit(0));
        return;
      }
      case "claude/projects/list": {
        sendResult(
          request.id ?? null,
          await claude.listProjects(asStringArray(request.params?.directories)),
        );
        return;
      }
      case "claude/projects/get": {
        sendResult(
          request.id ?? null,
          await claude.getProject(asString(request.params?.directory)),
        );
        return;
      }
      case "claude/projects/fileSearch": {
        sendResult(
          request.id ?? null,
          await claude.searchFiles(
            asString(request.params?.root),
            asString(request.params?.query),
            asNumber(request.params?.limit),
          ),
        );
        return;
      }
      case "claude/providers/list": {
        sendResult(
          request.id ?? null,
          await claude.listProviders(asString(request.params?.cwd)),
        );
        return;
      }
      case "claude/agents/list": {
        sendResult(
          request.id ?? null,
          await claude.listAgents(asString(request.params?.cwd)),
        );
        return;
      }
      case "claude/apps/list": {
        sendResult(
          request.id ?? null,
          await claude.listApps(asString(request.params?.cwd)),
        );
        return;
      }
      case "claude/sessions/list": {
        sendResult(
          request.id ?? null,
          await claude.listSessions(
            asString(request.params?.cwd),
            asNumber(request.params?.limit),
            asNumber(request.params?.offset),
          ),
        );
        return;
      }
      case "claude/sessions/get": {
        sendResult(
          request.id ?? null,
          await claude.getSession(
            asString(request.params?.cwd),
            asString(request.params?.sessionId),
          ),
        );
        return;
      }
      case "claude/sessions/create": {
        sendResult(
          request.id ?? null,
          claude.createSession(
            asString(request.params?.cwd),
            asOptionalString(request.params?.sessionId),
          ),
        );
        return;
      }
      case "claude/sessions/messages": {
        sendResult(
          request.id ?? null,
          await claude.getSessionMessages(
            asString(request.params?.cwd),
            asString(request.params?.sessionId),
            asNumber(request.params?.limit),
          ),
        );
        return;
      }
      case "claude/sessions/run": {
        sendResult(
          request.id ?? null,
          await claude.runSession(
            {
              requestId: asString(request.params?.requestId),
              cwd: asString(request.params?.cwd),
              sessionId: asOptionalString(request.params?.sessionId),
              prompt: asString(request.params?.prompt),
              agent: asOptionalString(request.params?.agent),
              systemPrompt: asOptionalString(request.params?.systemPrompt),
              model: asOptionalString(request.params?.model),
              permissionMode: asOptionalString(request.params?.permissionMode) as
                | undefined
                | "default"
                | "acceptEdits"
                | "bypassPermissions"
                | "plan"
                | "dontAsk"
                | "auto",
            },
            ({ method, params }) => notify(method, params),
          ),
        );
        return;
      }
      case "claude/sessions/abort": {
        sendResult(
          request.id ?? null,
          await claude.abortSession(asString(request.params?.sessionId)),
        );
        return;
      }
      case "claude/permission/respond": {
        sendResult(
          request.id ?? null,
          claude.respondToPermission({
            requestId: asString(request.params?.requestId),
            behavior: asString(request.params?.behavior) === "allow" ? "allow" : "deny",
            message: asOptionalString(request.params?.message),
          }),
        );
        return;
      }
      default: {
        sendError(request.id ?? null, -32601, `Method not found: ${request.method}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown bridge error";
    sendError(request.id ?? null, -32000, message);
  }
}

function main() {
  log("bridge starting");
  process.stdin.setEncoding("utf8");

  let buffer = "";
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;

    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline === -1) {
        break;
      }

      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) {
        continue;
      }

      try {
        const request = JSON.parse(line) as JSONRPCRequest;
        void handleRequest(request);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to parse request";
        sendError(null, -32700, message);
      }
    }
  });

  process.stdin.on("end", () => {
    log("bridge stdin ended");
    process.exit(0);
  });
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

main();
