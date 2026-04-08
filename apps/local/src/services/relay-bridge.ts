import { io, Socket } from "socket.io-client";
import { randomUUID } from "crypto";
import { eq, max } from "drizzle-orm";
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
  PermissionRequestPayload,
  PermissionResponsePayload,
  QuestionRequestPayload,
  QuestionResponsePayload,
  MessageQueueListRequestPayload,
  MessageQueueListResponsePayload,
  MessageQueueAddRequestPayload,
  MessageQueueAddResponsePayload,
  MessageQueueRemoveRequestPayload,
  MessageQueueRemoveResponsePayload,
  MessageQueueUpdateRequestPayload,
  MessageQueueUpdateResponsePayload,
  MessageQueueExecuteRequestPayload,
  MessageQueueExecuteResponsePayload,
  QueueItemPayload,
} from "../types";
import { opencodeCatalogService } from "./opencode-catalog-service";
import { GitService } from "./git-service";
import { runOpenCodeStream } from "./open-code-runner";
import { getDb } from "../db";
import { messageQueue } from "../db/schema";
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
  private onSessionAbort: SessionAbortHandler | null = null;
  private onSessionPrompt: SessionPromptHandler | null = null;
  private onSessionPromptStream: SessionPromptStreamHandler | null = null;
  private pendingPermissionRequests: Map<
    string,
    {
      resolve: (reply: PermissionResponsePayload["reply"]) => void;
      reject: (error: Error) => void;
    }
  > = new Map();
  private pendingQuestionRequests: Map<
    string,
    {
      resolve: (answers: string[][]) => void;
      reject: (error: Error) => void;
    }
  > = new Map();

  setSessionAbortHandler(handler: SessionAbortHandler): void {
    this.onSessionAbort = handler;
  }

  setSessionPromptHandler(handler: SessionPromptHandler): void {
    this.onSessionPrompt = handler;
  }

  setSessionPromptStreamHandler(handler: SessionPromptStreamHandler): void {
    this.onSessionPromptStream = handler;
  }

  requestPermission(
    payload: PermissionRequestPayload,
  ): Promise<PermissionResponsePayload["reply"]> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        logger.error("Cannot request permission: socket not connected", {
          requestId: payload.requestId,
        });
        reject(new Error("Socket not connected"));
        return;
      }

      const timeout = setTimeout(() => {
        this.pendingPermissionRequests.delete(payload.requestId);
        logger.warn("Permission request timed out", {
          requestId: payload.requestId,
          permission: payload.permission,
        });
        reject(new Error("Permission request timed out"));
      }, 120000);

      this.pendingPermissionRequests.set(payload.requestId, {
        resolve: (reply) => {
          clearTimeout(timeout);
          resolve(reply);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      logger.info("Emitting permission_request to relay", {
        requestId: payload.requestId,
        sessionId: payload.sessionId,
        permission: payload.permission,
        projectId: payload.projectId,
        socketConnected: this.socket?.connected,
      });

      this.emit("permission_request", payload);
    });
  }

  requestQuestion(payload: QuestionRequestPayload): Promise<string[][]> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        logger.error("Cannot request question: socket not connected", {
          requestId: payload.requestId,
        });
        reject(new Error("Socket not connected"));
        return;
      }

      const timeout = setTimeout(() => {
        this.pendingQuestionRequests.delete(payload.requestId);
        logger.warn("Question request timed out", {
          requestId: payload.requestId,
        });
        reject(new Error("Question request timed out"));
      }, 120000);

      this.pendingQuestionRequests.set(payload.requestId, {
        resolve: (answers) => {
          clearTimeout(timeout);
          resolve(answers);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      logger.info("Emitting question_request to relay", {
        requestId: payload.requestId,
        sessionId: payload.sessionId,
        questionCount: payload.questions.length,
        socketConnected: this.socket?.connected,
      });

      this.emit("question_request", payload);
    });
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

    this.socket.on(
      "git_file_diff_request",
      (payload: { requestId: string; projectId: string; filePath: string }) => {
        void this.handleGitFileDiffRequest(payload);
      },
    );

    this.socket.on(
      "git_discard_file_request",
      (payload: { requestId: string; projectId: string; filePath: string }) => {
        void this.handleGitDiscardFileRequest(payload);
      },
    );

    // Message Queue handlers
    this.socket.on(
      "message_queue_list_request",
      (payload: { requestId: string } & MessageQueueListRequestPayload) => {
        void this.handleMessageQueueListRequest(payload);
      },
    );

    this.socket.on(
      "message_queue_add_request",
      (payload: { requestId: string } & MessageQueueAddRequestPayload) => {
        void this.handleMessageQueueAddRequest(payload);
      },
    );

    this.socket.on(
      "message_queue_remove_request",
      (payload: { requestId: string } & MessageQueueRemoveRequestPayload) => {
        void this.handleMessageQueueRemoveRequest(payload);
      },
    );

    this.socket.on(
      "message_queue_update_request",
      (payload: { requestId: string } & MessageQueueUpdateRequestPayload) => {
        void this.handleMessageQueueUpdateRequest(payload);
      },
    );

    this.socket.on(
      "message_queue_execute_request",
      (payload: { requestId: string } & MessageQueueExecuteRequestPayload) => {
        void this.handleMessageQueueExecuteRequest(payload);
      },
    );

    this.socket.on(
      "permission_response",
      (payload: PermissionResponsePayload) => {
        const pending = this.pendingPermissionRequests.get(payload.requestId);
        if (pending) {
          this.pendingPermissionRequests.delete(payload.requestId);
          pending.resolve(payload.reply);
          logger.info("Permission response received", {
            requestId: payload.requestId,
            reply: payload.reply,
          });
        } else {
          logger.warn("Received permission response for unknown request", {
            requestId: payload.requestId,
          });
        }
      },
    );

    this.socket.on("question_response", (payload: QuestionResponsePayload) => {
      const pending = this.pendingQuestionRequests.get(payload.requestId);
      if (pending) {
        this.pendingQuestionRequests.delete(payload.requestId);
        pending.resolve(payload.answers);
        logger.info("Question response received", {
          requestId: payload.requestId,
          answerCount: payload.answers.length,
        });
      } else {
        logger.warn("Received question response for unknown request", {
          requestId: payload.requestId,
        });
      }
    });
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
    console.log("Emitting event", event, this.socket.id);
    this.socket.emit(event, payload);
  }

  private sendError(requestId: string, code: string, message: string): void {
    this.emit("error_response", { requestId, code, message });
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
      const projects = await opencodeCatalogService.listProjects();
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
        project: project,
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
        sessions: sessions,
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
        session: session,
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
        session,
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
        messages,
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
        session,
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
      const opencodeProviders = await opencodeCatalogService.listProviders();

      // Filter to only configured providers (env, config, custom sources have credentials)
      const configuredProviders = (opencodeProviders ?? []).filter(
        (provider) =>
          provider.source === "env" ||
          provider.source === "config" ||
          provider.source === "custom",
      );

      // Convert OpenCode providers (models as object) to relay format (models as array)
      const providers = configuredProviders.map((provider) => ({
        id: provider.id,
        name: provider.name,
        models: Object.values(provider.models).map((model) => ({
          id: model.id,
          name: model.name,
        })),
      }));

      // Deduplicate providers by ID
      const uniqueProviders = Array.from(
        new Map(providers.map((provider) => [provider.id, provider])).values(),
      );

      this.emit("providers_list_response", {
        requestId: payload.requestId,
        providers: uniqueProviders,
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

      const gitService = new GitService(project.worktree);
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

      const gitService = new GitService(project.worktree);
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

      const gitService = new GitService(project.worktree);
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

  private async handleGitFileDiffRequest(payload: {
    requestId: string;
    projectId: string;
    filePath: string;
  }): Promise<void> {
    try {
      const project = await opencodeCatalogService.getProject(
        payload.projectId,
      );

      if (!project) {
        this.emit("git_file_diff_response", {
          requestId: payload.requestId,
          files: [],
          error: "Project not found",
        });
        return;
      }

      const gitService = new GitService(project.worktree);
      const result = await gitService.diffFile(payload.filePath);

      this.emit("git_file_diff_response", {
        requestId: payload.requestId,
        files: result.data ?? [],
        success: result.success,
        error: result.error,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to get file diff", {
        error: errMsg,
        projectId: payload.projectId,
        filePath: payload.filePath,
        requestId: payload.requestId,
      });
      this.emit("git_file_diff_response", {
        requestId: payload.requestId,
        files: [],
        success: false,
        error: errMsg,
      });
    }
  }

  private async handleGitDiscardFileRequest(payload: {
    requestId: string;
    projectId: string;
    filePath: string;
  }): Promise<void> {
    try {
      const project = await opencodeCatalogService.getProject(
        payload.projectId,
      );

      if (!project) {
        this.emit("git_discard_file_response", {
          requestId: payload.requestId,
          success: false,
          error: "Project not found",
        });
        return;
      }

      const gitService = new GitService(project.worktree);
      const result = await gitService.discardChanges([payload.filePath]);

      this.emit("git_discard_file_response", {
        requestId: payload.requestId,
        success: result.success,
        error: result.error,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to discard file changes", {
        error: errMsg,
        projectId: payload.projectId,
        filePath: payload.filePath,
        requestId: payload.requestId,
      });
      this.emit("git_discard_file_response", {
        requestId: payload.requestId,
        success: false,
        error: errMsg,
      });
    }
  }

  // Message Queue Handlers

  private rowToQueuePayload(
    row: typeof messageQueue.$inferSelect,
  ): QueueItemPayload {
    return {
      id: row.id,
      projectId: row.projectId,
      prompt: row.prompt,
      status: row.status as QueueItemPayload["status"],
      sessionId: row.sessionId,
      error: row.error,
      position: row.position,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    };
  }

  private async handleMessageQueueListRequest(
    payload: { requestId: string } & MessageQueueListRequestPayload,
  ): Promise<void> {
    try {
      const db = getDb();
      const rows = await db
        .select()
        .from(messageQueue)
        .where(eq(messageQueue.projectId, payload.projectId))
        .orderBy(messageQueue.position);

      const items = rows.map((row) => this.rowToQueuePayload(row));

      this.emit("message_queue_list_response", {
        requestId: payload.requestId,
        items,
      } satisfies MessageQueueListResponsePayload);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to list message queue", { error: errMsg });
      this.emit("message_queue_list_response", {
        requestId: payload.requestId,
        items: [],
      });
    }
  }

  private async handleMessageQueueAddRequest(
    payload: { requestId: string } & MessageQueueAddRequestPayload,
  ): Promise<void> {
    try {
      const db = getDb();
      const id = randomUUID();
      const now = new Date();

      const maxResult = await db
        .select({ maxPos: max(messageQueue.position) })
        .from(messageQueue)
        .where(eq(messageQueue.projectId, payload.projectId));

      const nextPosition = (maxResult[0]?.maxPos ?? -1) + 1;

      await db.insert(messageQueue).values({
        id,
        projectId: payload.projectId,
        prompt: payload.prompt.trim(),
        status: "pending",
        position: nextPosition,
        createdAt: now,
        updatedAt: now,
      });

      const row = await db
        .select()
        .from(messageQueue)
        .where(eq(messageQueue.id, id))
        .get();

      if (!row) {
        throw new Error("Failed to retrieve created queue item");
      }

      this.emit("message_queue_add_response", {
        requestId: payload.requestId,
        item: this.rowToQueuePayload(row),
      } satisfies MessageQueueAddResponsePayload);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to add queue item", { error: errMsg });
      this.emit("message_queue_add_response", {
        requestId: payload.requestId,
        item: null as unknown as QueueItemPayload,
        error: errMsg,
      });
    }
  }

  private async handleMessageQueueRemoveRequest(
    payload: { requestId: string } & MessageQueueRemoveRequestPayload,
  ): Promise<void> {
    try {
      const db = getDb();

      const existing = await db
        .select()
        .from(messageQueue)
        .where(eq(messageQueue.id, payload.queueItemId))
        .get();

      if (!existing) {
        this.emit("message_queue_remove_response", {
          requestId: payload.requestId,
          success: false,
          error: "Queue item not found",
        } satisfies MessageQueueRemoveResponsePayload);
        return;
      }

      if (existing.status === "running") {
        this.emit("message_queue_remove_response", {
          requestId: payload.requestId,
          success: false,
          error: "Cannot delete a running queue item",
        } satisfies MessageQueueRemoveResponsePayload);
        return;
      }

      await db
        .delete(messageQueue)
        .where(eq(messageQueue.id, payload.queueItemId));

      this.emit("message_queue_remove_response", {
        requestId: payload.requestId,
        success: true,
      } satisfies MessageQueueRemoveResponsePayload);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to remove queue item", { error: errMsg });
      this.emit("message_queue_remove_response", {
        requestId: payload.requestId,
        success: false,
        error: errMsg,
      } satisfies MessageQueueRemoveResponsePayload);
    }
  }

  private async handleMessageQueueUpdateRequest(
    payload: { requestId: string } & MessageQueueUpdateRequestPayload,
  ): Promise<void> {
    try {
      const db = getDb();

      const existing = await db
        .select()
        .from(messageQueue)
        .where(eq(messageQueue.id, payload.queueItemId))
        .get();

      if (!existing) {
        this.emit("message_queue_update_response", {
          requestId: payload.requestId,
          item: null,
          error: "Queue item not found",
        } satisfies MessageQueueUpdateResponsePayload);
        return;
      }

      if (existing.status === "running") {
        this.emit("message_queue_update_response", {
          requestId: payload.requestId,
          item: null,
          error: "Cannot update a running queue item",
        } satisfies MessageQueueUpdateResponsePayload);
        return;
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (payload.prompt !== undefined) updates.prompt = payload.prompt.trim();
      if (payload.position !== undefined) updates.position = payload.position;

      await db
        .update(messageQueue)
        .set(updates)
        .where(eq(messageQueue.id, payload.queueItemId));

      const updated = await db
        .select()
        .from(messageQueue)
        .where(eq(messageQueue.id, payload.queueItemId))
        .get();

      this.emit("message_queue_update_response", {
        requestId: payload.requestId,
        item: updated ? this.rowToQueuePayload(updated) : null,
      } satisfies MessageQueueUpdateResponsePayload);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to update queue item", { error: errMsg });
      this.emit("message_queue_update_response", {
        requestId: payload.requestId,
        item: null,
        error: errMsg,
      } satisfies MessageQueueUpdateResponsePayload);
    }
  }

  private async handleMessageQueueExecuteRequest(
    payload: { requestId: string } & MessageQueueExecuteRequestPayload,
  ): Promise<void> {
    try {
      const db = getDb();

      const queueItem = await db
        .select()
        .from(messageQueue)
        .where(eq(messageQueue.id, payload.queueItemId))
        .get();

      if (!queueItem) {
        this.emit("message_queue_execute_response", {
          requestId: payload.requestId,
          success: false,
          error: "Queue item not found",
        } satisfies MessageQueueExecuteResponsePayload);
        return;
      }

      if (queueItem.status === "running") {
        this.emit("message_queue_execute_response", {
          requestId: payload.requestId,
          success: false,
          error: "Queue item is already running",
        } satisfies MessageQueueExecuteResponsePayload);
        return;
      }

      const project = await opencodeCatalogService.getProject(
        payload.projectId,
      );

      if (!project) {
        this.emit("message_queue_execute_response", {
          requestId: payload.requestId,
          success: false,
          error: "Project not found",
        } satisfies MessageQueueExecuteResponsePayload);
        return;
      }

      // Create new session if needed
      let sessionId = payload.sessionId;
      if (payload.createNewSession || !sessionId) {
        const newSession = await opencodeCatalogService.createSession(
          payload.projectId,
        );
        if (!newSession) {
          this.emit("message_queue_execute_response", {
            requestId: payload.requestId,
            success: false,
            error: "Failed to create session",
          } satisfies MessageQueueExecuteResponsePayload);
          return;
        }
        sessionId = newSession.id;
      }

      // Update queue item to running
      await db
        .update(messageQueue)
        .set({
          status: "running",
          sessionId,
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(messageQueue.id, payload.queueItemId));

      this.emit("message_queue_execute_response", {
        requestId: payload.requestId,
        success: true,
        sessionId,
      } satisfies MessageQueueExecuteResponsePayload);

      // Execute the prompt via streaming
      const executionRequestId = randomUUID();

      this.emit("session_prompt_started", {
        requestId: executionRequestId,
        projectId: payload.projectId,
        sessionId,
      } satisfies SessionPromptStartedPayload);

      const streamCallback: (chunk: {
        messageId?: string;
        content: string;
        type: string;
        isComplete?: boolean;
      }) => void = (sdkChunk) => {
        this.emit("session_stream_chunk", {
          requestId: executionRequestId,
          projectId: payload.projectId,
          sessionId,
          messageId: sdkChunk.messageId,
          chunk: sdkChunk.content,
          type: sdkChunk.type as SessionStreamChunkPayload["type"],
          isComplete: sdkChunk.isComplete,
        } satisfies SessionStreamChunkPayload);
      };

      const result = await runOpenCodeStream(
        queueItem.prompt,
        project.worktree,
        streamCallback,
        sessionId,
      );

      // Update queue item based on result
      const finalStatus = result.success ? "completed" : "failed";
      await db
        .update(messageQueue)
        .set({
          status: finalStatus,
          error: result.error || null,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(messageQueue.id, payload.queueItemId));

      this.emit("session_prompt_response", {
        requestId: executionRequestId,
        projectId: payload.projectId,
        sessionId,
        success: result.success,
        output: result.output,
        error: result.error,
        exitCode: result.exitCode,
        duration: result.duration,
      } satisfies SessionPromptResponsePayload);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to execute queue item", {
        error: errMsg,
        queueItemId: payload.queueItemId,
      });

      // Update queue item to failed
      try {
        const db = getDb();
        await db
          .update(messageQueue)
          .set({
            status: "failed",
            error: errMsg,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(messageQueue.id, payload.queueItemId));
      } catch {
        // Ignore DB update error
      }

      this.emit("message_queue_execute_response", {
        requestId: payload.requestId,
        success: false,
        error: errMsg,
      } satisfies MessageQueueExecuteResponsePayload);
    }
  }
}

export const chatServerClient = new ChatServerClient();
