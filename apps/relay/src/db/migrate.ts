import pg from "pg";
const { Pool } = pg;
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";

const databaseUrl = process.env.DATABASE_URL || "postgres://localhost:5432/relay";

const pool = new Pool({
  connectionString: databaseUrl,
});

const db = drizzle(pool);

const migrationsFolder = path.resolve(process.cwd(), "drizzle");

export async function runMigrations() {
  try {
    await migrate(db, { migrationsFolder });
    console.log("Database migrations applied");
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