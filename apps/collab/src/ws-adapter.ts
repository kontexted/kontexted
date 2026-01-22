type WebSocketEventHandler = (data?: unknown) => void;

type HandlerMap = {
  message?: WebSocketEventHandler;
  close?: WebSocketEventHandler;
  error?: WebSocketEventHandler;
  pong?: WebSocketEventHandler;
};

export const createBunWebSocketAdapter = (socket: WebSocket) => {
  const handlers: HandlerMap = {};

  const adapter = {
    binaryType: "arraybuffer" as BinaryType,
    get readyState() {
      return socket.readyState;
    },
    send(data: Uint8Array | ArrayBuffer, callback?: (error?: unknown) => void) {
      try {
        socket.send(data);
        callback?.();
      } catch (error) {
        callback?.(error);
      }
    },
    close(code?: number, reason?: string) {
      socket.close(code, reason);
    },
    ping() {
      if (socket && typeof (socket as any).ping === "function") {
        (socket as any).ping();
        return;
      }
      handlers.pong?.();
    },
    on(event: "message" | "close" | "error" | "pong", handler: WebSocketEventHandler) {
      handlers[event] = handler;
    },
    emit(event: "message" | "close" | "error" | "pong", data?: unknown) {
      handlers[event]?.(data);
    },
  };

  return adapter;
};

export type BunWebSocketAdapter = ReturnType<typeof createBunWebSocketAdapter>;
