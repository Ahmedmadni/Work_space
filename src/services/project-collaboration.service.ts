import { isSupabaseBackend } from "@/lib/backend-config";
import { CURRENT_USER } from "@/services/local-db";
import { supabaseRest } from "@/services/supabase-rest";
import type {
  ProjectAccess,
  ProjectCollaborator,
  ProjectInvitation,
  ProjectInviteResult,
  ProjectRole,
} from "@/types/collaboration";
import { projectAccessFromRole } from "@/types/collaboration";

const ROLE_SET = new Set<ProjectRole>(["owner", "admin", "editor", "viewer"]);

function normalizeRole(value: unknown): ProjectRole | null {
  return typeof value === "string" && ROLE_SET.has(value as ProjectRole)
    ? (value as ProjectRole)
    : null;
}

export async function getProjectAccess(
  projectId: string,
): Promise<ProjectAccess> {
  if (!projectId) return projectAccessFromRole(null);
  if (!isSupabaseBackend()) return projectAccessFromRole("owner");

  const role = await supabaseRest<unknown>("rpc/project_current_role", {
    method: "POST",
    body: { p_project_id: projectId },
  });
  return projectAccessFromRole(normalizeRole(role));
}

export async function listProjectCollaborators(
  projectId: string,
): Promise<ProjectCollaborator[]> {
  if (!isSupabaseBackend()) {
    return [
      {
        user_id: CURRENT_USER.id,
        email: CURRENT_USER.email,
        full_name: CURRENT_USER.full_name,
        role: "owner",
        joined_at: new Date(0).toISOString(),
        is_creator: true,
      },
    ];
  }

  const rows = await supabaseRest<
    Array<{
      user_id: string;
      email: string | null;
      full_name: string | null;
      role: string;
      joined_at: string;
      is_creator: boolean;
    }>
  >("rpc/list_project_collaborators", {
    method: "POST",
    body: { p_project_id: projectId },
  });

  return rows.flatMap((row) => {
    const role = normalizeRole(row.role);
    if (!role) return [];
    return [
      {
        user_id: row.user_id,
        email: row.email ?? "",
        full_name: row.full_name?.trim() || row.email?.split("@")[0] || "مستخدم",
        role,
        joined_at: row.joined_at,
        is_creator: row.is_creator,
      },
    ];
  });
}

export async function listProjectInvitations(
  projectId: string,
): Promise<ProjectInvitation[]> {
  if (!isSupabaseBackend()) return [];
  const rows = await supabaseRest<
    Array<{ id: string; email: string; role: string; created_at: string }>
  >("rpc/list_project_invitations", {
    method: "POST",
    body: { p_project_id: projectId },
  });

  return rows.flatMap((row) => {
    const role = normalizeRole(row.role);
    if (!role || role === "owner") return [];
    return [
      {
        id: row.id,
        email: row.email,
        role,
        created_at: row.created_at,
      },
    ];
  });
}

export async function inviteProjectMember(input: {
  projectId: string;
  email: string;
  role: Exclude<ProjectRole, "owner">;
}): Promise<ProjectInviteResult> {
  if (!isSupabaseBackend()) {
    throw new Error("مشاركة المشاريع تتطلب تشغيل Supabase.");
  }

  return supabaseRest<ProjectInviteResult>("rpc/invite_project_member", {
    method: "POST",
    body: {
      p_project_id: input.projectId,
      p_email: input.email,
      p_role: input.role,
    },
  });
}

export async function updateProjectMemberRole(input: {
  projectId: string;
  userId: string;
  role: Exclude<ProjectRole, "owner">;
}): Promise<void> {
  if (!isSupabaseBackend()) {
    throw new Error("مشاركة المشاريع تتطلب تشغيل Supabase.");
  }

  await supabaseRest<null>("rpc/update_project_member_role", {
    method: "POST",
    body: {
      p_project_id: input.projectId,
      p_user_id: input.userId,
      p_role: input.role,
    },
  });
}

export async function removeProjectMember(input: {
  projectId: string;
  userId: string;
}): Promise<void> {
  if (!isSupabaseBackend()) {
    throw new Error("مشاركة المشاريع تتطلب تشغيل Supabase.");
  }

  await supabaseRest<null>("rpc/remove_project_member", {
    method: "POST",
    body: {
      p_project_id: input.projectId,
      p_user_id: input.userId,
    },
  });
}

export async function revokeProjectInvitation(
  invitationId: string,
): Promise<void> {
  if (!isSupabaseBackend()) {
    throw new Error("مشاركة المشاريع تتطلب تشغيل Supabase.");
  }

  await supabaseRest<null>("rpc/revoke_project_invitation", {
    method: "POST",
    body: { p_invitation_id: invitationId },
  });
}
