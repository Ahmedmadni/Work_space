import { requireRemoteSession } from "@/services/auth.service";
import { supabaseRest } from "@/services/supabase-rest";
import type { Board, BoardWithContext, CreateBoardInput } from "@/types";

interface BoardRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  board_type: Board["board_type"];
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  is_favorite: boolean;
  last_opened_at: string | null;
}

interface ProjectNameRow {
  id: string;
  name: string;
  archived_at: string | null;
}

function mapBoard(row: BoardRow, projectName = "—"): BoardWithContext {
  return {
    id: row.id,
    workspace_id: "ws-system",
    project_id: row.project_id,
    name: row.name,
    description: row.description,
    board_type: row.board_type,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at,
    is_favorite: row.is_favorite,
    last_opened_at: row.last_opened_at,
    project_name: projectName,
    workspace_name: "—",
  };
}

async function projectNameMap(includeArchived = false) {
  const rows = await supabaseRest<ProjectNameRow[]>("projects", {
    query: {
      select: "id,name,archived_at",
      ...(includeArchived ? {} : { archived_at: "is.null" }),
    },
  });
  return new Map(rows.map((row) => [row.id, row.name] as const));
}

export async function remoteListBoards(filter?: {
  projectId?: string;
  favoritesOnly?: boolean;
  limit?: number;
  sort?: "updated" | "opened";
}): Promise<BoardWithContext[]> {
  const names = await projectNameMap(false);
  const rows = await supabaseRest<BoardRow[]>("boards", {
    query: {
      select: "*",
      archived_at: "is.null",
      ...(filter?.projectId ? { project_id: `eq.${filter.projectId}` } : {}),
      ...(filter?.favoritesOnly ? { is_favorite: "eq.true" } : {}),
      order:
        filter?.sort === "opened"
          ? "last_opened_at.desc.nullslast,updated_at.desc"
          : "updated_at.desc",
      ...(filter?.limit ? { limit: filter.limit } : {}),
    },
  });
  return rows
    .filter((row) => names.has(row.project_id))
    .map((row) => mapBoard(row, names.get(row.project_id)));
}

export async function remoteListArchivedBoards(): Promise<BoardWithContext[]> {
  const names = await projectNameMap(true);
  const rows = await supabaseRest<BoardRow[]>("boards", {
    query: {
      select: "*",
      archived_at: "not.is.null",
      order: "updated_at.desc",
    },
  });
  return rows.map((row) => mapBoard(row, names.get(row.project_id)));
}

export async function remoteGetBoard(id: string): Promise<BoardWithContext | null> {
  const rows = await supabaseRest<BoardRow[]>("boards", {
    query: { select: "*", id: `eq.${id}`, limit: 1 },
  });
  const row = rows[0];
  if (!row) return null;
  const projects = await supabaseRest<ProjectNameRow[]>("projects", {
    query: { select: "id,name,archived_at", id: `eq.${row.project_id}`, limit: 1 },
  });
  return mapBoard(row, projects[0]?.name);
}

export async function remoteCreateBoard(input: CreateBoardInput): Promise<Board> {
  const session = await requireRemoteSession();
  const payload = {
    id: `bd-${crypto.randomUUID()}`,
    project_id: input.project_id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    board_type: input.board_type,
    created_by: session.user.id,
  };
  const rows = await supabaseRest<BoardRow[]>("boards", {
    method: "POST",
    body: payload,
    prefer: "return=representation",
  });
  const row = rows[0];
  if (!row) throw new Error("BOARD_CREATE_FAILED");
  return mapBoard(row);
}

async function patchBoard(id: string, body: Record<string, unknown>): Promise<void> {
  if (!Object.keys(body).length) return;
  await supabaseRest("boards", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body,
    prefer: "return=minimal",
  });
}

export async function remoteRenameBoard(id: string, name: string): Promise<void> {
  await patchBoard(id, { name: name.trim() });
}

export async function remoteToggleBoardFavorite(id: string): Promise<void> {
  const board = await remoteGetBoard(id);
  if (!board) return;
  await patchBoard(id, { is_favorite: !board.is_favorite });
}

export async function remoteArchiveBoard(id: string): Promise<void> {
  await patchBoard(id, { archived_at: new Date().toISOString() });
}

export async function remoteRestoreBoard(id: string): Promise<void> {
  await patchBoard(id, { archived_at: null });
}

export async function remoteDeleteBoard(id: string): Promise<void> {
  await supabaseRest("boards", {
    method: "DELETE",
    query: { id: `eq.${id}` },
    prefer: "return=minimal",
  });
}

export async function remoteUpdateBoard(
  id: string,
  patch: { name?: string; description?: string | null },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name.trim();
  if (patch.description !== undefined) body.description = patch.description?.trim() || null;
  await patchBoard(id, body);
}

export async function remoteMarkBoardOpened(id: string): Promise<void> {
  await patchBoard(id, { last_opened_at: new Date().toISOString() });
}
