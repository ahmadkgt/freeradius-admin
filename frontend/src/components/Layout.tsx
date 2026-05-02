import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
  X,
  LogOut,
  UserCircle,
  Wifi,
  Package,
  Cpu,
  Network,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Permission } from "@/lib/api";

interface NavItem {
  to: string;
  labelKey: string;
  Icon: typeof LayoutDashboard;
  end?: boolean;
  perm?: Permission;
}

const navItems: NavItem[] = [
  { to: "/", labelKey: "nav.dashboard", Icon: LayoutDashboard, end: true },
  { to: "/users", labelKey: "nav.users", Icon: UsersIcon, perm: "users.view" },
  { to: "/online-users", labelKey: "nav.online_users", Icon: Wifi, perm: "users.view" },
  { to: "/profiles", labelKey: "nav.profiles", Icon: Package, perm: "profiles.view" },
  { to: "/managers", labelKey: "nav.managers", Icon: Network, perm: "managers.view" },
  { to: "/groups", labelKey: "nav.groups", Icon: UsersRound },
  { to: "/nas", labelKey: "nav.nas", Icon: Server },
  { to: "/accounting", labelKey: "nav.accounting", Icon: Activity },
  { to: "/auth-log", labelKey: "nav.auth_log", Icon: KeyRound },
  { to: "/system", labelKey: "nav.system", Icon: Cpu },
];

export default function Layout() {
  const { t, i18n } = useTranslation();
  const { user, logout, hasPermission } = useAuth();
  const visibleNav = navItems.filter((item) => !item.perm || hasPermission(item.perm));
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [pwOpen, setPwOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = mobileOpen ? "hidden" : prev;
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const toggleLang = () => {
    void i18n.changeLanguage(i18n.language?.startsWith("ar") ? "en" : "ar");
  };

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const onLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {mobileOpen && (
        <button
          type="button"
          aria-label={t("common.close")}
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={cn(
          "border-e bg-card flex flex-col transition-transform duration-200",
          "fixed inset-y-0 start-0 z-50 w-64 md:static md:z-auto md:translate-x-0",
          collapsed ? "md:w-16" : "md:w-64",
          mobileOpen
            ? "translate-x-0"
            : "-translate-x-full rtl:translate-x-full md:translate-x-0",
        )}
      >
        <div className="h-16 flex items-center px-4 gap-3 border-b md:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(false)}
            aria-label={t("common.close")}
            className="ms-auto"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="h-16 hidden md:flex items-center px-4 gap-3 border-b">
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
          {visibleNav.map(({ to, labelKey, Icon, end }) => (
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
        <div className="p-2 border-t hidden md:block">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed((c) => !c)}
            className="w-full justify-start"
            aria-label={t("common.menu")}
          >
            <Menu className="h-4 w-4" />
            {!collapsed && <span className="ms-1">{t("common.menu")}</span>}
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-card/80 backdrop-blur sticky top-0 z-30 flex items-center px-4 md:px-6 gap-3 justify-between">
          <div className="flex items-center gap-2 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileOpen(true)}
              aria-label={t("common.menu")}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">
              R
            </div>
            <span className="font-semibold truncate">{t("app.title")}</span>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <UserCircle className="h-4 w-4" />
                  <span className="hidden sm:inline max-w-[12rem] truncate">
                    {user?.username ?? ""}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="truncate">{user?.username}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setPwOpen(true)}>
                  <KeyRound className="h-4 w-4 me-2" />
                  {t("auth.change_password")}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onLogout}>
                  <LogOut className="h-4 w-4 me-2" />
                  {t("auth.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  );
}
