import { z } from "zod";

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
});

export type SessionAbortEvent = z.infer<typeof SessionAbortEventSchema>;

export const SessionAbortedEventSchema = z.object({
  sessionId: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});

export type SessionAbortedEvent = z.infer<typeof SessionAbortedEventSchema>;

export const SessionPromptRequestEventSchema = z.object({
  requestId: z.string(),
  projectId: z.string(),
  sessionId: z.string(),
  prompt: z.string(),
  userId: z.string().optional(),
});

export type SessionPromptRequestEvent = z.infer<
  typeof SessionPromptRequestEventSchema
>;

export const SessionPromptStartedEventSchema = z.object({
  requestId: z.string(),
  projectId: z.string(),
  sessionId: z.string(),
});

export type SessionPromptStartedEvent = z.infer<
  typeof SessionPromptStartedEventSchema
>;

export const SessionPromptResponseEventSchema = z.object({
  requestId: z.string(),
  projectId: z.string(),
  sessionId: z.string(),
  success: z.boolean(),
  output: z.string(),
  error: z.string().optional(),
  exitCode: z.number(),
  duration: z.number(),
  messages: z.array(z.lazy(() => MessagePayloadSchema)).optional(),
});

export type SessionPromptResponseEvent = z.infer<
  typeof SessionPromptResponseEventSchema
>;

export const SessionStreamChunkEventSchema = z.object({
  requestId: z.string(),
  projectId: z.string(),
  sessionId: z.string(),
  messageId: z.string().optional(),
  chunk: z.string(),
  type: z.enum(["text", "reasoning", "tool", "step", "status", "complete"]),
  isComplete: z.boolean().optional(),
});

export type SessionStreamChunkEvent = z.infer<
  typeof SessionStreamChunkEventSchema
>;

export const RunStreamChunkEventSchema = z.object({
  requestId: z.string(),
  projectId: z.string(),
  sessionId: z.string().optional(),
  messageId: z.string().optional(),
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
  projectId: z.string(),
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
  projectId: z.string().optional(),
  userId: z.string().optional(),
  status: z.string().optional(),
  limit: z.number().optional(),
});

export const SessionsListResponseSchema = z.object({
  sessions: z.array(SessionPayloadSchema),
});

export const SessionGetRequestSchema = z.object({
  sessionId: z.string(),
});

export const SessionGetResponseSchema = z.object({
  session: SessionPayloadSchema.nullable(),
});

export const SessionCreateRequestSchema = z.object({
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
  content: z.string(),
  visibleContent: z.string(),
  thinkingContent: z.string().nullable(),
  thinkingDurationSeconds: z.number().nullable(),
  parts: z.array(
    z.object({
      type: z.enum(["text", "reasoning", "tool", "step", "other"]),
      content: z.string(),
      durationSeconds: z.number().nullable(),
    }),
  ),
  createdAt: z.string(),
});

export type MessagePayload = z.infer<typeof MessagePayloadSchema>;

export const SessionMessagesRequestSchema = z.object({
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
});

export type ProviderModel = z.infer<typeof ProviderModelSchema>;

export const ProviderPayloadSchema = z.object({
  id: z.string(),
  name: z.string(),
  models: z.array(ProviderModelSchema),
});

export type ProviderPayload = z.infer<typeof ProviderPayloadSchema>;

export const ProvidersListRequestSchema = z.object({});

export const ProvidersListResponseSchema = z.object({
  providers: z.array(ProviderPayloadSchema),
});

export type ProvidersListRequest = z.infer<typeof ProvidersListRequestSchema>;
export type ProvidersListResponse = z.infer<typeof ProvidersListResponseSchema>;
