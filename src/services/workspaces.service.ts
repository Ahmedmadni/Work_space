import { CURRENT_USER, delay, newId, nowIso, readDb, writeDb } from "./local-db";
import { deleteManyBoardCanvases } from "./canvas.service";
import type { CreateWorkspaceInput, Workspace, WorkspaceWithStats } from "@/types";

function withStats(ws: Workspace, db = readDb()): WorkspaceWithStats {
  return {
    ...ws,
    projects_count: db.projects.filter((p) => p.workspace_id === ws.id && !p.archived_at).length,
    boards_count: db.boards.filter((b) => b.workspace_id === ws.id && !b.archived_at).length,
  };
}

export async function listWorkspaces(): Promise<WorkspaceWithStats[]> {
  const db = readDb();
  const rows = db.workspaces
    .filter((ws) => !ws.archived_at)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((ws) => withStats(ws, db));
  return delay(rows);
}

export async function listArchivedWorkspaces(): Promise<WorkspaceWithStats[]> {
  const db = readDb();
  return delay(db.workspaces.filter((ws) => ws.archived_at).map((ws) => withStats(ws, db)));
}

export async function getWorkspace(id: string): Promise<WorkspaceWithStats | null> {
  const db = readDb();
  const ws = db.workspaces.find((w) => w.id === id);
  return delay(ws ? withStats(ws, db) : null);
}

export async function createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
  const workspace: Workspace = {
    id: newId("ws"),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    icon: input.icon,
    color: input.color,
    created_by: CURRENT_USER.id,
    created_at: nowIso(),
    updated_at: nowIso(),
    archived_at: null,
  };

  writeDb((db) => {
    db.workspaces.unshift(workspace);
    db.workspace_members.push({
      id: newId("wm"),
      workspace_id: workspace.id,
      user_id: CURRENT_USER.id,
      role: "owner",
      created_at: workspace.created_at,
    });
  });

  return delay(workspace, 120);
}

export async function renameWorkspace(id: string, name: string): Promise<void> {
  writeDb((db) => {
    const ws = db.workspaces.find((w) => w.id === id);
    if (ws) {
      ws.name = name.trim();
      ws.updated_at = nowIso();
    }
  });
  await delay(null, 120);
}

export async function archiveWorkspace(id: string): Promise<void> {
  writeDb((db) => {
    const ws = db.workspaces.find((w) => w.id === id);
    if (ws) ws.archived_at = nowIso();
  });
  await delay(null, 120);
}

export async function restoreWorkspace(id: string): Promise<void> {
  writeDb((db) => {
    const ws = db.workspaces.find((w) => w.id === id);
    if (ws) ws.archived_at = null;
  });
  await delay(null, 120);
}

export async function deleteWorkspace(id: string): Promise<void> {
  const boardIds = readDb().boards.filter((b) => b.workspace_id === id).map((b) => b.id);
  writeDb((db) => {
    db.workspaces = db.workspaces.filter((w) => w.id !== id);
    db.workspace_members = db.workspace_members.filter((m) => m.workspace_id !== id);
    db.projects = db.projects.filter((p) => p.workspace_id !== id);
    db.boards = db.boards.filter((b) => b.workspace_id !== id);
  });
  deleteManyBoardCanvases(boardIds);
  await delay(null, 120);
}

export async function updateWorkspace(
  id: string,
  patch: { name?: string; description?: string | null },
): Promise<void> {
  writeDb((db) => {
    const ws = db.workspaces.find((w) => w.id === id);
    if (!ws) return;
    if (patch.name !== undefined) ws.name = patch.name.trim();
    if (patch.description !== undefined) ws.description = patch.description?.trim() || null;
    ws.updated_at = nowIso();
  });
  await delay(null, 120);
}
