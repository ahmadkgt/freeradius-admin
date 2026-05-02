import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Users,
  UsersRound,
  Server,
  Activity,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  TrendingUp,
  Wifi,
  WifiOff,
  Clock,
  AlertTriangle,
  AlertCircle,
  Ban,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { api, type DashboardStats, type TimeSeriesPoint, type TopUser } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { formatBytes } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  Icon: typeof Users;
  hint?: string;
}

function StatCard({ label, value, Icon, hint }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold mt-1">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const stats = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: async () => (await api.get<DashboardStats>("/dashboard/stats")).data,
  });
  const series = useQuery({
    queryKey: ["dashboard", "timeseries"],
    queryFn: async () =>
      (await api.get<TimeSeriesPoint[]>("/dashboard/auth-timeseries", { params: { days: 7 } })).data,
  });
  const top = useQuery({
    queryKey: ["dashboard", "top"],
    queryFn: async () =>
      (await api.get<TopUser[]>("/dashboard/top-users", { params: { limit: 5 } })).data,
  });

  const traffic =
    (stats.data?.total_input_bytes ?? 0) + (stats.data?.total_output_bytes ?? 0);

  return (
    <div>
      <PageHeader title={t("dashboard.title")} description={t("app.subtitle")} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={t("dashboard.stats.total_users")}
          value={stats.data?.total_users ?? "—"}
          Icon={Users}
        />
        <StatCard
          label={t("dashboard.stats.total_groups")}
          value={stats.data?.total_groups ?? "—"}
          Icon={UsersRound}
        />
        <StatCard
          label={t("dashboard.stats.total_nas")}
          value={stats.data?.total_nas ?? "—"}
          Icon={Server}
        />
        <StatCard
          label={t("dashboard.stats.active_sessions")}
          value={stats.data?.active_sessions ?? "—"}
          Icon={Activity}
        />
        <StatCard
          label={t("dashboard.stats.auth_accepts_today")}
          value={stats.data?.auth_accepts_today ?? "—"}
          Icon={CheckCircle2}
        />
        <StatCard
          label={t("dashboard.stats.auth_rejects_today")}
          value={stats.data?.auth_rejects_today ?? "—"}
          Icon={XCircle}
        />
        <StatCard
          label={t("dashboard.stats.sessions_today")}
          value={stats.data?.sessions_today ?? "—"}
          Icon={ArrowUpRight}
        />
        <StatCard
          label={t("dashboard.stats.total_traffic")}
          value={formatBytes(traffic, i18n.language)}
          Icon={TrendingUp}
        />
      </div>

      <h3 className="text-sm font-semibold text-muted-foreground mt-6 mb-3">
        {t("dashboard.lifecycle")}
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label={t("user_status.active_online")}
          value={stats.data?.online_users ?? "—"}
          Icon={Wifi}
        />
        <StatCard
          label={t("user_status.active_offline")}
          value={
            stats.data
              ? Math.max(0, stats.data.active_users - stats.data.online_users)
              : "—"
          }
          Icon={WifiOff}
        />
        <StatCard
          label={t("user_status.expiring_soon")}
          value={stats.data?.expiring_soon ?? "—"}
          hint={`${t("dashboard.stats.expiring_today")}: ${stats.data?.expiring_today ?? "—"}`}
          Icon={Clock}
        />
        <StatCard
          label={t("user_status.expired")}
          value={stats.data?.expired_users ?? "—"}
          Icon={AlertTriangle}
        />
        <StatCard
          label={t("user_status.expired_online")}
          value={stats.data?.expired_online_users ?? "—"}
          Icon={AlertCircle}
        />
        <StatCard
          label={t("user_status.disabled")}
          value={stats.data?.disabled_users ?? "—"}
          Icon={Ban}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("dashboard.auth_chart")}</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {series.data && series.data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series.data}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.5rem",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="accepts" fill="#10b981" name={t("dashboard.chart.accepts")} />
                  <Bar dataKey="rejects" fill="#ef4444" name={t("dashboard.chart.rejects")} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                {t("dashboard.no_data")}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.top_users")}</CardTitle>
          </CardHeader>
          <CardContent>
            {top.data && top.data.length > 0 ? (
              <ul className="space-y-3">
                {top.data.map((u) => (
                  <li key={u.username} className="flex items-center justify-between text-sm">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{u.username}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.sessions} {t("dashboard.sessions")}
                      </p>
                    </div>
                    <span className="text-xs font-mono">{formatBytes(u.total_bytes, i18n.language)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("dashboard.no_data")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
