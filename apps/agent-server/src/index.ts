import { createServer } from "./server/http-server.js";
import { isStoreLoaded, waitForSave } from "./server/store.js";

interface ParsedArgs {
  port: number;
  host: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  let port = 3090;
  let host = "127.0.0.1";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if ((arg === "--port" || arg === "-p") && argv[i + 1]) {
      const p = Number(argv[i + 1]);
      if (!Number.isNaN(p) && p > 0 && p < 65536) {
        port = p;
      }
      i++;
    }
    if ((arg === "--host" || arg === "-h") && argv[i + 1]) {
      host = argv[i + 1]!;
      i++;
    }
  }

  return { port, host };
}

async function main() {
  await isStoreLoaded();
  console.log(`Store: ${process.env.WORKBENCH_STORE_PATH || "~/.agent-workbench/store.json"}`);

  const { port, host } = parseArgs(process.argv.slice(2));
  const { app } = createServer();

  const server = app.listen(port, host, () => {
    console.log(`Agent server running at http://${host}:${port}`);
    console.log(`SSE endpoint: http://${host}:${port}/api/sse/stream`);
    console.log(`Health check: http://${host}:${port}/health`);
  });

  process.on("SIGINT", async () => {
    console.log("\nShutting down, saving store...");
    await waitForSave();
    server.close(() => process.exit(0));
  });
  process.on("SIGTERM", async () => {
    console.log("Shutting down, saving store...");
    await waitForSave();
    server.close(() => process.exit(0));
  });
}

main();
