import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronRight,
  Crown,
  BookOpen,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import {
  api,
  ALL_PERMISSIONS,
  type Manager,
  type ManagerCreatePayload,
  type ManagerCreditDebitPayload,
  type ManagerLedgerEntry,
  type ManagerTreeNode,
  type ManagerUpdatePayload,
  type Paginated,
  type Permission,
  type Profile,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
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
import { cn } from "@/lib/utils";

interface ManagerForm {
  username: string;
  password: string;
  full_name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  enabled: boolean;
  balance: string;
  profit_share_percent: string;
  max_users_quota: string;
  permissions: Set<Permission>;
  allowed_profile_ids: Set<number>;
}

const emptyForm = (): ManagerForm => ({
  username: "",
  password: "",
  full_name: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  enabled: true,
  balance: "0",
  profit_share_percent: "0",
  max_users_quota: "",
  permissions: new Set<Permission>(),
  allowed_profile_ids: new Set<number>(),
});

function ManagerTreeView({ nodes }: { nodes: ManagerTreeNode[] }) {
  const { t } = useTranslation();
  if (!nodes.length) {
    return <p className="text-sm text-muted-foreground p-4">{t("managers.no_managers")}</p>;
  }
  const renderNode = (n: ManagerTreeNode, depth: number) => (
    <div key={n.id}>
      <div
        className="flex items-center gap-2 py-2 px-2 rounded-md hover:bg-muted text-sm"
        style={{ paddingInlineStart: 8 + depth * 20 }}
      >
        {n.is_root ? (
          <Crown className="h-4 w-4 text-amber-500 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium truncate">{n.username}</span>
        {n.full_name && (
          <span className="text-muted-foreground truncate">— {n.full_name}</span>
        )}
        <Badge variant="outline" className="ms-auto">
          {n.user_count} {t("managers.users")}
        </Badge>
        {!n.enabled && (
          <Badge variant="destructive" className="text-xs">
            {t("common.disabled")}
          </Badge>
        )}
      </div>
      {n.children.map((c) => renderNode(c, depth + 1))}
    </div>
  );
  return <div className="divide-y">{nodes.map((n) => renderNode(n, 0))}</div>;
}

export default function ManagersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState<"list" | "tree">("list");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ManagerForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const [ledgerManager, setLedgerManager] = useState<Manager | null>(null);
  const [adjustOpen, setAdjustOpen] = useState<null | "credit" | "debit">(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustDescription, setAdjustDescription] = useState("");

  const list = useQuery({
    queryKey: ["managers"],
    queryFn: async () => (await api.get<Manager[]>("/managers")).data,
  });
  const tree = useQuery({
    queryKey: ["managers-tree"],
    queryFn: async () => (await api.get<ManagerTreeNode[]>("/managers/tree")).data,
    enabled: tab === "tree",
  });
  const profiles = useQuery({
    queryKey: ["profiles", "all"],
    queryFn: async () =>
      (await api.get<Paginated<Profile>>("/profiles", { params: { page_size: 200 } })).data,
  });

  const ledger = useQuery({
    queryKey: ["manager-ledger", ledgerManager?.id],
    queryFn: async () =>
      (
        await api.get<Paginated<ManagerLedgerEntry>>(
          `/managers/${ledgerManager!.id}/ledger`,
          { params: { page: 1, page_size: 100 } },
        )
      ).data,
    enabled: ledgerManager != null,
  });

  const adjust = useMutation({
    mutationFn: async (vars: {
      id: number;
      kind: "credit" | "debit";
      payload: ManagerCreditDebitPayload;
    }) =>
      (
        await api.post<ManagerLedgerEntry>(
          `/managers/${vars.id}/${vars.kind}`,
          vars.payload,
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["managers"] });
      qc.invalidateQueries({ queryKey: ["managers-tree"] });
      qc.invalidateQueries({ queryKey: ["manager-ledger"] });
    },
  });

  const create = useMutation({
    mutationFn: async (payload: ManagerCreatePayload) =>
      (await api.post<Manager>("/managers", payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["managers"] });
      qc.invalidateQueries({ queryKey: ["managers-tree"] });
    },
  });
  const update = useMutation({
    mutationFn: async (vars: { id: number } & ManagerUpdatePayload) => {
      const { id, ...payload } = vars;
      return (await api.patch<Manager>(`/managers/${id}`, payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["managers"] });
      qc.invalidateQueries({ queryKey: ["managers-tree"] });
    },
  });
  const remove = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/managers/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["managers"] });
      qc.invalidateQueries({ queryKey: ["managers-tree"] });
    },
  });

  const filtered = useMemo(() => {
    const items = list.data ?? [];
    if (!q.trim()) return items;
    const needle = q.toLowerCase();
    return items.filter(
      (m) =>
        m.username.toLowerCase().includes(needle) ||
        (m.full_name && m.full_name.toLowerCase().includes(needle)),
    );
  }, [list.data, q]);

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  };
  const openEdit = (m: Manager) => {
    setEditId(m.id);
    setForm({
      username: m.username,
      password: "",
      full_name: m.full_name ?? "",
      phone: m.phone ?? "",
      email: m.email ?? "",
      address: m.address ?? "",
      notes: m.notes ?? "",
      enabled: m.enabled,
      balance: m.balance,
      profit_share_percent: m.profit_share_percent,
      max_users_quota: m.max_users_quota?.toString() ?? "",
      permissions: new Set(
        (m.permissions ?? []).filter((p): p is Permission =>
          (ALL_PERMISSIONS as string[]).includes(p),
        ),
      ),
      allowed_profile_ids: new Set(m.allowed_profile_ids ?? []),
    });
    setError(null);
    setOpen(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const base = {
      username: form.username.trim(),
      full_name: form.full_name || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      notes: form.notes || null,
      enabled: form.enabled,
      balance: form.balance || "0",
      profit_share_percent: form.profit_share_percent || "0",
      max_users_quota: form.max_users_quota
        ? parseInt(form.max_users_quota, 10)
        : null,
      permissions: Array.from(form.permissions),
      allowed_profile_ids: Array.from(form.allowed_profile_ids),
    };
    try {
      if (editId === null) {
        if (!form.password) {
          setError(t("managers.fields.password") + " ?");
          return;
        }
        await create.mutateAsync({ ...base, password: form.password });
      } else {
        await update.mutateAsync({
          id: editId,
          ...base,
          password: form.password ? form.password : undefined,
        });
      }
      setOpen(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Error";
      setError(msg);
    }
  };

  const onDelete = async (m: Manager) => {
    if (!window.confirm(t("managers.delete_confirm", { username: m.username }))) return;
    try {
      await remove.mutateAsync(m.id);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Error";
      window.alert(msg);
    }
  };

  const togglePerm = (p: Permission) => {
    setForm((f) => {
      const next = new Set(f.permissions);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return { ...f, permissions: next };
    });
  };
  const toggleProfile = (id: number) => {
    setForm((f) => {
      const next = new Set(f.allowed_profile_ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...f, allowed_profile_ids: next };
    });
  };

  const canManage = user?.is_root || (user?.effective_permissions?.includes("managers.manage") ?? false);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("managers.title")}
        actions={
          canManage && (
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4 me-2" />
              {t("managers.create")}
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border p-1 bg-card">
          <button
            type="button"
            className={cn(
              "px-3 py-1 text-sm rounded",
              tab === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
            onClick={() => setTab("list")}
          >
            {t("managers.tab_list")}
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-1 text-sm rounded",
              tab === "tree" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
            onClick={() => setTab("tree")}
          >
            {t("managers.tab_tree")}
          </button>
        </div>
        {tab === "list" && (
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="h-4 w-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("managers.search_placeholder")}
              className="ps-9"
            />
          </div>
        )}
      </div>

      <Card className="overflow-hidden">
        {tab === "tree" ? (
          tree.isLoading ? (
            <div className="p-6 text-center text-muted-foreground">
              {t("common.loading")}
            </div>
          ) : (
            <ManagerTreeView nodes={tree.data ?? []} />
          )
        ) : list.isLoading ? (
          <div className="p-6 text-center text-muted-foreground">{t("common.loading")}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("managers.fields.username")}</TableHead>
                  <TableHead>{t("managers.fields.full_name")}</TableHead>
                  <TableHead>{t("managers.fields.parent")}</TableHead>
                  <TableHead>{t("managers.users")}</TableHead>
                  <TableHead>{t("managers.subs")}</TableHead>
                  <TableHead>{t("managers.fields.balance")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="text-end">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {t("managers.no_managers")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((m) => {
                    const parentName =
                      m.parent_id == null
                        ? t("managers.root")
                        : list.data?.find((x) => x.id === m.parent_id)?.username ?? "—";
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            {m.is_root && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                            {m.username}
                          </div>
                        </TableCell>
                        <TableCell>{m.full_name || "—"}</TableCell>
                        <TableCell>{parentName}</TableCell>
                        <TableCell>{m.user_count}</TableCell>
                        <TableCell>{m.sub_count}</TableCell>
                        <TableCell>
                          {parseFloat(m.balance).toLocaleString()} {t("common.currency")}
                        </TableCell>
                        <TableCell>
                          {m.enabled ? (
                            <Badge variant="default">{t("common.enabled")}</Badge>
                          ) : (
                            <Badge variant="destructive">{t("common.disabled")}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-end space-x-1 rtl:space-x-reverse whitespace-nowrap">
                          {!m.is_root && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setLedgerManager(m)}
                              aria-label={t("ledger.title")}
                            >
                              <BookOpen className="h-4 w-4" />
                            </Button>
                          )}
                          {canManage && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => openEdit(m)}
                                aria-label={t("common.edit")}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {!m.is_root && m.id !== user?.id && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => onDelete(m)}
                                  aria-label={t("common.delete")}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>
                {editId === null ? t("managers.create") : t("managers.edit")}
              </DialogTitle>
            </DialogHeader>

            <div className="grid gap-3 py-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("managers.fields.username")}</Label>
                <Input
                  required
                  minLength={1}
                  maxLength={64}
                  disabled={editId !== null}
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  {editId === null
                    ? t("managers.fields.password")
                    : t("managers.fields.password_change")}
                </Label>
                <Input
                  type="password"
                  minLength={editId === null ? 8 : 0}
                  required={editId === null}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("managers.fields.full_name")}</Label>
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("managers.fields.phone")}</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("managers.fields.email")}</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("managers.fields.address")}</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>{t("managers.fields.balance")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.balance}
                  onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("managers.fields.profit_share_percent")}</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.profit_share_percent}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, profit_share_percent: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("managers.fields.max_users_quota")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.max_users_quota}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, max_users_quota: e.target.value }))
                  }
                />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2 mt-2">
                <input
                  id="manager-enabled"
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, enabled: e.target.checked }))
                  }
                />
                <Label htmlFor="manager-enabled">{t("managers.fields.enabled")}</Label>
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <Label>{t("managers.fields.notes")}</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <div className="sm:col-span-2 space-y-2 border-t pt-3">
                <Label className="text-base">{t("managers.fields.permissions")}</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {ALL_PERMISSIONS.map((p) => (
                    <label
                      key={p}
                      className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-muted cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.permissions.has(p)}
                        onChange={() => togglePerm(p)}
                      />
                      <span>{t(`managers.permissions.${p}`)}</span>
                    </label>
                  ))}
                </div>
              </div>

              {profiles.data && profiles.data.items.length > 0 && (
                <div className="sm:col-span-2 space-y-2 border-t pt-3">
                  <Label className="text-base">{t("managers.fields.allowed_profiles")}</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {profiles.data.items.map((p) => (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-muted cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={form.allowed_profile_ids.has(p.id)}
                          onChange={() => toggleProfile(p.id)}
                        />
                        <span>{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-destructive py-2">{error}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Ledger dialog */}
      <Dialog
        open={ledgerManager != null}
        onOpenChange={(v) => {
          if (!v) {
            setLedgerManager(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("ledger.title")} — {ledgerManager?.username}
            </DialogTitle>
          </DialogHeader>
          {ledgerManager && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-muted-foreground">
                    {t("managers.fields.balance")}:
                  </span>{" "}
                  <span className="font-mono font-semibold">
                    {parseFloat(ledgerManager.balance).toLocaleString()}{" "}
                    {t("common.currency")}
                  </span>
                </div>
                {canManage && !ledgerManager.is_root && ledgerManager.id !== user?.id && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setAdjustOpen("credit");
                        setAdjustAmount("");
                        setAdjustDescription("");
                      }}
                    >
                      <ArrowUp className="h-4 w-4" /> {t("ledger.credit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAdjustOpen("debit");
                        setAdjustAmount("");
                        setAdjustDescription("");
                      }}
                    >
                      <ArrowDown className="h-4 w-4" /> {t("ledger.debit")}
                    </Button>
                  </div>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("ledger.entry_type")}</TableHead>
                    <TableHead>{t("ledger.amount")}</TableHead>
                    <TableHead>{t("ledger.balance_after")}</TableHead>
                    <TableHead>{t("ledger.description")}</TableHead>
                    <TableHead>{t("ledger.recorded_by")}</TableHead>
                    <TableHead>{t("invoices.fields.issue_date")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(ledger.data?.items ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-muted-foreground py-6"
                      >
                        {t("ledger.no_entries")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    ledger.data!.items.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Badge variant="secondary">
                            {t(`ledger.type.${entry.entry_type}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {parseFloat(entry.amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {parseFloat(entry.balance_after).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs">
                          {entry.description || "—"}
                          {entry.related_invoice_number && (
                            <span className="block text-muted-foreground">
                              {entry.related_invoice_number}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {entry.recorded_by_username || "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {new Date(entry.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Credit / Debit adjustment dialog */}
      <Dialog
        open={adjustOpen != null}
        onOpenChange={(v) => {
          if (!v) setAdjustOpen(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {adjustOpen === "credit"
                ? t("ledger.credit_dialog_title")
                : t("ledger.debit_dialog_title")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t("ledger.amount")}</Label>
              <Input
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("ledger.description")}</Label>
              <Input
                value={adjustDescription}
                onChange={(e) => setAdjustDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjustOpen(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={adjust.isPending || !adjustAmount}
              onClick={async () => {
                if (!ledgerManager || !adjustOpen) return;
                try {
                  await adjust.mutateAsync({
                    id: ledgerManager.id,
                    kind: adjustOpen,
                    payload: {
                      amount: adjustAmount,
                      description: adjustDescription || undefined,
                    },
                  });
                  setAdjustOpen(null);
                } catch (err: unknown) {
                  const msg =
                    (err as { response?: { data?: { detail?: string } } })?.response?.data
                      ?.detail || "Failed";
                  window.alert(msg);
                }
              }}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
