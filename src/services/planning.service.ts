import { isSupabaseBackend } from "@/lib/backend-config";
import { getBoardCanvas, saveBoardCanvas } from "@/services/canvas.service";
import { supabaseRest } from "@/services/supabase-rest";
import type {
  CanvasNodeScheduleUpdate,
  PlanningScenarioApplyResult,
  PlanningScenarioChange,
  ProjectPlanningData,
  ProjectScheduleBaselineItem,
  UpdateCanvasNodeScheduleInput,
} from "@/types/planning";

const LOCAL_KEY = "projectflow.planning.v1";

interface LocalPlanningProject {
  effort: Record<string, number>;
  capacity: Record<string, number>;
  baselines: Array<{
    id: string;
    name: string;
    created_at: string;
    created_by_name: string;
    items: ProjectScheduleBaselineItem[];
  }>;
}
interface LocalPlanningStore {
  version: 1;
  projects: Record<string, LocalPlanningProject>;
}

function emptyProject(): LocalPlanningProject {
  return { effort: {}, capacity: {}, baselines: [] };
}

function readLocal(): LocalPlanningStore {
  if (typeof window === "undefined") return { version: 1, projects: {} };
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LOCAL_KEY) ?? "{}",
    ) as Partial<LocalPlanningStore>;
    return parsed.projects && typeof parsed.projects === "object"
      ? { version: 1, projects: parsed.projects }
      : { version: 1, projects: {} };
  } catch {
    return { version: 1, projects: {} };
  }
}

function writeLocal(store: LocalPlanningStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function normalizePlanning(raw: Record<string, unknown>): ProjectPlanningData {
  const effortRows = Array.isArray(raw.effort) ? raw.effort : [];
  const capacityRows = Array.isArray(raw.capacity) ? raw.capacity : [];
  const dependencyRows = Array.isArray(raw.dependencies) ? raw.dependencies : [];
  const baselineRows = Array.isArray(raw.baselines) ? raw.baselines : [];

  const latest =
    raw.latest_baseline &&
    typeof raw.latest_baseline === "object" &&
    !Array.isArray(raw.latest_baseline)
      ? (raw.latest_baseline as Record<string, unknown>)
      : null;

  return {
    effort: effortRows.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const row = value as Record<string, unknown>;
      if (typeof row.board_id !== "string" || typeof row.node_id !== "string") {
        return [];
      }
      return [{
        board_id: row.board_id,
        node_id: row.node_id,
        effort_hours: numberOrNull(row.effort_hours),
      }];
    }),
    capacity: capacityRows.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const row = value as Record<string, unknown>;
      const hours = numberOrNull(row.weekly_capacity_hours);
      if (typeof row.user_id !== "string" || hours === null) return [];
      return [{ user_id: row.user_id, weekly_capacity_hours: hours }];
    }),
    dependencies: dependencyRows.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const row = value as Record<string, unknown>;
      const status = row.target_status;
      if (
        typeof row.board_id !== "string" ||
        typeof row.source_node_id !== "string" ||
        typeof row.target_node_id !== "string" ||
        typeof row.target_title !== "string" ||
        (status !== "idea" &&
          status !== "planned" &&
          status !== "in_progress" &&
          status !== "done" &&
          status !== "blocked")
      ) return [];
      return [{
        board_id: row.board_id,
        source_node_id: row.source_node_id,
        target_node_id: row.target_node_id,
        target_title: row.target_title,
        target_due_date: stringOrNull(row.target_due_date),
        target_status: status,
      }];
    }),
    baselines: baselineRows.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const row = value as Record<string, unknown>;
      if (
        typeof row.id !== "string" ||
        typeof row.name !== "string" ||
        typeof row.created_at !== "string"
      ) return [];
      return [{
        id: row.id,
        name: row.name,
        created_at: row.created_at,
        created_by: stringOrNull(row.created_by),
        created_by_name:
          typeof row.created_by_name === "string" ? row.created_by_name : "مستخدم",
        item_count: typeof row.item_count === "number" ? row.item_count : 0,
      }];
    }),
    latest_baseline:
      latest &&
      typeof latest.id === "string" &&
      typeof latest.name === "string" &&
      typeof latest.created_at === "string"
        ? {
            id: latest.id,
            name: latest.name,
            created_at: latest.created_at,
            items: normalizeBaselineItems(latest.items),
          }
        : null,
  };
}

function normalizeBaselineItems(value: unknown): ProjectScheduleBaselineItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const status = row.status;
    if (
      typeof row.board_id !== "string" ||
      typeof row.node_id !== "string" ||
      typeof row.title !== "string" ||
      typeof row.kind !== "string" ||
      (status !== "idea" &&
        status !== "planned" &&
        status !== "in_progress" &&
        status !== "done" &&
        status !== "blocked")
    ) return [];
    return [{
      board_id: row.board_id,
      node_id: row.node_id,
      title: row.title,
      kind: row.kind,
      start_date: stringOrNull(row.start_date),
      due_date: stringOrNull(row.due_date),
      status,
      progress: typeof row.progress === "number" ? row.progress : 0,
      assignee_user_id: stringOrNull(row.assignee_user_id),
      effort_hours: numberOrNull(row.effort_hours),
    }];
  });
}

export async function listProjectPlanningData(
  projectId: string,
): Promise<ProjectPlanningData> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/list_project_planning_data",
      { method: "POST", body: { p_project_id: projectId } },
    );
    return normalizePlanning(raw);
  }

  const project = readLocal().projects[projectId] ?? emptyProject();
  const latest = project.baselines[0] ?? null;
  return {
    effort: Object.entries(project.effort).map(([node_id, effort_hours]) => ({
      board_id: "",
      node_id,
      effort_hours,
    })),
    capacity: Object.entries(project.capacity).map(
      ([user_id, weekly_capacity_hours]) => ({
        user_id,
        weekly_capacity_hours,
      }),
    ),
    dependencies: [],
    baselines: project.baselines.map((baseline) => ({
      id: baseline.id,
      name: baseline.name,
      created_at: baseline.created_at,
      created_by: null,
      created_by_name: baseline.created_by_name,
      item_count: baseline.items.length,
    })),
    latest_baseline: latest
      ? {
          id: latest.id,
          name: latest.name,
          created_at: latest.created_at,
          items: latest.items,
        }
      : null,
  };
}

export async function updateCanvasNodeSchedule(
  input: UpdateCanvasNodeScheduleInput,
): Promise<CanvasNodeScheduleUpdate> {
  const setStart = Object.prototype.hasOwnProperty.call(input, "startDate");
  const setDue = Object.prototype.hasOwnProperty.call(input, "dueDate");
  const setEffort = Object.prototype.hasOwnProperty.call(input, "effortHours");

  if (!setStart && !setDue && !setEffort) {
    throw new Error("لم يتم تحديد تغيير في خطة المهمة.");
  }

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/update_canvas_node_schedule",
      {
        method: "POST",
        body: {
          p_project_id: input.projectId,
          p_board_id: input.boardId,
          p_node_id: input.nodeId,
          p_expected_version: input.expectedVersion,
          p_set_start_date: setStart,
          p_start_date: setStart ? input.startDate ?? null : null,
          p_set_due_date: setDue,
          p_due_date: setDue ? input.dueDate ?? null : null,
          p_set_effort_hours: setEffort,
          p_effort_hours: setEffort ? input.effortHours ?? null : null,
        },
      },
    );
    if (raw.ok !== true) {
      if (raw.reason === "version_mismatch") {
        throw new Error("تم تعديل المهمة بواسطة مستخدم آخر. حدّث البيانات وأعد المحاولة.");
      }
      throw new Error("لم تعد المهمة موجودة أو لم يعد الوصول إليها متاحًا.");
    }
    if (
      typeof raw.node_id !== "string" ||
      typeof raw.version !== "number" ||
      typeof raw.updated_at !== "string"
    ) {
      throw new Error("عاد الخادم باستجابة تخطيط غير صالحة.");
    }
    return {
      node_id: raw.node_id,
      version: raw.version,
      start_date: stringOrNull(raw.start_date),
      due_date: stringOrNull(raw.due_date),
      effort_hours: numberOrNull(raw.effort_hours),
      updated_at: raw.updated_at,
      ...(typeof raw.revision === "number" ? { revision: raw.revision } : {}),
    };
  }

  const snapshot = await getBoardCanvas(input.boardId);
  const current = snapshot.nodes.find((node) => node.id === input.nodeId);
  if (!current) throw new Error("المهمة غير موجودة.");
  if ((current.version ?? 1) !== input.expectedVersion) {
    throw new Error("تم تعديل المهمة بواسطة مستخدم آخر. أعد المحاولة.");
  }
  const startDate = setStart ? input.startDate ?? null : current.start_date;
  const dueDate = setDue ? input.dueDate ?? null : current.due_date;
  if (startDate && dueDate && startDate > dueDate) {
    throw new Error("تاريخ البداية يجب ألا يكون بعد تاريخ الاستحقاق.");
  }

  const now = new Date().toISOString();
  const version = (current.version ?? 1) + 1;
  const revision = (snapshot.revision ?? 0) + 1;
  await saveBoardCanvas({
    ...snapshot,
    revision,
    nodes: snapshot.nodes.map((node) =>
      node.id === input.nodeId
        ? {
            ...node,
            start_date: startDate,
            due_date: dueDate,
            effort_hours: setEffort
              ? input.effortHours ?? null
              : node.effort_hours,
            version,
            updated_at: now,
          }
        : node,
    ),
  });

  const store = readLocal();
  const project = store.projects[input.projectId] ?? emptyProject();
  if (setEffort) {
    if (input.effortHours == null) delete project.effort[input.nodeId];
    else project.effort[input.nodeId] = input.effortHours;
  }
  store.projects[input.projectId] = project;
  writeLocal(store);

  return {
    node_id: input.nodeId,
    version,
    start_date: startDate,
    due_date: dueDate,
    effort_hours: project.effort[input.nodeId] ?? null,
    updated_at: now,
    revision,
  };
}

export async function setProjectMemberCapacity(input: {
  projectId: string;
  userId: string;
  weeklyCapacityHours: number;
}) {
  if (isSupabaseBackend()) {
    await supabaseRest<null>("rpc/set_project_member_capacity", {
      method: "POST",
      body: {
        p_project_id: input.projectId,
        p_user_id: input.userId,
        p_weekly_capacity_hours: input.weeklyCapacityHours,
      },
    });
    return;
  }
  const store = readLocal();
  const project = store.projects[input.projectId] ?? emptyProject();
  project.capacity[input.userId] = input.weeklyCapacityHours;
  store.projects[input.projectId] = project;
  writeLocal(store);
}

export async function createProjectScheduleBaseline(input: {
  projectId: string;
  name: string;
  localItems?: ProjectScheduleBaselineItem[];
}) {
  if (isSupabaseBackend()) {
    return supabaseRest<string>("rpc/create_project_schedule_baseline", {
      method: "POST",
      body: {
        p_project_id: input.projectId,
        p_name: input.name,
      },
    });
  }

  const store = readLocal();
  const project = store.projects[input.projectId] ?? emptyProject();
  const id = crypto.randomUUID();
  project.baselines.unshift({
    id,
    name: input.name.trim(),
    created_at: new Date().toISOString(),
    created_by_name: "المستخدم الحالي",
    items: input.localItems ?? [],
  });
  store.projects[input.projectId] = project;
  writeLocal(store);
  return id;
}


export interface LocalPlanningMigrationData {
  effort: Record<string, number>;
  capacity: Record<string, number>;
  baselines: Array<{
    id: string;
    name: string;
    created_at: string;
    created_by_name: string;
    items: ProjectScheduleBaselineItem[];
  }>;
}

/** Read-only migration bridge. Never mutates or clears the local planning store. */
export function readLocalPlanningForMigration(
  projectId: string,
): LocalPlanningMigrationData {
  const project = readLocal().projects[projectId] ?? emptyProject();
  return {
    effort: { ...project.effort },
    capacity: { ...project.capacity },
    baselines: project.baselines.map((baseline) => ({
      ...baseline,
      items: baseline.items.map((item) => ({ ...item })),
    })),
  };
}


export async function applyProjectPlanningScenario(input: {
  projectId: string;
  changes: PlanningScenarioChange[];
}): Promise<PlanningScenarioApplyResult> {
  if (!input.changes.length) {
    throw new Error("لا توجد تغييرات لاعتمادها.");
  }
  if (input.changes.length > 50) {
    throw new Error("السيناريو يدعم حتى 50 تغييرًا في عملية اعتماد واحدة.");
  }

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/apply_project_planning_scenario",
      {
        method: "POST",
        body: {
          p_project_id: input.projectId,
          p_changes: input.changes.map((change) => ({
            board_id: change.board_id,
            node_id: change.node_id,
            expected_version: change.expected_version,
            start_date: change.start_date,
            due_date: change.due_date,
            effort_hours: change.effort_hours,
            assignee_user_id: change.assignee_user_id,
          })),
        },
      },
    );

    if (raw.ok !== true || typeof raw.applied_count !== "number") {
      throw new Error("لم يتم اعتماد السيناريو.");
    }
    return { ok: true, applied_count: raw.applied_count };
  }

  // Local fallback: pre-validate the entire change set before any write.
  const snapshots = new Map<string, Awaited<ReturnType<typeof getBoardCanvas>>>();
  for (const change of input.changes) {
    const snapshot =
      snapshots.get(change.board_id) ?? (await getBoardCanvas(change.board_id));
    snapshots.set(change.board_id, snapshot);

    const current = snapshot.nodes.find((node) => node.id === change.node_id);
    if (!current) throw new Error(`المهمة «${change.node_id}» غير موجودة.`);
    if ((current.version ?? 1) !== change.expected_version) {
      throw new Error(
        "تم تعديل إحدى المهام أثناء مراجعة السيناريو. حدّث البيانات وأعد المحاولة.",
      );
    }
    if (
      change.start_date &&
      change.due_date &&
      change.start_date > change.due_date
    ) {
      throw new Error("يوجد تغيير بتاريخ بداية بعد تاريخ الاستحقاق.");
    }
    if (
      change.effort_hours !== null &&
      (change.effort_hours < 0 || change.effort_hours > 10000)
    ) {
      throw new Error("يوجد جهد مقدّر خارج النطاق المسموح.");
    }
  }

  const store = readLocal();
  const project = store.projects[input.projectId] ?? emptyProject();
  const changesByBoard = new Map<string, PlanningScenarioChange[]>();
  for (const change of input.changes) {
    const rows = changesByBoard.get(change.board_id) ?? [];
    rows.push(change);
    changesByBoard.set(change.board_id, rows);
  }

  for (const [boardId, changes] of changesByBoard) {
    const snapshot = snapshots.get(boardId)!;
    const now = new Date().toISOString();
    const changeMap = new Map(changes.map((change) => [change.node_id, change]));
    await saveBoardCanvas({
      ...snapshot,
      revision: (snapshot.revision ?? 0) + changes.length,
      nodes: snapshot.nodes.map((node) => {
        const change = changeMap.get(node.id);
        if (!change) return node;
        return {
          ...node,
          start_date: change.start_date,
          due_date: change.due_date,
          effort_hours: change.effort_hours,
          assignee_user_id: change.assignee_user_id,
          assignee_name: change.assignee_name ?? null,
          owner: change.assignee_name ?? null,
          version: (node.version ?? 1) + 1,
          updated_at: now,
        };
      }),
      updated_at: now,
    });
  }

  for (const change of input.changes) {
    if (change.effort_hours == null) delete project.effort[change.node_id];
    else project.effort[change.node_id] = change.effort_hours;
  }
  store.projects[input.projectId] = project;
  writeLocal(store);

  return { ok: true, applied_count: input.changes.length };
}
