import { BACKEND_CONFIG, isSupabaseBackend } from "@/lib/backend-config";
import {
  getStoredRemoteSession,
  requireRemoteSession,
} from "@/services/auth.service";
import { CURRENT_USER } from "@/services/local-db";
import { getCanvasClientId } from "@/services/canvas-collaboration.service";
import type {
  CanvasRemoteCursor,
  CanvasRemoteEvent,
} from "@/types/realtime-canvas";

type RealtimeStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "error";

interface SubscribeOptions {
  boardId: string;
  onEvent: (event: CanvasRemoteEvent) => void;
  onCursor: (cursor: CanvasRemoteCursor) => void;
  onStatus?: (status: RealtimeStatus) => void;
}

export interface CanvasRealtimeConnection {
  sendCursor: (cursor: Omit<
    CanvasRemoteCursor,
    "client_id" | "user_id" | "user_name" | "updated_at"
  >) => void;
  close: () => void;
}

interface PhoenixMessage {
  topic?: string;
  event?: string;
  payload?: unknown;
  ref?: string | null;
  join_ref?: string | null;
}

function uuid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
        const value = Math.floor(Math.random() * 16);
        return (token === "x" ? value : (value & 0x3) | 0x8).toString(16);
      });
}

function realtimeSocketUrl() {
  const url = new URL(BACKEND_CONFIG.supabaseUrl);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  url.pathname = "/realtime/v1/websocket";
  url.search = "";
  url.searchParams.set("apikey", BACKEND_CONFIG.supabaseAnonKey);
  url.searchParams.set("vsn", "1.0.0");
  return url.toString();
}

function normalizeRemoteEvent(value: unknown): CanvasRemoteEvent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.board_id !== "string" ||
    typeof raw.revision !== "number" ||
    typeof raw.client_id !== "string"
  ) {
    return null;
  }
  return {
    board_id: raw.board_id,
    revision: raw.revision,
    actor_user_id:
      typeof raw.actor_user_id === "string" ? raw.actor_user_id : null,
    client_id: raw.client_id,
    operations: Array.isArray(raw.operations)
      ? (raw.operations as CanvasRemoteEvent["operations"])
      : [],
    created_at:
      typeof raw.created_at === "string"
        ? raw.created_at
        : new Date().toISOString(),
  };
}

function normalizeCursor(value: unknown): CanvasRemoteCursor | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.client_id !== "string" ||
    typeof raw.user_id !== "string" ||
    typeof raw.user_name !== "string"
  ) {
    return null;
  }
  return {
    client_id: raw.client_id,
    user_id: raw.user_id,
    user_name: raw.user_name,
    x: typeof raw.x === "number" ? raw.x : null,
    y: typeof raw.y === "number" ? raw.y : null,
    selected_node_ids: Array.isArray(raw.selected_node_ids)
      ? raw.selected_node_ids.filter(
          (id): id is string => typeof id === "string",
        )
      : [],
    tool: typeof raw.tool === "string" ? raw.tool : "select",
    updated_at:
      typeof raw.updated_at === "number" ? raw.updated_at : Date.now(),
  };
}

function subscribeLocal(options: SubscribeOptions): CanvasRealtimeConnection {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    options.onStatus?.("offline");
    return { sendCursor: () => {}, close: () => {} };
  }

  const clientId = getCanvasClientId();
  const channel = new BroadcastChannel(
    `projectflow.canvas.realtime.${options.boardId}`,
  );
  options.onStatus?.("connected");

  channel.onmessage = (event) => {
    const message = event.data as {
      type?: string;
      payload?: unknown;
    } | null;
    if (message?.type === "canvas-event") {
      const parsed = normalizeRemoteEvent(message.payload);
      if (parsed && parsed.client_id !== clientId) options.onEvent(parsed);
    } else if (message?.type === "cursor") {
      const parsed = normalizeCursor(message.payload);
      if (parsed && parsed.client_id !== clientId) options.onCursor(parsed);
    }
  };

  return {
    sendCursor: (cursor) => {
      channel.postMessage({
        type: "cursor",
        payload: {
          ...cursor,
          client_id: clientId,
          user_id: CURRENT_USER.id,
          user_name: CURRENT_USER.full_name,
          updated_at: Date.now(),
        },
      });
    },
    close: () => {
      channel.close();
      options.onStatus?.("offline");
    },
  };
}

export function broadcastLocalCanvasSaved(
  event: CanvasRemoteEvent,
): void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return;
  }
  const channel = new BroadcastChannel(
    `projectflow.canvas.realtime.${event.board_id}`,
  );
  channel.postMessage({ type: "canvas-event", payload: event });
  channel.close();
}

export function subscribeCanvasRealtime(
  options: SubscribeOptions,
): CanvasRealtimeConnection {
  if (!isSupabaseBackend()) return subscribeLocal(options);

  let socket: WebSocket | null = null;
  let heartbeat: number | null = null;
  let tokenRefresh: number | null = null;
  let reconnectTimer: number | null = null;
  let closed = false;
  let joined = false;
  let attempt = 0;
  let refCounter = 0;
  let joinRef = "";
  let currentToken = "";
  const clientId = getCanvasClientId();
  const topic = `realtime:board:${options.boardId}`;

  const nextRef = () => String(++refCounter);

  const clearTimers = () => {
    if (heartbeat !== null) window.clearInterval(heartbeat);
    if (tokenRefresh !== null) window.clearInterval(tokenRefresh);
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    heartbeat = null;
    tokenRefresh = null;
    reconnectTimer = null;
  };

  const send = (message: PhoenixMessage) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  };

  const updateAccessToken = async () => {
    try {
      const session = await requireRemoteSession();
      if (!session.access_token || session.access_token === currentToken) return;
      currentToken = session.access_token;
      if (joined) {
        send({
          topic,
          event: "access_token",
          payload: { access_token: currentToken },
          ref: nextRef(),
          join_ref: joinRef,
        });
      }
    } catch {
      // AuthGate will handle an expired/invalid session.
    }
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer !== null) return;
    joined = false;
    options.onStatus?.("reconnecting");
    const delay = Math.min(10_000, 700 * 2 ** Math.min(attempt, 4));
    attempt += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  };

  const connect = async () => {
    if (closed) return;
    options.onStatus?.(attempt ? "reconnecting" : "connecting");

    try {
      const session = await requireRemoteSession();
      currentToken = session.access_token;
      const ws = new WebSocket(realtimeSocketUrl());
      socket = ws;

      ws.onopen = () => {
        if (closed || socket !== ws) return;
        joinRef = nextRef();
        send({
          topic,
          event: "phx_join",
          payload: {
            config: {
              broadcast: { ack: false, self: false },
              presence: { enabled: false },
              postgres_changes: [
                {
                  event: "INSERT",
                  schema: "public",
                  table: "board_collaboration_events",
                  filter: `board_id=eq.${options.boardId}`,
                },
              ],
              private: true,
            },
            access_token: currentToken,
          },
          ref: joinRef,
          join_ref: joinRef,
        });

        heartbeat = window.setInterval(() => {
          send({
            topic: "phoenix",
            event: "heartbeat",
            payload: {},
            ref: nextRef(),
            join_ref: null,
          });
        }, 20_000);

        tokenRefresh = window.setInterval(() => {
          void updateAccessToken();
        }, 30_000);
      };

      ws.onmessage = (message) => {
        if (typeof message.data !== "string") return;
        let parsed: PhoenixMessage;
        try {
          parsed = JSON.parse(message.data) as PhoenixMessage;
        } catch {
          return;
        }

        if (
          parsed.event === "phx_reply" &&
          parsed.ref === joinRef &&
          parsed.payload &&
          typeof parsed.payload === "object"
        ) {
          const payload = parsed.payload as {
            status?: string;
            response?: unknown;
          };
          if (payload.status === "ok") {
            joined = true;
            attempt = 0;
            options.onStatus?.("connected");
          } else {
            options.onStatus?.("error");
          }
          return;
        }

        if (parsed.event === "postgres_changes") {
          const payload = parsed.payload as {
            data?: { record?: unknown };
          } | null;
          const event = normalizeRemoteEvent(payload?.data?.record);
          if (event && event.client_id !== clientId) options.onEvent(event);
          return;
        }

        if (parsed.event === "broadcast") {
          const payload = parsed.payload as {
            event?: string;
            payload?: unknown;
          } | null;
          if (payload?.event !== "cursor") return;
          const cursor = normalizeCursor(payload.payload);
          if (cursor && cursor.client_id !== clientId) {
            options.onCursor(cursor);
          }
          return;
        }

        if (parsed.event === "phx_error") {
          options.onStatus?.("error");
          ws.close();
        }
      };

      ws.onerror = () => {
        if (!closed) options.onStatus?.("error");
      };

      ws.onclose = () => {
        if (socket === ws) socket = null;
        if (heartbeat !== null) window.clearInterval(heartbeat);
        if (tokenRefresh !== null) window.clearInterval(tokenRefresh);
        heartbeat = null;
        tokenRefresh = null;
        if (!closed) scheduleReconnect();
      };
    } catch {
      scheduleReconnect();
    }
  };

  void connect();

  return {
    sendCursor: (cursor) => {
      const session = getStoredRemoteSession();
      if (!joined || !session) return;
      send({
        topic,
        event: "broadcast",
        payload: {
          type: "broadcast",
          event: "cursor",
          payload: {
            ...cursor,
            client_id: clientId,
            user_id: session.user.id,
            user_name: session.user.full_name,
            updated_at: Date.now(),
          },
        },
        ref: nextRef(),
        join_ref: joinRef,
      });
    },
    close: () => {
      closed = true;
      clearTimers();
      if (socket?.readyState === WebSocket.OPEN) {
        send({
          topic,
          event: "phx_leave",
          payload: {},
          ref: nextRef(),
          join_ref: joinRef,
        });
      }
      socket?.close();
      socket = null;
      options.onStatus?.("offline");
    },
  };
}

export type { RealtimeStatus };
