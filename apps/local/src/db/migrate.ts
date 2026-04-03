import { createClient } from "@libsql/client";
import path from "path";
import fs from "fs";
import os from "os";
import { logger } from "../shared/logger";

const MIGRATIONS_TABLE = "__drizzle_migrations";

function getDbPath(): string {
  return process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.join(os.homedir(), "maximus-bot-data", "maximus.db");
}

function getMigrationsFolder(): string {
  return path.join(__dirname, "..", "..", "drizzle");
}

export async function runMigrations(): Promise<void> {
  const dbPath = getDbPath();
  const migrationsFolder = getMigrationsFolder();

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const client = createClient({ url: `file:${dbPath}` });

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )
  `);

  const appliedResult = await client.execute(
    `SELECT hash FROM ${MIGRATIONS_TABLE} ORDER BY created_at`,
  );
  const appliedMigrations = appliedResult.rows.map(
    (row) => (row as unknown as { hash: string }).hash,
  );

  const files = fs
    .readdirSync(migrationsFolder)
    .filter((f) => f.endsWith(".sql"));
  files.sort();

  for (const file of files) {
    const filePath = path.join(migrationsFolder, file);
    const sql = fs.readFileSync(filePath, "utf-8");
    const hash = sql.trim();

    if (!appliedMigrations.includes(hash)) {
      logger.info(`Running migration: ${file}`);

      try {
        await client.executeMultiple(sql);
        await client.execute({
          sql: `INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)`,
          args: [hash, Date.now()],
        });
        logger.info(`Migration completed: ${file}`);
      } catch (error) {
        logger.error(`Migration failed: ${file}`, { error });
        throw error;
      }
    }
  }

  logger.info("All migrations completed");
}
