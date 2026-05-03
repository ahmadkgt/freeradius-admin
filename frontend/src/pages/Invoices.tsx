import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CreditCard, Eye, Trash2, Search, Ban } from "lucide-react";
import {
  api,
  type Paginated,
  type Invoice,
  type InvoiceCreatePayload,
  type InvoiceDetail,
  type InvoicePaymentCreatePayload,
  type InvoiceStatus,
  type PaymentMethod,
  type Profile,
} from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useAuth } from "@/lib/auth";

function formatCurrency(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function statusBadgeVariant(status: InvoiceStatus): "default" | "secondary" | "destructive" {
  if (status === "paid") return "default";
  if (status === "voided" || status === "written_off") return "destructive";
  return "secondary";
}

interface CreateForm {
  subscriber_username: string;
  profile_id: string;
  description: string;
  amount: string;
  vat_percent: string;
  due_date: string;
  notes: string;
}

const emptyCreate: CreateForm = {
  subscriber_username: "",
  profile_id: "",
  description: "",
  amount: "",
  vat_percent: "",
  due_date: "",
  notes: "",
};

interface PayForm {
  amount: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
}

const emptyPay: PayForm = {
  amount: "",
  method: "cash",
  reference: "",
  notes: "",
};

export default function InvoicesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("invoices.manage");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate);

  const [detailId, setDetailId] = useState<number | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [payForm, setPayForm] = useState<PayForm>(emptyPay);

  const list = useQuery({
    queryKey: ["invoices", q, status, page],
    queryFn: async () =>
      (
        await api.get<Paginated<Invoice>>("/invoices", {
          params: {
            q: q || undefined,
            status: status || undefined,
            page,
            page_size: pageSize,
          },
        })
      ).data,
  });

  const profiles = useQuery({
    queryKey: ["profiles", "for-invoices"],
    queryFn: async () =>
      (
        await api.get<Paginated<Profile>>("/profiles", {
          params: { page: 1, page_size: 200, enabled_only: true },
        })
      ).data,
    enabled: canManage,
  });

  const detail = useQuery({
    queryKey: ["invoice", detailId],
    queryFn: async () =>
      (await api.get<InvoiceDetail>(`/invoices/${detailId}`)).data,
    enabled: detailId != null,
  });

  const create = useMutation({
    mutationFn: async (payload: InvoiceCreatePayload) =>
      (await api.post<Invoice>("/invoices", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const pay = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: number;
      payload: InvoicePaymentCreatePayload;
    }) => (await api.post(`/invoices/${id}/payments`, payload)).data,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", vars.id] });
    },
  });

  const voidInvoice = useMutation({
    mutationFn: async (id: number) =>
      (await api.patch(`/invoices/${id}`, { status: "voided" })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", detailId] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/invoices/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const submitCreate = async () => {
    const payload: InvoiceCreatePayload = {
      subscriber_username: createForm.subscriber_username.trim(),
      profile_id: createForm.profile_id ? Number(createForm.profile_id) : undefined,
      description: createForm.description || undefined,
      amount: createForm.amount || undefined,
      vat_percent: createForm.vat_percent || undefined,
      due_date: createForm.due_date || undefined,
      notes: createForm.notes || undefined,
    };
    try {
      await create.mutateAsync(payload);
      setCreateOpen(false);
      setCreateForm(emptyCreate);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed";
      window.alert(msg);
    }
  };

  const openPay = (inv: Invoice) => {
    setPayInvoice(inv);
    setPayForm({
      ...emptyPay,
      amount: inv.balance_due,
    });
    setPayOpen(true);
  };

  const submitPay = async () => {
    if (!payInvoice) return;
    try {
      await pay.mutateAsync({
        id: payInvoice.id,
        payload: {
          amount: payForm.amount,
          method: payForm.method,
          reference: payForm.reference || undefined,
          notes: payForm.notes || undefined,
        },
      });
      setPayOpen(false);
      setPayInvoice(null);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed";
      window.alert(msg);
    }
  };

  const onVoid = async (inv: Invoice) => {
    if (!window.confirm(t("invoices.confirm_void"))) return;
    try {
      await voidInvoice.mutateAsync(inv.id);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed";
      window.alert(msg);
    }
  };

  const onDelete = async (inv: Invoice) => {
    if (!window.confirm(t("invoices.confirm_delete"))) return;
    try {
      await remove.mutateAsync(inv.id);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed";
      window.alert(msg);
    }
  };

  const detailPayments = useMemo(() => detail.data?.payments ?? [], [detail.data]);

  return (
    <div>
      <PageHeader
        title={t("invoices.title")}
        actions={
          canManage ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> {t("invoices.create")}
            </Button>
          ) : undefined
        }
      />

      <Card>
        <div className="p-4 border-b flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm w-full sm:w-72">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder={t("invoices.search_placeholder")}
              className="ps-9"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-48"
          >
            <option value="">{t("invoices.all_statuses")}</option>
            <option value="pending">{t("invoices.status.pending")}</option>
            <option value="partially_paid">{t("invoices.status.partially_paid")}</option>
            <option value="paid">{t("invoices.status.paid")}</option>
            <option value="voided">{t("invoices.status.voided")}</option>
            <option value="written_off">{t("invoices.status.written_off")}</option>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("invoices.fields.number")}</TableHead>
              <TableHead>{t("invoices.fields.subscriber")}</TableHead>
              <TableHead>{t("invoices.fields.manager")}</TableHead>
              <TableHead>{t("invoices.fields.profile")}</TableHead>
              <TableHead>{t("invoices.fields.total")}</TableHead>
              <TableHead>{t("invoices.fields.paid")}</TableHead>
              <TableHead>{t("invoices.fields.balance")}</TableHead>
              <TableHead>{t("invoices.fields.status")}</TableHead>
              <TableHead>{t("invoices.fields.issue_date")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : list.data?.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  {t("invoices.no_invoices")}
                </TableCell>
              </TableRow>
            ) : (
              list.data?.items.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                  <TableCell className="font-medium">{inv.subscriber_username}</TableCell>
                  <TableCell className="text-xs">{inv.manager_username || "—"}</TableCell>
                  <TableCell className="text-xs">{inv.profile_name || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatCurrency(inv.total_amount)} {t("common.currency")}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatCurrency(inv.paid_amount)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatCurrency(inv.balance_due)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(inv.status)}>
                      {t(`invoices.status.${inv.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(inv.issue_date)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDetailId(inv.id)}
                        aria-label={t("invoices.view")}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canManage &&
                        inv.status !== "paid" &&
                        inv.status !== "voided" &&
                        inv.status !== "written_off" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openPay(inv)}
                            aria-label={t("invoices.pay")}
                          >
                            <CreditCard className="h-4 w-4" />
                          </Button>
                        )}
                      {canManage && inv.status !== "voided" && inv.status !== "written_off" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onVoid(inv)}
                          aria-label={t("invoices.void")}
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
                      {canManage &&
                        Number(inv.paid_amount) === 0 &&
                        (inv.status === "pending" || inv.status === "voided") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onDelete(inv)}
                            className="text-destructive"
                            aria-label={t("invoices.delete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
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

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("invoices.create")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t("invoices.create_for_subscriber")}</Label>
              <Input
                value={createForm.subscriber_username}
                onChange={(e) =>
                  setCreateForm({ ...createForm, subscriber_username: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("invoices.fields.profile")}</Label>
              <Select
                value={createForm.profile_id}
                onChange={(e) =>
                  setCreateForm({ ...createForm, profile_id: e.target.value })
                }
              >
                <option value="">—</option>
                {profiles.data?.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatCurrency(p.unit_price)} {t("common.currency")})
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>{t("invoices.fields.amount")}</Label>
                <Input
                  value={createForm.amount}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, amount: e.target.value })
                  }
                  placeholder={t("invoices.create_amount_hint")}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("invoices.fields.vat_percent")}</Label>
                <Input
                  value={createForm.vat_percent}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, vat_percent: e.target.value })
                  }
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("invoices.fields.description")}</Label>
              <Input
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm({ ...createForm, description: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("invoices.fields.due_date")}</Label>
              <Input
                type="date"
                value={createForm.due_date}
                onChange={(e) =>
                  setCreateForm({ ...createForm, due_date: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("invoices.fields.notes")}</Label>
              <Input
                value={createForm.notes}
                onChange={(e) =>
                  setCreateForm({ ...createForm, notes: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitCreate} disabled={create.isPending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("payments.create")}</DialogTitle>
            <DialogDescription>
              {payInvoice && (
                <>
                  {payInvoice.invoice_number} — {payInvoice.subscriber_username} ·{" "}
                  {t("invoices.balance_due_label")}: {formatCurrency(payInvoice.balance_due)}{" "}
                  {t("common.currency")}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t("payments.amount")}</Label>
              <Input
                value={payForm.amount}
                onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("payments.method")}</Label>
              <Select
                value={payForm.method}
                onChange={(e) =>
                  setPayForm({ ...payForm, method: e.target.value as PaymentMethod })
                }
              >
                <option value="cash">{t("payments.method_cash")}</option>
                <option value="transfer">{t("payments.method_transfer")}</option>
                <option value="balance">{t("payments.method_balance")}</option>
                <option value="other">{t("payments.method_other")}</option>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("payments.reference")}</Label>
              <Input
                value={payForm.reference}
                onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("payments.notes")}</Label>
              <Input
                value={payForm.notes}
                onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPayOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submitPay} disabled={pay.isPending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog
        open={detailId != null}
        onOpenChange={(v) => {
          if (!v) setDetailId(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {detail.data?.invoice_number || t("common.loading")}
            </DialogTitle>
            <DialogDescription>
              {detail.data?.subscriber_username} · {detail.data?.manager_username}
            </DialogDescription>
          </DialogHeader>
          {detail.data && (
            <div className="grid gap-4 text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">{t("invoices.fields.amount")}</div>
                  <div className="font-mono">
                    {formatCurrency(detail.data.amount)} {t("common.currency")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    {t("invoices.fields.vat_amount")}
                  </div>
                  <div className="font-mono">{formatCurrency(detail.data.vat_amount)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("invoices.fields.total")}</div>
                  <div className="font-mono font-semibold">
                    {formatCurrency(detail.data.total_amount)} {t("common.currency")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("invoices.fields.paid")}</div>
                  <div className="font-mono">{formatCurrency(detail.data.paid_amount)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    {t("invoices.fields.balance")}
                  </div>
                  <div className="font-mono">
                    {formatCurrency(detail.data.balance_due)} {t("common.currency")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("invoices.fields.status")}</div>
                  <Badge variant={statusBadgeVariant(detail.data.status)}>
                    {t(`invoices.status.${detail.data.status}`)}
                  </Badge>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    {t("invoices.fields.issue_date")}
                  </div>
                  <div>{formatDate(detail.data.issue_date)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("invoices.fields.due_date")}</div>
                  <div>{formatDate(detail.data.due_date)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("invoices.fields.period")}</div>
                  <div className="text-xs">
                    {formatDate(detail.data.period_start)} → {formatDate(detail.data.period_end)}
                  </div>
                </div>
              </div>
              {detail.data.description && (
                <div>
                  <div className="text-xs text-muted-foreground">
                    {t("invoices.fields.description")}
                  </div>
                  <div>{detail.data.description}</div>
                </div>
              )}

              <div>
                <div className="font-semibold mb-2">{t("payments.history")}</div>
                {detailPayments.length === 0 ? (
                  <div className="text-muted-foreground text-xs">{t("common.no_data")}</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("payments.amount")}</TableHead>
                        <TableHead>{t("payments.method")}</TableHead>
                        <TableHead>{t("payments.paid_at")}</TableHead>
                        <TableHead>{t("ledger.recorded_by")}</TableHead>
                        <TableHead>{t("payments.reference")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailPayments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs">
                            {formatCurrency(p.amount)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {t(`payments.method_${p.method}`)}
                          </TableCell>
                          <TableCell className="text-xs">{formatDate(p.paid_at)}</TableCell>
                          <TableCell className="text-xs">
                            {p.recorded_by_username || "—"}
                          </TableCell>
                          <TableCell className="text-xs">{p.reference || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
