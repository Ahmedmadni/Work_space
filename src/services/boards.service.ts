import { CURRENT_USER, delay, newId, nowIso, readDb, writeDb } from "./local-db";
import { deleteBoardCanvas } from "./canvas.service";
import type { Board, BoardWithContext, CreateBoardInput } from "@/types";

function withContext(board: Board, db = readDb()): BoardWithContext {
  return {
    ...board,
    project_name: db.projects.find((p) => p.id === board.project_id)?.name ?? "—",
    workspace_name: db.workspaces.find((w) => w.id === board.workspace_id)?.name ?? "—",
  };
}

export async function listBoards(filter?: {
  workspaceId?: string;
  projectId?: string;
  favoritesOnly?: boolean;
  limit?: number;
  /** "opened": آخر فتح (ثم آخر تعديل)، الافتراضي: آخر تعديل. */
  sort?: "updated" | "opened";
}): Promise<BoardWithContext[]> {
  const db = readDb();
  // اللوحات النشطة فقط: ليست مؤرشفة ولا يتبع مشروعًا أو مساحة مؤرشفة.
  const activeProjects = new Set(
    db.projects
      .filter((p) => !p.archived_at && !db.workspaces.find((w) => w.id === p.workspace_id)?.archived_at)
      .map((p) => p.id),
  );
  let rows = db.boards.filter((b) => !b.archived_at && activeProjects.has(b.project_id));
  if (filter?.workspaceId) rows = rows.filter((b) => b.workspace_id === filter.workspaceId);
  if (filter?.projectId) rows = rows.filter((b) => b.project_id === filter.projectId);
  if (filter?.favoritesOnly) rows = rows.filter((b) => b.is_favorite);
  const key = (b: Board) => (filter?.sort === "opened" ? (b.last_opened_at ?? b.updated_at) : b.updated_at);
  rows = rows.sort((a, b) => key(b).localeCompare(key(a)));
  if (filter?.limit) rows = rows.slice(0, filter.limit);
  return delay(rows.map((b) => withContext(b, db)));
}

export async function listArchivedBoards(): Promise<BoardWithContext[]> {
  const db = readDb();
  return delay(db.boards.filter((b) => b.archived_at).map((b) => withContext(b, db)));
}

export async function getBoard(id: string): Promise<BoardWithContext | null> {
  const db = readDb();
  const board = db.boards.find((b) => b.id === id);
  return delay(board ? withContext(board, db) : null);
}

export async function createBoard(input: CreateBoardInput): Promise<Board> {
  const board: Board = {
    id: newId("bd"),
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    board_type: input.board_type,
    created_by: CURRENT_USER.id,
    created_at: nowIso(),
    updated_at: nowIso(),
    archived_at: null,
    is_favorite: false,
    last_opened_at: null,
  };

  writeDb((db) => {
    db.boards.unshift(board);
    const project = db.projects.find((p) => p.id === input.project_id);
    if (project) project.updated_at = board.updated_at;
    const ws = db.workspaces.find((w) => w.id === input.workspace_id);
    if (ws) ws.updated_at = board.updated_at;
  });

  return delay(board, 120);
}

export async function renameBoard(id: string, name: string): Promise<void> {
  writeDb((db) => {
    const board = db.boards.find((b) => b.id === id);
    if (board) {
      board.name = name.trim();
      board.updated_at = nowIso();
    }
  });
  await delay(null, 120);
}

export async function toggleBoardFavorite(id: string): Promise<void> {
  writeDb((db) => {
    const board = db.boards.find((b) => b.id === id);
    if (board) board.is_favorite = !board.is_favorite;
  });
  await delay(null, 80);
}

export async function archiveBoard(id: string): Promise<void> {
  writeDb((db) => {
    const board = db.boards.find((b) => b.id === id);
    if (board) board.archived_at = nowIso();
  });
  await delay(null, 120);
}

export async function restoreBoard(id: string): Promise<void> {
  writeDb((db) => {
    const board = db.boards.find((b) => b.id === id);
    if (board) board.archived_at = null;
  });
  await delay(null, 120);
}

export async function deleteBoard(id: string): Promise<void> {
  writeDb((db) => {
    db.boards = db.boards.filter((b) => b.id !== id);
  });
  deleteBoardCanvas(id);
  await delay(null, 120);
}

export async function updateBoard(
  id: string,
  patch: { name?: string; description?: string | null },
): Promise<void> {
  writeDb((db) => {
    const board = db.boards.find((b) => b.id === id);
    if (!board) return;
    if (patch.name !== undefined) board.name = patch.name.trim();
    if (patch.description !== undefined) board.description = patch.description?.trim() || null;
    board.updated_at = nowIso();
  });
  await delay(null, 120);
}

/** يسجّل فتح اللوحة لترتيب «آخر اللوحات» دون تغيير تاريخ التعديل. */
export async function markBoardOpened(id: string): Promise<void> {
  writeDb((db) => {
    const board = db.boards.find((b) => b.id === id);
    if (board) board.last_opened_at = nowIso();
  });
  await delay(null, 0);
}
