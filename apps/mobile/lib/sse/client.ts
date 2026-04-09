import { fetch as expoFetch } from "expo/fetch";
import { chatServerApiUrl } from "../axios/base";
import { getCurrentAccessToken } from "../pairing/session";

export type SseEventCallback = (
  event: string,
  data: Record<string, unknown>,
) => void;
export type SseConnectionCallback = () => void;
export type SseErrorCallback = (error: Error) => void;

export type SseClientOptions = {
  onEvent: SseEventCallback;
  onConnect?: SseConnectionCallback;
  onDisconnect?: SseConnectionCallback;
  onError?: SseErrorCallback;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  inactivityTimeoutMs?: number;
};

export type SseClientState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

type ParsedSseMessage = {
  event: string;
  data: string[];
  id: string | null;
};

function createEmptyMessage(): ParsedSseMessage {
  return {
    event: "message",
    data: [],
    id: null,
  };
}

class SseHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SseHttpError";
  }
}

export class SseClient {
  private abortController: AbortController | null = null;
  private state: SseClientState = "idle";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionEpoch = 0;
  private lastEventId: string | null = null;
  private readonly options: Required<SseClientOptions>;

  constructor(options: SseClientOptions) {
    this.options = {
      onEvent: options.onEvent,
      onConnect: options.onConnect ?? (() => {}),
      onDisconnect: options.onDisconnect ?? (() => {}),
      onError: options.onError ?? (() => {}),
      reconnectDelay: options.reconnectDelay ?? 1000,
      maxReconnectDelay: options.maxReconnectDelay ?? 30000,
      inactivityTimeoutMs: options.inactivityTimeoutMs ?? 75_000,
    };
  }

  getState(): SseClientState {
    return this.state;
  }

  connect(): void {
    if (this.state === "connecting" || this.state === "connected") {
      return;
    }

    const accessToken = getCurrentAccessToken();
    if (!accessToken) {
      this.state = "error";
      this.options.onError(new Error("No access token available"));
      return;
    }

    this.clearReconnectTimer();
    this.clearInactivityTimer();
    this.abortController?.abort();
    this.abortController = new AbortController();
    const epoch = ++this.connectionEpoch;
    this.state = "connecting";

    const url = `${chatServerApiUrl}/api/sse/stream`;

    this.readSseStream(url, accessToken, epoch).catch((error) => {
      if (
        this.abortController?.signal.aborted ||
        epoch !== this.connectionEpoch
      ) {
        return;
      }

      const errMsg = error instanceof Error ? error.message : String(error);
      console.log("[SSE] Connection error:", errMsg);
      this.state = "error";
      this.options.onError(error instanceof Error ? error : new Error(errMsg));

      if (this.shouldReconnect(error)) {
        this.scheduleReconnect();
      }
    });
  }

  disconnect(): void {
    this.clearReconnectTimer();
    this.clearInactivityTimer();
    this.reconnectAttempt = 0;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.state === "connected") {
      this.state = "disconnected";
      this.options.onDisconnect();
      return;
    }

    this.state = "disconnected";
  }

  private async readSseStream(
    url: string,
    accessToken: string,
    epoch: number,
  ): Promise<void> {
    const response = await expoFetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "text/event-stream",
        ...(this.lastEventId
          ? { "Last-Event-ID": this.lastEventId }
          : undefined),
      },
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SseHttpError(
        response.status,
        `SSE connection failed: ${response.status} ${body}`,
      );
    }

    this.state = "connected";
    this.reconnectAttempt = 0;
    console.log("[SSE] Connected");
    this.options.onConnect();
    this.bumpInactivityTimeout(epoch);

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Response body is not readable");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let message = createEmptyMessage();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log("[SSE] Stream ended");
          break;
        }

        this.bumpInactivityTimeout(epoch);
        buffer += decoder.decode(value, { stream: true });
        const processed = this.processBuffer(buffer, message);
        buffer = processed.nextBuffer;
        message = processed.nextMessage;
      }

      buffer += decoder.decode();
      const processed = this.processBuffer(`${buffer}\n`, message);
      message = processed.nextMessage;
    } finally {
      this.clearInactivityTimer();
      reader.releaseLock();
    }

    if (epoch !== this.connectionEpoch) {
      return;
    }

    if (this.state === "connected" && !this.abortController?.signal.aborted) {
      this.state = "disconnected";
      this.options.onDisconnect();
      this.scheduleReconnect();
    }
  }

  private processBuffer(
    buffer: string,
    message: ParsedSseMessage,
  ): { nextBuffer: string; nextMessage: ParsedSseMessage } {
    let remaining = buffer;
    let current = message;

    while (true) {
      const lineBreakIndex = remaining.indexOf("\n");
      if (lineBreakIndex < 0) {
        return { nextBuffer: remaining, nextMessage: current };
      }

      const rawLine = remaining.slice(0, lineBreakIndex);
      remaining = remaining.slice(lineBreakIndex + 1);
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

      if (line === "") {
        this.dispatchMessage(current);
        current = createEmptyMessage();
        continue;
      }

      if (line.startsWith(":")) {
        continue;
      }

      const separatorIndex = line.indexOf(":");
      const field = separatorIndex >= 0 ? line.slice(0, separatorIndex) : line;
      const rawValue =
        separatorIndex >= 0 ? line.slice(separatorIndex + 1) : "";
      const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

      switch (field) {
        case "event":
          current.event = value || "message";
          break;
        case "data":
          current.data.push(value);
          break;
        case "id":
          current.id = value;
          break;
        case "retry": {
          const retry = Number.parseInt(value, 10);
          if (Number.isFinite(retry) && retry >= 0) {
            this.options.reconnectDelay = retry;
          }
          break;
        }
      }
    }
  }

  private dispatchMessage(message: ParsedSseMessage): void {
    if (message.id) {
      this.lastEventId = message.id;
    }

    if (message.data.length === 0) {
      return;
    }

    const data = message.data.join("\n");
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      this.options.onEvent(message.event, parsed);
    } catch {
      console.warn("[SSE] Failed to parse event data:", data);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.clearInactivityTimer();
    const delay = Math.min(
      Math.round(
        this.options.reconnectDelay *
          Math.pow(2, this.reconnectAttempt) *
          (0.9 + Math.random() * 0.2),
      ),
      this.options.maxReconnectDelay,
    );

    this.reconnectAttempt += 1;
    console.log(
      `[SSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private bumpInactivityTimeout(epoch: number): void {
    this.clearInactivityTimer();
    this.inactivityTimer = setTimeout(() => {
      this.inactivityTimer = null;

      if (epoch !== this.connectionEpoch || this.state !== "connected") {
        return;
      }

      console.warn("[SSE] Connection timed out due to inactivity");
      this.abortController?.abort();
      this.state = "error";
      this.options.onError(new Error("SSE connection stalled"));
      this.scheduleReconnect();
    }, this.options.inactivityTimeoutMs);
  }

  private clearInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
  }

  private shouldReconnect(error: unknown): boolean {
    if (error instanceof SseHttpError) {
      return error.status >= 500 || error.status === 429;
    }

    return true;
  }
}
