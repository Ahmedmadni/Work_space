import { Link, useParams } from "@tanstack/react-router";
import {
  Archive, Bell, ChevronLeft, Clock, FolderKanban, HelpCircle, Home, LayoutTemplate, Layers, Menu, Moon,
  PanelRightClose, PanelRightOpen, Plus, Search, Settings, Star, Sun,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspace, useWorkspaces } from "@/hooks/use-workspaces";
import { useProject } from "@/hooks/use-projects";
import { CURRENT_USER } from "@/services/local-db";
import { cn } from "@/lib/utils";
import { Glyph } from "./shared";
import { CreateBoardDialog, CreateProjectDialog, CreateWorkspaceDialog } from "./dialogs";

const NAV = [
  { to: "/", label: "الرئيسية", icon: Home },
  { to: "/workspaces", label: "مساحات العمل", icon: Layers },
  { to: "/projects", label: "المشاريع", icon: FolderKanban },
  { to: "/recent", label: "آخر اللوحات", icon: Clock },
  { to: "/templates", label: "القوالب", icon: LayoutTemplate },
  { to: "/favorites", label: "المفضلة", icon: Star },
  { to: "/archive", label: "الأرشيف", icon: Archive },
] as const;
const FOOT = [
  { to: "/help", label: "المساعدة", icon: HelpCircle },
  { to: "/settings", label: "الإعدادات", icon: Settings },
] as const;

function useTheme() {
  // الحالة الأولية يضبطها سكربت الجذر قبل الرسم؛ هنا نقرأها فقط ثم نحفظ التغييرات.
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("projectflow.theme", next ? "dark" : "light"); } catch { /* ignore */ }
    setDark(next);
  };
  return [dark, toggle] as const;
}

function NavItem({ to, label, icon: Icon, collapsed, onNavigate }: { to: string; label: string; icon: typeof Home; collapsed: boolean; onNavigate?: (() => void) | undefined }) {
  const link = (
    <Link to={to} onClick={onNavigate} activeOptions={{ exact: to === "/" }}
      className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground", collapsed && "justify-center px-0")}
      activeProps={{ className: "bg-brand/10 !text-brand font-semibold" }}>
      <Icon className="h-4 w-4 shrink-0" />{!collapsed && label}
    </Link>
  );
  if (!collapsed) return link;
  return <Tooltip><TooltipTrigger asChild>{link}</TooltipTrigger><TooltipContent side="left">{label}</TooltipContent></Tooltip>;
}

function SidebarBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: (() => void) | undefined }) {
  const { data: workspaces } = useWorkspaces();
  return (
    <div className="flex h-full flex-col p-3">
      <Link to="/" onClick={onNavigate} className={cn("mb-6 flex items-center gap-2 px-2 pt-1", collapsed && "justify-center px-0")}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-lg font-bold text-primary-foreground">ب</span>
        {!collapsed && <span className="text-lg font-bold text-foreground">ProjectFlow</span>}
      </Link>
      <nav className="space-y-1">{NAV.map((n) => <NavItem key={n.to} {...n} collapsed={collapsed} onNavigate={onNavigate} />)}</nav>
      {!collapsed && (
        <>
          <p className="mt-8 px-3 text-xs font-semibold text-muted-foreground">مساحاتك</p>
          <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
            {workspaces?.map((w) => (
              <Link key={w.id} to="/workspace/$workspaceId" params={{ workspaceId: w.id }} onClick={onNavigate}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-foreground hover:bg-muted" activeProps={{ className: "bg-muted" }}>
                <Glyph icon={w.icon} color={w.color} size="sm" /><span className="truncate">{w.name}</span>
              </Link>
            ))}
          </div>
        </>
      )}
      {collapsed && <div className="flex-1" />}
      <div className="mt-4 space-y-1 border-t border-border pt-3">
        {FOOT.map((n) => <NavItem key={n.to} {...n} collapsed={collapsed} onNavigate={onNavigate} />)}
        <div className={cn("mt-2 flex items-center gap-3 rounded-xl p-2", collapsed && "justify-center")}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold">{CURRENT_USER.initials}</span>
          {!collapsed && <div className="min-w-0"><p className="truncate text-sm font-medium">{CURRENT_USER.full_name}</p><p className="truncate text-xs text-muted-foreground">{CURRENT_USER.email}</p></div>}
        </div>
      </div>
    </div>
  );
}

function Breadcrumbs() {
  const params = useParams({ strict: false }) as { workspaceId?: string; projectId?: string };
  const ws = useWorkspace(params.workspaceId ?? "");
  const pr = useProject(params.projectId ?? "");
  const sep = <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  return (
    <nav aria-label="مسار التنقل" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
      <Link to="/" className="text-muted-foreground hover:text-foreground">الرئيسية</Link>
      {params.workspaceId && ws.data && (<>{sep}<Link to="/workspace/$workspaceId" params={{ workspaceId: ws.data.id }} className="truncate text-muted-foreground hover:text-foreground">{ws.data.name}</Link></>)}
      {params.projectId && pr.data && (<>{sep}<Link to="/workspace/$workspaceId/project/$projectId" params={{ workspaceId: pr.data.workspace_id, projectId: pr.data.id }} className="truncate text-foreground">{pr.data.name}</Link></>)}
    </nav>
  );
}

function QuickCreate() {
  const params = useParams({ strict: false }) as { workspaceId?: string; projectId?: string };
  const [dlg, setDlg] = useState<null | "ws" | "pr" | "bd">(null);
  return (
    <>
      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild><Button size="sm" aria-label="إنشاء سريع"><Plus className="h-4 w-4" /><span className="hidden sm:inline">إنشاء</span></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>إنشاء جديد</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setDlg("ws")}>مساحة عمل</DropdownMenuItem>
          {params.workspaceId && <DropdownMenuItem onSelect={() => setDlg("pr")}>مشروع في هذه المساحة</DropdownMenuItem>}
          {params.workspaceId && params.projectId && <DropdownMenuItem onSelect={() => setDlg("bd")}>لوحة في هذا المشروع</DropdownMenuItem>}
          {!params.workspaceId && <><DropdownMenuSeparator /><p className="px-2 py-1.5 text-xs text-muted-foreground">افتح مساحة لإنشاء مشروع أو لوحة.</p></>}
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceDialog open={dlg === "ws"} onOpenChange={(o) => setDlg(o ? "ws" : null)} />
      {params.workspaceId && <CreateProjectDialog workspaceId={params.workspaceId} open={dlg === "pr"} onOpenChange={(o) => setDlg(o ? "pr" : null)} />}
      {params.workspaceId && params.projectId && <CreateBoardDialog workspaceId={params.workspaceId} projectId={params.projectId} open={dlg === "bd"} onOpenChange={(o) => setDlg(o ? "bd" : null)} />}
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [dark, toggleDark] = useTheme();
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen w-full bg-background">
        <aside className={cn("sticky top-0 hidden h-screen shrink-0 border-e border-border bg-sidebar transition-[width] md:block", collapsed ? "w-[68px]" : "w-64")}>
          <SidebarBody collapsed={collapsed} />
        </aside>
        <Sheet open={mobile} onOpenChange={setMobile}>
          <SheetContent side="right" className="w-72 bg-sidebar p-0">
            <SheetTitle className="sr-only">القائمة</SheetTitle>
            <SidebarBody collapsed={false} onNavigate={() => setMobile(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="frost hairline-b sticky top-0 z-20 flex h-16 items-center gap-3 px-4 sm:px-6">
            <button className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted md:hidden" aria-label="فتح القائمة" onClick={() => setMobile(true)}><Menu className="h-5 w-5" /></button>
            <button className="hidden h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted md:grid" aria-label={collapsed ? "توسيع الشريط" : "طي الشريط"} onClick={() => setCollapsed((c) => !c)}>
              {collapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
            </button>
            <Breadcrumbs />
            <div className="ms-auto flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="relative hidden lg:block">
                    <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input disabled placeholder="البحث الشامل — قريبًا" className="h-9 w-56 cursor-not-allowed rounded-xl border border-border bg-background/60 ps-9 pe-3 text-sm opacity-70" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>البحث الشامل سيتوفر لاحقًا؛ استخدم البحث داخل كل صفحة.</TooltipContent>
              </Tooltip>
              <QuickCreate />
              <Tooltip><TooltipTrigger asChild><button disabled aria-label="الإشعارات" className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground opacity-50"><Bell className="h-4 w-4" /></button></TooltipTrigger><TooltipContent>الإشعارات قريبًا</TooltipContent></Tooltip>
              <button onClick={toggleDark} aria-label="تبديل الوضع الليلي" className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
              <DropdownMenu dir="rtl">
                <DropdownMenuTrigger asChild><button aria-label="حسابي" className="grid h-9 w-9 place-items-center rounded-full bg-muted text-xs font-bold">{CURRENT_USER.initials}</button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel><p>{CURRENT_USER.full_name}</p><p className="text-xs font-normal text-muted-foreground">{CURRENT_USER.email}</p></DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><Link to="/settings">الإعدادات</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild><Link to="/help">المساعدة</Link></DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
