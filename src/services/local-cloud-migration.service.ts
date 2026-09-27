import { isSupabaseBackend } from "@/lib/backend-config";
import { requireRemoteSession } from "@/services/auth.service";
import { readPersistedDbForMigration } from "@/services/local-db";
import { getLocalBoardCanvasForMigration, normalizeBoardCanvasSnapshot } from "@/services/canvas.service";
import { listLocalBoardAssetsForMigration } from "@/services/canvas-assets.service";
import { listLocalBoardVersionsForMigration } from "@/services/canvas-history.service";
import { remoteMigrateCanvasImage } from "@/services/remote-canvas-assets.service";
import { supabaseRest } from "@/services/supabase-rest";
import type { Board, BoardCanvasSnapshot, CanvasBoardVersion, Project } from "@/types";

const DEMO_PROJECT_IDS = new Set(["pr-offices", "pr-lobby", "pr-gtm", "pr-platform"]);

export interface LocalCloudMigrationPreview {
  available: boolean;
  projects: number;
  boards: number;
  nodes: number;
  edges: number;
  strokes: number;
  assets: number;
  versions: number;
  excluded_demo_projects: number;
  excluded_demo_boards: number;
  remote_project_collisions: number;
  remote_board_collisions: number;
}

export interface LocalCloudMigrationIssue {
  scope: "project" | "board" | "asset" | "version" | "verification";
  id: string;
  name: string;
  message: string;
}

export interface LocalCloudMigrationProgress {
  phase: "preparing" | "projects" | "boards" | "assets" | "canvas" | "versions" | "verifying";
  current: number;
  total: number;
  message: string;
}

export interface LocalCloudMigrationResult {
  started_at: string;
  finished_at: string;
  projects_migrated: number;
  boards_migrated: number;
  assets_migrated: number;
  canvases_migrated: number;
  versions_migrated: number;
  boards_verified: number;
  issues: LocalCloudMigrationIssue[];
}

interface MigrationSource {
  projects: Project[];
  boards: Board[];
}

function migrationSource(includeDemo: boolean): MigrationSource {
  const db = readPersistedDbForMigration();
  if (!db) return { projects: [], boards: [] };
  const projects = includeDemo
    ? db.projects
    : db.projects.filter((project) => !DEMO_PROJECT_IDS.has(project.id));
  const projectIds = new Set(projects.map((project) => project.id));
  return {
    projects,
    boards: db.boards.filter((board) => projectIds.has(board.project_id)),
  };
}

async function countLocalDetails(boards: Board[]) {
  let nodes = 0;
  let edges = 0;
  let strokes = 0;
  let assets = 0;
  let versions = 0;
  for (const board of boards) {
    const snapshot = getLocalBoardCanvasForMigration(board.id);
    nodes += snapshot.nodes.length;
    edges += snapshot.edges.length;
    strokes += snapshot.strokes.length;
    try {
      assets += (await listLocalBoardAssetsForMigration(board.id)).length;
    } catch {
      // IndexedDB may be unavailable; migration will surface the error per board.
    }
    versions += listLocalBoardVersionsForMigration(board.id).length;
  }
  return { nodes, edges, strokes, assets, versions };
}

export async function previewLocalCloudMigration(
  includeDemo = false,
): Promise<LocalCloudMigrationPreview> {
  if (!isSupabaseBackend()) {
    return {
      available: false,
      projects: 0,
      boards: 0,
      nodes: 0,
      edges: 0,
      strokes: 0,
      assets: 0,
      versions: 0,
      excluded_demo_projects: 0,
      excluded_demo_boards: 0,
      remote_project_collisions: 0,
      remote_board_collisions: 0,
    };
  }

  await requireRemoteSession();
  const persisted = readPersistedDbForMigration();
  if (!persisted) {
    return {
      available: false,
      projects: 0,
      boards: 0,
      nodes: 0,
      edges: 0,
      strokes: 0,
      assets: 0,
      versions: 0,
      excluded_demo_projects: 0,
      excluded_demo_boards: 0,
      remote_project_collisions: 0,
      remote_board_collisions: 0,
    };
  }

  const source = migrationSource(includeDemo);
  const excludedProjectIds = new Set(
    persisted.projects.filter((project) => DEMO_PROJECT_IDS.has(project.id)).map((project) => project.id),
  );
  const details = await countLocalDetails(source.boards);
  const [remoteProjects, remoteBoards] = await Promise.all([
    supabaseRest<Array<{ id: string }>>("projects", { query: { select: "id" } }),
    supabaseRest<Array<{ id: string }>>("boards", { query: { select: "id" } }),
  ]);
  const remoteProjectIds = new Set(remoteProjects.map((row) => row.id));
  const remoteBoardIds = new Set(remoteBoards.map((row) => row.id));

  return {
    available: source.projects.length > 0 || source.boards.length > 0,
    projects: source.projects.length,
    boards: source.boards.length,
    ...details,
    excluded_demo_projects: includeDemo ? 0 : excludedProjectIds.size,
    excluded_demo_boards: includeDemo
      ? 0
      : persisted.boards.filter((board) => excludedProjectIds.has(board.project_id)).length,
    remote_project_collisions: source.projects.filter((project) => remoteProjectIds.has(project.id)).length,
    remote_board_collisions: source.boards.filter((board) => remoteBoardIds.has(board.id)).length,
  };
}

async function upsertProject(project: Project, userId: string) {
  const existing = await supabaseRest<Array<{ id: string; created_by: string }>>("projects", {
    query: { select: "id,created_by", id: `eq.${project.id}`, limit: 1 },
  });
  if (existing[0] && existing[0].created_by !== userId) {
    throw new Error("يوجد مشروع سحابي بنفس المعرّف لكنه ليس مملوكًا للحساب الحالي.");
  }

  await supabaseRest("projects", {
    method: "POST",
    query: { on_conflict: "id" },
    body: {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      previous_status: project.previous_status ?? null,
      icon: project.icon,
      color: project.color,
      created_by: userId,
      created_at: project.created_at,
      updated_at: project.updated_at,
      archived_at: project.archived_at,
    },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  await supabaseRest("project_members", {
    method: "POST",
    query: { on_conflict: "project_id,user_id" },
    body: {
      project_id: project.id,
      user_id: userId,
      role: "owner",
      created_at: project.created_at,
    },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

async function upsertBoard(board: Board, userId: string) {
  const existing = await supabaseRest<
    Array<{ id: string; project_id: string; created_by: string }>
  >("boards", {
    query: { select: "id,project_id,created_by", id: `eq.${board.id}`, limit: 1 },
  });
  if (
    existing[0] &&
    (existing[0].created_by !== userId || existing[0].project_id !== board.project_id)
  ) {
    throw new Error("يوجد Board سحابية بنفس المعرّف ولا تطابق ملكية/مشروع البيانات المحلية.");
  }

  await supabaseRest("boards", {
    method: "POST",
    query: { on_conflict: "id" },
    body: {
      id: board.id,
      project_id: board.project_id,
      name: board.name,
      description: board.description,
      board_type: board.board_type,
      created_by: userId,
      created_at: board.created_at,
      updated_at: board.updated_at,
      archived_at: board.archived_at,
      is_favorite: board.is_favorite,
      last_opened_at: board.last_opened_at,
    },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

async function migrateAssets(board: Board): Promise<number> {
  const assets = await listLocalBoardAssetsForMigration(board.id);
  for (const asset of assets) {
    const file = new File([asset.blob], asset.name, { type: asset.mime_type });
    await remoteMigrateCanvasImage(board.id, asset.id, file);
  }
  return assets.length;
}

async function migrateCanvas(boardId: string): Promise<BoardCanvasSnapshot> {
  const snapshot = getLocalBoardCanvasForMigration(boardId);
  await supabaseRest<null>("rpc/save_board_canvas", {
    method: "POST",
    body: {
      p_board_id: boardId,
      p_nodes: snapshot.nodes,
      p_edges: snapshot.edges,
      p_strokes: snapshot.strokes,
      p_viewport: snapshot.viewport,
    },
  });
  return snapshot;
}

async function migrateVersions(
  boardId: string,
  userId: string,
): Promise<number> {
  const versions = listLocalBoardVersionsForMigration(boardId);
  for (const version of versions) {
    await supabaseRest("board_versions", {
      method: "POST",
      query: { on_conflict: "id" },
      body: {
        id: version.id,
        board_id: boardId,
        reason: version.reason,
        label: version.label,
        snapshot: version.snapshot,
        node_count: version.node_count,
        edge_count: version.edge_count,
        stroke_count: version.stroke_count,
        created_by: userId,
        created_at: version.created_at,
      },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }
  return versions.length;
}

async function verifyBoard(
  board: Board,
  localSnapshot: BoardCanvasSnapshot,
  localAssetCount: number,
  localVersions: CanvasBoardVersion[],
) {
  const [remoteCanvas, remoteAssets, remoteVersions] = await Promise.all([
    supabaseRest<unknown>("rpc/get_board_canvas", {
      method: "POST",
      body: { p_board_id: board.id },
    }),
    supabaseRest<Array<{ id: string }>>("canvas_assets", {
      query: { select: "id", board_id: `eq.${board.id}` },
    }),
    supabaseRest<Array<{ id: string }>>("board_versions", {
      query: { select: "id", board_id: `eq.${board.id}` },
    }),
  ]);
  const normalized = normalizeBoardCanvasSnapshot(board.id, remoteCanvas);
  const sameCanvas =
    normalized.nodes.length === localSnapshot.nodes.length &&
    normalized.edges.length === localSnapshot.edges.length &&
    normalized.strokes.length === localSnapshot.strokes.length;
  const sameAssets = remoteAssets.length >= localAssetCount;
  const sameVersions = remoteVersions.length >= Math.min(localVersions.length, 20);
  if (!sameCanvas || !sameAssets || !sameVersions) {
    throw new Error(
      `Verification mismatch: canvas=${sameCanvas}, assets=${sameAssets}, versions=${sameVersions}`,
    );
  }
}

function issueMessage(error: unknown) {
  return error instanceof Error ? error.message : "خطأ غير معروف";
}

export async function migrateLocalDataToCloud(
  options: {
    includeDemo?: boolean;
    onProgress?: (progress: LocalCloudMigrationProgress) => void;
  } = {},
): Promise<LocalCloudMigrationResult> {
  if (!isSupabaseBackend()) throw new Error("الترحيل إلى السحابة يتطلب تشغيل Supabase mode.");
  const session = await requireRemoteSession();
  const source = migrationSource(options.includeDemo === true);
  const result: LocalCloudMigrationResult = {
    started_at: new Date().toISOString(),
    finished_at: "",
    projects_migrated: 0,
    boards_migrated: 0,
    assets_migrated: 0,
    canvases_migrated: 0,
    versions_migrated: 0,
    boards_verified: 0,
    issues: [],
  };
  const progress = options.onProgress ?? (() => {});

  progress({ phase: "preparing", current: 0, total: source.projects.length + source.boards.length, message: "جارٍ تجهيز الترحيل…" });

  const failedProjects = new Set<string>();
  for (let index = 0; index < source.projects.length; index += 1) {
    const project = source.projects[index]!;
    progress({ phase: "projects", current: index + 1, total: source.projects.length, message: `رفع المشروع: ${project.name}` });
    try {
      await upsertProject(project, session.user.id);
      result.projects_migrated += 1;
    } catch (error) {
      failedProjects.add(project.id);
      result.issues.push({ scope: "project", id: project.id, name: project.name, message: issueMessage(error) });
    }
  }

  const eligibleBoards = source.boards.filter((board) => !failedProjects.has(board.project_id));
  const verificationInputs = new Map<
    string,
    { board: Board; snapshot: BoardCanvasSnapshot; assets: number; versions: CanvasBoardVersion[] }
  >();

  for (let index = 0; index < eligibleBoards.length; index += 1) {
    const board = eligibleBoards[index]!;
    progress({ phase: "boards", current: index + 1, total: eligibleBoards.length, message: `رفع اللوحة: ${board.name}` });
    try {
      await upsertBoard(board, session.user.id);
      result.boards_migrated += 1;
    } catch (error) {
      result.issues.push({ scope: "board", id: board.id, name: board.name, message: issueMessage(error) });
      continue;
    }

    let assetCount = 0;
    try {
      progress({ phase: "assets", current: index + 1, total: eligibleBoards.length, message: `رفع صور: ${board.name}` });
      assetCount = await migrateAssets(board);
      result.assets_migrated += assetCount;
    } catch (error) {
      result.issues.push({ scope: "asset", id: board.id, name: board.name, message: issueMessage(error) });
    }

    let snapshot: BoardCanvasSnapshot;
    try {
      progress({ phase: "canvas", current: index + 1, total: eligibleBoards.length, message: `رفع محتوى اللوحة: ${board.name}` });
      snapshot = await migrateCanvas(board.id);
      result.canvases_migrated += 1;
    } catch (error) {
      result.issues.push({ scope: "board", id: board.id, name: board.name, message: issueMessage(error) });
      continue;
    }

    const localVersions = listLocalBoardVersionsForMigration(board.id);
    try {
      progress({ phase: "versions", current: index + 1, total: eligibleBoards.length, message: `رفع سجل الإصدارات: ${board.name}` });
      result.versions_migrated += await migrateVersions(board.id, session.user.id);
    } catch (error) {
      result.issues.push({ scope: "version", id: board.id, name: board.name, message: issueMessage(error) });
    }

    verificationInputs.set(board.id, { board, snapshot, assets: assetCount, versions: localVersions });
  }

  let verifyIndex = 0;
  for (const input of verificationInputs.values()) {
    verifyIndex += 1;
    progress({ phase: "verifying", current: verifyIndex, total: verificationInputs.size, message: `التحقق من: ${input.board.name}` });
    try {
      await verifyBoard(input.board, input.snapshot, input.assets, input.versions);
      result.boards_verified += 1;
    } catch (error) {
      result.issues.push({
        scope: "verification",
        id: input.board.id,
        name: input.board.name,
        message: issueMessage(error),
      });
    }
  }

  result.finished_at = new Date().toISOString();
  return result;
}
