import { createFileRoute } from "@tanstack/react-router";
import { Moon } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/shared";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [
    { title: "تفضيلاتي — ProjectFlow" },
    { name: "description", content: "تفضيلات التخطيط الشخصي والمظهر." },
    { property: "og:title", content: "تفضيلاتي — ProjectFlow" },
    { property: "og:description", content: "تفضيلات التخطيط الشخصي والمظهر." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: SettingsPage,
});
function SettingsPage() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  return <>
    <PageHeader title="تفضيلاتي" />
    <div className="flex max-w-lg items-center justify-between border-y border-border py-5">
      <label htmlFor="dark-mode" className="flex items-center gap-3"><Moon className="size-5 text-muted-foreground" /> الوضع الليلي</label>
      <Switch id="dark-mode" checked={dark} onCheckedChange={(next) => {
        document.documentElement.classList.toggle("dark", next);
        try { localStorage.setItem("projectflow.theme", next ? "dark" : "light"); } catch { /* Theme still works without storage. */ }
        setDark(next);
      }} />
    </div>
  </>;
}
