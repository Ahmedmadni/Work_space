import type { AccentColor, BoardType, ProjectStatus, Template } from "@/types";

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: "تخطيط",
  active: "نشط",
  on_hold: "متوقف مؤقتًا",
  completed: "مكتمل",
  archived: "مؤرشف",
};

export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "archived",
];

export const BOARD_TYPE_LABELS: Record<BoardType, string> = {
  blank: "لوحة فارغة",
  mind_map: "خريطة ذهنية",
  project_plan: "خطة مشروع",
  flowchart: "مخطط انسيابي",
  brainstorm: "عصف ذهني",
  roadmap: "خارطة طريق",
  system_architecture: "معمارية نظام",
};

export const BOARD_TYPE_ORDER: BoardType[] = [
  "blank",
  "mind_map",
  "project_plan",
  "flowchart",
  "brainstorm",
  "roadmap",
  "system_architecture",
];

export const ACCENT_COLORS: { value: AccentColor; label: string }[] = [
  { value: "brand", label: "فيروزي" },
  { value: "amber", label: "عنبري" },
  { value: "sky", label: "سماوي" },
  { value: "rose", label: "وردي" },
  { value: "violet", label: "بنفسجي" },
  { value: "lime", label: "ليموني" },
];

/** أنماط السطح واللون لكل لون مميّز — تُقرأ من نظام التصميم فقط. */
export const ACCENT_CHIP_CLASS: Record<AccentColor, string> = {
  brand: "bg-brand/12 text-brand",
  amber: "bg-warning/15 text-warning",
  sky: "bg-info/15 text-info",
  rose: "bg-danger/12 text-danger",
  violet: "bg-[oklch(0.62_0.19_300_/_0.15)] text-[oklch(0.55_0.19_300)]",
  lime: "bg-success/15 text-success",
};

export const ACCENT_SWATCH_CLASS: Record<AccentColor, string> = {
  brand: "bg-brand",
  amber: "bg-warning",
  sky: "bg-info",
  rose: "bg-danger",
  violet: "bg-[oklch(0.55_0.19_300)]",
  lime: "bg-success",
};

export const ICON_CHOICES = ["د", "ت", "س", "م", "خ", "ب", "ع", "ن", "ل", "ر"];

export const TEMPLATES: Template[] = [
  {
    id: "tpl-blank",
    name: "لوحة فارغة",
    description: "ابدأ من مساحة بيضاء بلا قيود.",
    board_type: "blank",
    color: "brand",
  },
  {
    id: "tpl-mind",
    name: "خريطة ذهنية",
    description: "فرّع الأفكار من فكرة مركزية واحدة.",
    board_type: "mind_map",
    color: "sky",
  },
  {
    id: "tpl-plan",
    name: "تخطيط مشروع",
    description: "مراحل وتسليمات ومسؤوليات واضحة.",
    board_type: "project_plan",
    color: "brand",
  },
  {
    id: "tpl-dev",
    name: "تطوير برمجيات",
    description: "من المتطلبات إلى الإصدار خطوة بخطوة.",
    board_type: "flowchart",
    color: "violet",
  },
  {
    id: "tpl-roadmap",
    name: "خارطة طريق المنتج",
    description: "أفقك الزمني للأرباع القادمة.",
    board_type: "roadmap",
    color: "amber",
  },
  {
    id: "tpl-website",
    name: "تخطيط موقع",
    description: "هيكل الصفحات ومسارات المستخدم.",
    board_type: "flowchart",
    color: "lime",
  },
  {
    id: "tpl-business",
    name: "خطة عمل",
    description: "السوق والقيمة والنموذج المالي.",
    board_type: "project_plan",
    color: "rose",
  },
  {
    id: "tpl-arch",
    name: "معمارية نظام",
    description: "الخدمات والعلاقات والاعتماديات.",
    board_type: "system_architecture",
    color: "sky",
  },
  {
    id: "tpl-brainstorm",
    name: "عصف ذهني",
    description: "اجمع كل الأفكار أولًا، ثم رتّبها.",
    board_type: "brainstorm",
    color: "amber",
  },
];
