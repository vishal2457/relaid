import "dotenv/config";
import { jobQueueRepository } from "./repositories/job-queue-repository";
import type { StreamChunk } from "./sdk/opencode-sdk";
import { createServer } from "./server";
import { chatServerClient } from "./services/chat-server-client";
import { jobProcessor } from "./services/job-processor";
import {
  abortSession,
  runOpenCodeStream,
  shutdownOpenCodeRunner,
} from "./services/open-code-runner";
import { opencodeCatalogService } from "./services/opencode-catalog-service";
import { logger } from "./shared/logger";
import type { MessagePayload, SessionStreamChunkPayload } from "./types";
import { promptAndVerifyRelayUrl } from "./services/relay-url-config";
import { setRelayServerUrl } from "./services/relay-device";

const PORT = parseInt(process.env.PORT || "0", 10);
const HOST = process.env.HOST || "0.0.0.0";

const RUNNING_JOBS_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_MESSAGES_FETCH_RETRY_DELAYS_MS = [0, 150, 350, 750];

async function startRunningJobsScheduler(): Promise<void> {
  const checkRunningJobs = (): void => {
    const runningJobs = jobQueueRepository.getRunningJobs();
    if (runningJobs.length > 0) {
      logger.debug("Running jobs check", {
        count: runningJobs.length,
      });
    }
  };

  checkRunningJobs();
  setInterval(checkRunningJobs, RUNNING_JOBS_CHECK_INTERVAL_MS);
  logger.info("Running jobs scheduler started", {
    intervalMs: RUNNING_JOBS_CHECK_INTERVAL_MS,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasCompletedAssistantVisibleContent(
  messages: Awaited<
    ReturnType<typeof opencodeCatalogService.getSessionMessages>
  >,
  expectedOutput: string,
): boolean {
  if (!expectedOutput.trim()) {
    return true;
  }

  const lastMessage = messages[messages.length - 1];
  return Boolean(
    lastMessage &&
    lastMessage.role === "assistant" &&
    lastMessage.visibleContent.trim(),
  );
}

async function getSettledSessionMessages(
  sessionId: string,
  expectedOutput: string,
): Promise<
  Awaited<ReturnType<typeof opencodeCatalogService.getSessionMessages>>
> {
  let latestMessages =
    await opencodeCatalogService.getSessionMessages(sessionId);

  if (hasCompletedAssistantVisibleContent(latestMessages, expectedOutput)) {
    return latestMessages;
  }

  for (const delayMs of SESSION_MESSAGES_FETCH_RETRY_DELAYS_MS.slice(1)) {
    await sleep(delayMs);
    latestMessages = await opencodeCatalogService.getSessionMessages(sessionId);

    if (hasCompletedAssistantVisibleContent(latestMessages, expectedOutput)) {
      return latestMessages;
    }
  }

  return latestMessages;
}

async function main(): Promise<void> {
  logger.info("Starting Maximus Bot");

  const enableChatServer = process.env.CHAT_SERVER_ENABLED !== "false";

  if (enableChatServer) {
    const relayUrl = await promptAndVerifyRelayUrl();
    setRelayServerUrl(relayUrl);
  }

  if (enableChatServer) {
    const mapMessagePayload = (
      messages: Awaited<
        ReturnType<typeof opencodeCatalogService.getSessionMessages>
      >,
    ): MessagePayload[] =>
      messages.map((message) => ({
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
      }));

    chatServerClient.setRunRequestStreamHandler(async (payload, onChunk) => {
      const project = await opencodeCatalogService.getProject(
        payload.projectId,
      );

      if (!project) {
        return {
          requestId: payload.requestId,
          projectId: payload.projectId,
          success: false,
          output: "",
          error: `Project "${payload.projectId}" not found`,
          exitCode: -1,
          duration: 0,
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
        });
      };

      const result = await runOpenCodeStream(
        payload.prompt,
        project.folder,
        streamCallback,
        payload.sessionId,
      );

      return {
        requestId: payload.requestId,
        projectId: payload.projectId,
        success: result.success,
        output: result.output,
        error: result.error,
        exitCode: result.exitCode,
        duration: result.duration,
        sessionId: result.sessionId,
      };
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

      const result = await abortSession(payload.sessionId, project.folder);
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
        project.folder,
        streamCallback,
        payload.sessionId,
        undefined,
        undefined,
        payload.model,
      );

      const resolvedSessionId = result.sessionId || payload.sessionId;
      const messages = resolvedSessionId
        ? await getSettledSessionMessages(
            resolvedSessionId,
            result.success ? result.output : "",
          )
        : [];

      return {
        requestId: payload.requestId,
        projectId: payload.projectId,
        sessionId: resolvedSessionId,
        success: result.success,
        output: result.output,
        error: result.error,
        exitCode: result.exitCode,
        duration: result.duration,
        messages: mapMessagePayload(messages),
      };
    });

    await chatServerClient.start();
    logger.info("Chat server client started");
  }

  await jobProcessor.start();

  await startRunningJobsScheduler();

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

    await jobProcessor.stop();

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
