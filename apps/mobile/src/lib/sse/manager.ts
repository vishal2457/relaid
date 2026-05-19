import {
  SseClient,
  type SseEventCallback,
  type SseConnectionCallback,
  type SseErrorCallback,
} from "./client";
import { getCurrentAccessToken } from "@/src/lib/pairing/session";
import baseApi, { chatServerApiUrl } from "@/src/lib/axios/base";
import { encryptForServer } from "@/src/lib/e2ee";
import { getCurrentPairingSession } from "@/src/lib/pairing/session";

let sseClient: SseClient | null = null;
let listenerIdCounter = 0;
const listeners = new Map<number, SseManagerCallbacks>();

export type SseManagerCallbacks = {
  onEvent: SseEventCallback;
  onConnect?: SseConnectionCallback;
  onDisconnect?: SseConnectionCallback;
  onError?: SseErrorCallback;
};

function notifyListeners<K extends keyof SseManagerCallbacks>(
  key: K,
  ...args: Parameters<NonNullable<SseManagerCallbacks[K]>>
): void {
  for (const listener of listeners.values()) {
    const callback = listener[key];
    if (callback) {
      (callback as (...params: typeof args) => void)(...args);
    }
  }
}

function createSharedSseClient(): SseClient | null {
  const accessToken = getCurrentAccessToken();
  if (!accessToken) {
    return null;
  }

  if (sseClient) {
    return sseClient;
  }

  sseClient = new SseClient({
    onEvent(event, data) {
      notifyListeners("onEvent", event, data);
    },
    onConnect() {
      notifyListeners("onConnect");
    },
    onDisconnect() {
      notifyListeners("onDisconnect");
    },
    onError(error) {
      notifyListeners("onError", error);
    },
  });

  return sseClient;
}

export function subscribeToSse(callbacks: SseManagerCallbacks): {
  client: SseClient | null;
  unsubscribe: () => void;
} {
  const listenerId = ++listenerIdCounter;
  listeners.set(listenerId, callbacks);

  return {
    client: createSharedSseClient(),
    unsubscribe() {
      listeners.delete(listenerId);
    },
  };
}

export function getSseClient(): SseClient | null {
  return createSharedSseClient();
}

export function connectSseClient(): SseClient | null {
  const client = createSharedSseClient();
  client?.connect();
  return client;
}

export function disconnectSseClient(): void {
  if (sseClient) {
    sseClient.disconnect();
    sseClient = null;
  }
}

export async function sendPromptRequest(params: {
  sessionId: string;
  requestId: string;
  agentProviderId?: string;
  projectId: string;
  prompt: string;
  agent?: string;
  systemPrompt?: string;
  approvalPolicy?: string;
  effort?: string;
  appMentions?: Array<{ id: string; name: string }>;
  model?: { providerId: string; modelId: string };
}): Promise<void> {
  const session = getCurrentPairingSession();
  if (!session) {
    throw new Error("Missing pairing session");
  }
  await baseApi.post(`/mobile/sessions/${params.sessionId}/prompt`, {
    requestId: params.requestId,
    agentProviderId: params.agentProviderId,
    projectId: params.projectId,
    deviceId: session.deviceId,
    deviceKeyId: session.deviceKeyId,
    devicePublicKey: session.devicePublicKey,
    sealedPayload: encryptForServer(session, {
      prompt: params.prompt,
      agent: params.agent,
      systemPrompt: params.systemPrompt,
      approvalPolicy: params.approvalPolicy,
      effort: params.effort,
      appMentions: params.appMentions,
      model: params.model,
    }),
  });
}

export async function sendAbortRequest(params: {
  sessionId: string;
  requestId?: string;
  agentProviderId?: string;
  projectId?: string;
}): Promise<void> {
  const url = `/mobile/sessions/${params.sessionId}/abort`;
  const data = {
    requestId: params.requestId,
    agentProviderId: params.agentProviderId,
    projectId: params.projectId,
  };

  console.log("[SSE Manager] sendAbortRequest called");
  console.log("[SSE Manager] Params:", JSON.stringify(params));
  console.log("[SSE Manager] URL:", url);
  console.log("[SSE Manager] Data:", JSON.stringify(data));
  console.log("[SSE Manager] Base URL:", chatServerApiUrl);

  try {
    const response = await baseApi.post(url, data);
    console.log(
      "[SSE Manager] sendAbortRequest success:",
      response.status,
      JSON.stringify(response.data),
    );
  } catch (error: any) {
    console.error("[SSE Manager] sendAbortRequest FAILED:", error?.message);
    console.error(
      "[SSE Manager] Full URL would be:",
      `${chatServerApiUrl}/api${url}`,
    );
    throw error;
  }
}

export async function sendPermissionResponse(params: {
  sessionId: string;
  requestId: string;
  agentProviderId?: string;
  jobId: string;
  reply: "once" | "always" | "reject";
}): Promise<void> {
  const session = getCurrentPairingSession();
  if (!session) {
    throw new Error("Missing pairing session");
  }
  await baseApi.post(
    `/mobile/sessions/${params.sessionId}/permission-response`,
    {
      requestId: params.requestId,
      agentProviderId: params.agentProviderId,
      sessionId: params.sessionId,
      jobId: params.jobId,
      sealedPayload: encryptForServer(session, {
        reply: params.reply,
      }),
    },
  );
}

export async function sendQuestionResponse(params: {
  sessionId: string;
  requestId: string;
  agentProviderId?: string;
  jobId: string;
  answers: string[][];
}): Promise<void> {
  const session = getCurrentPairingSession();
  if (!session) {
    throw new Error("Missing pairing session");
  }
  await baseApi.post(`/mobile/sessions/${params.sessionId}/question-response`, {
    requestId: params.requestId,
    agentProviderId: params.agentProviderId,
    sessionId: params.sessionId,
    jobId: params.jobId,
    sealedPayload: encryptForServer(session, {
      answers: params.answers,
    }),
  });
}

export async function registerPushToken(params: {
  token: string;
  platform: string;
}): Promise<void> {
  await baseApi.post("/mobile/push-token", {
    token: params.token,
    platform: params.platform,
  });
}
