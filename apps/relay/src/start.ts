import dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("[startup] Running database migrations");
  const { runMigrations } = await import("./db/migrate.js");
  await runMigrations();

  console.log("[startup] Starting relay server");
  await import("./index.js");
}

main().catch((error) => {
  console.error("[startup] Relay failed to start");
  console.error(error);
  process.exit(1);
});
