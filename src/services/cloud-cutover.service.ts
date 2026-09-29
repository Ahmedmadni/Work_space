import { getLocalBoardCanvasForMigration } from "@/services/canvas.service";
import {
  listLocalDocumentAnnotationPagesForMigration,
} from "@/services/document-annotations.service";
import {
  migrateLocalDataToCloud,
  previewLocalCloudMigration,
  type LocalCloudMigrationIssue,
  type LocalCloudMigrationResult,
} from "@/services/local-cloud-migration.service";
import {
  CURRENT_USER,
  readPersistedDbForMigration,
} from "@/services/local-db";
import {
  listLocalProjectDocumentsForMigration,
} from "@/services/project-documents.service";
import {
  readLocalPlanningForMigration,
} from "@/services/planning.service";
import {
  remoteMigrateProjectDocument,
} from "@/services/remote-project-documents.service";
import { requireRemoteSession } from "@/services/auth.service";
import { supabaseRest } from "@/services/supabase-rest";
import type { Board, Project } from "@/types";

const DEMO_PROJECT_IDS = new Set([
  "pr-offices",
  "pr-lobby",
  "pr-gtm",
  "pr-platform",
]);

export interface CompleteCloudCutoverPreview {
  available: boolean;
  projects: number;
  boards: number;
  nodes: number;
  edges: number;
  strokes: number;
  assets: number;
  versions: number;
  documents: number;
  annotation_pages: number;
  annotations: number;
  assignments: number;
  planning_effort: number;
  planning_capacity: number;
  baselines: number;
  baseline_items: number;
  excluded_demo_projects: number;
  excluded_demo_boards: number;
  remote_project_collisions: number;
  remote_board_collisions: number;
}

export type CompleteCloudCutoverPhase =
  | "preparing"
  | "projects"
  | "boards"
  | "assets"
  | "canvas"
  | "versions"
  | "documents"
  | "annotations"
  | "planning"
  | "verifying";

export interface CompleteCloudCutoverProgress {
  phase: CompleteCloudCutoverPhase;
  current: number;
  total: number;
  message: string;
}

export interface CompleteCloudCutoverResult
  extends LocalCloudMigrationResult {
  documents_migrated: number;
  annotation_pages_migrated: number;
  annotations_migrated: number;
  planning_projects_migrated: number;
  assignments_migrated: number;
  effort_migrated: number;
  capacity_migrated: number;
  baselines_migrated: number;
  baseline_items_migrated: number;
  projects_fully_verified: number;
}

interface Source {
  projects: Project[];
  boards: Board[];
}

function source(includeDemo: boolean): Source {
  const db = readPersistedDbForMigration();
  if (!db) return { projects: [], boards: [] };
  const projects = includeDemo
    ? db.projects
    : db.projects.filter(
        (project) => !DEMO_PROJECT_IDS.has(project.id),
      );
  const ids = new Set(projects.map((project) => project.id));
  return {
    projects,
    boards: db.boards.filter((board) => ids.has(board.project_id)),
  };
}

function boardsForProject(all: Board[], projectId: string) {
  return all.filter((board) => board.project_id === projectId);
}

async function countProjectExtras(
  project: Project,
  boards: Board[],
) {
  const documents =
    await listLocalProjectDocumentsForMigration(project.id).catch(() => []);
  let annotationPages = 0;
  let annotations = 0;
  for (const record of documents) {
    const pages = listLocalDocumentAnnotationPagesForMigration(
      record.document.id,
    );
    annotationPages += pages.length;
    annotations += pages.reduce(
      (total, page) => total + page.annotations.length,
      0,
    );
  }

  const planning = readLocalPlanningForMigration(project.id);
  const snapshots = boards.map((board) =>
    getLocalBoardCanvasForMigration(board.id),
  );
  const assignments = snapshots.reduce(
    (total, snapshot) =>
      total +
      snapshot.nodes.filter(
        (node) => node.assignee_user_id === CURRENT_USER.id,
      ).length,
    0,
  );

  return {
    documents: documents.length,
    annotation_pages: annotationPages,
    annotations,
    assignments,
    planning_effort: Object.keys(planning.effort).length,
    planning_capacity: Object.keys(planning.capacity).length,
    baselines: planning.baselines.length,
    baseline_items: planning.baselines.reduce(
      (total, baseline) => total + baseline.items.length,
      0,
    ),
  };
}

export async function previewCompleteCloudCutover(
  includeDemo = false,
): Promise<CompleteCloudCutoverPreview> {
  const base = await previewLocalCloudMigration(includeDemo);
  const local = source(includeDemo);

  const extras = {
    documents: 0,
    annotation_pages: 0,
    annotations: 0,
    assignments: 0,
    planning_effort: 0,
    planning_capacity: 0,
    baselines: 0,
    baseline_items: 0,
  };

  for (const project of local.projects) {
    const counts = await countProjectExtras(
      project,
      boardsForProject(local.boards, project.id),
    );
    for (const key of Object.keys(extras) as Array<keyof typeof extras>) {
      extras[key] += counts[key];
    }
  }

  return {
    ...base,
    ...extras,
    available:
      base.available ||
      extras.documents > 0 ||
      extras.planning_effort > 0 ||
      extras.baselines > 0,
  };
}

function issue(
  scope: LocalCloudMigrationIssue["scope"] | "document" | "annotation" | "planning",
  id: string,
  name: string,
  error: unknown,
): LocalCloudMigrationIssue {
  return {
    scope: scope as LocalCloudMigrationIssue["scope"],
    id,
    name,
    message:
      error instanceof Error ? error.message : "خطأ غير معروف",
  };
}

function projectNodeMap(boards: Board[]) {
  const map = new Map<
    string,
    { board_id: string; assignee_user_id: string | null }
  >();
  for (const board of boards) {
    const snapshot = getLocalBoardCanvasForMigration(board.id);
    for (const node of snapshot.nodes) {
      map.set(node.id, {
        board_id: board.id,
        assignee_user_id: node.assignee_user_id,
      });
    }
  }
  return map;
}

async function migrateProjectDocuments(
  project: Project,
  progress: (value: CompleteCloudCutoverProgress) => void,
  result: CompleteCloudCutoverResult,
) {
  const documents =
    await listLocalProjectDocumentsForMigration(project.id);
  for (let index = 0; index < documents.length; index += 1) {
    const record = documents[index]!;
    progress({
      phase: "documents",
      current: index + 1,
      total: documents.length,
      message: `رفع المستند: ${record.document.file_name}`,
    });

    try {
      await remoteMigrateProjectDocument(
        record.document,
        record.blob,
      );
      result.documents_migrated += 1;
    } catch (error) {
      result.issues.push(
        issue(
          "document",
          record.document.id,
          record.document.file_name,
          error,
        ),
      );
      continue;
    }

    const pages =
      listLocalDocumentAnnotationPagesForMigration(
        record.document.id,
      );
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      const page = pages[pageIndex]!;
      progress({
        phase: "annotations",
        current: pageIndex + 1,
        total: pages.length,
        message:
          `رفع علامات ${record.document.file_name} · صفحة ${page.page_number}`,
      });
      try {
        await supabaseRest<null>(
          "rpc/save_document_annotations",
          {
            method: "POST",
            body: {
              p_document_id: record.document.id,
              p_page_number: page.page_number,
              p_annotations: page.annotations,
            },
          },
        );
        result.annotation_pages_migrated += 1;
        result.annotations_migrated += page.annotations.length;
      } catch (error) {
        result.issues.push(
          issue(
            "annotation",
            record.document.id,
            `${record.document.file_name} · صفحة ${page.page_number}`,
            error,
          ),
        );
      }
    }
  }
}

async function migrateProjectPlanning(
  project: Project,
  boards: Board[],
  result: CompleteCloudCutoverResult,
) {
  const planning = readLocalPlanningForMigration(project.id);
  const nodes = projectNodeMap(boards);

  const assignments = Array.from(nodes.entries())
    .filter(([, value]) =>
      value.assignee_user_id === CURRENT_USER.id,
    )
    .map(([node_id, value]) => ({
      node_id,
      board_id: value.board_id,
      assignee_user_id: CURRENT_USER.id,
    }));

  const effort = Object.entries(planning.effort)
    .flatMap(([node_id, effort_hours]) => {
      const node = nodes.get(node_id);
      return node
        ? [{
            node_id,
            board_id: node.board_id,
            effort_hours,
          }]
        : [];
    });

  const raw = await supabaseRest<Record<string, unknown>>(
    "rpc/migrate_project_cutover_metadata",
    {
      method: "POST",
      body: {
        p_project_id: project.id,
        p_assignments: assignments,
        p_effort: effort,
        p_capacity: Object.entries(planning.capacity).map(
          ([user_id, weekly_capacity_hours]) => ({
            user_id,
            weekly_capacity_hours,
          }),
        ),
        p_baselines: planning.baselines,
        p_local_user_id: CURRENT_USER.id,
      },
    },
  );

  const number = (key: string) =>
    typeof raw[key] === "number" ? raw[key] as number : 0;

  result.planning_projects_migrated += 1;
  result.assignments_migrated += number("assignments");
  result.effort_migrated += number("effort");
  result.capacity_migrated += number("capacity");
  result.baselines_migrated += number("baselines");
  result.baseline_items_migrated += number("baseline_items");
}

async function verifyProjectExtras(
  project: Project,
  boards: Board[],
  remoteUserId: string,
) {
  const localDocs =
    await listLocalProjectDocumentsForMigration(project.id);
  const remoteDocs = await supabaseRest<
    Array<{
      id: string;
      size_bytes: number;
      page_count: number | null;
    }>
  >("project_documents", {
    query: {
      select: "id,size_bytes,page_count",
      project_id: `eq.${project.id}`,
    },
  });
  const remoteDocMap = new Map(
    remoteDocs.map((row) => [row.id, row] as const),
  );

  for (const local of localDocs) {
    const remote = remoteDocMap.get(local.document.id);
    if (!remote || remote.size_bytes !== local.blob.size) {
      throw new Error(
        `Document verification failed: ${local.document.file_name}`,
      );
    }

    const pages =
      listLocalDocumentAnnotationPagesForMigration(
        local.document.id,
      );
    if (pages.length) {
      const remoteAnnotations = await supabaseRest<
        Array<{ id: string }>
      >("document_annotations", {
        query: {
          select: "id",
          document_id: `eq.${local.document.id}`,
        },
      });
      const remoteIds = new Set(
        remoteAnnotations.map((row) => row.id),
      );
      for (const page of pages) {
        for (const annotation of page.annotations) {
          if (!remoteIds.has(annotation.id)) {
            throw new Error(
              `Annotation verification failed: ${annotation.id}`,
            );
          }
        }
      }
    }
  }

  const planning = readLocalPlanningForMigration(project.id);
  const remotePlanning = await supabaseRest<Record<string, unknown>>(
    "rpc/list_project_planning_data",
    {
      method: "POST",
      body: { p_project_id: project.id },
    },
  );
  const remoteEffort = Array.isArray(remotePlanning.effort)
    ? remotePlanning.effort
    : [];
  const remoteCapacity = Array.isArray(remotePlanning.capacity)
    ? remotePlanning.capacity
    : [];
  const remoteBaselines = Array.isArray(remotePlanning.baselines)
    ? remotePlanning.baselines
    : [];

  if (
    remoteEffort.length < Object.keys(planning.effort).length ||
    remoteCapacity.length < Math.min(1, Object.keys(planning.capacity).length) ||
    remoteBaselines.length < planning.baselines.length
  ) {
    throw new Error("Planning verification failed.");
  }

  for (const board of boards) {
    const localSnapshot = getLocalBoardCanvasForMigration(board.id);
    const assignedLocal = localSnapshot.nodes.filter(
      (node) => node.assignee_user_id === CURRENT_USER.id,
    );
    if (!assignedLocal.length) continue;

    const remote = await supabaseRest<Record<string, unknown>>(
      "rpc/get_board_canvas",
      {
        method: "POST",
        body: { p_board_id: board.id },
      },
    );
    const nodes = Array.isArray(remote.nodes)
      ? remote.nodes as Array<Record<string, unknown>>
      : [];
    const byId = new Map(
      nodes
        .filter((node) => typeof node.id === "string")
        .map((node) => [node.id as string, node] as const),
    );
    for (const node of assignedLocal) {
      if (
        byId.get(node.id)?.assignee_user_id !== remoteUserId
      ) {
        throw new Error(
          `Assignment verification failed: ${node.title}`,
        );
      }
    }
  }
}

export async function migrateCompleteLocalDataToCloud(
  options: {
    includeDemo?: boolean;
    onProgress?: (progress: CompleteCloudCutoverProgress) => void;
  } = {},
): Promise<CompleteCloudCutoverResult> {
  const includeDemo = options.includeDemo === true;
  const progress = options.onProgress ?? (() => {});
  const local = source(includeDemo);
  const session = await requireRemoteSession();

  const base = await migrateLocalDataToCloud({
    includeDemo,
    onProgress: (value) =>
      progress({
        phase: value.phase,
        current: value.current,
        total: value.total,
        message: value.message,
      }),
  });

  const result: CompleteCloudCutoverResult = {
    ...base,
    documents_migrated: 0,
    annotation_pages_migrated: 0,
    annotations_migrated: 0,
    planning_projects_migrated: 0,
    assignments_migrated: 0,
    effort_migrated: 0,
    capacity_migrated: 0,
    baselines_migrated: 0,
    baseline_items_migrated: 0,
    projects_fully_verified: 0,
  };

  const failedProjects = new Set(
    base.issues
      .filter((item) => item.scope === "project")
      .map((item) => item.id),
  );

  const eligibleProjects = local.projects.filter(
    (project) => !failedProjects.has(project.id),
  );

  for (let index = 0; index < eligibleProjects.length; index += 1) {
    const project = eligibleProjects[index]!;
    const projectBoards = boardsForProject(local.boards, project.id);

    try {
      await migrateProjectDocuments(project, progress, result);
    } catch (error) {
      result.issues.push(
        issue("document", project.id, project.name, error),
      );
    }

    progress({
      phase: "planning",
      current: index + 1,
      total: eligibleProjects.length,
      message: `نقل التخطيط والإسناد: ${project.name}`,
    });
    try {
      await migrateProjectPlanning(
        project,
        projectBoards,
        result,
      );
    } catch (error) {
      result.issues.push(
        issue("planning", project.id, project.name, error),
      );
    }
  }

  for (let index = 0; index < eligibleProjects.length; index += 1) {
    const project = eligibleProjects[index]!;
    progress({
      phase: "verifying",
      current: index + 1,
      total: eligibleProjects.length,
      message: `التحقق الكامل من: ${project.name}`,
    });
    try {
      await verifyProjectExtras(
        project,
        boardsForProject(local.boards, project.id),
        session.user.id,
      );
      result.projects_fully_verified += 1;
    } catch (error) {
      result.issues.push(
        issue("verification", project.id, project.name, error),
      );
    }
  }

  result.finished_at = new Date().toISOString();
  return result;
}
