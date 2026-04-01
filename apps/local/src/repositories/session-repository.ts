import { eq, desc, and, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import {
  sessions,
  type Session,
  type NewSession,
  type SessionStatus,
} from "../db/session.schema";

export class SessionRepository {
  getById(id: string): Session | undefined {
    const db = getDb();
    return db.select().from(sessions).where(eq(sessions.id, id)).get();
  }

  getByProjectId(projectId: string, limit = 50): Session[] {
    const db = getDb();
    return db
      .select()
      .from(sessions)
      .where(eq(sessions.projectId, projectId))
      .orderBy(desc(sessions.createdAt))
      .limit(limit)
      .all();
  }

  getByUserId(userId: string, limit = 50): Session[] {
    const db = getDb();
    return db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt))
      .limit(limit)
      .all();
  }

  getLatestWithSessionId(projectId: string): Session | undefined {
    const db = getDb();
    return db
      .select()
      .from(sessions)
      .where(
        and(eq(sessions.projectId, projectId), isNotNull(sessions.sessionId)),
      )
      .orderBy(desc(sessions.createdAt))
      .get();
  }

  getActiveByProjectId(projectId: string): Session | undefined {
    const db = getDb();
    return db
      .select()
      .from(sessions)
      .where(
        and(eq(sessions.projectId, projectId), eq(sessions.status, "running")),
      )
      .get();
  }

  create(session: Omit<NewSession, "id" | "createdAt" | "updatedAt">): Session {
    const db = getDb();
    const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const now = new Date();

    db.insert(sessions)
      .values({
        id,
        projectId: session.projectId,
        userId: session.userId || null,
        status: session.status || "pending",
        prompt: session.prompt,
        output: session.output || null,
        error: session.error || null,
        exitCode: session.exitCode || null,
        duration: session.duration || null,
        sessionId: session.sessionId || null,
        createdAt: now,
        updatedAt: now,
        startedAt: session.startedAt || null,
        completedAt: session.completedAt || null,
      })
      .run();

    return this.getById(id)!;
  }

  updateStatus(
    id: string,
    status: SessionStatus,
    extras?: Partial<
      Pick<
        NewSession,
        | "output"
        | "error"
        | "exitCode"
        | "duration"
        | "sessionId"
        | "startedAt"
        | "completedAt"
      >
    >,
  ): Session | undefined {
    const db = getDb();
    const updateData: Partial<NewSession> = {
      status,
      updatedAt: new Date(),
      ...extras,
    };

    if (status === "running") {
      updateData.startedAt = new Date();
    } else if (
      status === "completed" ||
      status === "failed" ||
      status === "aborted"
    ) {
      updateData.completedAt = new Date();
    }

    db.update(sessions).set(updateData).where(eq(sessions.id, id)).run();
    return this.getById(id);
  }

  delete(id: string): boolean {
    const db = getDb();
    const result = db.delete(sessions).where(eq(sessions.id, id)).run();
    return result.changes > 0;
  }
}

export const sessionRepository = new SessionRepository();
