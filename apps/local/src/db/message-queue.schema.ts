import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const messageQueue = sqliteTable(
  "message_queue",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    prompt: text("prompt").notNull(),
    status: text("status", {
      enum: ["pending", "running", "completed", "failed", "aborted"],
    })
      .notNull()
      .default("pending"),
    sessionId: text("session_id"),
    error: text("error"),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (table) => ({
    projectIdIdx: index("idx_message_queue_project_id").on(table.projectId),
    statusIdx: index("idx_message_queue_status").on(table.status),
    positionIdx: index("idx_message_queue_position").on(table.position),
  }),
);

export type MessageQueueItem = typeof messageQueue.$inferSelect;
export type NewMessageQueueItem = typeof messageQueue.$inferInsert;
export type MessageQueueStatus = MessageQueueItem["status"];
