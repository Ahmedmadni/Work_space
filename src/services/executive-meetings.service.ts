import { isSupabaseBackend } from "@/lib/backend-config";
import {
  listProjectActionCenter,
  saveProjectDecision,
} from "@/services/action-center.service";
import { supabaseRest } from "@/services/supabase-rest";
import type {
  ExecutiveMeetingActionItem,
  ExecutiveMeetingActionStatus,
  ExecutiveMeetingAttendee,
  ExecutiveMeetingAttendanceStatus,
  ExecutiveMeetingDecision,
  ExecutiveMeetingDecisionOutcome,
  ExecutiveMeetingGovernanceData,
  ExecutiveMeetingStatus,
  ExecutiveStrategyMeeting,
  SaveExecutiveStrategyMeetingInput,
  SavedExecutiveMeetingRef,
  UpdateExecutiveMeetingActionInput,
} from "@/types/executive-meetings";

const LOCAL_KEY = "projectflow.executive-meetings.v1";

interface LocalMeetingStore {
  version: 1;
  meetings: ExecutiveStrategyMeeting[];
}

function readLocal(): LocalMeetingStore {
  if (typeof window === "undefined") {
    return { version: 1, meetings: [] };
  }
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(LOCAL_KEY) ?? "{}",
    ) as Partial<LocalMeetingStore>;
    return Array.isArray(parsed.meetings)
      ? { version: 1, meetings: parsed.meetings }
      : { version: 1, meetings: [] };
  } catch {
    return { version: 1, meetings: [] };
  }
}

function writeLocal(store: LocalMeetingStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
}

function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }
  return null;
}

function numberValue(value: unknown, fallback = 0) {
  return numberOrNull(value) ?? fallback;
}

function meetingStatus(value: unknown): ExecutiveMeetingStatus {
  return value === "draft" ||
    value === "in_progress" ||
    value === "completed" ||
    value === "cancelled"
    ? value
    : "draft";
}

function attendanceStatus(
  value: unknown,
): ExecutiveMeetingAttendanceStatus {
  return value === "invited" ||
    value === "attended" ||
    value === "absent" ||
    value === "excused"
    ? value
    : "invited";
}

function decisionOutcome(
  value: unknown,
): ExecutiveMeetingDecisionOutcome {
  return value === "decided" ||
    value === "deferred" ||
    value === "rejected"
    ? value
    : "deferred";
}

function actionStatus(value: unknown): ExecutiveMeetingActionStatus {
  return value === "open" ||
    value === "in_progress" ||
    value === "done" ||
    value === "cancelled"
    ? value
    : "open";
}

function normalizeAttendee(value: unknown): ExecutiveMeetingAttendee | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.display_name !== "string") {
    return null;
  }
  return {
    id: row.id,
    user_id: stringOrNull(row.user_id),
    display_name: row.display_name,
    email_snapshot: stringOrNull(row.email_snapshot),
    role_label: stringOrNull(row.role_label),
    attendance_status: attendanceStatus(row.attendance_status),
    created_at:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date(0).toISOString(),
  };
}

function normalizeDecision(value: unknown): ExecutiveMeetingDecision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.title !== "string") {
    return null;
  }
  return {
    id: row.id,
    source_decision_id: stringOrNull(row.source_decision_id),
    source_decision_version: numberOrNull(row.source_decision_version),
    objective_id: stringOrNull(row.objective_id),
    objective_title: stringOrNull(row.objective_title),
    project_id: stringOrNull(row.project_id),
    project_name: stringOrNull(row.project_name),
    title: row.title,
    outcome: decisionOutcome(row.outcome),
    decision_text: stringOrNull(row.decision_text),
    rationale: stringOrNull(row.rationale),
    owner_user_id: stringOrNull(row.owner_user_id),
    owner_name: stringOrNull(row.owner_name),
    follow_up_date: stringOrNull(row.follow_up_date),
    created_at:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date(0).toISOString(),
  };
}

function normalizeAction(value: unknown): ExecutiveMeetingActionItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.title !== "string") {
    return null;
  }
  return {
    id: row.id,
    decision_id: stringOrNull(row.decision_id),
    objective_id: stringOrNull(row.objective_id),
    objective_title: stringOrNull(row.objective_title),
    project_id: stringOrNull(row.project_id),
    project_name: stringOrNull(row.project_name),
    title: row.title,
    description: stringOrNull(row.description),
    owner_user_id: stringOrNull(row.owner_user_id),
    owner_name: stringOrNull(row.owner_name),
    due_date: stringOrNull(row.due_date),
    status: actionStatus(row.status),
    completed_at: stringOrNull(row.completed_at),
    version: numberValue(row.version, 1),
    can_update: row.can_update !== false,
    created_at:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date(0).toISOString(),
    updated_at:
      typeof row.updated_at === "string"
        ? row.updated_at
        : new Date(0).toISOString(),
  };
}

function normalizeMeeting(value: unknown): ExecutiveStrategyMeeting | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.title !== "string" ||
    typeof row.meeting_date !== "string" ||
    typeof row.created_by !== "string"
  ) {
    return null;
  }
  return {
    id: row.id,
    title: row.title,
    meeting_date: row.meeting_date,
    period_label: stringOrNull(row.period_label),
    status: meetingStatus(row.status),
    chair_user_id: stringOrNull(row.chair_user_id),
    chair_name: stringOrNull(row.chair_name),
    summary: stringOrNull(row.summary),
    next_meeting_date: stringOrNull(row.next_meeting_date),
    board_pack_generated_at: stringOrNull(row.board_pack_generated_at),
    finalized_at: stringOrNull(row.finalized_at),
    version: numberValue(row.version, 1),
    created_by: row.created_by,
    created_at:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date(0).toISOString(),
    updated_at:
      typeof row.updated_at === "string"
        ? row.updated_at
        : new Date(0).toISOString(),
    can_edit: row.can_edit !== false,
    attendees: Array.isArray(row.attendees)
      ? row.attendees
          .map(normalizeAttendee)
          .filter((item): item is ExecutiveMeetingAttendee => !!item)
      : [],
    decisions: Array.isArray(row.decisions)
      ? row.decisions
          .map(normalizeDecision)
          .filter((item): item is ExecutiveMeetingDecision => !!item)
      : [],
    action_items: Array.isArray(row.action_items)
      ? row.action_items
          .map(normalizeAction)
          .filter((item): item is ExecutiveMeetingActionItem => !!item)
      : [],
  };
}

function todayKey() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export async function listExecutiveStrategyMeetings(): Promise<ExecutiveMeetingGovernanceData> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/list_executive_strategy_meetings",
      { method: "POST", body: {} },
    );
    return {
      meetings: Array.isArray(raw.meetings)
        ? raw.meetings
            .map(normalizeMeeting)
            .filter((item): item is ExecutiveStrategyMeeting => !!item)
        : [],
    };
  }

  return {
    meetings: [...readLocal().meetings].sort((a, b) => {
      const rank: Record<ExecutiveMeetingStatus, number> = {
        in_progress: 0,
        draft: 1,
        completed: 2,
        cancelled: 3,
      };
      return (
        rank[a.status] - rank[b.status] ||
        b.meeting_date.localeCompare(a.meeting_date) ||
        b.updated_at.localeCompare(a.updated_at)
      );
    }),
  };
}

export async function saveExecutiveStrategyMeeting(
  input: SaveExecutiveStrategyMeetingInput,
): Promise<SavedExecutiveMeetingRef> {
  if (!input.title.trim()) throw new Error("عنوان الاجتماع مطلوب.");
  if (!input.meeting_date) throw new Error("تاريخ الاجتماع مطلوب.");
  if (
    input.next_meeting_date &&
    input.next_meeting_date < input.meeting_date
  ) {
    throw new Error("موعد الاجتماع التالي لا يمكن أن يسبق الاجتماع الحالي.");
  }
  if (input.attendees.length > 150) {
    throw new Error("الحد الأقصى 150 حاضرًا.");
  }
  if (input.decisions.length > 150) {
    throw new Error("الحد الأقصى 150 قرارًا لكل اجتماع.");
  }
  if (input.action_items.length > 250) {
    throw new Error("الحد الأقصى 250 Action Item لكل اجتماع.");
  }

  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/save_executive_strategy_meeting",
      {
        method: "POST",
        body: {
          p_meeting_id: input.id ?? null,
          p_expected_version: input.expected_version ?? null,
          p_title: input.title,
          p_meeting_date: input.meeting_date,
          p_period_label: input.period_label ?? null,
          p_status: input.status,
          p_chair_user_id: input.chair_user_id ?? null,
          p_summary: input.summary ?? null,
          p_next_meeting_date: input.next_meeting_date ?? null,
          p_board_pack_generated_at: input.board_pack_generated_at ?? null,
          p_attendees: input.attendees.map((row) => ({
            id: row.id ?? null,
            user_id: row.user_id ?? null,
            display_name: row.display_name,
            email_snapshot: row.email_snapshot ?? null,
            role_label: row.role_label ?? null,
            attendance_status: row.attendance_status,
          })),
          p_decisions: input.decisions.map((row) => ({
            id: row.id ?? null,
            source_decision_id: row.source_decision_id ?? null,
            source_decision_version: row.source_decision_version ?? null,
            objective_id: row.objective_id ?? null,
            project_id: row.project_id ?? null,
            title: row.title,
            outcome: row.outcome,
            decision_text: row.decision_text ?? null,
            rationale: row.rationale ?? null,
            owner_user_id: row.owner_user_id ?? null,
            follow_up_date: row.follow_up_date ?? null,
          })),
          p_action_items: input.action_items.map((row) => ({
            id: row.id ?? null,
            decision_id: row.decision_id ?? null,
            objective_id: row.objective_id ?? null,
            project_id: row.project_id ?? null,
            title: row.title,
            description: row.description ?? null,
            owner_user_id: row.owner_user_id ?? null,
            due_date: row.due_date ?? null,
            status: row.status,
          })),
        },
      },
    );
    if (typeof raw.id !== "string") {
      throw new Error("لم يتم حفظ اجتماع الحوكمة.");
    }
    return {
      id: raw.id,
      version: numberValue(raw.version, 1),
    };
  }

  const store = readLocal();
  const existing = input.id
    ? store.meetings.find((meeting) => meeting.id === input.id)
    : null;
  if (input.id && !existing) throw new Error("الاجتماع غير موجود.");
  if (
    existing &&
    (input.expected_version == null ||
      existing.version !== input.expected_version)
  ) {
    throw new Error("تم تعديل الاجتماع. حدّث البيانات وأعد المحاولة.");
  }
  if (existing && (existing.status === "completed" || existing.status === "cancelled")) {
    throw new Error("المحضر النهائي مقفل ولا يمكن إعادة كتابته.");
  }

  const now = new Date().toISOString();
  const attendeeNames = new Map<string, string>();
  const attendees: ExecutiveMeetingAttendee[] = input.attendees.map((row) => {
    const prior = row.id
      ? existing?.attendees.find((item) => item.id === row.id)
      : null;
    const attendee: ExecutiveMeetingAttendee = {
      id: prior?.id ?? row.id ?? crypto.randomUUID(),
      user_id: row.user_id ?? null,
      display_name: row.display_name.trim(),
      email_snapshot: row.email_snapshot?.trim() || null,
      role_label: row.role_label?.trim() || null,
      attendance_status: row.attendance_status,
      created_at: prior?.created_at ?? now,
    };
    if (attendee.user_id) {
      attendeeNames.set(attendee.user_id, attendee.display_name);
    }
    return attendee;
  });

  const decisions: ExecutiveMeetingDecision[] = input.decisions.map((row) => {
    const prior = row.id
      ? existing?.decisions.find((item) => item.id === row.id)
      : null;
    return {
      id: prior?.id ?? row.id ?? crypto.randomUUID(),
      source_decision_id: row.source_decision_id ?? null,
      source_decision_version:
        prior?.source_decision_version ??
        row.source_decision_version ??
        null,
      objective_id: row.objective_id ?? null,
      objective_title: prior?.objective_title ?? null,
      project_id: row.project_id ?? null,
      project_name: prior?.project_name ?? null,
      title: row.title.trim(),
      outcome: row.outcome,
      decision_text: row.decision_text?.trim() || null,
      rationale: row.rationale?.trim() || null,
      owner_user_id: row.owner_user_id ?? null,
      owner_name:
        (row.owner_user_id
          ? attendeeNames.get(row.owner_user_id)
          : null) ??
        prior?.owner_name ??
        null,
      follow_up_date: row.follow_up_date ?? null,
      created_at: prior?.created_at ?? now,
    };
  });

  const actions: ExecutiveMeetingActionItem[] = input.action_items.map((row) => {
    const prior = row.id
      ? existing?.action_items.find((item) => item.id === row.id)
      : null;
    return {
      id: prior?.id ?? row.id ?? crypto.randomUUID(),
      decision_id: row.decision_id ?? null,
      objective_id: row.objective_id ?? null,
      objective_title: prior?.objective_title ?? null,
      project_id: row.project_id ?? null,
      project_name: prior?.project_name ?? null,
      title: row.title.trim(),
      description: row.description?.trim() || null,
      owner_user_id: row.owner_user_id ?? null,
      owner_name:
        (row.owner_user_id
          ? attendeeNames.get(row.owner_user_id)
          : null) ??
        prior?.owner_name ??
        null,
      due_date: row.due_date ?? null,
      status: row.status,
      completed_at:
        row.status === "done"
          ? prior?.completed_at ?? now
          : row.status === "open" || row.status === "in_progress"
            ? null
            : prior?.completed_at ?? null,
      version: prior?.version ?? 1,
      can_update: true,
      created_at: prior?.created_at ?? now,
      updated_at: now,
    };
  });

  const meeting: ExecutiveStrategyMeeting = {
    id: existing?.id ?? crypto.randomUUID(),
    title: input.title.trim(),
    meeting_date: input.meeting_date,
    period_label: input.period_label?.trim() || null,
    status: input.status,
    chair_user_id: input.chair_user_id ?? null,
    chair_name:
      (input.chair_user_id
        ? attendeeNames.get(input.chair_user_id)
        : null) ??
      existing?.chair_name ??
      null,
    summary: input.summary?.trim() || null,
    next_meeting_date: input.next_meeting_date ?? null,
    board_pack_generated_at: input.board_pack_generated_at ?? null,
    finalized_at: null,
    version: existing ? existing.version + 1 : 1,
    created_by: existing?.created_by ?? "local-user",
    created_at: existing?.created_at ?? now,
    updated_at: now,
    can_edit: true,
    attendees,
    decisions,
    action_items: actions,
  };

  store.meetings = existing
    ? store.meetings.map((row) => (row.id === meeting.id ? meeting : row))
    : [meeting, ...store.meetings];
  writeLocal(store);
  return { id: meeting.id, version: meeting.version };
}

export async function finalizeExecutiveStrategyMeeting(
  meetingId: string,
  expectedVersion: number,
): Promise<SavedExecutiveMeetingRef> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<Record<string, unknown>>(
      "rpc/finalize_executive_strategy_meeting",
      {
        method: "POST",
        body: {
          p_meeting_id: meetingId,
          p_expected_version: expectedVersion,
        },
      },
    );
    if (typeof raw.id !== "string") {
      throw new Error("تعذر اعتماد محضر الاجتماع.");
    }
    return {
      id: raw.id,
      version: numberValue(raw.version, expectedVersion + 1),
      status: meetingStatus(raw.status),
      finalized_at: stringOrNull(raw.finalized_at),
    };
  }

  const store = readLocal();
  const meeting = store.meetings.find((row) => row.id === meetingId);
  if (!meeting) throw new Error("الاجتماع غير موجود.");
  if (meeting.status === "completed" || meeting.status === "cancelled") {
    throw new Error("المحضر مقفل بالفعل.");
  }
  if (meeting.version !== expectedVersion) {
    throw new Error("تم تعديل الاجتماع. حدّث البيانات وأعد المحاولة.");
  }
  if (meeting.meeting_date > todayKey()) {
    throw new Error("لا يمكن اعتماد اجتماع بتاريخ مستقبلي.");
  }

  const linkedSources = [];
  for (const decision of meeting.decisions) {
    if (
      !decision.source_decision_id ||
      (decision.outcome !== "decided" && decision.outcome !== "rejected")
    ) {
      continue;
    }
    if (!decision.project_id) {
      throw new Error("القرار المصدر غير مرتبط بمشروع.");
    }
    const actionCenter = await listProjectActionCenter(decision.project_id);
    const source = actionCenter.decisions.find(
      (row) => row.id === decision.source_decision_id,
    );
    if (!source) throw new Error("القرار المصدر لم يعد موجودًا.");
    if (
      decision.source_decision_version == null ||
      source.version !== decision.source_decision_version
    ) {
      throw new Error(
        "تغير أحد القرارات المصدر بعد تجهيز الاجتماع. حدّث الاجتماع قبل الاعتماد.",
      );
    }
    linkedSources.push({ decision, source });
  }

  for (const { decision, source } of linkedSources) {
    await saveProjectDecision(source.project_id, {
      id: source.id,
      expected_version: source.version,
      title: source.title,
      decision: decision.decision_text?.trim() || source.decision,
      rationale: decision.rationale?.trim() || source.rationale,
      status: decision.outcome === "decided" ? "decided" : "cancelled",
      owner_user_id: decision.owner_user_id ?? source.owner_user_id,
      owner_name: decision.owner_name ?? source.owner_name,
      board_id: source.board_id,
      node_id: source.node_id,
    });
  }

  const now = new Date().toISOString();
  const finalized: ExecutiveStrategyMeeting = {
    ...meeting,
    status: "completed",
    finalized_at: now,
    version: meeting.version + 1,
    updated_at: now,
    can_edit: false,
  };
  store.meetings = store.meetings.map((row) =>
    row.id === meeting.id ? finalized : row,
  );
  writeLocal(store);

  return {
    id: finalized.id,
    version: finalized.version,
    status: finalized.status,
    finalized_at: finalized.finalized_at,
  };
}

export async function updateExecutiveMeetingActionItem(
  input: UpdateExecutiveMeetingActionInput,
): Promise<ExecutiveMeetingActionItem> {
  if (isSupabaseBackend()) {
    const raw = await supabaseRest<unknown>(
      "rpc/update_executive_meeting_action_item",
      {
        method: "POST",
        body: {
          p_action_item_id: input.id,
          p_expected_version: input.expected_version,
          p_status: input.status,
        },
      },
    );
    const row = normalizeAction(raw);
    if (!row) throw new Error("عاد الخادم بـAction Item غير صالح.");
    return row;
  }

  const store = readLocal();
  let result: ExecutiveMeetingActionItem | null = null;
  store.meetings = store.meetings.map((meeting) => {
    const target = meeting.action_items.find((row) => row.id === input.id);
    if (!target) return meeting;
    if (target.version !== input.expected_version) {
      throw new Error("تم تعديل Action Item. حدّث البيانات وأعد المحاولة.");
    }
    const now = new Date().toISOString();
    result = {
      ...target,
      status: input.status,
      completed_at:
        input.status === "done"
          ? target.completed_at ?? now
          : input.status === "open" || input.status === "in_progress"
            ? null
            : target.completed_at,
      version: target.version + 1,
      updated_at: now,
    };
    return {
      ...meeting,
      action_items: meeting.action_items.map((row) =>
        row.id === input.id ? result! : row,
      ),
    };
  });
  if (!result) throw new Error("Action Item غير موجود.");
  writeLocal(store);
  return result;
}
