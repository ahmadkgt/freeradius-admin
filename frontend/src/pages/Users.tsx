import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, Eye } from "lucide-react";
import { api, type Paginated, type UserDetail, type UserSummary } from "@/lib/api";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";

interface UserFormState {
  username: string;
  password: string;
  groups: string;
  framed_ip: string;
}

const emptyForm: UserFormState = { username: "", password: "", groups: "", framed_ip: "" };

export default function UsersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["users", q, page],
    queryFn: async () =>
      (await api.get<Paginated<UserSummary>>("/users", { params: { q: q || undefined, page, page_size: pageSize } }))
        .data,
  });

  const detail = useQuery({
    queryKey: ["user", detailUser],
    enabled: !!detailUser,
    queryFn: async () => (await api.get<UserDetail>(`/users/${detailUser}`)).data,
  });

  const create = useMutation({
    mutationFn: async (payload: { username: string; password: string; groups: string[]; framed_ip?: string }) =>
      (await api.post("/users", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
  const update = useMutation({
    mutationFn: async ({
      username,
      ...payload
    }: {
      username: string;
      password?: string;
      groups?: string[];
      framed_ip?: string;
    }) => (await api.patch(`/users/${username}`, payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
  const remove = useMutation({
    mutationFn: async (username: string) => (await api.delete(`/users/${username}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setEditOpen(true);
  };
  const openEdit = (u: UserSummary) => {
    setEditTarget(u.username);
    setForm({
      username: u.username,
      password: u.password ?? "",
      groups: u.groups.join(", "),
      framed_ip: u.framed_ip ?? "",
    });
    setEditOpen(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const groups = form.groups
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
    if (editTarget) {
      await update.mutateAsync({
        username: editTarget,
        password: form.password || undefined,
        groups,
        framed_ip: form.framed_ip,
      });
    } else {
      await create.mutateAsync({
        username: form.username,
        password: form.password,
        groups,
        framed_ip: form.framed_ip || undefined,
      });
    }
    setEditOpen(false);
  };

  const onDelete = async (username: string) => {
    if (!window.confirm(t("users.delete_confirm", { username }))) return;
    await remove.mutateAsync(username);
  };

  return (
    <div>
      <PageHeader
        title={t("users.title")}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> {t("users.create")}
          </Button>
        }
      />

      <Card>
        <div className="p-4 border-b">
          <div className="relative max-w-sm">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder={t("users.search_placeholder")}
              className="ps-9"
            />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.username")}</TableHead>
              <TableHead>{t("common.password")}</TableHead>
              <TableHead>{t("common.groups")}</TableHead>
              <TableHead>{t("common.framed_ip")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : list.data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {t("common.no_data")}
                </TableCell>
              </TableRow>
            ) : (
              list.data?.items.map((u) => (
                <TableRow key={u.username}>
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {u.password ? "•".repeat(Math.min(u.password.length, 10)) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.groups.length === 0 && <span className="text-muted-foreground">—</span>}
                      {u.groups.map((g) => (
                        <Badge key={g} variant="secondary">
                          {g}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{u.framed_ip ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setDetailUser(u.username);
                          setDetailOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(u.username)}
                        className="text-destructive"
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? t("users.edit") : t("users.create")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t("common.username")}</Label>
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
                disabled={!!editTarget}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("common.password")}</Label>
              <Input
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editTarget}
                placeholder={editTarget ? "•••••• (leave empty to keep)" : ""}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("common.groups")}</Label>
              <Input
                value={form.groups}
                onChange={(e) => setForm({ ...form, groups: e.target.value })}
                placeholder={t("users.groups_placeholder")}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("common.framed_ip")}</Label>
              <Input
                value={form.framed_ip}
                onChange={(e) => setForm({ ...form, framed_ip: e.target.value })}
                placeholder="10.0.0.1"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailUser}</DialogTitle>
            <DialogDescription>{t("common.details")}</DialogDescription>
          </DialogHeader>
          {detail.isLoading || !detail.data ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <div className="grid gap-6">
              <div>
                <h4 className="text-sm font-semibold mb-2">{t("users.fields.check_attrs")}</h4>
                {detail.data.check_attrs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("users.fields.no_attrs")}</p>
                ) : (
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
                        {detail.data.check_attrs.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="font-mono text-xs">{a.attribute}</TableCell>
                            <TableCell className="font-mono text-xs">{a.op}</TableCell>
                            <TableCell className="font-mono text-xs">{a.value}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">{t("users.fields.reply_attrs")}</h4>
                {detail.data.reply_attrs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("users.fields.no_attrs")}</p>
                ) : (
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
                        {detail.data.reply_attrs.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="font-mono text-xs">{a.attribute}</TableCell>
                            <TableCell className="font-mono text-xs">{a.op}</TableCell>
                            <TableCell className="font-mono text-xs">{a.value}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">{t("common.groups")}</h4>
                <div className="flex flex-wrap gap-1">
                  {detail.data.groups.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    detail.data.groups.map((g) => (
                      <Badge key={g} variant="secondary">
                        {g}
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
