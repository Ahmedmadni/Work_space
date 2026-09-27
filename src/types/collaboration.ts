export type ProjectRole = "owner" | "admin" | "editor" | "viewer";

export interface ProjectAccess {
  role: ProjectRole | null;
  can_view: boolean;
  can_edit: boolean;
  can_manage: boolean;
}

export interface ProjectCollaborator {
  user_id: string;
  email: string;
  full_name: string;
  role: ProjectRole;
  joined_at: string;
  is_creator: boolean;
}

export interface ProjectInvitation {
  id: string;
  email: string;
  role: Exclude<ProjectRole, "owner">;
  created_at: string;
}

export interface ProjectInviteResult {
  status: "added" | "pending";
  email: string;
  role: Exclude<ProjectRole, "owner">;
  user_id?: string;
  invitation_id?: string;
}

export function projectAccessFromRole(
  role: ProjectRole | null,
): ProjectAccess {
  return {
    role,
    can_view: role !== null,
    can_edit: role === "owner" || role === "admin" || role === "editor",
    can_manage: role === "owner" || role === "admin",
  };
}
