import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Eye } from "lucide-react";
import { api, type GroupDetail, type GroupSummary, type Paginated } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";

export default function GroupsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [createOpen, setCreateOpen] = useState(false);
  const [groupname, setGroupname] = useState("");

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailGroup, setDetailGroup] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["groups", page],
    queryFn: async () =>
      (await api.get<Paginated<GroupSummary>>("/groups", { params: { page, page_size: pageSize } })).data,
  });

  const detail = useQuery({
    queryKey: ["group", detailGroup],
    enabled: !!detailGroup,
    queryFn: async () => (await api.get<GroupDetail>(`/groups/${detailGroup}`)).data,
  });

  const create = useMutation({
    mutationFn: async (name: string) => (await api.post("/groups", { groupname: name })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups"] }),
  });
  const remove = useMutation({
    mutationFn: async (name: string) => (await api.delete(`/groups/${name}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups"] }),
  });

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupname.trim()) return;
    await create.mutateAsync(groupname.trim());
    setCreateOpen(false);
    setGroupname("");
  };

  const onDelete = async (name: string) => {
    if (!window.confirm(t("groups.delete_confirm", { groupname: name }))) return;
    await remove.mutateAsync(name);
  };

  return (
    <div>
      <PageHeader
        title={t("groups.title")}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> {t("groups.create")}
          </Button>
        }
      />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("groups.members")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
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
              list.data?.items.map((g) => (
                <TableRow key={g.groupname}>
                  <TableCell className="font-medium">{g.groupname}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{g.user_count}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setDetailGroup(g.groupname);
                          setDetailOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => onDelete(g.groupname)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("groups.create")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onCreate} className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t("common.name")}</Label>
              <Input
                value={groupname}
                onChange={(e) => setGroupname(e.target.value)}
                required
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailGroup}</DialogTitle>
          </DialogHeader>
          {detail.isLoading || !detail.data ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <div className="grid gap-6">
              <div>
                <h4 className="text-sm font-semibold mb-2">{t("groups.fields.check_attrs")}</h4>
                <div className="rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("common.attribute")}</TableHead>
                        <TableHead>{t("common.operator")}</TableHead>
                        <TableHead>{t("common.value")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.data.check_attrs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground text-xs">
                            —
                          </TableCell>
                        </TableRow>
                      ) : (
                        detail.data.check_attrs.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="font-mono text-xs">{a.attribute}</TableCell>
                            <TableCell className="font-mono text-xs">{a.op}</TableCell>
                            <TableCell className="font-mono text-xs">{a.value}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">{t("groups.fields.reply_attrs")}</h4>
                <div className="rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("common.attribute")}</TableHead>
                        <TableHead>{t("common.operator")}</TableHead>
                        <TableHead>{t("common.value")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.data.reply_attrs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground text-xs">
                            —
                          </TableCell>
                        </TableRow>
                      ) : (
                        detail.data.reply_attrs.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="font-mono text-xs">{a.attribute}</TableCell>
                            <TableCell className="font-mono text-xs">{a.op}</TableCell>
                            <TableCell className="font-mono text-xs">{a.value}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">{t("groups.members")}</h4>
                <div className="flex flex-wrap gap-1">
                  {detail.data.members.length === 0 ? (
                    <span className="text-xs text-muted-foreground">{t("groups.no_members")}</span>
                  ) : (
                    detail.data.members.map((m) => (
                      <Badge key={m} variant="secondary">
                        {m}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
