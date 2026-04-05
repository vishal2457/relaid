import { io, type Socket } from "socket.io-client";
import { chatServerApiUrl } from "../axios/base";
import { getCurrentAccessToken } from "../pairing/session";

let chatSocket: Socket | null = null;

export function getChatSocket(): Socket | null {
  if (chatSocket) {
    return chatSocket;
  }

  const accessToken = getCurrentAccessToken();
  if (!accessToken) {
    return null;
  }

  chatSocket = io(chatServerApiUrl, {
    path: "/socket",
    transports: ["websocket"],
    auth: {
      accessToken,
      type: "mobile",
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  return chatSocket;
}

export function disconnectChatSocket() {
  if (chatSocket) {
    chatSocket.disconnect();
    chatSocket = null;
  }
}
