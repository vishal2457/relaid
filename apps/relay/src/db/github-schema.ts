import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./schema";

export const githubTokens = pgTable("github_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  encryptedToken: text("encrypted_token").notNull(),
  githubUsername: text("github_username").notNull(),
  scope: text("scope"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type GithubToken = typeof githubTokens.$inferSelect;
export type NewGithubToken = typeof githubTokens.$inferInsert;