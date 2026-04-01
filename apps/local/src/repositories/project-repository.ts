import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { projects, type Project, type NewProject } from "../db/project.schema";

export class ProjectRepository {
  getAll(): Project[] {
    const db = getDb();
    return db.select().from(projects).all();
  }

  getById(id: string): Project | undefined {
    const db = getDb();
    const result = db.select().from(projects).where(eq(projects.id, id)).get();
    return result;
  }

  create(
    project: Pick<
      NewProject,
      | "id"
      | "name"
      | "description"
      | "folder"
      | "linearProjectId"
      | "linearProjectName"
    >,
  ): Project {
    const db = getDb();
    const now = new Date();
    db.insert(projects)
      .values({
        id: project.id,
        name: project.name,
        description: project.description,
        folder: project.folder,
        linearProjectId: project.linearProjectId || null,
        linearProjectName: project.linearProjectName || null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return this.getById(project.id)!;
  }

  update(
    id: string,
    data: Partial<
      Pick<
        NewProject,
        | "name"
        | "description"
        | "folder"
        | "linearProjectId"
        | "linearProjectName"
      >
    >,
  ): Project | undefined {
    const db = getDb();
    db.update(projects)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .run();
    return this.getById(id);
  }

  delete(id: string): boolean {
    const db = getDb();
    const result = db.delete(projects).where(eq(projects.id, id)).run();
    return result.changes > 0;
  }
}

export const projectRepository = new ProjectRepository();
