import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const localServers = pgTable("local_servers", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  serverSecretHash: text("server_secret_hash"),
  lastConnected: timestamp("last_connected"),
  isConnected: boolean("is_connected").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const mobileDevices = pgTable("mobile_devices", {
  id: text("id").primaryKey(),
  serverId: text("server_id")
    .notNull()
    .references(() => localServers.id),
  name: text("name").notNull(),
  platform: text("platform"),
  tokenHash: text("token_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at"),
  revokedAt: timestamp("revoked_at"),
});

export const pairingSessions = pgTable("pairing_sessions", {
  id: text("id").primaryKey(),
  serverId: text("server_id")
    .notNull()
    .references(() => localServers.id),
  secretHash: text("secret_hash").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  claimedDeviceId: text("claimed_device_id").references(() => mobileDevices.id),
});

export const expoPushTokens = pgTable("expo_push_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  token: text("token").notNull(),
  platform: text("platform").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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