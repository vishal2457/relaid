import { logger } from "./logger";

const SRC_SERVER_URL = process.env.SRC_SERVER_URL || "http://localhost:3000";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  folder: string;
  localServerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface Session {
  id: string;
  projectId: string;
  userId: string | null;
  status: string;
  prompt: string;
  output: string | null;
  error: string | null;
  exitCode: number | null;
  duration: number | null;
  sessionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

interface LocalServer {
  id: string;
  name: string;
  isConnected: boolean;
  lastConnected: Date | null;
  createdAt: Date;
}

class SrcApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = SRC_SERVER_URL;
  }

  private async request<T>(
    method: string,
    path: string,
    data?: unknown,
    headers?: Record<string, string>,
  ): Promise<ApiResponse<T>> {
    try {
      const url = `${this.baseUrl}${path}`;
      const fetchOptions: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      };

      if (
        data &&
        (method === "POST" || method === "PATCH" || method === "PUT")
      ) {
        fetchOptions.body = JSON.stringify(data);
      }

      const response = await fetch(url, fetchOptions);
      const result = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        return {
          success: false,
          error: String(result.error || result.message || "Request failed"),
        };
      }

      return {
        success: true,
        data: (result.data || result) as T,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("API request failed", { path, error: errMsg });
      return {
        success: false,
        error: errMsg,
      };
    }
  }

  async getProjects(
    userId: string,
  ): Promise<ApiResponse<{ projects: Project[] }>> {
    return this.request<{ projects: Project[] }>(
      "GET",
      "/api/project",
      undefined,
      { "x-user-id": userId },
    );
  }

  async getProject(
    projectId: string,
  ): Promise<ApiResponse<{ project: Project }>> {
    return this.request<{ project: Project }>(
      "GET",
      `/api/project/${projectId}`,
    );
  }

  async createProject(
    data: {
      name: string;
      description: string;
      folder: string;
      localServerId?: string;
    },
    userId: string,
  ): Promise<ApiResponse<{ project: Project }>> {
    return this.request<{ project: Project }>("POST", "/api/project", data, {
      "x-user-id": userId,
    });
  }

  async updateProject(
    projectId: string,
    data: Partial<{
      name: string;
      description: string;
      localServerId: string;
    }>,
  ): Promise<ApiResponse<{ project: Project }>> {
    return this.request<{ project: Project }>(
      "PUT",
      `/api/project/${projectId}`,
      data,
    );
  }

  async deleteProject(
    projectId: string,
  ): Promise<ApiResponse<{ success: boolean }>> {
    return this.request<{ success: boolean }>(
      "DELETE",
      `/api/project/${projectId}`,
    );
  }

  async getSessions(
    projectId?: string,
    userId?: string,
    status?: string,
    limit?: number,
  ): Promise<ApiResponse<{ sessions: Session[] }>> {
    const params = new URLSearchParams();
    if (projectId) params.append("projectId", projectId);
    if (userId) params.append("userId", userId);
    if (status) params.append("status", status);
    if (limit) params.append("limit", limit.toString());

    const queryString = params.toString();
    const path = queryString ? `/api/sessions?${queryString}` : "/api/sessions";

    return this.request<{ sessions: Session[] }>("GET", path);
  }

  async getSession(
    sessionId: string,
  ): Promise<ApiResponse<{ session: Session }>> {
    return this.request<{ session: Session }>(
      "GET",
      `/api/sessions/${sessionId}`,
    );
  }

  async createSession(
    data: {
      projectId: string;
      prompt: string;
      resumeSessionId?: string;
      userId?: string;
    },
    userId: string,
  ): Promise<ApiResponse<{ session: Session; requestId: string }>> {
    return this.request<{ session: Session; requestId: string }>(
      "POST",
      "/api/sessions",
      data,
      { "x-user-id": userId },
    );
  }

  async updateSessionStatus(
    sessionId: string,
    data: {
      status: string;
      output?: string;
      error?: string;
      exitCode?: number;
      duration?: number;
      sessionId?: string;
    },
  ): Promise<ApiResponse<{ session: Session }>> {
    return this.request<{ session: Session }>(
      "PATCH",
      `/api/sessions/${sessionId}/status`,
      data,
    );
  }

  async abortSession(
    sessionId: string,
  ): Promise<ApiResponse<{ session: Session; requestId: string }>> {
    return this.request<{ session: Session; requestId: string }>(
      "POST",
      `/api/sessions/${sessionId}/abort`,
    );
  }

  async getLocalServers(): Promise<ApiResponse<{ servers: LocalServer[] }>> {
    return this.request<{ servers: LocalServer[] }>(
      "GET",
      "/api/local-servers",
    );
  }

  async getConnectedLocalServers(): Promise<
    ApiResponse<{ servers: LocalServer[] }>
  > {
    return this.request<{ servers: LocalServer[] }>(
      "GET",
      "/api/local-servers/connected",
    );
  }

  async createLocalServer(
    name: string,
  ): Promise<ApiResponse<{ server: LocalServer }>> {
    return this.request<{ server: LocalServer }>("POST", "/api/local-servers", {
      name,
    });
  }

  async updateLocalServerConnection(
    serverId: string,
    isConnected: boolean,
  ): Promise<ApiResponse<{ server: LocalServer }>> {
    return this.request<{ server: LocalServer }>(
      "PATCH",
      `/api/local-servers/${serverId}/connection`,
      { isConnected },
    );
  }
}

export const srcApiClient = new SrcApiClient();
export type { Project, Session, LocalServer, ApiResponse };
