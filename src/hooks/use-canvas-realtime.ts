import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  subscribeCanvasRealtime,
  type CanvasRealtimeConnection,
  type RealtimeStatus,
} from "@/services/canvas-realtime.service";
import type { CanvasRemoteCursor } from "@/types/realtime-canvas";

export function useCanvasRealtime(
  boardId: string,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const connection = useRef<CanvasRealtimeConnection | null>(null);
  const refreshTimer = useRef<number | null>(null);
  const cursors = useRef(new Map<string, CanvasRemoteCursor>());
  const [cursorVersion, setCursorVersion] = useState(0);
  const [status, setStatus] = useState<RealtimeStatus>("offline");

  useEffect(() => {
    if (!enabled || !boardId) {
      connection.current?.close();
      connection.current = null;
      setStatus("offline");
      return;
    }

    connection.current = subscribeCanvasRealtime({
      boardId,
      onStatus: setStatus,
      onEvent: () => {
        if (refreshTimer.current !== null) {
          window.clearTimeout(refreshTimer.current);
        }
        refreshTimer.current = window.setTimeout(() => {
          refreshTimer.current = null;
          void queryClient.invalidateQueries({
            queryKey: ["canvas", boardId],
          });
        }, 80);
      },
      onCursor: (cursor) => {
        cursors.current.set(cursor.client_id, cursor);
        setCursorVersion((value) => value + 1);
      },
    });

    const expiry = window.setInterval(() => {
      const cutoff = Date.now() - 5_000;
      let changed = false;
      for (const [id, cursor] of cursors.current) {
        if (cursor.updated_at < cutoff) {
          cursors.current.delete(id);
          changed = true;
        }
      }
      if (changed) setCursorVersion((value) => value + 1);
    }, 1_500);

    return () => {
      window.clearInterval(expiry);
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
      connection.current?.close();
      connection.current = null;
      cursors.current.clear();
    };
  }, [boardId, enabled, queryClient]);

  const sendCursor = useCallback(
    (value: {
      x: number | null;
      y: number | null;
      selected_node_ids: string[];
      tool: string;
    }) => {
      connection.current?.sendCursor(value);
    },
    [],
  );

  return {
    status,
    sendCursor,
    remoteCursors: [...cursors.current.values()],
    cursorVersion,
  };
}
