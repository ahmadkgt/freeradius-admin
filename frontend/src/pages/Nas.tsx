import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { api, type NasRow, type Paginated } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const blankForm = {
  nasname: "",
  shortname: "",
  type: "other",
  ports: "",
  secret: "",
  server: "",
  community: "",
  description: "",
};

export default function NasPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...blankForm });

  const list = useQuery({
    queryKey: ["nas", page],
    queryFn: async () =>
      (await api.get<Paginated<NasRow>>("/nas", { params: { page, page_size: pageSize } })).data,
  });

  const create = useMutation({
    mutationFn: async (payload: Partial<NasRow>) => (await api.post("/nas", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nas"] }),
  });
  const update = useMutation({
    mutationFn: async ({ id, ...payload }: Partial<NasRow> & { id: number }) =>
      (await api.patch(`/nas/${id}`, payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nas"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/nas/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nas"] }),
  });

  const openCreate = () => {
    setEditId(null);
    setForm({ ...blankForm });
    setOpen(true);
  };
  const openEdit = (n: NasRow) => {
    setEditId(n.id);
    setForm({
      nasname: n.nasname ?? "",
      shortname: n.shortname ?? "",
      type: n.type ?? "other",
      ports: n.ports?.toString() ?? "",
      secret: n.secret ?? "",
      server: n.server ?? "",
      community: n.community ?? "",
      description: n.description ?? "",
    });
    setOpen(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      nasname: form.nasname,
      shortname: form.shortname || null,
      type: form.type || null,
      ports: form.ports ? parseInt(form.ports, 10) : null,
      secret: form.secret || null,
      server: form.server || null,
      community: form.community || null,
      description: form.description || null,
    };
    if (editId) await update.mutateAsync({ id: editId, ...payload });
    else await create.mutateAsync(payload);
    setOpen(false);
  };

  const onDelete = async (n: NasRow) => {
    if (!window.confirm(t("nas.delete_confirm", { nasname: n.nasname }))) return;
    await remove.mutateAsync(n.id);
  };

  return (
    <div>
      <PageHeader
        title={t("nas.title")}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> {t("nas.create")}
          </Button>
        }
      />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("nas.fields.nasname")}</TableHead>
              <TableHead>{t("nas.fields.shortname")}</TableHead>
              <TableHead>{t("nas.fields.type")}</TableHead>
              <TableHead>{t("nas.fields.secret")}</TableHead>
              <TableHead>{t("nas.fields.description")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : list.data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t("common.no_data")}
                </TableCell>
              </TableRow>
            ) : (
              list.data?.items.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="font-mono text-xs">{n.nasname}</TableCell>
                  <TableCell>{n.shortname ?? "—"}</TableCell>
                  <TableCell>{n.type ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {n.secret ? "•".repeat(Math.min(n.secret.length, 12)) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{n.description ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(n)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => onDelete(n)}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? t("nas.edit") : t("nas.create")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label>{t("nas.fields.nasname")}</Label>
              <Input
                value={form.nasname}
                onChange={(e) => setForm({ ...form, nasname: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("nas.fields.shortname")}</Label>
              <Input
                value={form.shortname}
                onChange={(e) => setForm({ ...form, shortname: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("nas.fields.type")}</Label>
              <Input
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("nas.fields.ports")}</Label>
              <Input
                value={form.ports}
                onChange={(e) => setForm({ ...form, ports: e.target.value })}
                type="number"
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("nas.fields.secret")}</Label>
              <Input
                value={form.secret}
                onChange={(e) => setForm({ ...form, secret: e.target.value })}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>{t("nas.fields.description")}</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
