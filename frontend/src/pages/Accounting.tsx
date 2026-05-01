import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api, type AccountingRow, type Paginated } from "@/lib/api";
import { Card } from "@/components/ui/card";
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
import { formatBytes, formatDate, formatDuration } from "@/lib/utils";

export default function AccountingPage() {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const list = useQuery({
    queryKey: ["accounting", q, activeOnly, page],
    queryFn: async () =>
      (
        await api.get<Paginated<AccountingRow>>("/accounting/sessions", {
          params: { q: q || undefined, active_only: activeOnly, page, page_size: pageSize },
        })
      ).data,
  });

  return (
    <div>
      <PageHeader title={t("accounting.title")} />
      <Card>
        <div className="p-4 border-b flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder={t("common.search")}
              className="ps-9"
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => {
                setActiveOnly(e.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-input"
            />
            {t("accounting.active_only")}
          </label>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("accounting.fields.username")}</TableHead>
              <TableHead>{t("accounting.fields.nas_ip")}</TableHead>
              <TableHead>{t("accounting.fields.framed_ip")}</TableHead>
              <TableHead>{t("accounting.fields.start")}</TableHead>
              <TableHead>{t("accounting.fields.duration")}</TableHead>
              <TableHead>{t("accounting.fields.input")}</TableHead>
              <TableHead>{t("accounting.fields.output")}</TableHead>
              <TableHead>{t("accounting.fields.cause")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : list.data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {t("common.no_data")}
                </TableCell>
              </TableRow>
            ) : (
              list.data?.items.map((s) => (
                <TableRow key={s.radacctid}>
                  <TableCell className="font-medium">{s.username}</TableCell>
                  <TableCell className="font-mono text-xs">{s.nasipaddress}</TableCell>
                  <TableCell className="font-mono text-xs">{s.framedipaddress ?? "—"}</TableCell>
                  <TableCell className="text-xs">{formatDate(s.acctstarttime, i18n.language)}</TableCell>
                  <TableCell className="text-xs">
                    {s.acctstoptime ? (
                      formatDuration(s.acctsessiontime)
                    ) : (
                      <Badge variant="success">{t("accounting.fields.active")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatBytes(s.acctinputoctets ?? 0, i18n.language)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatBytes(s.acctoutputoctets ?? 0, i18n.language)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {s.acctterminatecause || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {list.data && (
          <Pagination
            page={list.data.page}
            pageSize={list.data.page_size}
            total={list.data.total}
            onPageChange={setPage}
          />
        )}
      </Card>
    </div>
  );
}
