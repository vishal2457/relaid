import { getDb } from ".";
import { logger } from "../shared/logger";

export async function ensureRuntimeSchema(): Promise<void> {
  const db = getDb();
  const sqlite = db.$client;

  try {
    await sqlite.execute(`
      ALTER TABLE local_servers ADD COLUMN server_secret_hash TEXT;
    `);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (!errMsg.includes("duplicate column name")) {
      logger.error("Failed to ensure local_servers.server_secret_hash", {
        error: errMsg,
      });
    }
  }

  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS mobile_devices (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES local_servers(id),
      name TEXT NOT NULL,
      platform TEXT,
      token_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER,
      revoked_at INTEGER
    );
  `);

  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS pairing_sessions (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES local_servers(id),
      secret_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      claimed_device_id TEXT REFERENCES mobile_devices(id)
    );
  `);

  await sqlite.execute(`
    CREATE INDEX IF NOT EXISTS idx_mobile_devices_server_id
    ON mobile_devices(server_id);
  `);

  await sqlite.execute(`
    CREATE INDEX IF NOT EXISTS idx_mobile_devices_token_hash
    ON mobile_devices(token_hash);
  `);

  await sqlite.execute(`
    CREATE INDEX IF NOT EXISTS idx_pairing_sessions_server_id
    ON pairing_sessions(server_id);
  `);

  logger.info("Ensured runtime auth schema");
}
