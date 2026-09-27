import { isSupabaseBackend } from "@/lib/backend-config";
import { getStoredRemoteSession } from "@/services/auth.service";
import {
  getBoardCanvas,
  saveBoardCanvas,
} from "@/services/canvas.service";
import { CURRENT_USER } from "@/services/local-db";
import { supabaseRest } from "@/services/supabase-rest";
import type {
  CanvasNodeAssignment,
  CanvasNodeWatcher,
} from "@/types";

const WATCH_STORAGE_KEY = "projectflow.node-watchers.v1";

interface LocalWatchStore {
  version: 1;
  nodes: Record<string, string[]>;
}

function readWatchStore(): LocalWatchStore {
  if (typeof window === "undefined") return { version: 1, nodes: {} };
  try {
    const raw = window.localStorage.getItem(WATCH_STORAGE_KEY);
    if (!raw) return { version: 1, nodes: {} };
    const parsed = JSON.parse(raw) as Partial<LocalWatchStore>;
    return parsed.nodes && typeof parsed.nodes === "object"
      ? { version: 1, nodes: parsed.nodes }
      : { version: 1, nodes: {} };
  } catch {
    return { version: 1, nodes: {} };
  }
}

function writeWatchStore(store: LocalWatchStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WATCH_STORAGE_KEY, JSON.stringify(store));
}

export function getCurrentTaskUserId(): string | null {
  return isSupabaseBackend()
    ? getStoredRemoteSession()?.user.id ?? null
    : CURRENT_USER.id;
}

export async function setCanvasNodeAssignee(input: {
  projectId: string;
  boardId: string;
  nodeId: string;
  assigneeUserId: string | null;
  assigneeName?: string | null;
}): Promise<CanvasNodeAssignment> {
  if (isSupabaseBackend()) {
    const result = await supabaseRest<Record<string, unknown>>(
      "rpc/set_canvas_node_assignee",
      {
        method: "POST",
        body: {
          p_project_id: input.projectId,
          p_board_id: input.boardId,
          p_node_id: input.nodeId,
          p_assignee_user_id: input.assigneeUserId,
        },
      },
    );
    return {
      assignee_user_id:
        typeof result.assignee_user_id === "string"
          ? result.assignee_user_id
          : null,
      assignee_name:
        typeof result.assignee_name === "string"
          ? result.assignee_name
          : null,
    };
  }

  const snapshot = await getBoardCanvas(input.boardId);
  const next = {
    ...snapshot,
    nodes: snapshot.nodes.map((node) =>
      node.id === input.nodeId
        ? {
            ...node,
            assignee_user_id: input.assigneeUserId,
            assignee_name: input.assigneeName ?? null,
            owner: input.assigneeName ?? null,
            updated_at: new Date().toISOString(),
          }
        : node,
    ),
  };
  await saveBoardCanvas(next);
  return {
    assignee_user_id: input.assigneeUserId,
    assignee_name: input.assigneeName ?? null,
  };
}

export async function listCanvasNodeWatchers(input: {
  projectId: string;
  boardId: string;
  nodeId: string;
}): Promise<CanvasNodeWatcher[]> {
  if (isSupabaseBackend()) {
    return supabaseRest<CanvasNodeWatcher[]>(
      "rpc/list_canvas_node_watchers",
      {
        method: "POST",
        body: {
          p_project_id: input.projectId,
          p_board_id: input.boardId,
          p_node_id: input.nodeId,
        },
      },
    );
  }

  const store = readWatchStore();
  const ids = store.nodes[input.nodeId] ?? [];
  return ids.includes(CURRENT_USER.id)
    ? [
        {
          user_id: CURRENT_USER.id,
          full_name: CURRENT_USER.full_name,
          email: CURRENT_USER.email,
          created_at: new Date(0).toISOString(),
        },
      ]
    : [];
}

export async function setCanvasNodeWatching(input: {
  projectId: string;
  boardId: string;
  nodeId: string;
  watching: boolean;
}): Promise<void> {
  if (isSupabaseBackend()) {
    await supabaseRest<null>("rpc/set_canvas_node_watching", {
      method: "POST",
      body: {
        p_project_id: input.projectId,
        p_board_id: input.boardId,
        p_node_id: input.nodeId,
        p_watching: input.watching,
      },
    });
    return;
  }

  const store = readWatchStore();
  const current = new Set(store.nodes[input.nodeId] ?? []);
  if (input.watching) current.add(CURRENT_USER.id);
  else current.delete(CURRENT_USER.id);
  store.nodes[input.nodeId] = [...current];
  writeWatchStore(store);
}

export async function refreshTaskDueNotifications(): Promise<number> {
  if (!isSupabaseBackend()) return 0;
  return supabaseRest<number>("rpc/refresh_task_due_notifications", {
    method: "POST",
    body: {},
  });
}
