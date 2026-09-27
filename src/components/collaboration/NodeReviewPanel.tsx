import {
  AtSign,
  Check,
  Circle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Reply,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

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
  useResolveProjectComment,
  useUpdateProjectComment,
} from "@/hooks/use-live-collaboration";
import { relativeTime } from "@/lib/format";
import { getCurrentCollaborationUserId } from "@/services/live-collaboration.service";
import type { CanvasNode } from "@/types";
import type {
  ProjectActivity,
  ProjectComment,
} from "@/types/live-collaboration";

type ReviewTab = "threads" | "activity";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "م") + (parts[1]?.[0] ?? "");
}

function activityLabel(item: ProjectActivity) {
  const labels: Record<string, string> = {
    comment_created: "أضاف تعليقًا",
    comment_updated: "عدّل تعليقًا",
    comment_deleted: "حذف تعليقًا",
    comment_resolved: "أغلق محادثة",
    comment_reopened: "أعاد فتح محادثة",
  };
  return labels[item.action] ?? item.action.replaceAll("_", " ");
}

function belongsToNodeActivity(item: ProjectActivity, nodeId: string) {
  if (item.entity_type === "node" && item.entity_id === nodeId) return true;
  return (
    item.metadata.target_type === "node" &&
    item.metadata.target_id === nodeId
  );
}

function MentionChips({
  comment,
}: {
  comment: ProjectComment;
}) {
  if (!comment.mentions.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {comment.mentions.map((mention) => (
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

function ReviewComment({
  projectId,
  comment,
  currentUserId,
  canEdit,
  canManage,
  child = false,
  focused = false,
  onReply,
}: {
  projectId: string;
  comment: ProjectComment;
  currentUserId: string | null;
  canEdit: boolean;
  canManage: boolean;
  child?: boolean;
  focused?: boolean;
  onReply: (comment: ProjectComment) => void;
}) {
  const update = useUpdateProjectComment(projectId);
  const resolve = useResolveProjectComment(projectId);
  const remove = useDeleteProjectComment(projectId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);

  useEffect(() => {
    if (!editing) setDraft(comment.body);
  }, [comment.body, editing]);

  const canModify =
    canEdit &&
    (comment.created_by === currentUserId || canManage);

  return (
    <article
      id={"node-review-comment-" + comment.id}
      className={[
        "rounded-2xl border p-3 transition",
        child ? "ms-7 bg-muted/25" : "bg-card",
        focused
          ? "border-brand ring-2 ring-brand/20"
          : "border-border",
        comment.resolved_at ? "opacity-70" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-bold">
          {initials(comment.author_name)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">
                {comment.author_name}
              </p>
              <p className="text-[9px] text-muted-foreground">
                {relativeTime(comment.created_at)}
                {comment.updated_at !== comment.created_at ? " · معدّل" : ""}
              </p>
            </div>

            {canModify && (
              <DropdownMenu dir="rtl">
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                    aria-label="خيارات التعليق"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="gap-2"
                    onSelect={() => {
                      setDraft(comment.body);
                      setEditing(true);
                    }}
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

          {editing ? (
            <form
              className="mt-2"
              onSubmit={(event) => {
                event.preventDefault();
                const body = draft.trim();
                if (!body || update.isPending) return;
                update.mutate(
                  {
                    commentId: comment.id,
                    body,
                    mentionUserIds: comment.mentions.map(
                      (mention) => mention.user_id,
                    ),
                  },
                  { onSuccess: () => setEditing(false) },
                );
              }}
            >
              <textarea
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={3}
                maxLength={4000}
                className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-xs leading-5 outline-none focus:border-brand"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg px-2.5 py-1.5 text-[10px] text-muted-foreground hover:bg-muted"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!draft.trim() || update.isPending}
                  className="rounded-lg bg-brand px-2.5 py-1.5 text-[10px] font-semibold text-primary-foreground disabled:opacity-40"
                >
                  حفظ
                </button>
              </div>
            </form>
          ) : (
            <>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-foreground/85">
                {comment.body}
              </p>
              <MentionChips comment={comment} />
            </>
          )}

          {!editing && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onReply(comment)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Reply className="h-3 w-3" />
                  رد
                </button>
              )}

              {!child && canEdit && (
                <button
                  type="button"
                  disabled={resolve.isPending}
                  onClick={() =>
                    resolve.mutate({
                      commentId: comment.id,
                      resolved: !comment.resolved_at,
                    })
                  }
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                >
                  {comment.resolved_at ? (
                    <RotateCcw className="h-3 w-3" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  {comment.resolved_at ? "إعادة فتح" : "حل"}
                </button>
              )}

              {comment.resolved_at && !child && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-[9px] font-medium text-success">
                  <Check className="h-3 w-3" />
                  محلول
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function ReviewComposer({
  projectId,
  boardId,
  nodeId,
  replyTo,
  onCancelReply,
}: {
  projectId: string;
  boardId: string;
  nodeId: string;
  replyTo: ProjectComment | null;
  onCancelReply: () => void;
}) {
  const create = useCreateProjectComment(projectId);
  const collaborators = useProjectCollaborators(projectId);
  const currentUserId = getCurrentCollaborationUserId();
  const [body, setBody] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [memberToAdd, setMemberToAdd] = useState("");

  useEffect(() => {
    setBody("");
    setMentionIds([]);
    setMemberToAdd("");
    onCancelReply();
  }, [nodeId]);

  const availableMembers = (collaborators.data ?? []).filter(
    (member) =>
      member.user_id !== currentUserId &&
      !mentionIds.includes(member.user_id),
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = body.trim();
    if (!value || create.isPending) return;

    create.mutate(
      {
        body: value,
        boardId,
        originBoardId: boardId,
        targetType: "node",
        targetId: nodeId,
        parentCommentId: replyTo?.id ?? null,
        mentionUserIds: mentionIds,
      },
      {
        onSuccess: () => {
          setBody("");
          setMentionIds([]);
          setMemberToAdd("");
          onCancelReply();
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="border-t border-border bg-background p-3">
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
                  setMentionIds((current) =>
                    current.filter((id) => id !== userId),
                  )
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
        placeholder="اكتب مراجعة أو ملاحظة على هذا العنصر…"
        rows={3}
        maxLength={4000}
        className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-xs leading-6 outline-none focus:border-brand"
      />

      <div className="mt-2 flex items-center gap-2">
        <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
        <select
          value={memberToAdd}
          onChange={(event) => {
            const userId = event.target.value;
            setMemberToAdd("");
            if (!userId) return;
            setMentionIds((current) =>
              current.includes(userId) ? current : [...current, userId],
            );
          }}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-[10px] text-muted-foreground outline-none focus:border-brand"
        >
          <option value="">إضافة @إشارة لعضو…</option>
          {availableMembers.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.full_name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={!body.trim() || create.isPending}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-[10px] font-semibold text-primary-foreground disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
          إرسال
        </button>
      </div>
    </form>
  );
}

export function NodeReviewPanel({
  open,
  projectId,
  boardId,
  node,
  readOnly,
  focusCommentId,
  onOpenChange,
}: {
  open: boolean;
  projectId: string;
  boardId: string;
  node: CanvasNode | null;
  readOnly: boolean;
  focusCommentId?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<ReviewTab>("threads");
  const [showResolved, setShowResolved] = useState(false);
  const [replyTo, setReplyTo] = useState<ProjectComment | null>(null);
  const access = useProjectAccess(projectId);
  const comments = useProjectComments(
    projectId,
    {
      boardId,
      targetType: "node",
      targetId: node?.id ?? null,
      limit: 500,
    },
    open && !!node,
  );
  const activity = useProjectActivity(projectId, open && !!node, 150);
  const currentUserId = getCurrentCollaborationUserId();
  const canEdit = !readOnly && !!access.data?.can_edit;
  const canManage = !!access.data?.can_manage;

  useEffect(() => {
    if (!open) {
      setReplyTo(null);
      return;
    }
    setTab("threads");
  }, [open, node?.id]);

  useEffect(() => {
    if (!open || !focusCommentId || !comments.data?.length) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById("node-review-comment-" + focusCommentId)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [open, focusCommentId, comments.data]);

  const all = comments.data ?? [];
  const roots = all.filter((comment) => !comment.parent_comment_id);
  const visibleRoots = showResolved
    ? roots
    : roots.filter((comment) => !comment.resolved_at);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, ProjectComment[]>();
    for (const comment of all) {
      if (!comment.parent_comment_id) continue;
      const list = map.get(comment.parent_comment_id) ?? [];
      list.push(comment);
      map.set(comment.parent_comment_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    return map;
  }, [all]);

  const nodeActivity = useMemo(
    () =>
      (activity.data ?? []).filter(
        (item) => !!node && belongsToNodeActivity(item, node.id),
      ),
    [activity.data, node],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        dir="rtl"
        className="flex h-full w-[min(95vw,470px)] max-w-none flex-col gap-0 p-0 sm:max-w-[470px]"
      >
        <SheetHeader className="border-b border-border px-5 py-4 pe-12 text-start">
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-brand" />
            مراجعة العنصر
          </SheetTitle>
          <SheetDescription className="line-clamp-2">
            {node?.title ?? "العنصر"}
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-2 border-b border-border bg-muted/20 p-1.5">
          <button
            type="button"
            onClick={() => setTab("threads")}
            className={
              tab === "threads"
                ? "rounded-lg bg-background px-3 py-2 text-xs font-semibold shadow-sm"
                : "rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            }
          >
            المناقشة
            {roots.filter((comment) => !comment.resolved_at).length > 0 && (
              <span className="ms-1.5 rounded-full bg-brand/10 px-1.5 text-[9px] text-brand">
                {roots.filter((comment) => !comment.resolved_at).length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab("activity")}
            className={
              tab === "activity"
                ? "rounded-lg bg-background px-3 py-2 text-xs font-semibold shadow-sm"
                : "rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
            }
          >
            نشاط العنصر
          </button>
        </div>

        {tab === "threads" ? (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
              <span className="text-[11px] text-muted-foreground">
                {visibleRoots.length} محادثات
              </span>
              <button
                type="button"
                onClick={() => setShowResolved((value) => !value)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
              >
                {showResolved ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Circle className="h-3 w-3" />
                )}
                {showResolved ? "إخفاء المحلول" : "إظهار المحلول"}
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {comments.isLoading ? (
                <div className="space-y-2">
                  <div className="h-24 animate-pulse rounded-2xl bg-muted" />
                  <div className="h-24 animate-pulse rounded-2xl bg-muted" />
                </div>
              ) : !visibleRoots.length ? (
                <div className="grid min-h-64 place-items-center text-center">
                  <div>
                    <MessageSquare className="mx-auto h-9 w-9 text-muted-foreground/40" />
                    <p className="mt-3 text-sm font-semibold">
                      لا توجد مراجعات مفتوحة
                    </p>
                    <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
                      {canEdit
                        ? "أضف ملاحظة مرتبطة بهذا العنصر، أو استخدم @ لإشعار عضو في المشروع."
                        : "لا توجد ملاحظات مفتوحة على هذا العنصر حاليًا."}
                    </p>
                  </div>
                </div>
              ) : (
                visibleRoots.map((comment) => (
                  <div key={comment.id} className="space-y-2">
                    <ReviewComment
                      projectId={projectId}
                      comment={comment}
                      currentUserId={currentUserId}
                      canEdit={canEdit}
                      canManage={canManage}
                      onReply={setReplyTo}
                      focused={comment.id === focusCommentId}
                    />
                    {(childrenByParent.get(comment.id) ?? []).map((child) => (
                      <ReviewComment
                        key={child.id}
                        projectId={projectId}
                        comment={child}
                        currentUserId={currentUserId}
                        canEdit={canEdit}
                        canManage={canManage}
                        onReply={setReplyTo}
                        child
                        focused={child.id === focusCommentId}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>

            {canEdit && node ? (
              <ReviewComposer
                projectId={projectId}
                boardId={boardId}
                nodeId={node.id}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
              />
            ) : (
              <div className="border-t border-border bg-muted/30 px-4 py-3 text-center text-[11px] text-muted-foreground">
                صلاحيتك للعرض فقط؛ يمكنك قراءة المراجعات دون إضافة أو تعديل.
              </div>
            )}
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {activity.isLoading ? (
              <div className="space-y-2">
                <div className="h-16 animate-pulse rounded-xl bg-muted" />
                <div className="h-16 animate-pulse rounded-xl bg-muted" />
              </div>
            ) : !nodeActivity.length ? (
              <div className="grid min-h-64 place-items-center text-center">
                <div>
                  <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/40" />
                  <p className="mt-3 text-sm font-medium">
                    لا يوجد نشاط مراجعة بعد
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {nodeActivity.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border bg-card p-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-[9px] font-bold">
                        {initials(item.actor_name)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs leading-5">
                          <strong>{item.actor_name}</strong>{" "}
                          {activityLabel(item)}
                        </p>
                        <p className="mt-0.5 text-[9px] text-muted-foreground">
                          {relativeTime(item.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
