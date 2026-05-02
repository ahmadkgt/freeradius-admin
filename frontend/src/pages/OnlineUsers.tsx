import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Wifi } from "lucide-react";
import { api, type OnlineUser } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";

function fmtBytes(n?: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${u[i]}`;
}

function fmtDuration(seconds?: number | null): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function OnlineUsersPage() {
  const { t } = useTranslation();
  const list = useQuery({
    queryKey: ["online-users"],
    queryFn: async () => (await api.get<OnlineUser[]>("/users/online")).data,
    refetchInterval: 5000,
  });

  return (
    <div>
      <PageHeader
        title={t("online_users.title")}
        actions={
          <Button variant="outline" onClick={() => list.refetch()}>
            <RefreshCw className="h-4 w-4" /> {t("common.refresh")}
          </Button>
        }
      />

      <Card>
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Wifi className="h-4 w-4 text-emerald-500" />
            <span>
              {list.data?.length ?? 0} {t("online_users.connected")}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">{t("online_users.auto_refresh")}</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.username")}</TableHead>
              <TableHead>{t("online_users.fields.profile")}</TableHead>
              <TableHead>{t("online_users.fields.framed_ip")}</TableHead>
              <TableHead>{t("online_users.fields.nas_ip")}</TableHead>
              <TableHead>{t("online_users.fields.calling_station")}</TableHead>
              <TableHead>{t("online_users.fields.duration")}</TableHead>
              <TableHead>{t("online_users.fields.input")}</TableHead>
              <TableHead>{t("online_users.fields.output")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : (list.data?.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {t("online_users.empty")}
                </TableCell>
              </TableRow>
            ) : (
              list.data?.map((u) => (
                <TableRow key={`${u.username}-${u.acctstarttime}`}>
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell>
                    {u.profile_name ? (
                      <Badge variant="secondary">{u.profile_name}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {u.framedipaddress ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{u.nasipaddress}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {u.callingstationid ?? "—"}
                  </TableCell>
                  <TableCell>{fmtDuration(u.acctsessiontime)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {fmtBytes(u.acctinputoctets)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {fmtBytes(u.acctoutputoctets)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
