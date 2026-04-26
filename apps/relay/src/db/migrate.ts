import pg from "pg";
const { Pool } = pg;
import { drizzle, type PgRemoteDatabase } from "drizzle-orm/pg-proxy";
import path from "path";
import fs from "fs";

const databaseUrl = process.env.DATABASE_URL || "postgres://localhost:5432/relay";

const pool = new Pool({
  connectionString: databaseUrl,
});

const query = async (sql: string, params?: unknown[]) => {
  const result = await pool.query(sql, params);
  return { rows: result.rows };
};

const db = drizzle(query);

const migrationsFolder = path.resolve(process.cwd(), "drizzle");

export async function runMigrations() {
  try {
    const migrationFiles = fs.readdirSync(migrationsFolder).sort();
    for (const file of migrationFiles) {
      if (file.endsWith(".sql")) {
        const sql = fs.readFileSync(path.join(migrationsFolder, file), "utf-8");
        await pool.query(sql);
        console.log(`Applied migration: ${file}`);
      }
    }
    console.log(`Database migrations applied`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations().catch((error) => {
    console.error("Database migration failed");
    console.error(error);
    process.exit(1);
  });
}