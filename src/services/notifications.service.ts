import { isSupabaseBackend } from "@/lib/backend-config";
import { supabaseRest } from "@/services/supabase-rest";
import { refreshMyProjectAutomations } from "@/services/automations.service";
import { refreshTaskDueNotifications } from "@/services/task-execution.service";
import { refreshRiskEscalationNotifications } from "@/services/action-center.service";
import { refreshStrategyScheduleNotifications } from "@/services/strategy-calendar.service";
import { refreshExecutiveActionNotifications } from "@/services/executive-meetings.service";
import { refreshGovernanceAlertNotifications } from "@/services/governance-exceptions.service";
import { refreshGovernanceAssuranceNotifications } from "@/services/governance-assurance.service";
import {
  refreshGovernanceAssuranceCapaNotifications,
  refreshGovernanceAssuranceFindingNotifications,
} from "@/services/governance-assurance-findings.service";
import type {
  NotificationFilter,
  NotificationKind,
  UserNotification,
} from "@/types/notifications";
const SCHEDULE_REFRESH_MS = 60_000;
let lastScheduleRefreshAt = 0;
let scheduleRefreshPromise: Promise<void> | null = null;

async function refreshScheduledWorkIfNeeded() {
  const now = Date.now();
  if (now - lastScheduleRefreshAt < SCHEDULE_REFRESH_MS) return;
  if (scheduleRefreshPromise) return scheduleRefreshPromise;

  scheduleRefreshPromise = Promise.all([
    refreshTaskDueNotifications().catch((error) => {
      if (import.meta.env.DEV) {
        console.warn("[notifications] تعذر تحديث تنبيهات الاستحقاق.", error);
      }
      return 0;
    }),
    refreshMyProjectAutomations().catch((error) => {
      if (import.meta.env.DEV) {
        console.warn("[notifications] تعذر تشغيل فحص أتمتة المشاريع.", error);
      }
      return 0;
    }),
    refreshRiskEscalationNotifications().catch((error) => {
      if (import.meta.env.DEV) {
        console.warn("[notifications] تعذر تحديث تنبيهات المخاطر.", error);
      }
      return 0;
    }),
    refreshStrategyScheduleNotifications().catch((error) => {
      if (import.meta.env.DEV) {
        console.warn("[notifications] تعذر تحديث تنبيهات التقويم الاستراتيجي.", error);
      }
      return 0;
    }),
    refreshExecutiveActionNotifications().catch((error) => {
      if (import.meta.env.DEV) {
        console.warn("[notifications] تعذر تحديث تنبيهات الإجراءات التنفيذية.", error);
      }
      return 0;
    }),
    refreshGovernanceAlertNotifications().catch((error) => {
      if (import.meta.env.DEV) {
        console.warn("[notifications] تعذر تحديث تنبيهات الحوكمة.", error);
      }
      return 0;
    }),
    refreshGovernanceAssuranceNotifications().catch((error) => {
      if (import.meta.env.DEV) {
        console.warn("[notifications] تعذر تحديث تنبيهات Assurance Review.", error);
      }
      return 0;
    }),
    refreshGovernanceAssuranceFindingNotifications().catch((error) => {
      if (import.meta.env.DEV) {
        console.warn("[notifications] تعذر تحديث تنبيهات Assurance Findings.", error);
      }
      return 0;
    }),
    refreshGovernanceAssuranceCapaNotifications().catch((error) => {
      if (import.meta.env.DEV) {
        console.warn("[notifications] تعذر تحديث تنبيهات CAPA Actions.", error);
      }
      return 0;
    }),
  ]).then(() => {
    lastScheduleRefreshAt = Date.now();
  }).finally(() => {
    scheduleRefreshPromise = null;
  });

  return scheduleRefreshPromise;
}


function normalizeKind(value: unknown): NotificationKind {
  return value === "mention" ||
    value === "reply" ||
    value === "project_added" ||
    value === "role_changed" ||
    value === "project_removed" ||
    value === "task_assigned" ||
    value === "task_status" ||
    value === "task_due" ||
    value === "risk_escalation" ||
    value === "strategy_schedule" ||
    value === "executive_action" ||
    value === "governance_alert"
    ? value
    : "mention";
}

function normalizeNotification(
  value: Record<string, unknown>,
): UserNotification {
  return {
    id: String(value.id),
    project_id: String(value.project_id),
    project_name:
      typeof value.project_name === "string" && value.project_name.trim()
        ? value.project_name
        : "المشروع",
    kind: normalizeKind(value.kind),
    actor_user_id:
      typeof value.actor_user_id === "string" ? value.actor_user_id : null,
    actor_name:
      typeof value.actor_name === "string" && value.actor_name.trim()
        ? value.actor_name
        : "النظام",
    actor_email:
      typeof value.actor_email === "string" ? value.actor_email : "",
    comment_id:
      typeof value.comment_id === "string" ? value.comment_id : null,
    board_id:
      typeof value.board_id === "string" ? value.board_id : null,
    board_name:
      typeof value.board_name === "string" ? value.board_name : null,
    document_id:
      typeof value.document_id === "string" ? value.document_id : null,
    document_name:
      typeof value.document_name === "string" ? value.document_name : null,
    page_number:
      typeof value.page_number === "number" ? value.page_number : null,
    metadata:
      value.metadata && typeof value.metadata === "object"
        ? (value.metadata as Record<string, unknown>)
        : {},
    read_at:
      typeof value.read_at === "string" ? value.read_at : null,
    created_at: String(value.created_at),
  };
}

export async function listUserNotifications(
  filter: NotificationFilter = "all",
  limit = 60,
): Promise<UserNotification[]> {
  if (!isSupabaseBackend()) return [];
  await refreshScheduledWorkIfNeeded();
  const rows = await supabaseRest<Record<string, unknown>[]>(
    "rpc/list_user_notifications",
    {
      method: "POST",
      body: {
        p_filter: filter,
        p_limit: limit,
      },
    },
  );
  return rows.map(normalizeNotification);
}

export async function countUnreadNotifications(): Promise<number> {
  if (!isSupabaseBackend()) return 0;
  const count = await supabaseRest<unknown>(
    "rpc/count_unread_notifications",
    { method: "POST", body: {} },
  );
  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  if (!isSupabaseBackend()) return;
  await supabaseRest<null>("rpc/mark_notification_read", {
    method: "POST",
    body: { p_notification_id: notificationId },
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  if (!isSupabaseBackend()) return;
  await supabaseRest<null>("rpc/mark_all_notifications_read", {
    method: "POST",
    body: {},
  });
}
