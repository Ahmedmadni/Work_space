import {
  Activity,
  AtSign,
  Check,
  CheckCircle2,
  Circle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Reply,
  RotateCcw,
  Send,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  useProjectAccess,
  useProjectCollaborators,
} from "@/hooks/use-collaboration";
import {
  useCreateProjectComment,
  useDeleteProjectComment,
  useProjectActivity,
  useProjectComments,
  useProjectPresence,
  useResolveProjectComment,
  useUpdateProjectComment,
} from "@/hooks/use-live-collaboration";
import { relativeTime } from "@/lib/format";
import { getCurrentCollaborationUserId } from "@/services/live-collaboration.service";
import type {
  ProjectActivity,
  ProjectComment,
  ProjectPresence,
} from "@/types/live-collaboration";

type DockTab = "comments" | "activity" | "presence";

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "م") + (words[1]?.[0] ?? "");
}

function activityLabel(item: ProjectActivity) {
  const labels: Record<string, string> = {
    comment_created: "أضاف تعليقًا",
    comment_updated: "عدّل تعليقًا",
    comment_deleted: "حذف تعليقًا",
    comment_resolved: "أغلق تعليقًا",
    comment_reopened: "أعاد فتح تعليق",
    board_updated: "حدّث اللوحة",
    task_assigned: "أسند مهمة",
    task_unassigned: "ألغى إسناد مهمة",
    task_status_changed: "غيّر حالة مهمة",
    task_due_changed: "غيّر تاريخ استحقاق مهمة",
    task_priority_changed: "غيّر أولوية مهمة",
    task_schedule_changed: "غيّر الجدول الزمني لمهمة",
    automation_enabled: "فعّل قاعدة أتمتة",
    automation_disabled: "أوقف قاعدة أتمتة",
    automation_task_status_changed: "غيّرت الأتمتة حالة مهمة",
    automation_task_due_changed: "غيّرت الأتمتة تاريخ استحقاق مهمة",
    ai_copilot_task_accepted: "أضاف مهمة مقترحة من مساعد المشروع",
    risk_created: "سجّل خطرًا",
    risk_updated: "حدّث خطرًا",
    decision_created: "سجّل قرارًا",
    decision_updated: "حدّث قرارًا",
    strategic_objective_linked: "ربط هدفًا استراتيجيًا بالمشروع",
    strategic_objective_updated: "حدّث هدفًا استراتيجيًا مرتبطًا",
    strategic_benefit_created: "سجّل منفعة استراتيجية",
    strategic_benefit_updated: "حدّث منفعة استراتيجية",
    strategy_review_recorded: "سجّل مراجعة استراتيجية",
    document_uploaded: "رفع ملفًا",
    document_deleted: "حذف ملفًا",
    member_invited: "أرسل دعوة للمشروع",
    member_role_updated: "غيّر صلاحية عضو",
    member_removed: "أزال عضوًا من المشروع",
  };
  return labels[item.action] ?? item.action.replaceAll("_", " ");
}

function contextLabel(presence: ProjectPresence, boardId: string) {
  if (presence.context_type === "board") {
    return presence.context_id === boardId ? "على هذه اللوحة" : "على لوحة أخرى";
  }
  if (presence.context_type === "document") return "يعرض مستندًا";
  return "داخل المشروع";
}

function MentionChips({
  mentions,
}: {
  mentions: ProjectComment["mentions"];
}) {
  if (!mentions.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {mentions.map((mention) => (
        <span
          key={mention.user_id}
          className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand"
        >
          @{mention.full_name}
        </span>
      ))}
    </div>
  );
}

function CommentComposer({
  projectId,
  boardId,
  originBoardId,
  targetType,
  targetId,
  pageNumber,
  replyTo,
  onCancelReply,
}: {
  projectId: string;
  boardId: string | null;
  originBoardId: string;
  targetType: "board" | "document";
  targetId: string;
  pageNumber?: number;
  replyTo: ProjectComment | null;
  onCancelReply: () => void;
}) {
  const collaborators = useProjectCollaborators(projectId);
  const create = useCreateProjectComment(projectId);
  const [body, setBody] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [mentionCandidate, setMentionCandidate] = useState("");

  const availableMembers = (collaborators.data ?? []).filter(
    (member) => !mentionIds.includes(member.user_id),
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim() || create.isPending) return;
    create.mutate(
      {
        body,
        boardId,
        originBoardId,
        targetType,
        targetId,
        pageNumber: targetType === "document" ? pageNumber ?? null : null,
        parentCommentId: replyTo?.id ?? null,
        mentionUserIds: mentionIds,
      },
      {
        onSuccess: () => {
          setBody("");
          setMentionIds([]);
          setMentionCandidate("");
          onCancelReply();
        },
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      className="border-t border-border bg-background p-3"
    >
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted px-2.5 py-2 text-xs">
          <Reply className="h-3.5 w-3.5 text-brand" />
          <span className="min-w-0 flex-1 truncate">
            رد على {replyTo.author_name}
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            className="grid h-6 w-6 place-items-center rounded-md hover:bg-background"
            aria-label="إلغاء الرد"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {!!mentionIds.length && (
        <div className="mb-2 flex flex-wrap gap-1">
          {mentionIds.map((userId) => {
            const member = collaborators.data?.find(
              (item) => item.user_id === userId,
            );
            return (
              <button
                key={userId}
                type="button"
                onClick={() =>
                  setMentionIds((ids) => ids.filter((id) => id !== userId))
                }
                className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-1 text-[10px] text-brand"
              >
                @{member?.full_name ?? "عضو"}
                <X className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      )}

      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={
          targetType === "document"
            ? "اكتب تعليقًا على هذه الصفحة من المستند…"
            : "اكتب تعليقًا على هذه اللوحة…"
        }
        rows={3}
        maxLength={4000}
        className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-brand"
      />

      <div className="mt-2 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <AtSign className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <select
            value={mentionCandidate}
            onChange={(event) => {
              const value = event.target.value;
              setMentionCandidate("");
              if (value) {
                setMentionIds((ids) =>
                  ids.includes(value) ? ids : [...ids, value],
                );
              }
            }}
            className="h-9 w-full rounded-xl border border-border bg-background pe-2 ps-8 text-xs text-muted-foreground outline-none focus:border-brand"
            aria-label="ذكر عضو"
          >
            <option value="">ذكر عضو…</option>
            {availableMembers.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.full_name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={!body.trim() || create.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
          إرسال
        </button>
      </div>
    </form>
  );
}

function CommentItem({
  projectId,
  comment,
  canEditProject,
  canManageProject,
  currentUserId,
  onReply,
  child,
  focused = false,
}: {
  projectId: string;
  comment: ProjectComment;
  canEditProject: boolean;
  canManageProject: boolean;
  currentUserId: string | null;
  onReply: (comment: ProjectComment) => void;
  child?: boolean;
  focused?: boolean;
}) {
  const update = useUpdateProjectComment(projectId);
  const remove = useDeleteProjectComment(projectId);
  const resolve = useResolveProjectComment(projectId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);

  const canModify =
    canEditProject &&
    (currentUserId === comment.created_by || canManageProject);

  return (
    <article
      id={"comment-" + comment.id}
      className={
        focused
          ? child
            ? "ms-8 rounded-xl border-s-2 border-brand bg-brand/5 p-3 ps-3 ring-2 ring-brand/20"
            : "rounded-xl border border-brand bg-brand/5 p-3 ring-2 ring-brand/20"
          : child
            ? "ms-8 border-s-2 border-brand/15 ps-3"
            : "rounded-xl border border-border bg-card p-3"
      }
    >
      <div className="flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold">
          {initials(comment.author_name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-semibold">
              {comment.author_name}
            </p>
            <span className="text-[10px] text-muted-foreground">
              {relativeTime(comment.created_at)}
            </span>
            {comment.resolved_at && (
              <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success">
                مغلق
              </span>
            )}
            {comment.page_number && (
              <span className="rounded-full bg-info/10 px-1.5 py-0.5 text-[9px] font-medium text-info">
                صفحة {comment.page_number}
              </span>
            )}
          </div>

          {editing ? (
            <div className="mt-2">
              <textarea
                autoFocus
                rows={3}
                value={draft}
                maxLength={4000}
                onChange={(event) => setDraft(event.target.value)}
                className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-brand"
              />
              <div className="mt-2 flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(comment.body);
                    setEditing(false);
                  }}
                  className="rounded-lg px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={!draft.trim() || update.isPending}
                  onClick={() =>
                    update.mutate(
                      {
                        commentId: comment.id,
                        body: draft,
                        mentionUserIds: comment.mentions.map((m) => m.user_id),
                      },
                      { onSuccess: () => setEditing(false) },
                    )
                  }
                  className="rounded-lg bg-brand px-2 py-1 text-[10px] font-medium text-primary-foreground disabled:opacity-40"
                >
                  حفظ
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-foreground/90">
                {comment.body}
              </p>
              <MentionChips mentions={comment.mentions} />
            </>
          )}

          {!editing && (
            <div className="mt-2 flex items-center gap-1">
              {canEditProject && (
                <button
                  type="button"
                  onClick={() => onReply(comment)}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Reply className="h-3 w-3" />
                  رد
                </button>
              )}

              {canEditProject && (
                <button
                  type="button"
                  disabled={resolve.isPending}
                  onClick={() =>
                    resolve.mutate({
                      commentId: comment.id,
                      resolved: !comment.resolved_at,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {comment.resolved_at ? (
                    <RotateCcw className="h-3 w-3" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  {comment.resolved_at ? "إعادة فتح" : "إغلاق"}
                </button>
              )}

              {canModify && (
                <DropdownMenu dir="rtl">
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-muted"
                      aria-label="خيارات التعليق"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        setDraft(comment.body);
                        setEditing(true);
                      }}
                      className="gap-2"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      تعديل
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="gap-2 text-danger focus:text-danger"
                      onSelect={() => {
                        if (window.confirm("حذف هذا التعليق؟")) {
                          remove.mutate(comment.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function CommentsTab({
  projectId,
  boardId,
  targetType,
  targetId,
  pageNumber,
  focusCommentId,
}: {
  projectId: string;
  boardId: string;
  targetType: "board" | "document";
  targetId: string;
  pageNumber?: number;
  focusCommentId?: string;
}) {
  const access = useProjectAccess(projectId);
  const comments = useProjectComments(projectId, {
    boardId: targetType === "document" ? null : boardId,
    targetType,
    targetId,
    limit: 150,
  });
  const currentUserId = getCurrentCollaborationUserId();
  const [replyTo, setReplyTo] = useState<ProjectComment | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [showAllPages, setShowAllPages] = useState(false);

  useEffect(() => {
    setReplyTo(null);
    setShowAllPages(false);
  }, [targetId, targetType, pageNumber]);

  useEffect(() => {
    if (!focusCommentId || !comments.data?.length) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById("comment-" + focusCommentId)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [comments.data, focusCommentId]);

  const all = comments.data ?? [];
  const scoped =
    targetType === "document" && pageNumber && !showAllPages
      ? all.filter((comment) => comment.page_number === pageNumber)
      : all;
  const roots = scoped.filter((comment) => !comment.parent_comment_id);
  const visibleRoots = showResolved
    ? roots
    : roots.filter((comment) => !comment.resolved_at);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, ProjectComment[]>();
    for (const comment of scoped) {
      if (!comment.parent_comment_id) continue;
      const list = map.get(comment.parent_comment_id) ?? [];
      list.push(comment);
      map.set(comment.parent_comment_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    return map;
  }, [scoped]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <span className="text-[11px] text-muted-foreground">
          {visibleRoots.length} محادثات
        </span>
        <div className="flex items-center gap-1">
          {targetType === "document" && pageNumber && (
            <button
              type="button"
              onClick={() => setShowAllPages((value) => !value)}
              className="rounded-lg px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
            >
              {showAllPages ? "هذه الصفحة" : "كل الصفحات"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowResolved((value) => !value)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
          >
            {showResolved ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
            {showResolved ? "إخفاء المغلق" : "إظهار المغلق"}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {comments.isLoading ? (
          <div className="space-y-2">
            <div className="h-20 animate-pulse rounded-xl bg-muted" />
            <div className="h-20 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : !visibleRoots.length ? (
          <div className="grid min-h-52 place-items-center text-center">
            <div>
              <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm font-medium">لا توجد تعليقات مفتوحة</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {targetType === "document"
                  ? "أضف تعليقًا نصيًا مرتبطًا بصفحة المستند الحالية."
                  : "استخدم التعليقات لمناقشة القرارات والملاحظات على هذه اللوحة."}
              </p>
            </div>
          </div>
        ) : (
          visibleRoots.map((comment) => (
            <div key={comment.id} className="space-y-2">
              <CommentItem
                projectId={projectId}
                comment={comment}
                canEditProject={access.data?.can_edit ?? false}
                canManageProject={access.data?.can_manage ?? false}
                currentUserId={currentUserId}
                onReply={setReplyTo}
                focused={comment.id === focusCommentId}
              />
              {(childrenByParent.get(comment.id) ?? []).map((child) => (
                <CommentItem
                  key={child.id}
                  projectId={projectId}
                  comment={child}
                  canEditProject={access.data?.can_edit ?? false}
                  canManageProject={access.data?.can_manage ?? false}
                  currentUserId={currentUserId}
                  onReply={setReplyTo}
                  child
                  focused={child.id === focusCommentId}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {access.data?.can_edit ? (
        <CommentComposer
          projectId={projectId}
          boardId={targetType === "document" ? null : boardId}
          originBoardId={boardId}
          targetType={targetType}
          targetId={targetId}
          pageNumber={pageNumber}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      ) : (
        <div className="border-t border-border bg-muted/30 px-4 py-3 text-center text-[11px] text-muted-foreground">
          صلاحيتك للعرض فقط؛ يمكنك قراءة التعليقات دون إضافة أو تعديل.
        </div>
      )}
    </div>
  );
}

function ActivityTab({ projectId }: { projectId: string }) {
  const activity = useProjectActivity(projectId, true, 100);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {activity.isLoading ? (
        <div className="space-y-2">
          <div className="h-14 animate-pulse rounded-xl bg-muted" />
          <div className="h-14 animate-pulse rounded-xl bg-muted" />
          <div className="h-14 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : !(activity.data?.length ?? 0) ? (
        <div className="grid min-h-64 place-items-center text-center">
          <div>
            <Activity className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">لا يوجد نشاط مسجل بعد</p>
            <p className="mt-1 text-xs text-muted-foreground">
              سيظهر هنا سجل التعليقات والتعديلات المهمة.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {(activity.data ?? []).map((item) => (
            <div
              key={item.id}
              className="flex gap-3 rounded-xl px-2.5 py-2.5 hover:bg-muted/50"
            >
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-bold">
                {initials(item.actor_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <strong>{item.actor_name}</strong>{" "}
                  <span className="text-muted-foreground">
                    {activityLabel(item)}
                  </span>
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {relativeTime(item.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PresenceTab({
  presence,
  boardId,
}: {
  presence: ProjectPresence[];
  boardId: string;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {!presence.length ? (
        <div className="grid min-h-64 place-items-center text-center">
          <div>
            <Users className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">لا يوجد مستخدم نشط الآن</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {presence.map((person) => (
            <div
              key={person.user_id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <div className="relative">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-[10px] font-bold">
                  {initials(person.full_name)}
                </span>
                <span className="absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-card bg-success" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">
                  {person.full_name}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {contextLabel(person, boardId)}
                </p>
              </div>
              <span className="text-[9px] text-success">متصل</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProjectCollaborationDock({
  projectId,
  boardId,
  presenceContextType = "board",
  presenceContextId,
  documentPageNumber,
  focusCommentId,
}: {
  projectId: string;
  boardId: string;
  presenceContextType?: "board" | "document";
  presenceContextId?: string | null;
  documentPageNumber?: number;
  focusCommentId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DockTab>("comments");

  useEffect(() => {
    if (!focusCommentId) return;
    setOpen(true);
    setTab("comments");
  }, [focusCommentId]);
  const commentTargetType =
    presenceContextType === "document" ? "document" : "board";
  const commentTargetId =
    presenceContextType === "document" && presenceContextId
      ? presenceContextId
      : boardId;
  const presence = useProjectPresence(
    projectId,
    presenceContextType,
    presenceContextId ?? boardId,
    true,
  );
  const comments = useProjectComments(
    projectId,
    {
      boardId: commentTargetType === "document" ? null : boardId,
      targetType: commentTargetType,
      targetId: commentTargetId,
      limit: 150,
    },
    true,
  );
  const unresolvedCount = (comments.data ?? []).filter(
    (comment) => !comment.parent_comment_id && !comment.resolved_at,
  ).length;
  const online = presence.data ?? [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          title="التعاون والتعليقات"
          aria-label="التعاون والتعليقات"
          className="relative grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <MessageSquare className="h-4 w-4" />
          {unresolvedCount > 0 && (
            <span className="absolute -end-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-primary-foreground">
              {Math.min(unresolvedCount, 99)}
            </span>
          )}
        </button>
      </SheetTrigger>

      <SheetContent
        side="left"
        dir="rtl"
        className="flex h-full w-[min(94vw,470px)] max-w-none flex-col gap-0 p-0 sm:max-w-[470px]"
      >
        <SheetHeader className="border-b border-border px-5 py-4 pe-12 text-start">
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-brand" />
            التعاون
          </SheetTitle>
          <SheetDescription>
            {commentTargetType === "document"
              ? "تعليقات المستند الحالي، النشاط، ومن يعمل على المشروع الآن."
              : "تعليقات اللوحة، النشاط، ومن يعمل على المشروع الآن."}
          </SheetDescription>

          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex -space-x-1.5 space-x-reverse">
              {online.slice(0, 5).map((person) => (
                <span
                  key={person.user_id}
                  title={person.full_name}
                  className="grid h-7 w-7 place-items-center rounded-full border-2 border-background bg-muted text-[8px] font-bold"
                >
                  {initials(person.full_name)}
                </span>
              ))}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {online.length
                ? online.length + " متصلون الآن"
                : "لا يوجد مستخدم نشط الآن"}
            </span>
          </div>
        </SheetHeader>

        <div className="grid grid-cols-3 border-b border-border bg-muted/20 p-1.5">
          {([
            ["comments", "التعليقات", MessageSquare],
            ["activity", "النشاط", Activity],
            ["presence", "المتصلون", UserRound],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={
                tab === value
                  ? "flex items-center justify-center gap-1.5 rounded-lg bg-background px-2 py-2 text-xs font-semibold shadow-sm"
                  : "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs text-muted-foreground hover:text-foreground"
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {value === "comments" && unresolvedCount > 0 && (
                <span className="rounded-full bg-brand/10 px-1.5 text-[9px] text-brand">
                  {unresolvedCount}
                </span>
              )}
              {value === "presence" && online.length > 0 && (
                <span className="rounded-full bg-success/10 px-1.5 text-[9px] text-success">
                  {online.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "comments" ? (
          <CommentsTab
            projectId={projectId}
            boardId={boardId}
            targetType={commentTargetType}
            targetId={commentTargetId}
            pageNumber={
              commentTargetType === "document"
                ? documentPageNumber
                : undefined
            }
            focusCommentId={focusCommentId}
          />
        ) : tab === "activity" ? (
          <ActivityTab projectId={projectId} />
        ) : (
          <PresenceTab presence={online} boardId={boardId} />
        )}
      </SheetContent>
    </Sheet>
  );
}
