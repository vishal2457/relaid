import pg from "pg";
const { Pool } = pg;
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import * as githubSchema from "./github-schema";

const schemaWithGithub = {
  ...schema,
  githubTokens: githubSchema.githubTokens,
};

type Pool = pg.Pool;

let db: ReturnType<typeof drizzle<typeof schemaWithGithub>> | null = null;
let dbPool: Pool | null = null;

export function getDb() {
  if (db) {
    return db;
  }

  const databaseUrl = process.env.DATABASE_URL || "postgres://localhost:5432/relay";

  console.log("Database URL:", databaseUrl);

  dbPool = new Pool({
    connectionString: databaseUrl,
  });

  db = drizzle(dbPool, { schema: schemaWithGithub });

  return db;
}

export type { User, NewUser } from "./schema";
export type { LocalServer, NewLocalServer } from "./schema";
export type { ExpoPushToken, NewExpoPushToken } from "./schema";
export type { MobileDevice, NewMobileDevice } from "./schema";
export type { PairingSession, NewPairingSession } from "./schema";
export type { GithubToken, NewGithubToken } from "./github-schema";

export { users, localServers, mobileDevices, pairingSessions, expoPushTokens } from "./schema";
export { githubTokens } from "./github-schema";