import { useNavigate } from "@tanstack/react-router";
import {
  AtSign,
  Bell,
  CalendarClock,
  CheckCheck,
  Clock3,
  FileText,
  ListTodo,
  MessageSquareReply,
  Gavel,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserMinus,
  UserPlus,
  Target,
} from "lucide-react";
import { useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from "@/hooks/use-notifications";
import { relativeTime } from "@/lib/format";
import type {
  NotificationFilter,
  UserNotification,
} from "@/types/notifications";

const FILTERS: Array<{ value: NotificationFilter; label: string }> = [
  { value: "all", label: "الكل" },
  { value: "unread", label: "غير المقروء" },
  { value: "mentions", label: "الإشارات والردود" },
  { value: "tasks", label: "المهام" },
  { value: "risks", label: "المخاطر" },
  { value: "strategy", label: "الاستراتيجية" },
  { value: "executive", label: "تنفيذي" },
  { value: "governance", label: "الحوكمة" },
];

const GOVERNANCE_METRIC_LABELS: Record<string, string> = {
  decision_resolution: "Decision Resolution",
  deferred_rate: "Deferred Rate",
  action_completion: "Action Completion",
  overdue_open: "Overdue Open Rate",
  unowned_open: "Unowned Open Rate",
  on_time_completion: "On-time Completion",
  median_completion_days: "Median Completion Days",
  repeated_deferrals: "Repeated Deferrals",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "المالك",
  admin: "مسؤول",
  editor: "محرر",
  viewer: "مشاهد",
};

function notificationIcon(notification: UserNotification) {
  if (notification.kind === "mention") return AtSign;
  if (notification.kind === "reply") return MessageSquareReply;
  if (notification.kind === "project_added") return UserPlus;
  if (notification.kind === "role_changed") return ShieldCheck;
  if (notification.kind === "task_assigned") return UserCheck;
  if (notification.kind === "task_status") return ListTodo;
  if (notification.kind === "task_due") return Clock3;
  if (notification.kind === "risk_escalation") return ShieldAlert;
  if (notification.kind === "strategy_schedule") return CalendarClock;
  if (notification.kind === "executive_action") return Gavel;
  if (notification.kind === "governance_alert") return Target;
  return UserMinus;
}

function notificationTitle(notification: UserNotification) {
  if (notification.kind === "mention") {
    return `${notification.actor_name} ذكرك في تعليق`;
  }
  if (notification.kind === "reply") {
    return `${notification.actor_name} رد على تعليقك`;
  }
  if (notification.kind === "project_added") {
    return `تمت إضافتك إلى «${notification.project_name}»`;
  }
  if (notification.kind === "role_changed") {
    const role =
      typeof notification.metadata.role === "string"
        ? ROLE_LABELS[notification.metadata.role] ?? notification.metadata.role
        : "صلاحية جديدة";
    return `تم تغيير صلاحيتك إلى ${role}`;
  }
  const taskTitle =
    typeof notification.metadata.title === "string"
      ? notification.metadata.title
      : "مهمة";
  if (notification.kind === "task_assigned") {
    return `تم إسناد «${taskTitle}» إليك`;
  }
  if (notification.kind === "task_status") {
    const event =
      typeof notification.metadata.event === "string"
        ? notification.metadata.event
        : "";
    if (event === "automation_blocked") {
      return `تنبيه تلقائي: «${taskTitle}» أصبحت معطلة`;
    }
    if (event === "automation_dependencies_ready") {
      return `«${taskTitle}» أصبحت جاهزة للعمل`;
    }
    return `تغيّرت حالة «${taskTitle}»`;
  }
  if (notification.kind === "risk_escalation") {
    const event =
      typeof notification.metadata.event === "string"
        ? notification.metadata.event
        : "";
    const riskTitle =
      typeof notification.metadata.title === "string"
        ? notification.metadata.title
        : "خطر";
    return event === "critical"
      ? `تصعيد خطر حرج: «${riskTitle}»`
      : event === "overdue"
        ? `تأخرت معالجة الخطر «${riskTitle}»`
        : `تنبيه مخاطر: «${riskTitle}»`;
  }
  if (notification.kind === "strategy_schedule") {
    const event =
      typeof notification.metadata.event === "string"
        ? notification.metadata.event
        : "";
    const title =
      typeof notification.metadata.title === "string"
        ? notification.metadata.title
        : "موعد استراتيجي";
    return event === "overdue"
      ? `تأخر الموعد: «${title}»`
      : `اقترب الموعد: «${title}»`;
  }
  if (notification.kind === "executive_action") {
    const event =
      typeof notification.metadata.event === "string"
        ? notification.metadata.event
        : "";
    const title =
      typeof notification.metadata.title === "string"
        ? notification.metadata.title
        : "Action Item";
    return event === "overdue"
      ? `تصعيد إجراء تنفيذي متأخر: «${title}»`
      : `اقترب استحقاق الإجراء التنفيذي «${title}»`;
  }
  if (notification.kind === "governance_alert") {
    const event =
      typeof notification.metadata.event === "string"
        ? notification.metadata.event
        : "";
    const title =
      typeof notification.metadata.title === "string"
        ? notification.metadata.title
        : "Governance Exception";
    if (event === "exception_overdue") {
      return `تأخر Corrective Action: «${title}»`;
    }
    if (event === "exception_due_soon") {
      return `اقترب استحقاق Governance Exception «${title}»`;
    }
    if (event === "assurance_finding_assigned") {
      const findingTitle =
        typeof notification.metadata.title === "string"
          ? notification.metadata.title
          : "Assurance Finding";
      return `تم إسناد Assurance Finding: «${findingTitle}»`;
    }
    if (event === "assurance_archive_sealed") {
      return "تم ختم Governance Assurance Archive";
    }
    if (event === "assurance_distribution_assigned") {
      return "تم توزيع Governance Assurance Pack عليك";
    }
    if (event === "assurance_distribution_acknowledged") {
      return "تم تسجيل Acknowledgement على Governance Assurance Pack";
    }
    if (event === "assurance_distribution_closed") {
      return "تم إغلاق Governance Assurance Distribution";
    }
    if (event === "assurance_signoff_assigned") {
      return "تم إسناد Governance Assurance Sign-off إليك";
    }
    if (event === "assurance_signoff_ready") {
      return "حان دورك في Governance Assurance Sign-off";
    }
    if (event === "assurance_signoff_step_completed") {
      return "اكتملت خطوة في Governance Assurance Sign-off";
    }
    if (event === "assurance_signoff_completed") {
      return "اكتمل Governance Assurance Sign-off";
    }
    if (event === "assurance_signoff_declined") {
      return "تم رفض Governance Assurance Sign-off";
    }
    if (event === "assurance_review_overdue") {
      return "تأخرت Governance Assurance Review";
    }
    if (event === "assurance_review_due_soon") {
      return "اقترب موعد Governance Assurance Review";
    }
    if (event === "cadence_overdue") {
      return "تجاوز موعد الاجتماع التنفيذي المستهدف";
    }
    if (event === "cadence_due_soon") {
      return "اقترب موعد الاجتماع التنفيذي المستهدف";
    }
    return "تنبيه حوكمة";
  }
  if (notification.kind === "task_due") {
    const event =
      typeof notification.metadata.event === "string"
        ? notification.metadata.event
        : "";
    return event === "overdue"
      ? `«${taskTitle}» متأخرة`
      : event === "due_soon"
        ? `اقترب استحقاق «${taskTitle}»`
        : `تغيّر استحقاق «${taskTitle}»`;
  }
  return `تمت إزالتك من «${notification.project_name}»`;
}

function notificationContext(notification: UserNotification) {
  if (notification.kind === "strategy_schedule") {
    const objective =
      typeof notification.metadata.objective_title === "string"
        ? notification.metadata.objective_title
        : "Objective";
    const dueDate =
      typeof notification.metadata.due_date === "string"
        ? notification.metadata.due_date
        : "";
    return dueDate ? `${objective} · ${dueDate}` : objective;
  }
  if (notification.kind === "executive_action") {
    const meeting =
      typeof notification.metadata.meeting_title === "string"
        ? notification.metadata.meeting_title
        : "اجتماع تنفيذي";
    const dueDate =
      typeof notification.metadata.due_date === "string"
        ? notification.metadata.due_date
        : "";
    return dueDate ? `${meeting} · ${dueDate}` : meeting;
  }
  if (notification.kind === "governance_alert") {
    const event =
      typeof notification.metadata.event === "string"
        ? notification.metadata.event
        : "";
    if (event === "assurance_finding_assigned") {
      const certificate =
        typeof notification.metadata.certificate_code === "string"
          ? notification.metadata.certificate_code
          : "Archive Certificate";
      const dueDate =
        typeof notification.metadata.due_date === "string"
          ? notification.metadata.due_date
          : "";
      return dueDate
        ? `${certificate} · Due ${dueDate}`
        : certificate;
    }
    if (event === "assurance_archive_sealed") {
      const period =
        typeof notification.metadata.review_period === "string"
          ? notification.metadata.review_period
          : "Governance Assurance Review";
      const certificate =
        typeof notification.metadata.certificate_code === "string"
          ? notification.metadata.certificate_code
          : "";
      return certificate
        ? `${period} · ${certificate}`
        : period + " · Archive Certificate";
    }
    if (
      event === "assurance_distribution_assigned" ||
      event === "assurance_distribution_acknowledged" ||
      event === "assurance_distribution_closed"
    ) {
      const period =
        typeof notification.metadata.review_period === "string"
          ? notification.metadata.review_period
          : "Governance Assurance Review";
      return period + " · Distribution Register";
    }
    if (
      event === "assurance_signoff_assigned" ||
      event === "assurance_signoff_ready" ||
      event === "assurance_signoff_step_completed" ||
      event === "assurance_signoff_completed" ||
      event === "assurance_signoff_declined"
    ) {
      const period =
        typeof notification.metadata.review_period === "string"
          ? notification.metadata.review_period
          : "Governance Assurance Review";
      const role =
        typeof notification.metadata.role === "string"
          ? notification.metadata.role
          : "";
      return role ? `${period} · ${role}` : period;
    }
    if (
      event === "assurance_review_due_soon" ||
      event === "assurance_review_overdue"
    ) {
      const nextDue =
        typeof notification.metadata.next_due_date === "string"
          ? notification.metadata.next_due_date
          : "";
      const lastReview =
        typeof notification.metadata.latest_finalized_review_date === "string"
          ? notification.metadata.latest_finalized_review_date
          : "";
      return nextDue
        ? `Assurance due ${nextDue}${lastReview ? " · Last " + lastReview : ""}`
        : "Assurance Review Cadence";
    }
    if (event === "cadence_due_soon" || event === "cadence_overdue") {
      const nextDue =
        typeof notification.metadata.next_due_date === "string"
          ? notification.metadata.next_due_date
          : "";
      const lastMeeting =
        typeof notification.metadata.last_meeting_date === "string"
          ? notification.metadata.last_meeting_date
          : "";
      return nextDue
        ? `Next due ${nextDue}${lastMeeting ? " · Last " + lastMeeting : ""}`
        : "Operating Rhythm";
    }
    const metricKey =
      typeof notification.metadata.metric_key === "string"
        ? notification.metadata.metric_key
        : "";
    const metric =
      GOVERNANCE_METRIC_LABELS[metricKey] ??
      (metricKey || "Governance Target");
    const dueDate =
      typeof notification.metadata.due_date === "string"
        ? notification.metadata.due_date
        : "";
    return dueDate ? `${metric} · ${dueDate}` : metric;
  }
  if (notification.document_name) {
    return notification.page_number
      ? `${notification.document_name} · صفحة ${notification.page_number}`
      : notification.document_name;
  }
  if (notification.board_name) {
    if (typeof notification.metadata.automation_rule_id === "string") {
      return `${notification.board_name} · أتمتة سير العمل`;
    }
    if (notification.kind === "risk_escalation") {
      return `${notification.board_name} · خطر مرتبط بالتنفيذ`;
    }
    if (
      notification.kind === "task_assigned" ||
      notification.kind === "task_status" ||
      notification.kind === "task_due"
    ) {
      return `${notification.board_name} · مهمة`;
    }
    return notification.metadata.target_type === "node"
      ? `${notification.board_name} · مراجعة عنصر`
      : notification.board_name;
  }
  return notification.project_name;
}

function notificationPreview(notification: UserNotification) {
  const preview =
    typeof notification.metadata.preview === "string"
      ? notification.metadata.preview.trim()
      : "";
  return preview.length > 180 ? preview.slice(0, 177) + "…" : preview;
}

export function NotificationCenterButton() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const notifications = useNotifications(filter, true);
  const unread = useUnreadNotificationCount(true);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const count = unread.data ?? 0;

  const openNotification = (notification: UserNotification) => {
    if (!notification.read_at) markRead.mutate(notification.id);

    if (notification.kind === "project_removed") {
      return;
    }

    setOpen(false);

    if (
      notification.kind === "strategy_schedule" ||
      notification.kind === "executive_action" ||
      notification.kind === "governance_alert"
    ) {
      void navigate({ to: "/" });
      return;
    }

    if (notification.board_id) {
      const nodeId =
        notification.metadata.target_type === "node" &&
        typeof notification.metadata.target_id === "string"
          ? notification.metadata.target_id
          : undefined;

      void navigate({
        to: "/project/$projectId/board/$boardId",
        params: {
          projectId: notification.project_id,
          boardId: notification.board_id,
        },
        search: {
          node: nodeId,
          doc: notification.document_id ?? undefined,
          page: notification.page_number ?? undefined,
          comment: notification.comment_id ?? undefined,
        },
      });
      return;
    }

    void navigate({
      to: "/project/$projectId",
      params: { projectId: notification.project_id },
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={
            count > 0 ? `الإشعارات، ${count} غير مقروء` : "الإشعارات"
          }
          title="الإشعارات"
          className="relative grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -end-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {Math.min(count, 99)}
            </span>
          )}
        </button>
      </SheetTrigger>

      <SheetContent
        side="left"
        dir="rtl"
        className="flex h-full w-[min(95vw,440px)] max-w-none flex-col gap-0 p-0 sm:max-w-[440px]"
      >
        <SheetHeader className="border-b border-border px-5 py-4 pe-12 text-start">
          <div className="flex items-center justify-between gap-3">
            <div>
              <SheetTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-brand" />
                الإشعارات
              </SheetTitle>
              <SheetDescription className="mt-1">
                الإشارات، المهام، المخاطر، المواعيد الاستراتيجية والتنبيهات التنفيذية والحوكمة.
              </SheetDescription>
            </div>

            {count > 0 && (
              <button
                type="button"
                disabled={markAll.isPending}
                onClick={() => markAll.mutate()}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium text-brand hover:bg-brand/10 disabled:opacity-40"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                قراءة الكل
              </button>
            )}
          </div>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-1 border-b border-border bg-muted/20 p-1.5 sm:grid-cols-8">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={
                filter === item.value
                  ? "rounded-lg bg-background px-2 py-2 text-[11px] font-semibold shadow-sm"
                  : "rounded-lg px-2 py-2 text-[11px] text-muted-foreground hover:text-foreground"
              }
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {notifications.isLoading ? (
            <div className="space-y-2 p-4">
              <div className="h-20 animate-pulse rounded-xl bg-muted" />
              <div className="h-20 animate-pulse rounded-xl bg-muted" />
              <div className="h-20 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : !(notifications.data?.length ?? 0) ? (
            <div className="grid min-h-72 place-items-center p-6 text-center">
              <div>
                <Bell className="mx-auto h-9 w-9 text-muted-foreground/40" />
                <p className="mt-3 text-sm font-semibold">
                  لا توجد إشعارات هنا
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  ستظهر هنا الإشارات والمهام والمخاطر والتنبيهات الاستراتيجية والتنفيذية والحوكمة.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(notifications.data ?? []).map((notification) => {
                const Icon = notificationIcon(notification);
                const preview = notificationPreview(notification);
                const removed = notification.kind === "project_removed";

                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => openNotification(notification)}
                    className={
                      notification.read_at
                        ? "flex w-full gap-3 px-4 py-3 text-start hover:bg-muted/40"
                        : "flex w-full gap-3 bg-brand/[0.035] px-4 py-3 text-start hover:bg-brand/[0.07]"
                    }
                  >
                    <span
                      className={
                        notification.read_at
                          ? "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
                          : "grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"
                      }
                    >
                      <Icon className="h-4 w-4" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 text-xs font-semibold leading-5">
                          {notificationTitle(notification)}
                        </span>
                        {!notification.read_at && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                        )}
                      </span>

                      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                        {notificationContext(notification)}
                      </span>

                      {preview && (
                        <span className="mt-1.5 block line-clamp-2 text-[11px] leading-5 text-foreground/75">
                          {preview}
                        </span>
                      )}

                      <span className="mt-1.5 flex items-center gap-2 text-[9px] text-muted-foreground">
                        <span>{relativeTime(notification.created_at)}</span>
                        {removed ? (
                          <span>لم يعد لديك وصول للمشروع</span>
                        ) : notification.document_id ? (
                          <span className="inline-flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            فتح المستند
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
