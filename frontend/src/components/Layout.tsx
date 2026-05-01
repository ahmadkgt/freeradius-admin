import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Users as UsersIcon,
  UsersRound,
  Server,
  Activity,
  KeyRound,
  Languages,
  Sun,
  Moon,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", labelKey: "nav.dashboard", Icon: LayoutDashboard, end: true },
  { to: "/users", labelKey: "nav.users", Icon: UsersIcon },
  { to: "/groups", labelKey: "nav.groups", Icon: UsersRound },
  { to: "/nas", labelKey: "nav.nas", Icon: Server },
  { to: "/accounting", labelKey: "nav.accounting", Icon: Activity },
  { to: "/auth-log", labelKey: "nav.auth_log", Icon: KeyRound },
];

export default function Layout() {
  const { t, i18n } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  const toggleLang = () => {
    void i18n.changeLanguage(i18n.language?.startsWith("ar") ? "en" : "ar");
  };

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside
        className={cn(
          "border-e bg-card transition-all duration-200 hidden md:flex flex-col",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className="h-16 flex items-center px-4 gap-3 border-b">
          <div className="h-9 w-9 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold shrink-0">
            R
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight overflow-hidden">
              <span className="font-semibold text-sm truncate">{t("app.title")}</span>
              <span className="text-xs text-muted-foreground truncate">{t("app.subtitle")}</span>
            </div>
          )}
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map(({ to, labelKey, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{t(labelKey)}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="p-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed((c) => !c)}
            className="w-full justify-start"
          >
            <Menu className="h-4 w-4" />
            {!collapsed && <span className="ms-1">Toggle</span>}
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-card/80 backdrop-blur sticky top-0 z-40 flex items-center px-4 md:px-6 gap-3 justify-between">
          <div className="flex items-center gap-3 md:hidden">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">
              R
            </div>
            <span className="font-semibold">{t("app.title")}</span>
          </div>
          <div className="flex items-center gap-2 ms-auto">
            <Button variant="ghost" size="sm" onClick={toggleLang} title={t("common.language")}>
              <Languages className="h-4 w-4" />
              <span className="hidden sm:inline">
                {i18n.language?.startsWith("ar") ? "EN" : "AR"}
              </span>
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleTheme} title={t("common.theme")}>
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
