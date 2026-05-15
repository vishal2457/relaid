import { z } from "zod";
import type {
  Project,
  Session,
  Message,
  Provider,
} from "@opencode-ai/sdk/v2" with {
  "resolution-mode": "import",
};

export type { Project, Session, Message, Provider };

export const SessionStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "aborted",
]);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const MessageRoleSchema = z.enum(["user", "assistant", "system"]);

export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const EncryptedEnvelopeSchema = z.object({
  version: z.literal("v1"),
  senderDeviceId: z.string().optional(),
  recipientServerId: z.string().optional(),
  nonce: z.string(),
  ciphertext: z.string(),
});

export type EncryptedEnvelope = z.infer<typeof EncryptedEnvelopeSchema>;

export const RunRequestEventSchema = z.object({
  requestId: z.string(),
  projectId: z.string(),
  prompt: z.string(),
  sessionId: z.string().optional(),
  userId: z.string(),
});

export type RunRequestEvent = z.infer<typeof RunRequestEventSchema>;

export const RunResponseEventSchema = z.object({
  requestId: z.string(),
  projectId: z.string(),
  success: z.boolean(),
  output: z.string(),
  error: z.string().optional(),
  exitCode: z.number(),
  duration: z.number(),
  sessionId: z.string().optional(),
});

export type RunResponseEvent = z.infer<typeof RunResponseEventSchema>;

export const SessionAbortEventSchema = z.object({
  sessionId: z.string(),
  requestId: z.string(),
  projectId: z.string(),
  agentProviderId: z.string().optional(),
});

export type SessionAbortEvent = z.infer<typeof SessionAbortEventSchema>;

export const SessionAbortedEventSchema = z.object({
  requestId: z.string().optional(),
  agentProviderId: z.string().optional(),
  projectId: z.string().optional(),
  sessionId: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});

export type SessionAbortedEvent = z.infer<typeof SessionAbortedEventSchema>;

export const SessionPromptRequestEventSchema = z.object({
  requestId: z.string(),
  agentProviderId: z.string().optional(),
  projectId: z.string(),
  sessionId: z.string(),
  deviceId: z.string(),
  deviceKeyId: z.string(),
  devicePublicKey: z.string(),
  sealedPayload: EncryptedEnvelopeSchema,
  userId: z.string().optional(),
});

export type SessionPromptRequestEvent = z.infer<
  typeof SessionPromptRequestEventSchema
>;

export const SessionPromptStartedEventSchema = z.object({
  requestId: z.string(),
  agentProviderId: z.string().optional(),
  projectId: z.string(),
  sessionId: z.string(),
});

export type SessionPromptStartedEvent = z.infer<
  typeof SessionPromptStartedEventSchema
>;

export const SessionPromptResponseEventSchema = z.object({
  requestId: z.string(),
  agentProviderId: z.string().optional(),
  projectId: z.string(),
  sessionId: z.string(),
  success: z.boolean(),
  exitCode: z.number(),
  duration: z.number(),
  sealedPayload: EncryptedEnvelopeSchema.optional(),
  sessionTitle: z.string().optional(),
  output: z.string().optional(),
  error: z.string().optional(),
  messages: z.array(z.lazy(() => MessagePayloadSchema)).optional(),
});

export type SessionPromptResponseEvent = z.infer<
  typeof SessionPromptResponseEventSchema
>;

export const SessionStreamChunkEventSchema = z.object({
  requestId: z.string(),
  agentProviderId: z.string().optional(),
  projectId: z.string(),
  sessionId: z.string(),
  messageId: z.string().optional(),
  partId: z.string().optional(),
  type: z.enum(["text", "reasoning", "tool", "step", "status", "complete"]),
  isComplete: z.boolean().optional(),
  sealedPayload: EncryptedEnvelopeSchema.optional(),
  chunk: z.string().optional(),
});

export type SessionStreamChunkEvent = z.infer<
  typeof SessionStreamChunkEventSchema
>;

export const SessionRuntimePhaseSchema = z.enum([
  "pending",
  "streaming",
  "awaiting_permission",
  "awaiting_question",
  "completed",
  "failed",
  "aborted",
]);

export type SessionRuntimePhase = z.infer<typeof SessionRuntimePhaseSchema>;

export const SessionRuntimeSnapshotSchema = z.object({
  sessionKey: z.string(),
  sessionId: z.string(),
  agentProviderId: z.string().optional(),
  projectId: z.string(),
  requestId: z.string(),
  serverId: z.string(),
  phase: SessionRuntimePhaseSchema,
  lastActivityAt: z.number(),
  updatedAt: z.number(),
  lastStatusText: z.string().nullable(),
  lastToolLabel: z.string().nullable(),
  baselineMessageId: z.string().nullable().optional(),
});

export type SessionRuntimeSnapshot = z.infer<
  typeof SessionRuntimeSnapshotSchema
>;

export const RunStreamChunkEventSchema = z.object({
  requestId: z.string(),
  projectId: z.string(),
  sessionId: z.string().optional(),
  messageId: z.string().optional(),
  partId: z.string().optional(),
  chunk: z.string(),
  type: z.enum(["text", "reasoning", "tool", "step", "status", "complete"]),
  isComplete: z.boolean().optional(),
});

export type RunStreamChunkEvent = z.infer<typeof RunStreamChunkEventSchema>;

export const ProjectPayloadSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  folder: z.string(),
  localServerId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProjectPayload = z.infer<typeof ProjectPayloadSchema>;

export type ProjectDirectoryNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: ProjectDirectoryNode[];
};

export const ProjectDirectoryNodeSchema: z.ZodType<ProjectDirectoryNode> =
  z.lazy(() =>
    z.object({
      name: z.string(),
      path: z.string(),
      type: z.enum(["file", "directory"]),
      children: z.array(ProjectDirectoryNodeSchema).optional(),
    }),
  );

export const SessionPayloadSchema = z.object({
  id: z.string(),
  agentProviderId: z.string().optional(),
  projectId: z.string().optional(),
  directory: z.string().optional(),
  userId: z.string().nullable().optional(),
  status: z.string(),
  prompt: z.string(),
  output: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  exitCode: z.number().nullable().optional(),
  duration: z.number().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
});

export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

export const LocalServerPayloadSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastConnected: z.string().nullable().optional(),
  isConnected: z.boolean(),
  createdAt: z.string(),
});

export type LocalServerPayload = z.infer<typeof LocalServerPayloadSchema>;

export const ProjectsListRequestSchema = z.object({});

export const ProjectsListResponseSchema = z.object({
  projects: z.array(ProjectPayloadSchema),
});

export const ProjectGetRequestSchema = z.object({
  projectId: z.string(),
});

export const ProjectGetResponseSchema = z.object({
  project: ProjectPayloadSchema.nullable(),
});

export const ProjectDirectoryRequestSchema = z.object({
  projectId: z.string(),
  path: z.string().optional(),
});

export const ProjectDirectoryResponseSchema = z.object({
  tree: z.array(ProjectDirectoryNodeSchema).nullable(),
});

export const ProjectFileMatchSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["file", "directory"]),
});

export type ProjectFileMatch = z.infer<typeof ProjectFileMatchSchema>;

export const ProjectFileSearchRequestSchema = z.object({
  projectId: z.string(),
  agentProviderId: z.string().optional(),
  query: z.string().optional(),
  limit: z.number().optional(),
});

export const ProjectFileSearchResponseSchema = z.object({
  results: z.array(ProjectFileMatchSchema).nullable(),
});

export const ProjectCreateRequestSchema = z.object({
  name: z.string(),
  description: z.string(),
  folder: z.string(),
  localServerId: z.string().optional(),
});

export const ProjectCreateResponseSchema = z.object({
  project: ProjectPayloadSchema,
});

export const ProjectUpdateRequestSchema = z.object({
  projectId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  folder: z.string().optional(),
});

export const ProjectUpdateResponseSchema = z.object({
  project: ProjectPayloadSchema.nullable(),
});

export const ProjectDeleteRequestSchema = z.object({
  projectId: z.string(),
});

export const ProjectDeleteResponseSchema = z.object({
  success: z.boolean(),
});

export const SessionsListRequestSchema = z.object({
  agentProviderId: z.string().optional(),
  cwd: z.string().optional(),
  userId: z.string().optional(),
  status: z.string().optional(),
  limit: z.number().optional(),
});

export const SessionsListResponseSchema = z.object({
  sessions: z.array(SessionPayloadSchema),
});

export const SessionGetRequestSchema = z.object({
  agentProviderId: z.string().optional(),
  sessionId: z.string(),
});

export const SessionGetResponseSchema = z.object({
  session: SessionPayloadSchema.nullable(),
});

export const SessionCreateRequestSchema = z.object({
  agentProviderId: z.string().optional(),
  projectId: z.string(),
  prompt: z.string(),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
});

export const SessionCreateResponseSchema = z.object({
  session: SessionPayloadSchema,
  requestId: z.string(),
});

export const SessionUpdateRequestSchema = z.object({
  sessionId: z.string(),
  status: z.string(),
  output: z.string().optional(),
  error: z.string().optional(),
  exitCode: z.number().optional(),
  duration: z.number().optional(),
  sessionId_data: z.string().optional(),
});

export const SessionUpdateResponseSchema = z.object({
  session: SessionPayloadSchema.nullable(),
});

export const LocalServersListRequestSchema = z.object({});

export const LocalServersListResponseSchema = z.object({
  servers: z.array(LocalServerPayloadSchema),
});

export const LocalServerRegisterRequestSchema = z.object({
  name: z.string(),
  serverId: z.string().optional(),
});

export const LocalServerRegisterResponseSchema = z.object({
  server: LocalServerPayloadSchema,
  serverId: z.string(),
});

export const UserPayloadSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type UserPayload = z.infer<typeof UserPayloadSchema>;

export const UserRegisterRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

export const UserLoginRequestSchema = z.object({
  email: z.string().email(),
});

export const MessagePayloadSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  sealedBody: EncryptedEnvelopeSchema,
  content: z.string().optional().default(""),
  visibleContent: z.string().optional().default(""),
  thinkingContent: z.string().nullable().optional().default(null),
  thinkingDurationSeconds: z.number().nullable(),
  parts: z.array(
    z.object({
      type: z.enum(["text", "reasoning", "tool", "step", "other"]),
      content: z.string(),
      durationSeconds: z.number().nullable(),
    }),
  ).optional().default([]),
  createdAt: z.string(),
});

export type MessagePayload = z.infer<typeof MessagePayloadSchema>;

export const SessionMessagesRequestSchema = z.object({
  agentProviderId: z.string().optional(),
  sessionId: z.string(),
  limit: z.number().optional(),
});

export const SessionMessagesResponseSchema = z.object({
  messages: z.array(MessagePayloadSchema),
});

export type SessionMessagesRequest = z.infer<
  typeof SessionMessagesRequestSchema
>;
export type SessionMessagesResponse = z.infer<
  typeof SessionMessagesResponseSchema
>;

export const MessagesListRequestSchema = z.object({
  sessionId: z.string(),
});

export const MessagesListResponseSchema = z.object({
  messages: z.array(MessagePayloadSchema),
});

export const MessageCreateRequestSchema = z.object({
  sessionId: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export const MessageCreateResponseSchema = z.object({
  message: MessagePayloadSchema,
});

export const ProviderModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  agentProviderId: z.string().optional(),
  agentProviderName: z.string().optional(),
  providerId: z.string().optional(),
  providerName: z.string().optional(),
  modelId: z.string().optional(),
  modelName: z.string().optional(),
});

export type ProviderModel = z.infer<typeof ProviderModelSchema>;

export const ProviderPayloadSchema = z.object({
  id: z.string(),
  name: z.string(),
  agentProviderId: z.string().optional(),
  agentProviderName: z.string().optional(),
  providerId: z.string().optional(),
  providerName: z.string().optional(),
  models: z.array(ProviderModelSchema),
});

export type ProviderPayload = z.infer<typeof ProviderPayloadSchema>;

export const ProvidersListRequestSchema = z.object({});

export const ProvidersListResponseSchema = z.object({
  providers: z.array(ProviderPayloadSchema),
});

export type ProvidersListRequest = z.infer<typeof ProvidersListRequestSchema>;
export type ProvidersListResponse = z.infer<typeof ProvidersListResponseSchema>;

export const AppPayloadSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  isAccessible: z.boolean(),
  isEnabled: z.boolean(),
  labels: z.array(z.string()).optional(),
});

export type AppPayload = z.infer<typeof AppPayloadSchema>;

export const PermissionReplySchema = z.enum(["once", "always", "reject"]);

export type PermissionReply = z.infer<typeof PermissionReplySchema>;

export const PermissionRequestEventSchema = z.object({
  requestId: z.string(),
  agentProviderId: z.string().optional(),
  projectId: z.string(),
  sessionId: z.string(),
  jobId: z.string(),
  threadId: z.string(),
  sealedPayload: EncryptedEnvelopeSchema,
  permission: z.string().optional(),
  patterns: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type PermissionRequestEvent = z.infer<
  typeof PermissionRequestEventSchema
>;

export const SessionRuntimeSummarySchema = SessionRuntimeSnapshotSchema.extend({
  pendingPermission: PermissionRequestEventSchema.optional(),
  pendingQuestion: z.lazy(() => QuestionRequestEventSchema).optional(),
});

export type SessionRuntimeSummary = z.infer<typeof SessionRuntimeSummarySchema>;

export const PermissionResponseEventSchema = z.object({
  requestId: z.string(),
  agentProviderId: z.string().optional(),
  sessionId: z.string(),
  jobId: z.string(),
  sealedPayload: EncryptedEnvelopeSchema,
  reply: PermissionReplySchema.optional(),
});

export type PermissionResponseEvent = z.infer<
  typeof PermissionResponseEventSchema
>;

export const QuestionOptionSchema = z.object({
  label: z.string(),
  description: z.string(),
});

export type QuestionOption = z.infer<typeof QuestionOptionSchema>;

export const QuestionSchema = z.object({
  header: z.string(),
  question: z.string(),
  options: z.array(QuestionOptionSchema),
  multiple: z.boolean().optional(),
  custom: z.boolean().optional(),
});

export type Question = z.infer<typeof QuestionSchema>;

export const QuestionRequestEventSchema = z.object({
  requestId: z.string(),
  agentProviderId: z.string().optional(),
  projectId: z.string(),
  sessionId: z.string(),
  jobId: z.string(),
  threadId: z.string(),
  sealedPayload: EncryptedEnvelopeSchema,
  questions: z.array(QuestionSchema).optional(),
});

export type QuestionRequestEvent = z.infer<typeof QuestionRequestEventSchema>;

export const SessionRuntimeDetailSchema = SessionRuntimeSummarySchema.extend({
  bufferedChunks: z.array(SessionStreamChunkEventSchema),
});

export type SessionRuntimeDetail = z.infer<typeof SessionRuntimeDetailSchema>;

export const QuestionResponseEventSchema = z.object({
  requestId: z.string(),
  agentProviderId: z.string().optional(),
  sessionId: z.string(),
  jobId: z.string(),
  sealedPayload: EncryptedEnvelopeSchema,
  answers: z.array(z.array(z.string())).optional(),
});

export type QuestionResponseEvent = z.infer<typeof QuestionResponseEventSchema>;

// Message Queue Types

export const QueueItemPayloadSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  prompt: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "aborted"]),
  sessionId: z.string().nullable(),
  error: z.string().nullable(),
  position: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export type QueueItemPayload = z.infer<typeof QueueItemPayloadSchema>;

export const MessageQueueListRequestSchema = z.object({
  projectId: z.string(),
});

export const MessageQueueListResponseSchema = z.object({
  items: z.array(QueueItemPayloadSchema),
});

export type MessageQueueListResponse = z.infer<
  typeof MessageQueueListResponseSchema
>;

export const MessageQueueAddRequestSchema = z.object({
  projectId: z.string(),
  prompt: z.string(),
});

export const MessageQueueAddResponseSchema = z.object({
  item: QueueItemPayloadSchema,
});

export type MessageQueueAddResponse = z.infer<
  typeof MessageQueueAddResponseSchema
>;

export const MessageQueueRemoveRequestSchema = z.object({
  queueItemId: z.string(),
});

export const MessageQueueRemoveResponseSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

export type MessageQueueRemoveResponse = z.infer<
  typeof MessageQueueRemoveResponseSchema
>;

export const MessageQueueUpdateRequestSchema = z.object({
  queueItemId: z.string(),
  prompt: z.string().optional(),
  position: z.number().optional(),
});

export const MessageQueueUpdateResponseSchema = z.object({
  item: QueueItemPayloadSchema.nullable(),
  error: z.string().optional(),
});

export type MessageQueueUpdateResponse = z.infer<
  typeof MessageQueueUpdateResponseSchema
>;

export const MessageQueueExecuteRequestSchema = z.object({
  queueItemId: z.string(),
  sessionId: z.string().optional(),
  createNewSession: z.boolean().optional(),
  projectId: z.string(),
});

export const MessageQueueExecuteResponseSchema = z.object({
  success: z.boolean(),
  sessionId: z.string().optional(),
  error: z.string().optional(),
});

export type MessageQueueExecuteResponse = z.infer<
  typeof MessageQueueExecuteResponseSchema
>;

// Skills Types

export const SkillPayloadSchema = z.object({
  name: z.string(),
  description: z.string(),
  source: z.string().optional(),
});

export type SkillPayload = z.infer<typeof SkillPayloadSchema>;

export const SkillsListRequestSchema = z.object({
  projectId: z.string(),
  query: z.string().optional(),
});

export const SkillsListResponseSchema = z.object({
  skills: z.array(SkillPayloadSchema),
});

export type SkillsListRequest = z.infer<typeof SkillsListRequestSchema>;
export type SkillsListResponse = z.infer<typeof SkillsListResponseSchema>;
