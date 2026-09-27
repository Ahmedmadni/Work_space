import {
  Clock3,
  Mail,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useInviteProjectMember,
  useProjectAccess,
  useProjectCollaborators,
  useProjectInvitations,
  useRemoveProjectMember,
  useRevokeProjectInvitation,
  useUpdateProjectMemberRole,
} from "@/hooks/use-collaboration";
import { isSupabaseBackend } from "@/lib/backend-config";
import type {
  ProjectCollaborator,
  ProjectRole,
} from "@/types/collaboration";

const ROLE_LABELS: Record<ProjectRole, string> = {
  owner: "المالك",
  admin: "مسؤول",
  editor: "محرر",
  viewer: "مشاهد",
};

const ROLE_DESCRIPTIONS: Record<Exclude<ProjectRole, "owner">, string> = {
  admin: "إدارة المشروع والأعضاء، مع التعديل الكامل.",
  editor: "تعديل اللوحات والملفات والتعليقات.",
  viewer: "مشاهدة وتنقل فقط بدون تعديل.",
};

function roleOptions(actorRole: ProjectRole | null) {
  if (actorRole === "owner") {
    return ["admin", "editor", "viewer"] as const;
  }
  if (actorRole === "admin") {
    return ["editor", "viewer"] as const;
  }
  return [] as const;
}

function canManageMember(
  actorRole: ProjectRole | null,
  member: ProjectCollaborator,
) {
  if (member.is_creator || member.role === "owner") return false;
  if (actorRole === "owner") return true;
  return actorRole === "admin" && member.role !== "admin";
}

export function ProjectShareDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
}: {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const access = useProjectAccess(projectId);
  const collaborators = useProjectCollaborators(projectId);
  const canManage = access.data?.can_manage ?? false;
  const invitations = useProjectInvitations(projectId, canManage);
  const invite = useInviteProjectMember(projectId);
  const updateRole = useUpdateProjectMemberRole(projectId);
  const removeMember = useRemoveProjectMember(projectId);
  const revokeInvitation = useRevokeProjectInvitation(projectId);

  const options = useMemo(
    () => roleOptions(access.data?.role ?? null),
    [access.data?.role],
  );
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<ProjectRole, "owner">>("editor");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) return;
    invite.mutate(
      { email: normalizedEmail, role },
      {
        onSuccess: () => {
          setEmail("");
          setRole(access.data?.role === "admin" ? "editor" : "editor");
        },
      },
    );
  };

  const actorRole = access.data?.role ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-h-[88vh] max-w-2xl gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="border-b border-border px-6 py-5 text-start">
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-brand" />
            مشاركة المشروع
          </DialogTitle>
          <DialogDescription>
            {projectName} · الصلاحيات تطبق على اللوحات والملفات والتعليقات داخل المشروع.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          {!isSupabaseBackend() ? (
            <div className="rounded-2xl border border-info/25 bg-info/5 p-5 text-sm">
              <p className="font-semibold">المشاركة متاحة في الوضع السحابي</p>
              <p className="mt-2 text-muted-foreground">
                فعّل Supabase أولًا حتى تكون العضويات والصلاحيات معزولة وآمنة بين الحسابات.
              </p>
            </div>
          ) : access.isLoading ? (
            <div className="space-y-3">
              <div className="h-24 animate-pulse rounded-2xl bg-muted" />
              <div className="h-40 animate-pulse rounded-2xl bg-muted" />
            </div>
          ) : (
            <div className="space-y-6">
              {canManage && (
                <section className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-brand" />
                    <h3 className="text-sm font-semibold">إضافة عضو</h3>
                  </div>

                  <form
                    onSubmit={submit}
                    className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]"
                  >
                    <div className="relative">
                      <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="email"
                        dir="ltr"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="member@example.com"
                        className="h-10 w-full rounded-xl border border-border bg-background pe-3 ps-9 text-sm outline-none focus:border-brand"
                      />
                    </div>

                    <select
                      value={role}
                      onChange={(event) =>
                        setRole(
                          event.target.value as Exclude<ProjectRole, "owner">,
                        )
                      }
                      className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand"
                    >
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {ROLE_LABELS[option]}
                        </option>
                      ))}
                    </select>

                    <button
                      type="submit"
                      disabled={invite.isPending || !email.trim()}
                      className="h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {invite.isPending ? "جارٍ الإضافة…" : "إضافة"}
                    </button>
                  </form>

                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {ROLE_DESCRIPTIONS[role]}
                    {" "}إذا لم يكن البريد مسجلًا بعد، تبقى الدعوة معلقة وتُفعّل تلقائيًا عند التسجيل.
                  </p>
                </section>
              )}

              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">أعضاء المشروع</h3>
                  <span className="text-xs text-muted-foreground">
                    {collaborators.data?.length ?? 0}
                  </span>
                </div>

                {collaborators.isLoading ? (
                  <div className="h-28 animate-pulse rounded-2xl bg-muted" />
                ) : (
                  <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
                    {(collaborators.data ?? []).map((member) => {
                      const manageable = canManageMember(actorRole, member);
                      const memberOptions = roleOptions(actorRole).filter(
                        (option) =>
                          actorRole === "owner" ||
                          (member.role !== "admin" && option !== "admin"),
                      );

                      return (
                        <div
                          key={member.user_id}
                          className="flex flex-wrap items-center gap-3 bg-background px-4 py-3"
                        >
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold">
                            {(member.full_name || member.email).slice(0, 1)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-medium">
                                {member.full_name}
                              </p>
                              {member.is_creator && (
                                <ShieldCheck className="h-3.5 w-3.5 text-brand" />
                              )}
                            </div>
                            <p className="truncate text-[11px] text-muted-foreground" dir="ltr">
                              {member.email}
                            </p>
                          </div>

                          {manageable ? (
                            <select
                              value={member.role}
                              disabled={updateRole.isPending}
                              onChange={(event) =>
                                updateRole.mutate({
                                  userId: member.user_id,
                                  role: event.target.value as Exclude<
                                    ProjectRole,
                                    "owner"
                                  >,
                                })
                              }
                              className="h-9 rounded-xl border border-border bg-background px-2 text-xs"
                            >
                              {memberOptions.map((option) => (
                                <option key={option} value={option}>
                                  {ROLE_LABELS[option]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                              {ROLE_LABELS[member.role]}
                            </span>
                          )}

                          {manageable && (
                            <button
                              type="button"
                              disabled={removeMember.isPending}
                              onClick={() => {
                                const confirmed = window.confirm(
                                  `إزالة ${member.full_name} من المشروع؟`,
                                );
                                if (confirmed) {
                                  removeMember.mutate(member.user_id);
                                }
                              }}
                              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                              aria-label="إزالة العضو"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {canManage && (invitations.data?.length ?? 0) > 0 && (
                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-warning" />
                    <h3 className="text-sm font-semibold">دعوات معلقة</h3>
                  </div>
                  <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
                    {(invitations.data ?? []).map((invitation) => {
                      const canRevoke =
                        actorRole === "owner" ||
                        (actorRole === "admin" && invitation.role !== "admin");
                      return (
                        <div
                          key={invitation.id}
                          className="flex items-center gap-3 bg-background px-4 py-3"
                        >
                          <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm" dir="ltr">
                              {invitation.email}
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {ROLE_LABELS[invitation.role]} · بانتظار تسجيل البريد
                            </p>
                          </div>
                          {canRevoke && (
                            <button
                              type="button"
                              disabled={revokeInvitation.isPending}
                              onClick={() => revokeInvitation.mutate(invitation.id)}
                              className="rounded-lg px-2.5 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-40"
                            >
                              إلغاء
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {!canManage && (
                <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  دورك الحالي: <strong className="text-foreground">
                    {actorRole ? ROLE_LABELS[actorRole] : "بدون صلاحية"}
                  </strong>. إدارة الأعضاء متاحة للمالك والمسؤول فقط.
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
