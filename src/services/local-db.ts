/**
 * مخزن بيانات محلي مؤقت (Mock Data Layer).
 *
 * الغرض: تشغيل الواجهة بالكامل قبل توصيل قاعدة البيانات.
 * كل الوصول للبيانات يمر عبر ملفات services/*.service.ts فقط،
 * لذلك استبدال هذا الملف بقاعدة بيانات حقيقية لا يتطلب تغيير أي مكوّن.
 */

import type { Board, Profile, Project, Workspace, WorkspaceMember } from "@/types";

const STORAGE_KEY = "projectflow.db.v1";

export interface Database {
  profile: Profile;
  workspaces: Workspace[];
  workspace_members: WorkspaceMember[];
  projects: Project[];
  boards: Board[];
}

export const CURRENT_USER: Profile = {
  id: "user-local",
  full_name: "سارة الحربي",
  email: "sara@projectflow.app",
  initials: "س",
};

function daysAgo(days: number, hours = 0): string {
  return new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();
}

function seed(): Database {
  const workspaces: Workspace[] = [
    {
      id: "ws-design",
      name: "التصميم الداخلي — الرياض",
      description: "تخطيط مساحات العمل والمكاتب المشتركة للفريق.",
      icon: "د",
      color: "brand",
      created_by: CURRENT_USER.id,
      created_at: daysAgo(64),
      updated_at: daysAgo(0, 2),
      archived_at: null,
    },
    {
      id: "ws-launch",
      name: "إطلاق منتج الفصل الثالث",
      description: "الجدول الزمني والتسليمات قبل موعد الإطلاق الرسمي.",
      icon: "ت",
      color: "amber",
      created_by: CURRENT_USER.id,
      created_at: daysAgo(40),
      updated_at: daysAgo(1),
      archived_at: null,
    },
    {
      id: "ws-infra",
      name: "سلسلة البنية التحتية",
      description: "مهام هندسة البرمجيات وتكامل المنصات الخلفية.",
      icon: "س",
      color: "sky",
      created_by: CURRENT_USER.id,
      created_at: daysAgo(22),
      updated_at: daysAgo(2),
      archived_at: null,
    },
  ];

  const projects: Project[] = [
    {
      id: "pr-offices",
      workspace_id: "ws-design",
      name: "مكاتب الدور الثالث",
      description: "توزيع المساحات والأثاث وخطة الإضاءة.",
      status: "active",
      icon: "م",
      color: "brand",
      created_by: CURRENT_USER.id,
      created_at: daysAgo(50),
      updated_at: daysAgo(0, 3),
      archived_at: null,
    },
    {
      id: "pr-lobby",
      workspace_id: "ws-design",
      name: "بهو الاستقبال",
      description: "مفهوم بصري أولي ومراجعة المواد.",
      status: "planning",
      icon: "ب",
      color: "lime",
      created_by: CURRENT_USER.id,
      created_at: daysAgo(30),
      updated_at: daysAgo(4),
      archived_at: null,
    },
    {
      id: "pr-gtm",
      workspace_id: "ws-launch",
      name: "خطة الانتشار",
      description: "رسائل السوق وقنوات الإطلاق.",
      status: "active",
      icon: "خ",
      color: "amber",
      created_by: CURRENT_USER.id,
      created_at: daysAgo(35),
      updated_at: daysAgo(1),
      archived_at: null,
    },
    {
      id: "pr-platform",
      workspace_id: "ws-infra",
      name: "تكامل المنصات",
      description: "ربط الأنظمة الخلفية وتوحيد الواجهات البرمجية.",
      status: "on_hold",
      icon: "ت",
      color: "sky",
      created_by: CURRENT_USER.id,
      created_at: daysAgo(18),
      updated_at: daysAgo(5),
      archived_at: null,
    },
  ];

  const boards: Board[] = [
    {
      id: "bd-roadmap",
      workspace_id: "ws-launch",
      project_id: "pr-gtm",
      name: "خريطة الإطلاق",
      description: "المراحل الزمنية حتى الإطلاق.",
      board_type: "roadmap",
      created_by: CURRENT_USER.id,
      created_at: daysAgo(20),
      updated_at: daysAgo(0, 3),
      archived_at: null,
      is_favorite: true,
      last_opened_at: null,
    },
    {
      id: "bd-offices",
      workspace_id: "ws-design",
      project_id: "pr-offices",
      name: "نظرة على المكاتب",
      description: "مخطط المساحات ومسارات الحركة.",
      board_type: "project_plan",
      created_by: CURRENT_USER.id,
      created_at: daysAgo(16),
      updated_at: daysAgo(1),
      archived_at: null,
      is_favorite: true,
      last_opened_at: null,
    },
    {
      id: "bd-integration",
      workspace_id: "ws-infra",
      project_id: "pr-platform",
      name: "تبويب التكامل",
      description: "علاقات الخدمات والاعتماديات.",
      board_type: "system_architecture",
      created_by: CURRENT_USER.id,
      created_at: daysAgo(12),
      updated_at: daysAgo(5),
      archived_at: null,
      is_favorite: false,
      last_opened_at: null,
    },
    {
      id: "bd-security",
      workspace_id: "ws-infra",
      project_id: "pr-platform",
      name: "توصيف الأمان",
      description: "أفكار أولية لمراجعة الصلاحيات.",
      board_type: "brainstorm",
      created_by: CURRENT_USER.id,
      created_at: daysAgo(9),
      updated_at: daysAgo(7),
      archived_at: null,
      is_favorite: false,
      last_opened_at: null,
    },
    {
      id: "bd-lobby",
      workspace_id: "ws-design",
      project_id: "pr-lobby",
      name: "أفكار البهو",
      description: null,
      board_type: "mind_map",
      created_by: CURRENT_USER.id,
      created_at: daysAgo(6),
      updated_at: daysAgo(6),
      archived_at: null,
      is_favorite: false,
      last_opened_at: null,
    },
  ];

  const workspace_members: WorkspaceMember[] = workspaces.map((ws) => ({
    id: `wm-${ws.id}`,
    workspace_id: ws.id,
    user_id: CURRENT_USER.id,
    role: "owner",
    created_at: ws.created_at,
  }));

  return { profile: CURRENT_USER, workspaces, workspace_members, projects, boards };
}

/** رقم نسخة بنية البيانات المحفوظة. ارفعه وأضف دالة ترحيل عند تغيير البنية. */
export const SCHEMA_VERSION = 3;

interface StoredEnvelope {
  schemaVersion: number;
  data: Database;
}

/** ترحيلات متسلسلة: المفتاح هو النسخة المصدر. */
const MIGRATIONS: Record<number, (db: Database) => Database> = {
  // v1 → v2: إضافة last_opened_at للوحات (يُطبَّع تلقائيًا في normalize).
  1: (db) => db,
  // v2 → v3: إلغاء تأثير أرشفة Workspace على الواجهة وتحويله إلى أرشفة المشاريع التابعة.
  2: (db) => {
    const archivedWorkspaceIds = new Set(
      db.workspaces.filter((workspace) => workspace.archived_at).map((workspace) => workspace.id),
    );
    for (const project of db.projects) {
      if (!archivedWorkspaceIds.has(project.workspace_id) || project.archived_at) continue;
      if (project.status !== "archived") project.previous_status = project.status;
      project.archived_at =
        db.workspaces.find((workspace) => workspace.id === project.workspace_id)?.archived_at ??
        nowIso();
      project.status = "archived";
    }
    for (const workspace of db.workspaces) workspace.archived_at = null;
    return db;
  },
};

function warnDev(message: string, error?: unknown) {
  if (import.meta.env.DEV) console.warn(`[local-db] ${message}`, error ?? "");
}

type RawKey = "id"|"name"|"description"|"icon"|"color"|"created_at"|"updated_at"|"archived_at"|"workspace_id"|"project_id"|"status"|"previous_status"|"board_type"|"is_favorite"|"last_opened_at"|"user_id"|"role"|"workspaces"|"projects"|"boards"|"workspace_members"|"schemaVersion"|"data";
type Raw = Partial<Record<RawKey, unknown>>;
const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string) => (typeof v === "string" && v.length ? v : fallback);
const strOrNull = (v: unknown) => (typeof v === "string" ? v : null);
function rows<T>(v: unknown, fix: (r: Raw) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((r) => { if (!isObj(r) || typeof r.id !== "string") return []; const x = fix(r); return x ? [x] : []; });
}

/** يطبّع أي بيانات محفوظة (ناقصة أو قديمة) إلى بنية سليمة ويزيل العناصر اليتيمة. */
export function normalize(raw: unknown): Database {
  const src = isObj(raw) ? raw : {};
  const now = nowIso();
  const base = { created_by: CURRENT_USER.id };
  const workspaces = rows<Workspace>(src.workspaces, (r) => ({
    ...base, id: r.id as string, name: str(r.name, "مساحة بلا اسم"), description: strOrNull(r.description),
    icon: str(r.icon, "م"), color: str(r.color, "brand") as Workspace["color"],
    created_at: str(r.created_at, now), updated_at: str(r.updated_at, now), archived_at: strOrNull(r.archived_at),
  }));
  const wsIds = new Set(workspaces.map((w) => w.id));
  const projects = rows<Project>(src.projects, (r) => wsIds.has(r.workspace_id as string) ? ({
    ...base, id: r.id as string, workspace_id: r.workspace_id as string, name: str(r.name, "مشروع بلا اسم"),
    description: strOrNull(r.description), status: str(r.status, "planning") as Project["status"],
    previous_status: typeof r.previous_status === "string" && r.previous_status !== "archived" ? (r.previous_status as Project["previous_status"]) : null,
    icon: str(r.icon, "م"), color: str(r.color, "brand") as Project["color"],
    created_at: str(r.created_at, now), updated_at: str(r.updated_at, now), archived_at: strOrNull(r.archived_at),
  }) : null);
  const prById = new Map(projects.map((p) => [p.id, p]));
  const boards = rows<Board>(src.boards, (r) => {
    const pr = prById.get(r.project_id as string);
    if (!pr) return null; // لوحة يتيمة
    return {
      ...base, id: r.id as string, workspace_id: pr.workspace_id, project_id: pr.id, name: str(r.name, "لوحة بلا اسم"),
      description: strOrNull(r.description), board_type: str(r.board_type, "blank") as Board["board_type"],
      created_at: str(r.created_at, now), updated_at: str(r.updated_at, now), archived_at: strOrNull(r.archived_at),
      is_favorite: r.is_favorite === true, last_opened_at: strOrNull(r.last_opened_at),
    };
  });
  const workspace_members = rows<WorkspaceMember>(src.workspace_members, (r) => wsIds.has(r.workspace_id as string) ? ({
    id: r.id as string, workspace_id: r.workspace_id as string, user_id: str(r.user_id, CURRENT_USER.id),
    role: str(r.role, "owner") as WorkspaceMember["role"], created_at: str(r.created_at, now),
  }) : null);
  return { profile: CURRENT_USER, workspaces, workspace_members, projects, boards };
}

function load(raw: string): Database {
  const parsed: unknown = JSON.parse(raw);
  // النسخة 1 كانت تحفظ قاعدة البيانات مباشرة بدون غلاف.
  let version = 1;
  let data: unknown = parsed;
  if (isObj(parsed) && typeof parsed.schemaVersion === "number" && "data" in parsed) {
    version = parsed.schemaVersion;
    data = parsed.data;
  }
  if (version > SCHEMA_VERSION) throw new Error(`unknown schema version ${version}`);
  let db = normalize(data);
  for (let v = version; v < SCHEMA_VERSION; v++) db = normalize((MIGRATIONS[v] ?? ((d) => d))(db));
  return db;
}

let memory: Database | null = null;

export function readDb(): Database {
  if (typeof window === "undefined") return seed(); // على الخادم: بيانات مؤقتة لا تُحفظ
  if (memory) return memory;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      memory = load(raw);
      persist(memory);
      return memory;
    }
  } catch (error) {
    warnDev("تعذرت قراءة البيانات المحفوظة؛ تم الرجوع إلى بيانات البدء.", error);
    try { window.localStorage.setItem(`${STORAGE_KEY}.corrupt`, window.localStorage.getItem(STORAGE_KEY) ?? ""); } catch { /* ignore */ }
  }
  memory = seed();
  persist(memory);
  return memory;
}

export function writeDb(mutate: (db: Database) => void): Database {
  const db = readDb();
  mutate(db);
  persist(db);
  return db;
}

function persist(db: Database) {
  if (typeof window === "undefined") return;
  try {
    const envelope: StoredEnvelope = { schemaVersion: SCHEMA_VERSION, data: db };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch (error) {
    warnDev("تعذر حفظ البيانات.", error);
  }
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** محاكاة زمن الشبكة حتى تظهر حالات التحميل بشكل واقعي. */
export function delay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
