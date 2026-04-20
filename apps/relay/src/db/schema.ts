import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const localServers = sqliteTable("local_servers", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  serverSecretHash: text("server_secret_hash"),
  lastConnected: integer("last_connected", { mode: "timestamp" }),
  isConnected: integer("is_connected", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const mobileDevices = sqliteTable("mobile_devices", {
  id: text("id").primaryKey(),
  serverId: text("server_id")
    .notNull()
    .references(() => localServers.id),
  name: text("name").notNull(),
  platform: text("platform"),
  tokenHash: text("token_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
});

export const pairingSessions = sqliteTable("pairing_sessions", {
  id: text("id").primaryKey(),
  serverId: text("server_id")
    .notNull()
    .references(() => localServers.id),
  secretHash: text("secret_hash").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp" }),
  claimedDeviceId: text("claimed_device_id").references(() => mobileDevices.id),
});

export const expoPushTokens = sqliteTable("expo_push_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  token: text("token").notNull(),
  platform: text("platform").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type LocalServer = typeof localServers.$inferSelect;
export type NewLocalServer = typeof localServers.$inferInsert;

export type ExpoPushToken = typeof expoPushTokens.$inferSelect;
export type NewExpoPushToken = typeof expoPushTokens.$inferInsert;

export type MobileDevice = typeof mobileDevices.$inferSelect;
export type NewMobileDevice = typeof mobileDevices.$inferInsert;

export type PairingSession = typeof pairingSessions.$inferSelect;
export type NewPairingSession = typeof pairingSessions.$inferInsert;

export { githubTokens } from "./github-schema";
export type { GithubToken, NewGithubToken } from "./github-schema";
