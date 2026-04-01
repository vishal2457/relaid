import { io, type Socket } from "socket.io-client";
import { chatServerApiUrl, chatServerUserId } from "../axios/base";

let chatSocket: Socket | null = null;

export function getChatSocket(): Socket {
  if (chatSocket) {
    return chatSocket;
  }

  chatSocket = io(chatServerApiUrl, {
    path: "/socket",
    transports: ["websocket"],
    auth: {
      userId: chatServerUserId,
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
