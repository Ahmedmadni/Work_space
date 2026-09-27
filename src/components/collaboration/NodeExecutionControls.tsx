import { Bell, BellOff, UserRound, Users } from "lucide-react";

import { useProjectCollaborators } from "@/hooks/use-collaboration";
import {
  useCanvasNodeWatchers,
  useCurrentTaskUserId,
  useSetCanvasNodeAssignee,
  useSetCanvasNodeWatching,
} from "@/hooks/use-task-execution";
import type { CanvasNode, CanvasNodeAssignment } from "@/types";

export function NodeExecutionControls({
  projectId,
  boardId,
  node,
  onAssignmentChange,
}: {
  projectId: string;
  boardId: string;
  node: CanvasNode;
  onAssignmentChange: (assignment: CanvasNodeAssignment) => void;
}) {
  const collaborators = useProjectCollaborators(projectId);
  const watchers = useCanvasNodeWatchers(
    projectId,
    boardId,
    node.id,
    true,
  );
  const setAssignee = useSetCanvasNodeAssignee(
    projectId,
    boardId,
    node.id,
  );
  const setWatching = useSetCanvasNodeWatching(
    projectId,
    boardId,
    node.id,
  );
  const currentUserId = useCurrentTaskUserId();

  const watcherList = watchers.data ?? [];
  const assignableMembers = (collaborators.data ?? []).filter(
    (member) => member.role !== "viewer",
  );
  const watching = !!currentUserId &&
    watcherList.some((watcher) => watcher.user_id === currentUserId);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <UserRound className="h-4 w-4 text-brand" />
        <div>
          <p className="text-xs font-semibold">التنفيذ والمسؤولية</p>
          <p className="text-[10px] text-muted-foreground">
            عيّن عضوًا حقيقيًا للمهمة وتابع تغييراتها.
          </p>
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-[10px] text-muted-foreground">
          المسؤول
        </span>
        <select
          value={node.assignee_user_id ?? ""}
          disabled={setAssignee.isPending || collaborators.isLoading}
          onChange={(event) => {
            const userId = event.target.value || null;
            const member = (collaborators.data ?? []).find(
              (item) => item.user_id === userId,
            );
            setAssignee.mutate(
              {
                assigneeUserId: userId,
                assigneeName: member?.full_name ?? null,
              },
              {
                onSuccess: onAssignmentChange,
              },
            );
          }}
          className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none focus:border-brand disabled:opacity-50"
        >
          <option value="">بدون مسؤول</option>
          {assignableMembers.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.full_name}
              {member.role === "owner"
                ? " · المالك"
                : member.role === "admin"
                  ? " · مسؤول"
                  : " · محرر"}
            </option>
          ))}
        </select>
        {!node.assignee_user_id && node.owner && (
          <p className="mt-1.5 text-[9px] leading-4 text-warning">
            تعيين قديم بالاسم: {node.owner}. اختر عضوًا لتحويله إلى تكليف حقيقي.
          </p>
        )}
      </label>

      <div className="flex items-center justify-between gap-2 rounded-xl bg-muted/40 p-2.5">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-medium">
            <Users className="h-3.5 w-3.5" />
            المتابعون
          </p>
          <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
            {watcherList.length
              ? watcherList.map((item) => item.full_name).join("، ")
              : "لا يوجد متابعون بعد"}
          </p>
        </div>
        <button
          type="button"
          disabled={!currentUserId || setWatching.isPending}
          onClick={() => setWatching.mutate(!watching)}
          className={
            watching
              ? "inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand/10 px-2 py-1.5 text-[10px] font-medium text-brand"
              : "inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
          }
        >
          {watching ? (
            <BellOff className="h-3.5 w-3.5" />
          ) : (
            <Bell className="h-3.5 w-3.5" />
          )}
          {watching ? "إيقاف المتابعة" : "متابعة"}
        </button>
      </div>
    </div>
  );
}
