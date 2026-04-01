import { defineConfig } from "drizzle-kit";
import path from "path";
import os from "os";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DB_PATH
      ? path.resolve(process.cwd(), process.env.DB_PATH)
      : path.join(os.homedir(), "maximus-chat-data", "chat-server.db"),
  },
});
