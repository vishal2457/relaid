import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import path from "path";
import fs from "fs";
import os from "os";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let dbClient: ReturnType<typeof createClient> | null = null;
let githubSchemaReady: Promise<void> | null = null;

async function ensureGithubTokensTable(
  client: ReturnType<typeof createClient>,
): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS github_tokens (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      encrypted_token TEXT NOT NULL,
      github_username TEXT NOT NULL,
      scope TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
}

export function ensureGithubSchema(): Promise<void> {
  if (!dbClient) {
    getDb();
  }

  if (!dbClient) {
    throw new Error("Database client is not initialized");
  }

  if (!githubSchemaReady) {
    githubSchemaReady = ensureGithubTokensTable(dbClient);
  }

  return githubSchemaReady;
}

export function getDb() {
  if (db) {
    return db;
  }

  const dbPath = process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.join(os.homedir(), "maximus-chat-data", "chat-server.db");

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbClient = createClient({ url: `file:${dbPath}` });
  db = drizzle(dbClient, { schema });

  return db;
}

export * from "./schema";
