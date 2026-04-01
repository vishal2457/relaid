import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    userId: text("user_id"),
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
  },
  (table) => ({
    projectIdIdx: index("idx_sessions_project_id").on(table.projectId),
    userIdIdx: index("idx_sessions_user_id").on(table.userId),
    statusIdx: index("idx_sessions_status").on(table.status),
    createdAtIdx: index("idx_sessions_created_at").on(table.createdAt),
    sessionIdIdx: index("idx_sessions_session_id").on(table.sessionId),
  }),
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type SessionStatus = Session["status"];
