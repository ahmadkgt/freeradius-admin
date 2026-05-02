import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { api, type Paginated, type Profile, type DurationUnit, type ProfileType } from "@/lib/api";
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

interface ProfileForm {
  name: string;
  type: ProfileType;
  unit_price: string;
  vat_percent: string;
  duration_value: string;
  duration_unit: DurationUnit;
  download_rate_kbps: string;
  upload_rate_kbps: string;
  pool_name: string;
  short_description: string;
  enabled: boolean;
}

const emptyForm: ProfileForm = {
  name: "",
  type: "prepaid",
  unit_price: "0",
  vat_percent: "0",
  duration_value: "30",
  duration_unit: "days",
  download_rate_kbps: "",
  upload_rate_kbps: "",
  pool_name: "",
  short_description: "",
  enabled: true,
};

function formatCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(num);
}

function formatRate(kbps?: number | null): string {
  if (kbps == null) return "—";
  if (kbps >= 1000) return `${(kbps / 1000).toFixed(kbps % 1000 === 0 ? 0 : 1)}M`;
  return `${kbps}K`;
}

export default function ProfilesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);

  const list = useQuery({
    queryKey: ["profiles", q, page],
    queryFn: async () =>
      (
        await api.get<Paginated<Profile>>("/profiles", {
          params: { q: q || undefined, page, page_size: pageSize },
        })
      ).data,
  });

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post("/profiles", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
  const update = useMutation({
    mutationFn: async ({ id, ...payload }: { id: number } & Record<string, unknown>) =>
      (await api.patch(`/profiles/${id}`, payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/profiles/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setOpen(true);
  };
  const openEdit = (p: Profile) => {
    setEditId(p.id);
    setForm({
      name: p.name,
      type: p.type,
      unit_price: p.unit_price,
      vat_percent: p.vat_percent,
      duration_value: String(p.duration_value),
      duration_unit: p.duration_unit,
      download_rate_kbps: p.download_rate_kbps?.toString() ?? "",
      upload_rate_kbps: p.upload_rate_kbps?.toString() ?? "",
      pool_name: p.pool_name ?? "",
      short_description: p.short_description ?? "",
      enabled: p.enabled,
    });
    setOpen(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      name: form.name,
      type: form.type,
      unit_price: form.unit_price || "0",
      vat_percent: form.vat_percent || "0",
      duration_value: parseInt(form.duration_value, 10) || 30,
      duration_unit: form.duration_unit,
      download_rate_kbps: form.download_rate_kbps
        ? parseInt(form.download_rate_kbps, 10)
        : null,
      upload_rate_kbps: form.upload_rate_kbps ? parseInt(form.upload_rate_kbps, 10) : null,
      pool_name: form.pool_name || null,
      short_description: form.short_description || null,
      enabled: form.enabled,
    };
    if (editId) {
      await update.mutateAsync({ id: editId, ...payload });
    } else {
      await create.mutateAsync(payload);
    }
    setOpen(false);
  };

  const onDelete = async (p: Profile) => {
    if (!window.confirm(t("profiles.delete_confirm", { name: p.name }))) return;
    try {
      await remove.mutateAsync(p.id);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        t("profiles.delete_failed");
      window.alert(msg);
    }
  };

  return (
    <div>
      <PageHeader
        title={t("profiles.title")}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> {t("profiles.create")}
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
              placeholder={t("profiles.search_placeholder")}
              className="ps-9"
            />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("common.type")}</TableHead>
              <TableHead>{t("profiles.fields.price")}</TableHead>
              <TableHead>{t("profiles.fields.duration")}</TableHead>
              <TableHead>{t("profiles.fields.speed")}</TableHead>
              <TableHead>{t("profiles.fields.users")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
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
              list.data?.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t(`profiles.type.${p.type}`)}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatCurrency(p.unit_price)} {t("common.currency")}
                  </TableCell>
                  <TableCell>
                    {p.duration_value} {t(`profiles.duration_unit.${p.duration_unit}`)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatRate(p.download_rate_kbps)} / {formatRate(p.upload_rate_kbps)}
                  </TableCell>
                  <TableCell>{p.user_count}</TableCell>
                  <TableCell>
                    {p.enabled ? (
                      <Badge variant="default">{t("common.enabled")}</Badge>
                    ) : (
                      <Badge variant="secondary">{t("common.disabled")}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(p)}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editId ? t("profiles.edit") : t("profiles.create")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label>{t("common.name")}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("common.type")}</Label>
              <select
                className="border rounded-md h-10 px-3 bg-background"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as ProfileType })}
              >
                <option value="prepaid">{t("profiles.type.prepaid")}</option>
                <option value="postpaid">{t("profiles.type.postpaid")}</option>
                <option value="expired">{t("profiles.type.expired")}</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>
                {t("profiles.fields.price")} ({t("common.currency")})
              </Label>
              <Input
                type="number"
                step="0.01"
                value={form.unit_price}
                onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("profiles.fields.vat_percent")}</Label>
              <Input
                type="number"
                step="0.01"
                value={form.vat_percent}
                onChange={(e) => setForm({ ...form, vat_percent: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("profiles.fields.duration_value")}</Label>
              <Input
                type="number"
                value={form.duration_value}
                onChange={(e) => setForm({ ...form, duration_value: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("profiles.fields.duration_unit")}</Label>
              <select
                className="border rounded-md h-10 px-3 bg-background"
                value={form.duration_unit}
                onChange={(e) =>
                  setForm({ ...form, duration_unit: e.target.value as DurationUnit })
                }
              >
                <option value="days">{t("profiles.duration_unit.days")}</option>
                <option value="months">{t("profiles.duration_unit.months")}</option>
                <option value="years">{t("profiles.duration_unit.years")}</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{t("profiles.fields.download_kbps")}</Label>
              <Input
                type="number"
                value={form.download_rate_kbps}
                onChange={(e) =>
                  setForm({ ...form, download_rate_kbps: e.target.value })
                }
                placeholder="10000"
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("profiles.fields.upload_kbps")}</Label>
              <Input
                type="number"
                value={form.upload_rate_kbps}
                onChange={(e) => setForm({ ...form, upload_rate_kbps: e.target.value })}
                placeholder="2000"
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("profiles.fields.pool_name")}</Label>
              <Input
                value={form.pool_name}
                onChange={(e) => setForm({ ...form, pool_name: e.target.value })}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>{t("profiles.fields.short_description")}</Label>
              <Input
                value={form.short_description}
                onChange={(e) => setForm({ ...form, short_description: e.target.value })}
              />
            </div>
            <label className="sm:col-span-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              />
              {t("common.enabled")}
            </label>
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
