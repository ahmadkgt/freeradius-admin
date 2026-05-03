import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import {
  api,
  type NotificationLog,
  type Paginated,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Pagination } from "@/components/Pagination";
import { useAuth } from "@/lib/auth";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500",
  sent: "bg-emerald-600",
  failed: "bg-red-600",
};

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canSend = hasPermission("notifications.send");

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const list = useQuery<Paginated<NotificationLog>>({
    queryKey: ["notifications", q, statusFilter, page],
    queryFn: async () =>
      (
        await api.get<Paginated<NotificationLog>>("/notifications", {
          params: {
            q: q || undefined,
            status: statusFilter || undefined,
            page,
            page_size: pageSize,
          },
        })
      ).data,
  });

  const retry = useMutation({
    mutationFn: async (id: number) =>
      (await api.post<NotificationLog>(`/notifications/${id}/retry`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("notifications.title")}
        description={t("notifications.description")}
        actions={
          <Button
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ["notifications"] })}
          >
            <RefreshCw className="h-4 w-4 me-1" />
            {t("whatsapp.refresh")}
          </Button>
        }
      />

      <Card className="p-4 flex flex-wrap gap-2 items-end">
        <div className="grid gap-1 grow min-w-[220px]">
          <div className="relative">
            <Search className="absolute start-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="ps-8"
              placeholder={t("notifications.search_placeholder")}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div className="grid gap-1">
          <select
            className="border rounded-md h-10 px-3 bg-background"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("notifications.all_statuses")}</option>
            <option value="pending">{t("notifications.status.pending")}</option>
            <option value="sent">{t("notifications.status.sent")}</option>
            <option value="failed">{t("notifications.status.failed")}</option>
          </select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("notifications.columns.id")}</TableHead>
              <TableHead>{t("notifications.columns.subscriber")}</TableHead>
              <TableHead>{t("notifications.columns.event")}</TableHead>
              <TableHead>{t("notifications.columns.phone")}</TableHead>
              <TableHead>{t("notifications.columns.body")}</TableHead>
              <TableHead>{t("notifications.columns.status")}</TableHead>
              <TableHead>{t("notifications.columns.sent_at")}</TableHead>
              {canSend && <TableHead className="text-end">{t("notifications.columns.actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data?.items.length ? (
              list.data.items.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="font-mono text-xs">{n.id}</TableCell>
                  <TableCell>{n.subscriber_username || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t(`notifications.event.${n.event}`)}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{n.phone || "—"}</TableCell>
                  <TableCell className="text-xs whitespace-pre-wrap max-w-[320px]">
                    {n.body.slice(0, 160)}
                    {n.body.length > 160 ? "…" : ""}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[n.status] || ""}>
                      {t(`notifications.status.${n.status}`)}
                    </Badge>
                    {n.error && (
                      <div
                        className="text-xs text-red-500 mt-1 max-w-[240px] truncate"
                        title={n.error}
                      >
                        {n.error}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDate(n.sent_at || n.created_at)}
                  </TableCell>
                  {canSend && (
                    <TableCell className="text-end">
                      {(n.status === "failed" || n.status === "pending") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => retry.mutate(n.id)}
                          disabled={retry.isPending}
                        >
                          {t("notifications.retry")}
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={canSend ? 8 : 7}
                  className="text-center text-muted-foreground py-8"
                >
                  {t("notifications.no_messages")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {list.data && list.data.total > pageSize && (
        <Pagination
          page={list.data.page}
          pageSize={list.data.page_size}
          total={list.data.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
