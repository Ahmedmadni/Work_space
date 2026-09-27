import { isSupabaseBackend } from "@/lib/backend-config";
import {
  remoteArchiveProject,
  remoteCreateProject,
  remoteDeleteProject,
  remoteGetProject,
  remoteListArchivedProjects,
  remoteListProjects,
  remoteRestoreProject,
  remoteUpdateProject,
} from "./remote-projects.service";
import { CURRENT_USER, delay, newId, nowIso, readDb, writeDb } from "./local-db";
import { deleteManyBoardCanvases } from "./canvas.service";
import { deleteManyBoardAssets } from "./canvas-assets.service";
import { deleteManyBoardHistories } from "./canvas-history.service";
import type { CreateProjectInput, Project, ProjectStatus } from "@/types";

export async function listProjects(workspaceId?: string): Promise<Project[]> {
  if (isSupabaseBackend()) return remoteListProjects();
  const db = readDb();
  const rows = db.projects
    .filter((p) => !p.archived_at && (!workspaceId || p.workspace_id === workspaceId))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return delay(rows);
}

export async function listArchivedProjects(): Promise<Project[]> {
  if (isSupabaseBackend()) return remoteListArchivedProjects();
  const db = readDb();
  return delay(db.projects.filter((p) => p.archived_at));
}

export async function getProject(id: string): Promise<Project | null> {
  if (isSupabaseBackend()) return remoteGetProject(id);
  const db = readDb();
  return delay(db.projects.find((p) => p.id === id) ?? null);
}

const SYSTEM_WORKSPACE_ID = "ws-system";

function ensureSystemWorkspace() {
  writeDb((db) => {
    if (db.workspaces.some((w) => w.id === SYSTEM_WORKSPACE_ID)) return;
    const now = nowIso();
    db.workspaces.push({
      id: SYSTEM_WORKSPACE_ID,
      name: "النظام",
      description: "حاوية داخلية مخفية للمشاريع المباشرة.",
      icon: "م",
      color: "brand",
      created_by: CURRENT_USER.id,
      created_at: now,
      updated_at: now,
      archived_at: null,
    });
  });
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  if (isSupabaseBackend()) return remoteCreateProject(input);
  if (!input.workspace_id) ensureSystemWorkspace();
  const workspaceId = input.workspace_id ?? SYSTEM_WORKSPACE_ID;
  const project: Project = {
    id: newId("pr"),
    workspace_id: workspaceId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    status: input.status,
    icon: input.icon,
    color: input.color,
    created_by: CURRENT_USER.id,
    created_at: nowIso(),
    updated_at: nowIso(),
    archived_at: null,
  };

  writeDb((db) => {
    db.projects.unshift(project);
    const ws = db.workspaces.find((w) => w.id === workspaceId);
    if (ws) ws.updated_at = project.updated_at;
  });

  return delay(project, 120);
}

export async function updateProject(
  id: string,
  patch: { name?: string; description?: string | null; status?: ProjectStatus },
): Promise<void> {
  if (isSupabaseBackend()) return remoteUpdateProject(id, patch);
  writeDb((db) => {
    const project = db.projects.find((p) => p.id === id);
    if (!project) return;
    if (patch.name !== undefined) project.name = patch.name.trim();
    if (patch.description !== undefined) project.description = patch.description || null;
    if (patch.status !== undefined) project.status = patch.status;
    project.updated_at = nowIso();
  });
  await delay(null, 120);
}

export async function archiveProject(id: string): Promise<void> {
  if (isSupabaseBackend()) return remoteArchiveProject(id);
  writeDb((db) => {
    const project = db.projects.find((p) => p.id === id);
    if (project) {
      if (!project.archived_at) {
        if (project.status !== "archived") project.previous_status = project.status;
        project.archived_at = nowIso();
        project.status = "archived";
      }
    }
  });
  await delay(null, 120);
}

export async function restoreProject(id: string): Promise<void> {
  if (isSupabaseBackend()) return remoteRestoreProject(id);
  writeDb((db) => {
    const project = db.projects.find((p) => p.id === id);
    if (project) {
      project.archived_at = null;
      project.status = project.previous_status ?? "planning";
      project.previous_status = null;
    }
  });
  await delay(null, 120);
}

export async function deleteProject(id: string): Promise<void> {
  if (isSupabaseBackend()) return remoteDeleteProject(id);
  const boardIds = readDb().boards.filter((b) => b.project_id === id).map((b) => b.id);
  writeDb((db) => {
    db.projects = db.projects.filter((p) => p.id !== id);
    db.boards = db.boards.filter((b) => b.project_id !== id);
  });
  deleteManyBoardCanvases(boardIds);
  deleteManyBoardHistories(boardIds);
  await deleteManyBoardAssets(boardIds);
  await delay(null, 120);
}
