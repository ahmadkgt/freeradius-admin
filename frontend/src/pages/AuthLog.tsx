import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api, type Paginated, type PostAuthRow } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
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
import { formatDate } from "@/lib/utils";

export default function AuthLogPage() {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState("");
  const [reply, setReply] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const list = useQuery({
    queryKey: ["postauth", q, reply, page],
    queryFn: async () =>
      (
        await api.get<Paginated<PostAuthRow>>("/accounting/postauth", {
          params: { q: q || undefined, reply: reply || undefined, page, page_size: pageSize },
        })
      ).data,
  });

  return (
    <div>
      <PageHeader title={t("auth_log.title")} />
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
          <Select
            value={reply}
            onChange={(e) => {
              setReply(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          >
            <option value="">{t("auth_log.filter_all")}</option>
            <option value="Access-Accept">{t("auth_log.filter_accept")}</option>
            <option value="Access-Reject">{t("auth_log.filter_reject")}</option>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("auth_log.fields.username")}</TableHead>
              <TableHead>{t("auth_log.fields.reply")}</TableHead>
              <TableHead>{t("auth_log.fields.date")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : list.data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  {t("common.no_data")}
                </TableCell>
              </TableRow>
            ) : (
              list.data?.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.username}</TableCell>
                  <TableCell>
                    <Badge variant={r.reply === "Access-Accept" ? "success" : "destructive"}>
                      {r.reply}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(r.authdate, i18n.language)}</TableCell>
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
