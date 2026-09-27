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
  CanvasNodeExecutionUpdate,
  CanvasNodeStatus,
  CanvasNodeWatcher,
  CanvasPriority,
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

export async function updateCanvasNodeExecution(input: {
  projectId: string;
  boardId: string;
  nodeId: string;
  expectedVersion: number;
  status?: CanvasNodeStatus;
  priority?: CanvasPriority | null;
}): Promise<CanvasNodeExecutionUpdate> {
  const setStatus = Object.prototype.hasOwnProperty.call(input, "status");
  const setPriority = Object.prototype.hasOwnProperty.call(input, "priority");

  if (!setStatus && !setPriority) {
    throw new Error("لم يتم تحديد تغيير للمهمة.");
  }

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/update_canvas_node_execution",
      {
        method: "POST",
        body: {
          p_project_id: input.projectId,
          p_board_id: input.boardId,
          p_node_id: input.nodeId,
          p_expected_version: input.expectedVersion,
          p_set_status: setStatus,
          p_status: setStatus ? input.status ?? null : null,
          p_set_priority: setPriority,
          p_priority: setPriority ? input.priority ?? null : null,
        },
      },
    );

    if (raw.ok !== true) {
      if (raw.reason === "version_mismatch") {
        throw new Error(
          "تم تعديل المهمة بواسطة مستخدم آخر. تم تحديث البيانات؛ أعد المحاولة على النسخة الجديدة.",
        );
      }
      throw new Error("لم تعد المهمة موجودة أو لم يعد الوصول إليها متاحًا.");
    }

    const status = raw.status;
    const priority = raw.priority;
    if (
      typeof raw.node_id !== "string" ||
      typeof raw.version !== "number" ||
      (status !== "idea" &&
        status !== "planned" &&
        status !== "in_progress" &&
        status !== "done" &&
        status !== "blocked") ||
      !(
        priority === null ||
        priority === "critical" ||
        priority === "high" ||
        priority === "medium" ||
        priority === "low"
      ) ||
      typeof raw.progress !== "number" ||
      typeof raw.updated_at !== "string"
    ) {
      throw new Error("عاد الخادم باستجابة غير صالحة لتحديث المهمة.");
    }

    return {
      node_id: raw.node_id,
      version: raw.version,
      status,
      priority,
      progress: raw.progress,
      updated_at: raw.updated_at,
      ...(typeof raw.revision === "number"
        ? { revision: raw.revision }
        : {}),
    };
  }

  const snapshot = await getBoardCanvas(input.boardId);
  const current = snapshot.nodes.find((node) => node.id === input.nodeId);
  if (!current) throw new Error("المهمة غير موجودة.");
  if ((current.version ?? 1) !== input.expectedVersion) {
    throw new Error(
      "تم تعديل المهمة بواسطة مستخدم آخر. أعد المحاولة على النسخة الجديدة.",
    );
  }

  const nextStatus = setStatus ? input.status! : current.status;
  const nextPriority = setPriority ? input.priority ?? null : current.priority;
  const nextProgress =
    setStatus && nextStatus === "done"
      ? 100
      : setStatus &&
          current.status === "done" &&
          nextStatus !== "done" &&
          current.progress === 100
        ? 0
        : current.progress;
  const now = new Date().toISOString();
  const nextVersion = (current.version ?? 1) + 1;
  const nextRevision = (snapshot.revision ?? 0) + 1;

  await saveBoardCanvas({
    ...snapshot,
    revision: nextRevision,
    nodes: snapshot.nodes.map((node) =>
      node.id === input.nodeId
        ? {
            ...node,
            status: nextStatus,
            priority: nextPriority,
            progress: nextProgress,
            version: nextVersion,
            updated_at: now,
          }
        : node,
    ),
  });

  return {
    node_id: input.nodeId,
    version: nextVersion,
    status: nextStatus,
    priority: nextPriority,
    progress: nextProgress,
    updated_at: now,
    revision: nextRevision,
  };
}

export async function refreshTaskDueNotifications(): Promise<number> {
  if (!isSupabaseBackend()) return 0;
  return supabaseRest<number>("rpc/refresh_task_due_notifications", {
    method: "POST",
    body: {},
  });
}
