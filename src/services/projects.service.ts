import { CURRENT_USER, delay, newId, nowIso, readDb, writeDb } from "./local-db";
import { deleteManyBoardCanvases } from "./canvas.service";
import type { CreateProjectInput, Project, ProjectStatus } from "@/types";

export async function listProjects(workspaceId?: string): Promise<Project[]> {
  const db = readDb();
  const rows = db.projects
    .filter((p) => !p.archived_at && (!workspaceId || p.workspace_id === workspaceId))
    // مشاريع المساحات المؤرشفة لا تظهر في القوائم النشطة
    .filter((p) => !db.workspaces.find((w) => w.id === p.workspace_id)?.archived_at)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return delay(rows);
}

export async function listArchivedProjects(): Promise<Project[]> {
  const db = readDb();
  return delay(db.projects.filter((p) => p.archived_at));
}

export async function getProject(id: string): Promise<Project | null> {
  const db = readDb();
  return delay(db.projects.find((p) => p.id === id) ?? null);
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const project: Project = {
    id: newId("pr"),
    workspace_id: input.workspace_id,
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
    const ws = db.workspaces.find((w) => w.id === input.workspace_id);
    if (ws) ws.updated_at = project.updated_at;
  });

  return delay(project, 120);
}

export async function updateProject(
  id: string,
  patch: { name?: string; description?: string | null; status?: ProjectStatus },
): Promise<void> {
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
  const boardIds = readDb().boards.filter((b) => b.project_id === id).map((b) => b.id);
  writeDb((db) => {
    db.projects = db.projects.filter((p) => p.id !== id);
    db.boards = db.boards.filter((b) => b.project_id !== id);
  });
  deleteManyBoardCanvases(boardIds);
  await delay(null, 120);
}
