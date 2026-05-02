import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Search, Eye } from "lucide-react";
import {
  api,
  type Paginated,
  type Profile,
  type UserDetail,
  type UserStatus,
  type UserSummary,
} from "@/lib/api";
import { UserStatusBadge } from "@/components/UserStatusBadge";
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
  profile_id: string; // "" or numeric string
  expiration_at: string; // ISO datetime-local
  enabled: boolean;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  balance: string;
  debt: string;
}

const emptyForm: UserFormState = {
  username: "",
  password: "",
  groups: "",
  framed_ip: "",
  profile_id: "",
  expiration_at: "",
  enabled: true,
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
  balance: "0",
  debt: "0",
};

function isoToInputValue(iso?: string | null): string {
  if (!iso) return "";
  // Strip seconds + Z so it fits datetime-local
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function UsersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "">("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["users", q, statusFilter, page],
    queryFn: async () =>
      (
        await api.get<Paginated<UserSummary>>("/users", {
          params: {
            q: q || undefined,
            status: statusFilter || undefined,
            page,
            page_size: pageSize,
          },
        })
      ).data,
  });

  const detail = useQuery({
    queryKey: ["user", detailUser],
    enabled: !!detailUser,
    queryFn: async () => (await api.get<UserDetail>(`/users/${detailUser}`)).data,
  });

  const profiles = useQuery({
    queryKey: ["profiles", "lookup"],
    queryFn: async () =>
      (
        await api.get<Paginated<Profile>>("/profiles", {
          params: { enabled_only: true, page: 1, page_size: 200 },
        })
      ).data.items,
  });

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post("/users", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
  const update = useMutation({
    mutationFn: async ({ username, ...payload }: { username: string } & Record<string, unknown>) =>
      (await api.patch(`/users/${username}`, payload)).data,
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
  const openEdit = async (u: UserSummary) => {
    setEditTarget(u.username);
    // Fetch detail to get full subscription metadata.
    const det = (await api.get<UserDetail>(`/users/${u.username}`)).data;
    const sub = det.subscription;
    setForm({
      username: u.username,
      password: u.password ?? "",
      groups: u.groups.join(", "),
      framed_ip: u.framed_ip ?? "",
      profile_id: sub?.profile_id != null ? String(sub.profile_id) : "",
      expiration_at: isoToInputValue(sub?.expiration_at ?? null),
      enabled: sub?.enabled ?? true,
      first_name: sub?.first_name ?? "",
      last_name: sub?.last_name ?? "",
      email: sub?.email ?? "",
      phone: sub?.phone ?? "",
      address: sub?.address ?? "",
      notes: sub?.notes ?? "",
      balance: sub?.balance ?? "0",
      debt: sub?.debt ?? "0",
    });
    setEditOpen(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const groups = form.groups
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
    const subscriptionPayload = {
      profile_id: form.profile_id ? parseInt(form.profile_id, 10) : null,
      expiration_at: form.expiration_at ? new Date(form.expiration_at).toISOString() : null,
      enabled: form.enabled,
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      notes: form.notes || null,
      balance: form.balance || "0",
      debt: form.debt || "0",
    };
    if (editTarget) {
      await update.mutateAsync({
        username: editTarget,
        password: form.password || undefined,
        groups,
        framed_ip: form.framed_ip,
        ...subscriptionPayload,
      });
    } else {
      await create.mutateAsync({
        username: form.username,
        password: form.password,
        groups,
        framed_ip: form.framed_ip || undefined,
        ...subscriptionPayload,
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
        <div className="p-4 border-b flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
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
          <select
            className="border rounded-md h-10 px-3 bg-background text-sm"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as UserStatus | "");
              setPage(1);
            }}
          >
            <option value="">{t("users.all_statuses")}</option>
            <option value="active_online">{t("user_status.active_online")}</option>
            <option value="active_offline">{t("user_status.active_offline")}</option>
            <option value="expiring_soon">{t("user_status.expiring_soon")}</option>
            <option value="expired">{t("user_status.expired")}</option>
            <option value="expired_online">{t("user_status.expired_online")}</option>
            <option value="disabled">{t("user_status.disabled")}</option>
          </select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.username")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("users.fields.profile")}</TableHead>
              <TableHead>{t("managers.fields.manager")}</TableHead>
              <TableHead>{t("users.fields.expiration")}</TableHead>
              <TableHead>{t("common.framed_ip")}</TableHead>
              <TableHead>{t("users.fields.full_name")}</TableHead>
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
              list.data?.items.map((u) => (
                <TableRow key={u.username}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{u.username}</span>
                      {u.groups.map((g) => (
                        <Badge key={g} variant="secondary" className="text-[10px]">
                          {g}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <UserStatusBadge status={u.status} />
                  </TableCell>
                  <TableCell>
                    {u.profile_name ? (
                      <Badge variant="secondary">{u.profile_name}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.manager_username ? (
                      <Badge variant="outline">{u.manager_username}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {u.expiration_at ? new Date(u.expiration_at).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{u.framed_ip ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}
                    {u.phone ? (
                      <div className="text-muted-foreground">{u.phone}</div>
                    ) : null}
                  </TableCell>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? t("users.edit") : t("users.create")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
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
              <div className="grid gap-2 sm:col-span-2">
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
              <label className="flex items-center gap-2 text-sm self-end">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                />
                {t("users.fields.enabled")}
              </label>
            </div>

            <fieldset className="border rounded-md p-4 grid gap-4 sm:grid-cols-2">
              <legend className="text-sm font-semibold px-1">
                {t("users.fields.subscription")}
              </legend>
              <div className="grid gap-2">
                <Label>{t("users.fields.profile")}</Label>
                <select
                  className="border rounded-md h-10 px-3 bg-background"
                  value={form.profile_id}
                  onChange={(e) => setForm({ ...form, profile_id: e.target.value })}
                >
                  <option value="">{t("users.fields.no_profile")}</option>
                  {profiles.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>{t("users.fields.expiration")}</Label>
                <Input
                  type="datetime-local"
                  value={form.expiration_at}
                  onChange={(e) => setForm({ ...form, expiration_at: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>
                  {t("users.fields.balance")} ({t("common.currency")})
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.balance}
                  onChange={(e) => setForm({ ...form, balance: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>
                  {t("users.fields.debt")} ({t("common.currency")})
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.debt}
                  onChange={(e) => setForm({ ...form, debt: e.target.value })}
                />
              </div>
            </fieldset>

            <fieldset className="border rounded-md p-4 grid gap-4 sm:grid-cols-2">
              <legend className="text-sm font-semibold px-1">{t("users.fields.contact")}</legend>
              <div className="grid gap-2">
                <Label>{t("users.fields.first_name")}</Label>
                <Input
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("users.fields.last_name")}</Label>
                <Input
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("users.fields.phone")}</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("users.fields.email")}</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>{t("users.fields.address")}</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>{t("users.fields.notes")}</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </fieldset>

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
