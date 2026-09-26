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

let memory: Database | null = null;

export function readDb(): Database {
  if (memory) return memory;

  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        memory = JSON.parse(raw) as Database;
        return memory;
      }
    } catch {
      /* التخزين غير متاح — نعود إلى بيانات البدء */
    }
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* تجاهل امتلاء التخزين */
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
