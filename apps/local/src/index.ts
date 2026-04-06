import "dotenv/config";
import { StreamChunk } from "./sdk/opencode-sdk";
import { createServer } from "./server";
import {
  abortSession,
  runOpenCodeStream,
  shutdownOpenCodeRunner,
} from "./services/open-code-runner";
import { opencodeCatalogService } from "./services/opencode-catalog-service";
import { chatServerClient } from "./services/relay-bridge";
import { setRelayServerUrl } from "./services/relay-device";
import { promptAndVerifyRelayUrl } from "./services/relay-url-config";
import { remotePermissionHandler } from "./services/remote-permission-handler";
import { logger } from "./shared/logger";
import type { SessionStreamChunkPayload } from "./types";

const PORT = parseInt(process.env.PORT || "0", 10);
const HOST = process.env.HOST || "0.0.0.0";

async function main(): Promise<void> {
  logger.info("Starting Local server");

  const enableChatServer = process.env.CHAT_SERVER_ENABLED !== "false";

  if (enableChatServer) {
    const relayUrl = await promptAndVerifyRelayUrl();
    setRelayServerUrl(relayUrl);
  }

  if (enableChatServer) {
    const createInteractionHandler = (projectId: string) => ({
      onPermissionRequest: async (request: {
        id: string;
        sessionId: string;
        permission: string;
        patterns: string[];
        metadata: Record<string, unknown>;
        always: string[];
      }) => {
        return remotePermissionHandler.onPermissionRequest({
          jobId: `mobile_${Date.now()}`,
          threadId: "",
          sessionId: request.sessionId,
          permission: request.permission,
          patterns: request.patterns,
          metadata: { ...request.metadata, projectId },
        });
      },
      onQuestionRequest: async (request: {
        id: string;
        sessionId: string;
        questions: Array<{
          question: string;
          header: string;
          options: Array<{ label: string; description: string }>;
          multiple?: boolean;
          custom?: boolean;
        }>;
      }) => {
        return remotePermissionHandler.onQuestionRequest({
          jobId: `mobile_${Date.now()}`,
          threadId: "",
          sessionId: request.sessionId,
          questions: request.questions,
        });
      },
    });

    chatServerClient.setSessionAbortHandler(async (payload) => {
      const project = await opencodeCatalogService.getProject(
        payload.projectId,
      );

      if (!project) {
        return {
          sessionId: payload.sessionId,
          success: false,
          error: `Project "${payload.projectId}" not found`,
        };
      }

      const result = await abortSession(payload.sessionId, project.worktree);
      return {
        sessionId: payload.sessionId,
        success: result.success,
        error: result.error,
      };
    });

    chatServerClient.setSessionPromptStreamHandler(async (payload, onChunk) => {
      const project = await opencodeCatalogService.getProject(
        payload.projectId,
      );

      if (!project) {
        return {
          requestId: payload.requestId,
          projectId: payload.projectId,
          sessionId: payload.sessionId,
          success: false,
          output: "",
          error: `Project "${payload.projectId}" not found`,
          exitCode: -1,
          duration: 0,
          messages: [],
        };
      }

      const streamCallback: (chunk: StreamChunk) => void = (sdkChunk) => {
        onChunk({
          requestId: payload.requestId,
          projectId: payload.projectId,
          sessionId: payload.sessionId,
          messageId: sdkChunk.messageId,
          chunk: sdkChunk.content,
          type: sdkChunk.type,
          isComplete: sdkChunk.isComplete,
        } satisfies SessionStreamChunkPayload);
      };

      const result = await runOpenCodeStream(
        payload.prompt,
        project.worktree,
        streamCallback,
        payload.sessionId,
        createInteractionHandler(payload.projectId),
        undefined,
        payload.model,
      );

      const resolvedSessionId = result.sessionId || payload.sessionId;

      return {
        requestId: payload.requestId,
        projectId: payload.projectId,
        sessionId: resolvedSessionId,
        success: result.success,
        output: result.output,
        error: result.error,
        exitCode: result.exitCode,
        duration: result.duration,
      };
    });

    await chatServerClient.start();
    logger.info("Chat server client started");
  }

  const app = createServer();
  const server = app.listen(PORT, HOST, () => {
    const address = server.address();
    const actualPort =
      typeof address === "object" && address ? address.port : PORT;
    logger.info("HTTP server listening", {
      url: `http://${HOST}:${actualPort}`,
      port: actualPort,
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info("Received shutdown signal", { signal });

    if (enableChatServer) {
      await chatServerClient.stop();
    }

    await shutdownOpenCodeRunner();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (err) => {
    console.log(err, "err");

    logger.error("Uncaught exception", { error: err });
  });
  process.on("unhandledRejection", (reason) => {
    if (
      reason != null &&
      typeof reason === "object" &&
      Object.keys(reason as object).length === 0
    ) {
      return;
    }
    logger.error("Unhandled rejection", { reason });
  });
}

main().catch((err) => {
  console.log(err);

  logger.error("Fatal startup error", { error: err });
  process.exit(1);
});
