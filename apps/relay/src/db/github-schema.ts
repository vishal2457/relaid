import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

export const githubTokens = sqliteTable("github_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  encryptedToken: text("encrypted_token").notNull(),
  githubUsername: text("github_username").notNull(),
  scope: text("scope"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type GithubToken = typeof githubTokens.$inferSelect;
export type NewGithubToken = typeof githubTokens.$inferInsert;
