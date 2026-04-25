import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import fs from "fs";
import os from "os";
import path from "path";

const dbPath = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(os.homedir(), "maximus-chat-data", "chat-server.db");

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const migrationsFolder = path.resolve(process.cwd(), "drizzle");
const client = createClient({ url: `file:${dbPath}` });
const db = drizzle(client);

async function main() {
  try {
    await migrate(db, { migrationsFolder });
    console.log(`Database migrations applied to ${dbPath}`);
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error("Database migration failed");
  console.error(error);
  process.exit(1);
});
