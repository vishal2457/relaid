import { getDb } from "../db";
import { type NewProject, type Project } from "../db/project.schema";
import { projectRepository } from "../repositories/project-repository";
import { logger } from "../shared/logger";

const DEFAULT_PROJECT_NAME = "maximus-bot";

function normalizeDate(value: Date | string | number | null | undefined): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function mapDbProject(p: Project): Project {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    folder: p.folder,
    linearProjectId: p?.linearProjectId || null,
    linearProjectName: p?.linearProjectName || null,
    createdAt: normalizeDate(p.createdAt),
    updatedAt: normalizeDate(p.updatedAt),
  };
}

export class ProjectManager {
  private projects: Project[] = [];
  private projectsById: Map<string, Project> = new Map();

  constructor() {
    this.ensureDefaultProject();
  }

  private ensureDefaultProject(): void {
    try {
      getDb();
      const dbProjects = projectRepository.getAll();

      if (dbProjects.length === 0) {
        const workspacePath = process.cwd();
        const now = new Date();
        const defaultProject: Project = {
          id: "default",
          name: DEFAULT_PROJECT_NAME,
          description: "Default project",
          folder: workspacePath,
          linearProjectId: null,
          linearProjectName: null,
          createdAt: now,
          updatedAt: now,
        };

        projectRepository.create({
          id: defaultProject.id,
          name: defaultProject.name,
          description: defaultProject.description,
          folder: defaultProject.folder,
        });

        logger.info("Created default project", {
          projectId: defaultProject.id,
          name: defaultProject.name,
          folder: defaultProject.folder,
        });

        this.projects = [defaultProject];
      } else {
        this.projects = dbProjects.map(mapDbProject);
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Error initializing projects", { error: errMsg });
    }

    this.rebuildIndexes();
  }

  private rebuildIndexes(): void {
    this.projectsById.clear();
    for (const project of this.projects) {
      this.projectsById.set(project.id, project);
    }
  }

  getAll(): Project[] {
    try {
      const dbProjects = projectRepository.getAll();
      return dbProjects.map(mapDbProject);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Error getting all projects", { error: errMsg });
      return this.projects;
    }
  }

  getById(id: string): Project | undefined {
    try {
      const project = projectRepository.getById(id);
      if (!project) return undefined;
      return mapDbProject(project);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Error getting project by id", { id, error: errMsg });
      return this.projectsById.get(id);
    }
  }

  add(project: {
    id: NewProject["id"];
    name: NewProject["name"];
    description: NewProject["description"];
    folder: NewProject["folder"];
    linearProjectId?: NewProject["linearProjectId"];
    linearProjectName?: NewProject["linearProjectName"];
  }): Project {
    const newProject = projectRepository.create({
      id: project.id,
      name: project.name,
      description: project.description,
      folder: project.folder,
      linearProjectId: project.linearProjectId || null,
      linearProjectName: project.linearProjectName || null,
    });

    logger.info("Added new project", {
      projectId: project.id,
      projectName: project.name,
    });

    return mapDbProject(newProject);
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
    try {
      const updated = projectRepository.update(id, data);
      if (updated) {
        this.rebuildIndexes();
      }
      return updated ? mapDbProject(updated) : undefined;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Error updating project", { id, error: errMsg });
      return undefined;
    }
  }

  delete(id: string): boolean {
    try {
      const deleted = projectRepository.delete(id);
      if (deleted) {
        this.projects = this.projects.filter((p) => p.id !== id);
        this.projectsById.delete(id);
      }
      return deleted;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Error deleting project", { id, error: errMsg });
      return false;
    }
  }
}

export const projectManager = new ProjectManager();
