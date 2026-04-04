import { Server as HttpServer } from "http";
import { and, eq } from "drizzle-orm";
import { Server, Socket } from "socket.io";
import { getDb } from "../db";
import { localServers } from "../db/schema";
import {
  getConnectedServerForUser,
  getConnectedServersForUser,
  requestAllConnectedServers,
  requestConnectedServer,
  requestUntilMatch,
  RouteError,
} from "../services/local-server-proxy";
import {
  authenticateLocalServer,
  authenticateMobileAccessToken,
} from "../services/auth";
import {
  sendPushNotification,
  savePushToken,
} from "../services/push-notification";
import { logger } from "../shared/logger";
import type {
  ProjectPayload,
  ProviderPayload,
  RunRequestEvent,
  RunResponseEvent,
  SessionAbortedEvent,
  SessionAbortEvent,
  SessionPromptRequestEvent,
  SessionPromptResponseEvent,
  SessionPayload,
} from "../shared/types";
import {
  emitRequestToServer,
  refreshPendingRequest,
  registerLocalServerSocket,
  rejectPendingRequest,
  resolvePendingRequest,
  unregisterLocalServerSocket,
} from "./request-broker";

export interface SocketData {
  userId: string;
  serverId: string;
  serverName?: string;
  deviceId?: string;
  type: "mobile" | "local_server";
}

type ProjectResponse = {
  project: ProjectPayload | null;
  error?: string;
};

type ProjectsListResponse = {
  projects: ProjectPayload[];
  error?: string;
};

type SessionResponse = {
  session: SessionPayload | null;
  error?: string;
};

type SessionMessagesResponse = {
  messages: Array<{
    id: string;
    sessionId: string;
    role: "user" | "assistant" | "system";
    content: string;
    visibleContent: string;
    thinkingContent: string | null;
    thinkingDurationSeconds: number | null;
    parts: Array<{
      type: "text" | "reasoning" | "tool" | "step" | "other";
      content: string;
      durationSeconds: number | null;
    }>;
    createdAt: string;
  }>;
  error?: string;
};

type SessionsListResponse = {
  sessions: SessionPayload[];
  error?: string;
};

type SessionCreateResponse = {
  session: SessionPayload;
  requestId: string;
  error?: string;
};

type SessionUpdateResponse = {
  session: SessionPayload | null;
  error?: string;
};

type ProjectDeleteResponse = {
  success: boolean;
  error?: string;
};

type ProvidersListResponse = {
  providers: ProviderPayload[];
  error?: string;
};

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
    path: "/socket",
  });

  io.use(async (socket, next) => {
    const accessToken = socket.handshake.auth.accessToken as string | undefined;
    const serverSecret = socket.handshake.auth.serverSecret as
      | string
      | undefined;
    const serverId = socket.handshake.auth.serverId as string | undefined;
    const serverName = socket.handshake.auth.serverName as string | undefined;
    const type = socket.handshake.auth.type as
      | "mobile"
      | "local_server"
      | undefined;

    try {
      if (type === "local_server") {
        if (!serverId) {
          throw new RouteError(401, "serverId is required");
        }

        if (!serverSecret) {
          throw new RouteError(401, "serverSecret is required");
        }

        const server = await authenticateLocalServer(
          serverId,
          serverSecret,
          serverName,
        );

        socket.data = {
          userId: server.id,
          serverId: server.id,
          serverName: server.name,
          type: "local_server",
        } as SocketData;
        next();
        return;
      }

      if (!accessToken) {
        throw new RouteError(401, "accessToken is required");
      }

      const auth = await authenticateMobileAccessToken(accessToken);
      socket.data = {
        userId: auth.server.id,
        serverId: auth.server.id,
        serverName: auth.server.name,
        deviceId: auth.device.id,
        type: "mobile",
      } as SocketData;

      next();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      next(new Error(errMsg));
    }
  });

  io.on("connection", (socket) => {
    void handleConnection(io, socket);
  });

  return io;
}

async function handleConnection(io: Server, socket: Socket): Promise<void> {
  const { userId, serverId, serverName, type } = socket.data as SocketData;

  logger.info("Client connected", {
    userId,
    serverId,
    type,
    socketId: socket.id,
  });

  socket.join(`user:${userId}`);

  if (type === "local_server") {
    await handleLocalServerConnection(io, socket, userId, serverId, serverName);
  } else {
    handleMobileConnection(socket, userId);
  }

  socket.on("disconnect", async (reason) => {
    logger.info("Client disconnected", { userId, serverId, type, reason });

    if (type === "local_server") {
      unregisterLocalServerSocket(serverId, socket.id);
      await updateServerConnectionStatus(serverId, false);
      io.to(`user:${userId}`).emit("local_server_disconnected", {
        serverId,
        userId,
      });
    }
  });
}

async function handleLocalServerConnection(
  io: Server,
  socket: Socket,
  userId: string,
  serverId: string,
  serverName?: string,
): Promise<void> {
  registerLocalServerSocket(serverId, socket);
  await updateServerConnectionStatus(serverId, true);

  io.to(`user:${userId}`).emit("local_server_connected", { serverId, userId });
  logger.info("Local server registered", { userId, serverId });

  const pipeResponse = (eventName: string) => {
    socket.on(eventName, (payload: Record<string, unknown>) => {
      if (eventName.includes("stream_chunk")) {
        const requestId =
          typeof payload.requestId === "string" ? payload.requestId : undefined;
        if (eventName === "run_stream_chunk") {
          refreshPendingRequest("run_response", requestId);
        }
        if (eventName === "session_stream_chunk") {
          refreshPendingRequest("session_prompt_response", requestId);
        }
        logger.info(`Forwarding ${eventName} to mobile`, {
          userId,
          requestId,
        });
      }
      resolvePendingRequest(eventName, payload);
      io.to(`user:${userId}`).emit(eventName, payload);

      if (eventName === "session_prompt_response") {
        const responsePayload = payload as SessionPromptResponseEvent;
        if (responsePayload.success && responsePayload.messages?.length) {
          const lastMessage =
            responsePayload.messages[responsePayload.messages.length - 1];
          const preview = lastMessage.content.slice(0, 100);
          void sendPushNotification(userId, "Request Completed", preview, {
            type: "request_completed",
            sessionId: responsePayload.sessionId,
            projectId: responsePayload.projectId,
            success: responsePayload.success,
          });
        } else if (!responsePayload.success) {
          void sendPushNotification(
            userId,
            "Request Failed",
            responsePayload.error || "The request failed with an error",
            {
              type: "request_completed",
              sessionId: responsePayload.sessionId,
              projectId: responsePayload.projectId,
              success: responsePayload.success,
            },
          );
        }
      }
    });
  };

  pipeResponse("run_response");
  pipeResponse("run_stream_chunk");
  pipeResponse("session_aborted");
  pipeResponse("session_prompt_started");
  pipeResponse("session_stream_chunk");
  pipeResponse("session_prompt_response");
  pipeResponse("projects_list_response");
  pipeResponse("project_get_response");
  pipeResponse("project_directory_response");
  pipeResponse("project_file_search_response");
  pipeResponse("project_create_response");
  pipeResponse("project_update_response");
  pipeResponse("project_delete_response");
  pipeResponse("sessions_list_response");
  pipeResponse("session_get_response");
  pipeResponse("session_messages_response");
  pipeResponse("session_create_response");
  pipeResponse("session_update_response");
  pipeResponse("local_servers_list_response");
  pipeResponse("local_server_register_response");
  pipeResponse("providers_list_response");
  pipeResponse("git_staged_files_response");
  pipeResponse("git_stage_files_response");
  pipeResponse("git_unstage_files_response");
  pipeResponse("git_file_diff_response");
  pipeResponse("git_discard_file_response");

  socket.on(
    "error_response",
    (payload: { requestId: string; code: string; message: string }) => {
      rejectPendingRequest(payload);
      io.to(`user:${userId}`).emit("error_response", payload);
    },
  );
}

function handleMobileConnection(socket: Socket, userId: string): void {
  logger.info("Mobile client registered", { userId });

  socket.on(
    "register_push_token",
    async (data: { token: string; platform: string }) => {
      try {
        await savePushToken(userId, data.token, data.platform);
        logger.info("Push token registered", {
          userId,
          platform: data.platform,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error("Failed to save push token", { userId, error: errMsg });
      }
    },
  );

  socket.on("run_request", async (data: RunRequestEvent) => {
    try {
      const projectResult = await requestUntilMatch<ProjectResponse>(
        userId,
        "project_get_request",
        "project_get_response",
        { projectId: data.projectId },
        (response) => Boolean(response.project),
      );

      if (!projectResult) {
        socket.emit("run_response", {
          requestId: data.requestId,
          projectId: data.projectId,
          success: false,
          output: "",
          error: "Project not found",
          exitCode: -1,
          duration: 0,
        } satisfies RunResponseEvent);
        return;
      }

      const response = await emitRequestToServer<RunResponseEvent>(
        projectResult.serverId,
        "run_request",
        "run_response",
        data,
      );

      socket.emit("run_response", {
        ...response,
        requestId: data.requestId,
      });
    } catch (error) {
      emitSocketError(
        socket,
        "run_response",
        data.requestId,
        {
          projectId: data.projectId,
          success: false,
          output: "",
          exitCode: -1,
          duration: 0,
        },
        error,
      );
    }
  });

  socket.on("session_abort", async (data: SessionAbortEvent) => {
    try {
      const sessionResult = await requestUntilMatch<SessionResponse>(
        userId,
        "session_get_request",
        "session_get_response",
        { sessionId: data.sessionId },
        (response) => Boolean(response.session),
      );

      if (!sessionResult?.response.session) {
        socket.emit("session_aborted", {
          sessionId: data.sessionId,
          success: false,
          error: "Session not found",
        } satisfies SessionAbortedEvent);
        return;
      }

      const response = await emitRequestToServer<SessionAbortedEvent>(
        sessionResult.serverId,
        "session_abort",
        "session_aborted",
        {
          requestId: data.requestId,
          sessionId: data.sessionId,
          projectId: sessionResult.response.session.projectId,
        },
      );

      socket.emit("session_aborted", response);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      socket.emit("session_aborted", {
        sessionId: data.sessionId,
        success: false,
        error: errMsg,
      } satisfies SessionAbortedEvent);
    }
  });

  socket.on(
    "session_prompt_request",
    async (data: SessionPromptRequestEvent) => {
      try {
        const sessionResult = await requestUntilMatch<SessionResponse>(
          userId,
          "session_get_request",
          "session_get_response",
          { sessionId: data.sessionId },
          (response) => Boolean(response.session),
        );

        if (!sessionResult?.response.session) {
          socket.emit("session_prompt_response", {
            requestId: data.requestId,
            projectId: data.projectId,
            sessionId: data.sessionId,
            success: false,
            output: "",
            error: "Session not found",
            exitCode: -1,
            duration: 0,
            messages: [],
          } satisfies SessionPromptResponseEvent);
          return;
        }

        await emitRequestToServer<SessionPromptResponseEvent>(
          sessionResult.serverId,
          "session_prompt_request",
          "session_prompt_response",
          {
            ...data,
            userId,
          },
        );
      } catch (error) {
        emitSocketError(
          socket,
          "session_prompt_response",
          data.requestId,
          {
            projectId: data.projectId,
            sessionId: data.sessionId,
            success: false,
            output: "",
            exitCode: -1,
            duration: 0,
            messages: [],
          },
          error,
        );
      }
    },
  );

  socket.on("projects_list_request", async (data: { requestId: string }) => {
    try {
      const results = await requestAllConnectedServers<ProjectsListResponse>(
        userId,
        "projects_list_request",
        "projects_list_response",
        {},
      );

      socket.emit("projects_list_response", {
        requestId: data.requestId,
        projects: results.flatMap((result) => result.response.projects || []),
      });
    } catch (error) {
      emitSocketError(
        socket,
        "projects_list_response",
        data.requestId,
        {
          projects: [],
        },
        error,
      );
    }
  });

  socket.on(
    "project_get_request",
    async (data: { requestId: string; projectId: string }) => {
      try {
        const result = await requestUntilMatch<ProjectResponse>(
          userId,
          "project_get_request",
          "project_get_response",
          { projectId: data.projectId },
          (response) => Boolean(response.project),
        );

        socket.emit("project_get_response", {
          requestId: data.requestId,
          project: result?.response.project || null,
          error: result ? undefined : "Project not found",
        });
      } catch (error) {
        emitSocketError(
          socket,
          "project_get_response",
          data.requestId,
          {
            project: null,
          },
          error,
        );
      }
    },
  );

  socket.on(
    "project_create_request",
    async (data: {
      requestId: string;
      name: string;
      description: string;
      folder: string;
      localServerId?: string;
    }) => {
      try {
        const result = await requestConnectedServer<{
          project: ProjectPayload;
        }>(
          userId,
          "project_create_request",
          "project_create_response",
          {
            name: data.name,
            description: data.description,
            folder: data.folder,
            localServerId: data.localServerId,
          },
          data.localServerId,
        );

        socket.emit("project_create_response", {
          requestId: data.requestId,
          project: result.response.project,
        });
      } catch (error) {
        emitSocketError(
          socket,
          "project_create_response",
          data.requestId,
          {},
          error,
        );
      }
    },
  );

  socket.on(
    "project_update_request",
    async (data: {
      requestId: string;
      projectId: string;
      name?: string;
      description?: string;
      folder?: string;
    }) => {
      try {
        const result = await requestUntilMatch<ProjectResponse>(
          userId,
          "project_update_request",
          "project_update_response",
          data,
          (response) => Boolean(response.project),
        );

        socket.emit("project_update_response", {
          requestId: data.requestId,
          project: result?.response.project || null,
          error: result ? undefined : "Project not found",
        });
      } catch (error) {
        emitSocketError(
          socket,
          "project_update_response",
          data.requestId,
          {
            project: null,
          },
          error,
        );
      }
    },
  );

  socket.on(
    "project_delete_request",
    async (data: { requestId: string; projectId: string }) => {
      try {
        const result = await requestUntilMatch<ProjectDeleteResponse>(
          userId,
          "project_delete_request",
          "project_delete_response",
          { projectId: data.projectId },
          (response) => response.success,
        );

        socket.emit("project_delete_response", {
          requestId: data.requestId,
          success: Boolean(result?.response.success),
          error: result ? undefined : "Project not found",
        });
      } catch (error) {
        emitSocketError(
          socket,
          "project_delete_response",
          data.requestId,
          {
            success: false,
          },
          error,
        );
      }
    },
  );

  socket.on(
    "sessions_list_request",
    async (data: {
      requestId: string;
      projectId?: string;
      status?: string;
      limit?: number;
    }) => {
      try {
        const results = await requestAllConnectedServers<SessionsListResponse>(
          userId,
          "sessions_list_request",
          "sessions_list_response",
          {
            projectId: data.projectId,
            status: data.status,
            limit: data.limit,
          },
        );

        const sessions = results
          .flatMap((result) => result.response.sessions || [])
          .filter((session) =>
            data.projectId ? session.projectId === data.projectId : true,
          )
          .filter((session) =>
            data.status ? session.status === data.status : true,
          );

        socket.emit("sessions_list_response", {
          requestId: data.requestId,
          sessions,
        });
      } catch (error) {
        emitSocketError(
          socket,
          "sessions_list_response",
          data.requestId,
          {
            sessions: [],
          },
          error,
        );
      }
    },
  );

  socket.on(
    "session_get_request",
    async (data: { requestId: string; sessionId: string }) => {
      try {
        const result = await requestUntilMatch<SessionResponse>(
          userId,
          "session_get_request",
          "session_get_response",
          { sessionId: data.sessionId },
          (response) => Boolean(response.session),
        );

        socket.emit("session_get_response", {
          requestId: data.requestId,
          session: result?.response.session || null,
          error: result ? undefined : "Session not found",
        });
      } catch (error) {
        emitSocketError(
          socket,
          "session_get_response",
          data.requestId,
          {
            session: null,
          },
          error,
        );
      }
    },
  );

  socket.on(
    "session_messages_request",
    async (data: { requestId: string; sessionId: string; limit?: number }) => {
      try {
        const sessionResult = await requestUntilMatch<SessionResponse>(
          userId,
          "session_get_request",
          "session_get_response",
          { sessionId: data.sessionId },
          (response) => Boolean(response.session),
        );

        if (!sessionResult?.response.session) {
          socket.emit("session_messages_response", {
            requestId: data.requestId,
            messages: [],
            error: "Session not found",
          });
          return;
        }

        const result = await requestConnectedServer<SessionMessagesResponse>(
          userId,
          "session_messages_request",
          "session_messages_response",
          {
            sessionId: data.sessionId,
            limit: data.limit,
          },
          sessionResult.serverId,
        );

        socket.emit("session_messages_response", {
          requestId: data.requestId,
          messages: result.response.messages || [],
        });
      } catch (error) {
        emitSocketError(
          socket,
          "session_messages_response",
          data.requestId,
          {
            messages: [],
          },
          error,
        );
      }
    },
  );

  socket.on(
    "session_create_request",
    async (data: {
      requestId: string;
      projectId: string;
      prompt: string;
      sessionId?: string;
      localServerId?: string;
    }) => {
      try {
        let targetServerId = data.localServerId;

        if (!targetServerId) {
          const projectResult = await requestUntilMatch<ProjectResponse>(
            userId,
            "project_get_request",
            "project_get_response",
            { projectId: data.projectId },
            (response) => Boolean(response.project),
          );

          if (!projectResult) {
            socket.emit("session_create_response", {
              requestId: data.requestId,
              error: "Project not found",
            });
            return;
          }

          targetServerId = projectResult.serverId;
        }

        const result = await requestConnectedServer<SessionCreateResponse>(
          userId,
          "session_create_request",
          "session_create_response",
          {
            projectId: data.projectId,
            prompt: data.prompt,
            sessionId: data.sessionId,
            userId,
          },
          targetServerId,
        );

        socket.emit("session_create_response", {
          requestId: data.requestId,
          session: result.response.session,
          requestId_data: result.response.requestId,
        });
      } catch (error) {
        emitSocketError(
          socket,
          "session_create_response",
          data.requestId,
          {},
          error,
        );
      }
    },
  );

  socket.on(
    "session_update_request",
    async (data: {
      requestId: string;
      sessionId: string;
      status: string;
      output?: string;
      error?: string;
      exitCode?: number;
      duration?: number;
      sessionId_data?: string;
    }) => {
      try {
        const result = await requestUntilMatch<SessionUpdateResponse>(
          userId,
          "session_update_request",
          "session_update_response",
          data,
          (response) => Boolean(response.session),
        );

        socket.emit("session_update_response", {
          requestId: data.requestId,
          session: result?.response.session || null,
          error: result ? undefined : "Session not found",
        });
      } catch (error) {
        emitSocketError(
          socket,
          "session_update_response",
          data.requestId,
          {
            session: null,
          },
          error,
        );
      }
    },
  );

  socket.on(
    "local_servers_list_request",
    async (data: { requestId: string }) => {
      try {
        const db = getDb();
        const servers = await db
          .select()
          .from(localServers)
          .where(eq(localServers.userId, userId));

        socket.emit("local_servers_list_response", {
          requestId: data.requestId,
          servers,
        });
      } catch (error) {
        emitSocketError(
          socket,
          "local_servers_list_response",
          data.requestId,
          {
            servers: [],
          },
          error,
        );
      }
    },
  );

  socket.on(
    "local_server_register_request",
    async (data: { requestId: string; name: string; serverId?: string }) => {
      try {
        const server = await getConnectedServerForUser(userId, data.serverId);
        socket.emit("local_server_register_response", {
          requestId: data.requestId,
          server,
          serverId: server.id,
        });
      } catch (error) {
        emitSocketError(
          socket,
          "local_server_register_response",
          data.requestId,
          {},
          error,
        );
      }
    },
  );

  socket.on("providers_list_request", async (data: { requestId: string }) => {
    try {
      const results = await requestAllConnectedServers<ProvidersListResponse>(
        userId,
        "providers_list_request",
        "providers_list_response",
        {},
      );

      socket.emit("providers_list_response", {
        requestId: data.requestId,
        providers: results.flatMap((result) => result.response.providers || []),
      });
    } catch (error) {
      emitSocketError(
        socket,
        "providers_list_response",
        data.requestId,
        { providers: [] },
        error,
      );
    }
  });
}

function emitSocketError(
  socket: Socket,
  eventName: string,
  requestId: string,
  payload: Record<string, unknown>,
  error: unknown,
): void {
  const errMsg = error instanceof Error ? error.message : String(error);
  socket.emit(eventName, {
    requestId,
    ...payload,
    error:
      error instanceof RouteError
        ? error.message
        : errMsg || "Local server request failed",
  });
}

async function updateServerConnectionStatus(
  serverId: string,
  isConnected: boolean,
): Promise<void> {
  try {
    const db = getDb();
    await db
      .update(localServers)
      .set({
        isConnected,
        lastConnected: isConnected ? new Date() : undefined,
      })
      .where(eq(localServers.id, serverId));
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error("Failed to update server connection status", {
      serverId,
      isConnected,
      error: errMsg,
    });
  }
}

export async function getConnectedServerIds(userId: string): Promise<string[]> {
  const servers = await getConnectedServersForUser(userId);
  return servers.map((server) => server.id);
}
