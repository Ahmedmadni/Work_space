import { requireRemoteSession } from "@/services/auth.service";
import { supabaseRest } from "@/services/supabase-rest";
import { remoteDeleteBoardAssets } from "@/services/remote-canvas-assets.service";
import type { CreateProjectInput, Project, ProjectStatus } from "@/types";

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  previous_status: Exclude<ProjectStatus, "archived"> | null;
  icon: string;
  color: Project["color"];
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    workspace_id: "ws-system",
    name: row.name,
    description: row.description,
    status: row.status,
    previous_status: row.previous_status,
    icon: row.icon,
    color: row.color,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at,
  };
}

export async function remoteListProjects(): Promise<Project[]> {
  const rows = await supabaseRest<ProjectRow[]>("projects", {
    query: {
      select: "*",
      archived_at: "is.null",
      order: "updated_at.desc",
    },
  });
  return rows.map(mapProject);
}

export async function remoteListArchivedProjects(): Promise<Project[]> {
  const rows = await supabaseRest<ProjectRow[]>("projects", {
    query: {
      select: "*",
      archived_at: "not.is.null",
      order: "updated_at.desc",
    },
  });
  return rows.map(mapProject);
}

export async function remoteGetProject(id: string): Promise<Project | null> {
  const rows = await supabaseRest<ProjectRow[]>("projects", {
    query: { select: "*", id: `eq.${id}`, limit: 1 },
  });
  return rows[0] ? mapProject(rows[0]) : null;
}

export async function remoteCreateProject(input: CreateProjectInput): Promise<Project> {
  const session = await requireRemoteSession();
  const id = `pr-${crypto.randomUUID()}`;
  const payload = {
    id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    status: input.status,
    previous_status: null,
    icon: input.icon,
    color: input.color,
    created_by: session.user.id,
  };

  const rows = await supabaseRest<ProjectRow[]>("projects", {
    method: "POST",
    body: payload,
    prefer: "return=representation",
  });
  const row = rows[0];
  if (!row) throw new Error("PROJECT_CREATE_FAILED");

  try {
    await supabaseRest("project_members", {
      method: "POST",
      body: { project_id: id, user_id: session.user.id, role: "owner" },
      prefer: "return=minimal",
    });
  } catch (error) {
    try {
      await supabaseRest("projects", {
        method: "DELETE",
        query: { id: `eq.${id}` },
        prefer: "return=minimal",
      });
    } catch {
      // لا نخفي الخطأ الأصلي إذا تعذر التعويض.
    }
    throw error;
  }

  return mapProject(row);
}

export async function remoteUpdateProject(
  id: string,
  patch: { name?: string; description?: string | null; status?: ProjectStatus },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name.trim();
  if (patch.description !== undefined) body.description = patch.description?.trim() || null;
  if (patch.status !== undefined) body.status = patch.status;
  if (!Object.keys(body).length) return;
  await supabaseRest("projects", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body,
    prefer: "return=minimal",
  });
}

export async function remoteArchiveProject(id: string): Promise<void> {
  const current = await remoteGetProject(id);
  if (!current || current.archived_at) return;
  await supabaseRest("projects", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: {
      previous_status: current.status === "archived" ? "planning" : current.status,
      status: "archived",
      archived_at: new Date().toISOString(),
    },
    prefer: "return=minimal",
  });
}

export async function remoteRestoreProject(id: string): Promise<void> {
  const current = await remoteGetProject(id);
  if (!current) return;
  await supabaseRest("projects", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: {
      archived_at: null,
      status: current.previous_status ?? "planning",
      previous_status: null,
    },
    prefer: "return=minimal",
  });
}

export async function remoteDeleteProject(id: string): Promise<void> {
  const boards = await supabaseRest<Array<{ id: string }>>("boards", {
    query: { select: "id", project_id: `eq.${id}` },
  });
  for (const board of boards) {
    await remoteDeleteBoardAssets(board.id);
  }
  await supabaseRest("projects", {
    method: "DELETE",
    query: { id: `eq.${id}` },
    prefer: "return=minimal",
  });
}
