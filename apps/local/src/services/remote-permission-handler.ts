import { chatServerClient } from "./relay-bridge";
import type { PermissionHandler } from "./permission-handler";
import { logger } from "../shared/logger";

export class RemotePermissionHandler implements PermissionHandler {
  async onPermissionRequest(request: {
    jobId: string;
    threadId: string;
    sessionId: string;
    permission: string;
    patterns: string[];
    metadata: Record<string, unknown>;
  }): Promise<"once" | "always" | "reject"> {
    const requestId = `perm_${request.jobId}_${Date.now()}`;
    const projectId = (request.metadata.projectId as string) || "";

    logger.info("Requesting permission from mobile app", {
      requestId,
      projectId,
      jobId: request.jobId,
      permission: request.permission,
      patterns: request.patterns,
    });

    try {
      const reply = await chatServerClient.requestPermission({
        requestId,
        projectId,
        sessionId: request.sessionId,
        jobId: request.jobId,
        threadId: request.threadId,
        permission: request.permission,
        patterns: request.patterns,
        metadata: request.metadata,
      });

      logger.info("Permission response received from mobile", {
        requestId,
        jobId: request.jobId,
        reply,
      });

      return reply;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to get permission response", {
        requestId,
        jobId: request.jobId,
        error: errMsg,
      });

      return "reject";
    }
  }

  async onQuestionRequest(request: {
    jobId: string;
    threadId: string;
    sessionId: string;
    questions: Array<{
      header: string;
      question: string;
      options: Array<{ label: string; description: string }>;
      multiple?: boolean;
      custom?: boolean;
    }>;
  }): Promise<string[][]> {
    const requestId = `q_${request.jobId}_${Date.now()}`;
    const projectId = "";

    logger.info("Requesting question answer from mobile app", {
      requestId,
      jobId: request.jobId,
      questionCount: request.questions.length,
    });

    try {
      const answers = await chatServerClient.requestQuestion({
        requestId,
        projectId,
        sessionId: request.sessionId,
        jobId: request.jobId,
        threadId: request.threadId,
        questions: request.questions.map((q) => ({
          header: q.header,
          question: q.question,
          options: q.options,
          multiple: q.multiple,
          custom: q.custom,
        })),
      });

      logger.info("Question answers received from mobile", {
        requestId,
        jobId: request.jobId,
        answerCount: answers.length,
      });

      return answers;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error("Failed to get question response", {
        requestId,
        jobId: request.jobId,
        error: errMsg,
      });

      return [];
    }
  }
}

export const remotePermissionHandler = new RemotePermissionHandler();
