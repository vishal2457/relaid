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

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  localServerId: text("local_server_id")
    .notNull()
    .references(() => localServers.id),
  name: text("name").notNull(),
  description: text("description"),
  folder: text("folder").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  status: text("status", {
    enum: ["pending", "running", "completed", "failed", "aborted"],
  })
    .notNull()
    .default("pending"),
  prompt: text("prompt").notNull(),
  output: text("output"),
  error: text("error"),
  exitCode: integer("exit_code"),
  duration: integer("duration"),
  sessionId: text("session_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
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

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type ExpoPushToken = typeof expoPushTokens.$inferSelect;
export type NewExpoPushToken = typeof expoPushTokens.$inferInsert;

export type MobileDevice = typeof mobileDevices.$inferSelect;
export type NewMobileDevice = typeof mobileDevices.$inferInsert;

export type PairingSession = typeof pairingSessions.$inferSelect;
export type NewPairingSession = typeof pairingSessions.$inferInsert;
