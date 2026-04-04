import { io, Socket } from "socket.io-client";
import { logger } from "../shared/logger";
import type {
  MessagePayload,
  ProjectCreateRequestPayload,
  ProjectDirectoryRequestPayload,
  ProjectDeleteRequestPayload,
  ProjectFileSearchRequestPayload,
  ProjectGetRequestPayload,
  ProjectUpdateRequestPayload,
  ProjectsListRequestPayload,
  ProvidersListRequestPayload,
  RunRequestPayload,
  RunResponsePayload,
  RunStreamChunkPayload,
  SessionAbortPayload,
  SessionAbortedPayload,
  SessionCreateRequestPayload,
  SessionGetRequestPayload,
  SessionMessagesRequestPayload,
  SessionPromptRequestPayload,
  SessionPromptResponsePayload,
  SessionPromptStartedPayload,
  SessionStreamChunkPayload,
  SessionUpdateRequestPayload,
  SessionsListRequestPayload,
} from "../types";
import { opencodeCatalogService } from "./opencode-catalog-service";
import { GitService } from "./git-service";
import {
  createPairingSession,
  getRelayServerName,
  getRelayServerUrl,
  loadOrCreateRelayDeviceCredentials,
  type PairingSessionResponse,
} from "./relay-device";

const QRCodeTerminal: {
  generate: (
    text: string,
    options: { small?: boolean },
    callback?: (qr: string) => void,
  ) => void;
} = require("qrcode-terminal");

const CHAT_SERVER_URL = getRelayServerUrl();
const RELAY_DEVICE = loadOrCreateRelayDeviceCredentials();
const LOCAL_SERVER_ID = RELAY_DEVICE.serverId;
const LOCAL_SERVER_SECRET = RELAY_DEVICE.serverSecret;
const LOCAL_SERVER_NAME = getRelayServerName();
const RECONNECT_INTERVAL_MS = 5000;

function ensureProjectIsoDate(value?: Date | string | number | null): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

export type RunRequestHandler = (
  payload: RunRequestPayload,
) => Promise<RunResponsePayload>;

export type RunRequestStreamHandler = (
  payload: RunRequestPayload,
  onChunk: (chunk: RunStreamChunkPayload) => void,
) => Promise<RunResponsePayload>;

export type SessionAbortHandler = (
  payload: SessionAbortPayload,
) => Promise<SessionAbortedPayload>;

export type SessionPromptHandler = (
  payload: SessionPromptRequestPayload,
) => Promise<SessionPromptResponsePayload>;

export type SessionPromptStreamHandler = (
  payload: SessionPromptRequestPayload,
  onChunk: (chunk: SessionStreamChunkPayload) => void,
) => Promise<SessionPromptResponsePayload>;

export class ChatServerClient {
  private socket: Socket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private pairingQrPrinted = false;
  private onRunRequest: RunRequestHandler | null = null;
  private onRunRequestStream: RunRequestStreamHandler | null = null;
  private onSessionAbort: SessionAbortHandler | null = null;
  private onSessionPrompt: SessionPromptHandler | null = null;
  private onSessionPromptStream: SessionPromptStreamHandler | null = null;

  setRunRequestHandler(handler: RunRequestHandler): void {
    this.onRunRequest = handler;
  }

  setRunRequestStreamHandler(handler: RunRequestStreamHandler): void {
    this.onRunRequestStream = handler;
  }

  setSessionAbortHandler(handler: SessionAbortHandler): void {
    this.onSessionAbort = handler;
  }

  setSessionPromptHandler(handler: SessionPromptHandler): void {
    this.onSessionPrompt = handler;
  }

  setSessionPromptStreamHandler(handler: SessionPromptStreamHandler): void {
    this.onSessionPromptStream = handler;
  }

  async start(): Promise<void> {
    if (!CHAT_SERVER_URL) {
      logger.info("Chat server URL not configured, skipping connection");
      return;
    }

    if (this.isRunning) {
      logger.warn("ChatServerClient already running");
      return;
    }

    this.isRunning = true;
    this.connect();
    logger.info("ChatServerClient started", {
      url: CHAT_SERVER_URL,
      serverId: LOCAL_SERVER_ID,
    });
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    logger.info("ChatServerClient stopped");
  }

  private async printPairingQr(): Promise<void> {
    if (this.pairingQrPrinted) {
      return;
    }

    try {
      const pairingSession = await createPairingSession(RELAY_DEVICE);
      this.renderPairingQr(pairingSession);
      this.pairingQrPrinted = true;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to create pairing QR", {
        serverId: LOCAL_SERVER_ID,
        error: errMsg,
      });
    }
  }

  private renderPairingQr(pairingSession: PairingSessionResponse): void {
    console.log("\n" + "=".repeat(56));
    console.log("Scan this QR code from the mobile app to pair this device.");
    console.log(
      `Server: ${pairingSession.serverName} (${pairingSession.serverId})`,
    );
    console.log(
      `Pairing expires: ${new Date(pairingSession.expiresAt).toLocaleString()}`,
    );
    console.log("=".repeat(56));

    QRCodeTerminal.generate(
      pairingSession.pairingUrl,
      { small: true },
      (qr) => {
        console.log(qr);
      },
    );

    console.log(`Pairing link: ${pairingSession.pairingUrl}`);
    console.log("=".repeat(56) + "\n");
  }

  private connect(): void {
    if (!this.isRunning) {
      return;
    }

    this.socket = io(CHAT_SERVER_URL, {
      path: "/socket",
      transports: ["websocket"],
      reconnection: false,
      auth: {
        serverId: LOCAL_SERVER_ID,
        serverSecret: LOCAL_SERVER_SECRET,
        serverName: LOCAL_SERVER_NAME,
        type: "local_server",
      },
    });

    this.socket.on("connect", () => {
      logger.info("Connected to chat server", {
        socketId: this.socket?.id,
        serverId: LOCAL_SERVER_ID,
      });
      void this.printPairingQr();
    });

    this.socket.on("disconnect", (reason) => {
      logger.info("Disconnected from chat server", { reason });
      this.scheduleReconnect();
    });

    this.socket.on("connect_error", (error) => {
      logger.error("Failed to connect to chat server", {
        error: error.message,
      });
      this.scheduleReconnect();
    });

    this.socket.on("run_request", (payload: RunRequestPayload) => {
      void this.handleRunRequest(payload);
    });

    this.socket.on("session_abort", (payload: SessionAbortPayload) => {
      void this.handleSessionAbort(payload);
    });

    this.socket.on(
      "session_prompt_request",
      (payload: SessionPromptRequestPayload) => {
        void this.handleSessionPromptRequest(payload);
      },
    );

    this.socket.on(
      "projects_list_request",
      (payload: { requestId: string } & ProjectsListRequestPayload) => {
        void this.handleProjectsListRequest(payload);
      },
    );

    this.socket.on(
      "project_get_request",
      (payload: { requestId: string } & ProjectGetRequestPayload) => {
        void this.handleProjectGetRequest(payload);
      },
    );

    this.socket.on(
      "project_directory_request",
      (payload: { requestId: string } & ProjectDirectoryRequestPayload) => {
        void this.handleProjectDirectoryRequest(payload);
      },
    );

    this.socket.on(
      "project_file_search_request",
      (payload: { requestId: string } & ProjectFileSearchRequestPayload) => {
        void this.handleProjectFileSearchRequest(payload);
      },
    );

    this.socket.on(
      "project_create_request",
      (payload: { requestId: string } & ProjectCreateRequestPayload) => {
        void this.handleProjectCreateRequest(payload);
      },
    );

    this.socket.on(
      "project_update_request",
      (payload: { requestId: string } & ProjectUpdateRequestPayload) => {
        void this.handleProjectUpdateRequest(payload);
      },
    );

    this.socket.on(
      "project_delete_request",
      (payload: { requestId: string } & ProjectDeleteRequestPayload) => {
        void this.handleProjectDeleteRequest(payload);
      },
    );

    this.socket.on(
      "sessions_list_request",
      (payload: { requestId: string } & SessionsListRequestPayload) => {
        void this.handleSessionsListRequest(payload);
      },
    );

    this.socket.on(
      "session_get_request",
      (payload: { requestId: string } & SessionGetRequestPayload) => {
        void this.handleSessionGetRequest(payload);
      },
    );

    this.socket.on(
      "session_create_request",
      (payload: { requestId: string } & SessionCreateRequestPayload) => {
        void this.handleSessionCreateRequest(payload);
      },
    );

    this.socket.on(
      "session_messages_request",
      (payload: { requestId: string } & SessionMessagesRequestPayload) => {
        void this.handleSessionMessagesRequest(payload);
      },
    );

    this.socket.on(
      "session_update_request",
      (payload: { requestId: string } & SessionUpdateRequestPayload) => {
        void this.handleSessionUpdateRequest(payload);
      },
    );

    this.socket.on(
      "providers_list_request",
      (payload: { requestId: string } & ProvidersListRequestPayload) => {
        void this.handleProvidersListRequest(payload);
      },
    );

    this.socket.on(
      "git_staged_files_request",
      (payload: { requestId: string; projectId: string }) => {
        void this.handleGitStagedFilesRequest(payload);
      },
    );

    this.socket.on(
      "git_stage_files_request",
      (payload: { requestId: string; projectId: string; files: string[] }) => {
        void this.handleGitStageFilesRequest(payload);
      },
    );

    this.socket.on(
      "git_unstage_files_request",
      (payload: { requestId: string; projectId: string; files: string[] }) => {
        void this.handleGitUnstageFilesRequest(payload);
      },
    );
  }

  private scheduleReconnect(): void {
    if (!this.isRunning || this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      logger.info("Attempting to reconnect to chat server");
      this.connect();
    }, RECONNECT_INTERVAL_MS);
  }

  private emit(event: string, payload: object): void {
    if (!this.socket?.connected) {
      logger.warn(
        "Cannot emit event to chat server because socket is disconnected",
        {
          event,
        },
      );
      return;
    }
    this.socket.emit(event, payload);
  }

  private sendError(requestId: string, code: string, message: string): void {
    this.emit("error_response", { requestId, code, message });
  }

  private async handleRunRequest(
    payload: RunRequestPayload & { requestId: string },
  ): Promise<void> {
    logger.info("handleRunRequest called", {
      requestId: payload.requestId,
      projectId: payload.projectId,
    });

    const handler = this.onRunRequestStream || this.onRunRequest;
    if (!handler) {
      this.sendError(
        payload.requestId,
        "NO_HANDLER",
        "No run request handler configured",
      );
      return;
    }

    try {
      if (this.onRunRequestStream) {
        logger.info("Using stream handler for run request", {
          requestId: payload.requestId,
        });
        let chunkCount = 0;
        const onChunk = (chunk: RunStreamChunkPayload) => {
          chunkCount++;
          logger.info(
            `Streaming chunk #${chunkCount} for request ${payload.requestId}`,
            {
              type: chunk.type,
              contentLength: chunk.chunk.length,
            },
          );
          this.emit("run_stream_chunk", {
            ...chunk,
            requestId: payload.requestId,
            projectId: payload.projectId,
          });
        };

        const response = await this.onRunRequestStream(payload, onChunk);
        logger.info(
          `Run request ${payload.requestId} completed with ${chunkCount} chunks`,
          {
            success: response.success,
          },
        );
        this.emit("run_response", response);
      } else if (this.onRunRequest) {
        const response = await this.onRunRequest(payload);
        this.emit("run_response", response);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.sendError(payload.requestId, "RUN_ERROR", errMsg);
    }
  }

  private async handleSessionAbort(
    payload: SessionAbortPayload & { requestId: string },
  ): Promise<void> {
    if (!this.onSessionAbort) {
      this.sendError(
        payload.requestId,
        "NO_HANDLER",
        "No session abort handler configured",
      );
      return;
    }

    try {
      const response = await this.onSessionAbort(payload);
      this.emit("session_aborted", response);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.sendError(payload.requestId, "ABORT_ERROR", errMsg);
    }
  }

  private async handleSessionPromptRequest(
    payload: SessionPromptRequestPayload,
  ): Promise<void> {
    const handler = this.onSessionPromptStream || this.onSessionPrompt;
    if (!handler) {
      this.sendError(
        payload.requestId,
        "NO_HANDLER",
        "No session prompt handler configured",
      );
      return;
    }

    this.emit("session_prompt_started", {
      requestId: payload.requestId,
      projectId: payload.projectId,
      sessionId: payload.sessionId,
    } satisfies SessionPromptStartedPayload);

    try {
      if (this.onSessionPromptStream) {
        const onChunk = (chunk: SessionStreamChunkPayload) => {
          this.emit("session_stream_chunk", {
            ...chunk,
            requestId: payload.requestId,
            projectId: payload.projectId,
            sessionId: payload.sessionId,
          });
        };

        const response = await this.onSessionPromptStream(payload, onChunk);
        this.emit("session_prompt_response", response);
      } else if (this.onSessionPrompt) {
        const response = await this.onSessionPrompt(payload);
        this.emit("session_prompt_response", response);
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.sendError(payload.requestId, "SESSION_PROMPT_ERROR", errMsg);
    }
  }

  private async handleProjectsListRequest(
    payload: { requestId: string } & ProjectsListRequestPayload,
  ): Promise<void> {
    try {
      const projects = (await opencodeCatalogService.listProjects()).map(
        (project) => ({
          id: project.id,
          name: project.name,
          description: project.description,
          folder: project.folder,
          localServerId: LOCAL_SERVER_ID,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        }),
      );

      this.emit("projects_list_response", {
        requestId: payload.requestId,
        projects,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.sendError(payload.requestId, "PROJECTS_LIST_ERROR", errMsg);
    }
  }

  private async handleProjectGetRequest(
    payload: { requestId: string } & ProjectGetRequestPayload,
  ): Promise<void> {
    try {
      const project = await opencodeCatalogService.getProject(
        payload.projectId,
      );
      this.emit("project_get_response", {
        requestId: payload.requestId,
        project: project
          ? {
              id: project.id,
              name: project.name,
              description: project.description,
              folder: project.folder,
              localServerId: LOCAL_SERVER_ID,
              createdAt: project.createdAt,
              updatedAt: project.updatedAt,
            }
          : null,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.sendError(payload.requestId, "PROJECT_GET_ERROR", errMsg);
    }
  }

  private async handleProjectDirectoryRequest(
    payload: { requestId: string } & ProjectDirectoryRequestPayload,
  ): Promise<void> {
    try {
      const tree = await opencodeCatalogService.getProjectDirectory(
        payload.projectId,
      );
      this.emit("project_directory_response", {
        requestId: payload.requestId,
        tree,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.sendError(payload.requestId, "PROJECT_DIRECTORY_ERROR", errMsg);
    }
  }

  private async handleProjectFileSearchRequest(
    payload: { requestId: string } & ProjectFileSearchRequestPayload,
  ): Promise<void> {
    try {
      const results = await opencodeCatalogService.searchProjectFiles(
        payload.projectId,
        payload.query,
        payload.limit,
      );
      this.emit("project_file_search_response", {
        requestId: payload.requestId,
        results,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.sendError(payload.requestId, "PROJECT_FILE_SEARCH_ERROR", errMsg);
    }
  }

  private async handleProjectCreateRequest(
    payload: { requestId: string } & ProjectCreateRequestPayload,
  ): Promise<void> {
    this.sendError(
      payload.requestId,
      "PROJECT_CREATE_ERROR",
      "Project creation via the app database is deprecated; OpenCode owns projects",
    );
  }

  private async handleProjectUpdateRequest(
    payload: { requestId: string } & ProjectUpdateRequestPayload,
  ): Promise<void> {
    this.sendError(
      payload.requestId,
      "PROJECT_UPDATE_ERROR",
      "Project updates via the app database are deprecated; OpenCode owns projects",
    );
  }

  private async handleProjectDeleteRequest(
    payload: { requestId: string } & ProjectDeleteRequestPayload,
  ): Promise<void> {
    this.sendError(
      payload.requestId,
      "PROJECT_DELETE_ERROR",
      "Project deletion via the app database is deprecated; OpenCode owns projects",
    );
  }

  private async handleSessionsListRequest(
    payload: { requestId: string } & SessionsListRequestPayload,
  ): Promise<void> {
    try {
      const sessions = await opencodeCatalogService.listSessions({
        projectId: payload.projectId,
        limit: payload.limit,
        status: payload.status,
      });

      this.emit("sessions_list_response", {
        requestId: payload.requestId,
        sessions: sessions.map((session) => ({
          id: session.id,
          projectId: session.projectId,
          userId: null,
          status: session.status,
          prompt: session.prompt,
          output: session.output,
          error: session.error,
          exitCode: session.exitCode,
          duration: session.duration,
          sessionId: session.sessionId,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
        })),
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.sendError(payload.requestId, "SESSIONS_LIST_ERROR", errMsg);
    }
  }

  private async handleSessionGetRequest(
    payload: { requestId: string } & SessionGetRequestPayload,
  ): Promise<void> {
    try {
      const session = await opencodeCatalogService.getSession(
        payload.sessionId,
      );
      this.emit("session_get_response", {
        requestId: payload.requestId,
        session: session
          ? {
              id: session.id,
              projectId: session.projectId,
              userId: null,
              status: session.status,
              prompt: session.prompt,
              output: session.output,
              error: session.error,
              exitCode: session.exitCode,
              duration: session.duration,
              sessionId: session.sessionId,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
              startedAt: session.startedAt,
              completedAt: session.completedAt,
            }
          : null,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.sendError(payload.requestId, "SESSION_GET_ERROR", errMsg);
    }
  }

  private async handleSessionCreateRequest(
    payload: { requestId: string } & SessionCreateRequestPayload,
  ): Promise<void> {
    try {
      const session = await opencodeCatalogService.createSession(
        payload.projectId,
      );
      if (!session) {
        this.sendError(
          payload.requestId,
          "SESSION_CREATE_ERROR",
          `Unable to create session for project ${payload.projectId}`,
        );
        return;
      }

      this.emit("session_create_response", {
        requestId: payload.requestId,
        session: {
          id: session.id,
          projectId: session.projectId,
          status: session.status,
          prompt: session.prompt,
          output: session.output,
          error: session.error,
          exitCode: session.exitCode,
          duration: session.duration,
          sessionId: session.sessionId,
          userId: payload.userId || null,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          startedAt: session.startedAt,
          completedAt: session.completedAt,
        },
        requestId_data: payload.requestId,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.sendError(payload.requestId, "SESSION_CREATE_ERROR", errMsg);
    }
  }

  private async handleSessionMessagesRequest(
    payload: { requestId: string } & SessionMessagesRequestPayload,
  ): Promise<void> {
    try {
      const messages = await opencodeCatalogService.getSessionMessages(
        payload.sessionId,
        payload.limit,
      );

      this.emit("session_messages_response", {
        requestId: payload.requestId,
        messages: messages.map(
          (message): MessagePayload => ({
            id: message.id,
            sessionId: message.sessionId,
            role: message.role,
            content: message.content,
            visibleContent: message.visibleContent,
            thinkingContent: message.thinkingContent,
            thinkingDurationSeconds: message.thinkingDurationSeconds,
            parts: message.parts.map((part) => ({
              type: part.type,
              content: part.content,
              durationSeconds: part.durationSeconds,
            })),
            createdAt: message.createdAt,
          }),
        ),
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.sendError(payload.requestId, "SESSION_MESSAGES_ERROR", errMsg);
    }
  }

  private async handleSessionUpdateRequest(
    payload: { requestId: string } & SessionUpdateRequestPayload,
  ): Promise<void> {
    try {
      const session = await opencodeCatalogService.getSession(
        payload.sessionId,
      );

      this.emit("session_update_response", {
        requestId: payload.requestId,
        session: session
          ? {
              id: session.id,
              projectId: session.projectId,
              userId: null,
              status: session.status,
              prompt: session.prompt,
              output: session.output,
              error: session.error,
              exitCode: session.exitCode,
              duration: session.duration,
              sessionId: session.sessionId,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
              startedAt: session.startedAt,
              completedAt: session.completedAt,
            }
          : null,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.sendError(payload.requestId, "SESSION_UPDATE_ERROR", errMsg);
    }
  }

  private async handleProvidersListRequest(
    payload: { requestId: string } & ProvidersListRequestPayload,
  ): Promise<void> {
    try {
      const providers = await opencodeCatalogService.listProviders();
      this.emit("providers_list_response", {
        requestId: payload.requestId,
        providers,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.sendError(payload.requestId, "PROVIDERS_LIST_ERROR", errMsg);
    }
  }

  private async handleGitStagedFilesRequest(payload: {
    requestId: string;
    projectId: string;
  }): Promise<void> {
    try {
      const project = await opencodeCatalogService.getProject(
        payload.projectId,
      );

      if (!project) {
        this.emit("git_staged_files_response", {
          requestId: payload.requestId,
          staged: [],
          unstaged: [],
        });
        return;
      }

      const gitService = new GitService(project.folder);
      const result = await gitService.getFileStatusLists();

      this.emit("git_staged_files_response", {
        requestId: payload.requestId,
        staged: result.data?.staged ?? [],
        unstaged: result.data?.unstaged ?? [],
        branch: result.data?.branch ?? "HEAD",
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to get file status", {
        error: errMsg,
        projectId: payload.projectId,
        requestId: payload.requestId,
      });
      this.emit("git_staged_files_response", {
        requestId: payload.requestId,
        staged: [],
        unstaged: [],
        branch: "HEAD",
      });
    }
  }

  private async handleGitStageFilesRequest(payload: {
    requestId: string;
    projectId: string;
    files: string[];
  }): Promise<void> {
    logger.info("Git stage files request received", {
      requestId: payload.requestId,
      projectId: payload.projectId,
      fileCount: payload.files.length,
    });

    try {
      const project = await opencodeCatalogService.getProject(
        payload.projectId,
      );

      if (!project) {
        this.emit("git_stage_files_response", {
          requestId: payload.requestId,
          success: false,
          error: "Project not found",
        });
        return;
      }

      const gitService = new GitService(project.folder);
      const result = await gitService.addFiles(payload.files);

      this.emit("git_stage_files_response", {
        requestId: payload.requestId,
        success: result.success,
        error: result.error,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to stage files", {
        error: errMsg,
        stack: error instanceof Error ? error.stack : undefined,
        projectId: payload.projectId,
        requestId: payload.requestId,
      });
      this.emit("git_stage_files_response", {
        requestId: payload.requestId,
        success: false,
        error: errMsg,
      });
    }
  }

  private async handleGitUnstageFilesRequest(payload: {
    requestId: string;
    projectId: string;
    files: string[];
  }): Promise<void> {
    try {
      const project = await opencodeCatalogService.getProject(
        payload.projectId,
      );

      if (!project) {
        this.emit("git_unstage_files_response", {
          requestId: payload.requestId,
          success: false,
          error: "Project not found",
        });
        return;
      }

      const gitService = new GitService(project.folder);
      const result = await gitService.unstageFiles(payload.files);

      this.emit("git_unstage_files_response", {
        requestId: payload.requestId,
        success: result.success,
        error: result.error,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to unstage files", {
        error: errMsg,
        projectId: payload.projectId,
        requestId: payload.requestId,
      });
      this.emit("git_unstage_files_response", {
        requestId: payload.requestId,
        success: false,
        error: errMsg,
      });
    }
  }
}

export const chatServerClient = new ChatServerClient();
