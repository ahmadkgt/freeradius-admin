import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Activity, Cpu, Database, HardDrive, Server, Clock, Users, Package } from "lucide-react";
import { api, type SystemInfo } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

function fmtBytes(n?: number | null): string {
  if (n == null) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${u[i]}`;
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ");
}

function StatCard({
  Icon,
  label,
  value,
  hint,
}: {
  Icon: typeof Activity;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="font-semibold text-lg truncate">{value}</div>
          {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
        </div>
      </div>
    </Card>
  );
}

function ProgressBar({ percent, color }: { percent: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, percent));
  let cls = color ?? "bg-primary";
  if (!color) {
    if (pct >= 90) cls = "bg-rose-500";
    else if (pct >= 70) cls = "bg-amber-500";
    else cls = "bg-emerald-500";
  }
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div className={`h-full ${cls}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function SystemInfoPage() {
  const { t } = useTranslation();
  const info = useQuery({
    queryKey: ["system-info"],
    queryFn: async () => (await api.get<SystemInfo>("/system/info")).data,
    refetchInterval: 10000,
  });

  if (info.isLoading || !info.data) {
    return (
      <div>
        <PageHeader title={t("system_info.title")} />
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }
  const d = info.data;

  return (
    <div>
      <PageHeader title={t("system_info.title")} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-4">
        <StatCard
          Icon={Server}
          label={t("system_info.version")}
          value={d.version}
          hint={d.timezone}
        />
        <StatCard
          Icon={Clock}
          label={t("system_info.uptime")}
          value={fmtUptime(d.uptime_seconds)}
          hint={new Date(d.server_time).toLocaleString()}
        />
        <StatCard
          Icon={Activity}
          label={t("system_info.load_avg")}
          value={d.load_avg.map((x) => x.toFixed(2)).join(" / ")}
          hint="1 / 5 / 15 min"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">{t("system_info.memory")}</h3>
          </div>
          {d.memory_used_percent != null ? (
            <>
              <ProgressBar percent={d.memory_used_percent} />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>
                  {fmtBytes((d.memory_total_bytes ?? 0) - (d.memory_available_bytes ?? 0))}{" "}
                  / {fmtBytes(d.memory_total_bytes)}
                </span>
                <span>{d.memory_used_percent.toFixed(1)}%</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{t("common.no_data")}</p>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">{t("system_info.disk")}</h3>
          </div>
          {d.disk_used_percent != null ? (
            <>
              <ProgressBar percent={d.disk_used_percent} />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>
                  {fmtBytes((d.disk_total_bytes ?? 0) - (d.disk_free_bytes ?? 0))} /{" "}
                  {fmtBytes(d.disk_total_bytes)}
                </span>
                <span>{d.disk_used_percent.toFixed(1)}%</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{t("common.no_data")}</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          Icon={Database}
          label={t("system_info.db_size")}
          value={fmtBytes(d.db_size_bytes)}
          hint={`${d.active_connections} ${t("system_info.connections")}`}
        />
        <StatCard
          Icon={Users}
          label={t("system_info.users")}
          value={d.user_count}
        />
        <StatCard
          Icon={Package}
          label={t("system_info.profiles")}
          value={d.profile_count}
        />
        <StatCard
          Icon={Activity}
          label={t("system_info.cpu")}
          value={d.cpu_percent != null ? `${d.cpu_percent.toFixed(1)}%` : "—"}
        />
      </div>
    </div>
  );
}
