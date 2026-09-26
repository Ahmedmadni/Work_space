import { Link } from "@tanstack/react-router";
import { Archive, Home, LayoutTemplate, Layers, Search, Star, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { CURRENT_USER } from "@/services/local-db";
import { Glyph } from "./shared";
import { CreateWorkspaceDialog } from "./dialogs";

const NAV = [
  { to: "/", label: "الرئيسية", icon: Home },
  { to: "/workspaces", label: "مساحات العمل", icon: Layers },
  { to: "/favorites", label: "المفضلة", icon: Star },
  { to: "/templates", label: "القوالب", icon: LayoutTemplate },
  { to: "/archive", label: "الأرشيف", icon: Archive },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { data: workspaces } = useWorkspaces();
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e border-border bg-sidebar p-4 md:flex">
        <Link to="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-lg font-bold text-primary-foreground">ب</span>
          <span className="text-lg font-bold text-foreground">ProjectFlow</span>
        </Link>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
              activeProps={{ className: "bg-brand/10 !text-brand font-semibold" }}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-8 flex items-center justify-between px-3">
          <p className="text-xs font-semibold text-muted-foreground">مساحاتك</p>
          <CreateWorkspaceDialog trigger={<button aria-label="مساحة جديدة" className="text-muted-foreground hover:text-brand"><Plus className="h-4 w-4" /></button>} />
        </div>
        <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
          {workspaces?.map((w) => (
            <Link key={w.id} to="/workspace/$workspaceId" params={{ workspaceId: w.id }}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-foreground hover:bg-muted"
              activeProps={{ className: "bg-muted" }}>
              <Glyph icon={w.icon} color={w.color} size="sm" />
              <span className="truncate">{w.name}</span>
            </Link>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-border p-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-sm font-bold">{CURRENT_USER.initials}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{CURRENT_USER.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{CURRENT_USER.email}</p>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="frost hairline-b sticky top-0 z-20 flex h-16 items-center gap-4 px-6">
          <div className="relative max-w-md flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input placeholder="ابحث في المشاريع واللوحات…" className="h-10 w-full rounded-xl border border-border bg-background/70 ps-9 pe-3 text-sm outline-none focus:border-brand" />
          </div>
          <div className="ms-auto">
            <Button asChild size="sm"><Link to="/templates"><Plus className="h-4 w-4" />لوحة من قالب</Link></Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
