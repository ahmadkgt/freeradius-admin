import { useTranslation } from "react-i18next";
import { Wifi, WifiOff, Clock, AlertTriangle, Ban, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserStatus } from "@/lib/api";

const STATUS_STYLES: Record<UserStatus, { className: string; Icon: typeof Wifi }> = {
  active_online: {
    className:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
    Icon: Wifi,
  },
  active_offline: {
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30",
    Icon: WifiOff,
  },
  expiring_soon: {
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30",
    Icon: Clock,
  },
  expired: {
    className: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30",
    Icon: AlertTriangle,
  },
  expired_online: {
    className:
      "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-500/30",
    Icon: AlertCircle,
  },
  disabled: {
    className: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border border-zinc-500/30",
    Icon: Ban,
  },
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const { t } = useTranslation();
  const cfg = STATUS_STYLES[status];
  const Icon = cfg.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        cfg.className,
      )}
    >
      <Icon className="h-3 w-3" />
      {t(`user_status.${status}`)}
    </span>
  );
}
