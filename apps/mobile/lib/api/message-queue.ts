import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import baseApi from "../axios/base";

export type QueueItemStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "aborted";

export interface QueueItem {
  id: string;
  projectId: string;
  prompt: string;
  status: QueueItemStatus;
  sessionId: string | null;
  error: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export type MessageQueueResponse = {
  items: QueueItem[];
};

export type QueueAddResponse = {
  item: QueueItem;
};

export type QueueRemoveResponse = {
  success: boolean;
  error?: string;
};

export type QueueUpdateResponse = {
  item: QueueItem | null;
  error?: string;
};

export type QueueExecuteResponse = {
  success: boolean;
  sessionId?: string;
  error?: string;
};

export const messageQueueKeys = {
  all: ["message-queue"] as const,
  lists: () => [...messageQueueKeys.all, "list"] as const,
  list: (projectId: string) =>
    [...messageQueueKeys.lists(), projectId] as const,
};

export function useMessageQueue(projectId: string, enabled = true) {
  return useQuery<MessageQueueResponse>({
    queryKey: messageQueueKeys.list(projectId),
    enabled: Boolean(projectId) && enabled,
    queryFn: async () => {
      const response = await baseApi.get<MessageQueueResponse>(
        "/message-queue",
        { params: { projectId } },
      );
      return {
        items: response.data.items ?? [],
      };
    },
  });
}

export function useAddToQueue(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (prompt: string) => {
      const response = await baseApi.post<QueueAddResponse>("/message-queue", {
        projectId,
        prompt,
      });
      return response.data.item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: messageQueueKeys.list(projectId),
      });
    },
  });
}

export function useRemoveFromQueue(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (queueItemId: string) => {
      const response = await baseApi.delete<QueueRemoveResponse>(
        `/message-queue/${queueItemId}`,
      );
      if (!response.data.success) {
        throw new Error(response.data.error ?? "Failed to remove queue item");
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: messageQueueKeys.list(projectId),
      });
    },
  });
}

export function useUpdateQueueItem(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      queueItemId,
      prompt,
      position,
    }: {
      queueItemId: string;
      prompt?: string;
      position?: number;
    }) => {
      const response = await baseApi.put<QueueUpdateResponse>(
        `/message-queue/${queueItemId}`,
        { prompt, position },
      );
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      return response.data.item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: messageQueueKeys.list(projectId),
      });
    },
  });
}

export function useExecuteQueueItem(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      queueItemId,
      sessionId,
      createNewSession,
    }: {
      queueItemId: string;
      sessionId?: string;
      createNewSession?: boolean;
    }) => {
      const response = await baseApi.post<QueueExecuteResponse>(
        `/message-queue/${queueItemId}/execute`,
        { sessionId, createNewSession, projectId },
      );
      if (!response.data.success) {
        throw new Error(response.data.error ?? "Failed to execute queue item");
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: messageQueueKeys.list(projectId),
      });
    },
  });
}
