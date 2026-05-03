import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  api,
  type NotificationEvent,
  type NotificationTemplate,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/lib/auth";

const EVENTS: NotificationEvent[] = [
  "custom",
  "renewal_reminder",
  "expired",
  "debt_warning",
  "invoice_issued",
  "welcome",
];

interface TemplateForm {
  name: string;
  event: NotificationEvent;
  enabled: boolean;
  body_ar: string;
  body_en: string;
  config: string;
}

const emptyForm: TemplateForm = {
  name: "",
  event: "custom",
  enabled: true,
  body_ar: "",
  body_en: "",
  config: "",
};

function parseConfig(text: string): { ok: true; value: Record<string, unknown> | null } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: null };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Config must be a JSON object" };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export default function NotificationTemplatesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("notifications.templates.manage");

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery<NotificationTemplate[]>({
    queryKey: ["notification-templates"],
    queryFn: async () => (await api.get<NotificationTemplate[]>("/notifications/templates")).data,
  });

  const variables = useQuery<{ variables: string[] }>({
    queryKey: ["notification-template-variables"],
    queryFn: async () =>
      (await api.get<{ variables: string[] }>("/notifications/templates/variables")).data,
  });

  const create = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post("/notifications/templates", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-templates"] }),
  });
  const update = useMutation({
    mutationFn: async ({ id, ...payload }: { id: number } & Record<string, unknown>) =>
      (await api.patch(`/notifications/templates/${id}`, payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-templates"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: number) =>
      (await api.delete(`/notifications/templates/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-templates"] }),
  });

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setError(null);
    setOpen(true);
  };
  const openEdit = (tpl: NotificationTemplate) => {
    setEditId(tpl.id);
    setForm({
      name: tpl.name,
      event: tpl.event,
      enabled: tpl.enabled,
      body_ar: tpl.body_ar ?? "",
      body_en: tpl.body_en ?? "",
      config: tpl.config ? JSON.stringify(tpl.config, null, 2) : "",
    });
    setError(null);
    setOpen(true);
  };

  const onSubmit = async () => {
    setError(null);
    if (!form.name.trim()) {
      setError(t("notification_templates.name"));
      return;
    }
    if (!form.body_ar.trim() && !form.body_en.trim()) {
      setError(t("notification_templates.must_have_body"));
      return;
    }
    const cfg = parseConfig(form.config);
    if (!cfg.ok) {
      setError(`Config: ${cfg.error}`);
      return;
    }
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      event: form.event,
      enabled: form.enabled,
      body_ar: form.body_ar.trim() || null,
      body_en: form.body_en.trim() || null,
      config: cfg.value,
    };
    try {
      if (editId == null) await create.mutateAsync(payload);
      else await update.mutateAsync({ id: editId, ...payload });
      setOpen(false);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? String(err);
      setError(detail);
    }
  };

  const onDelete = async (tpl: NotificationTemplate) => {
    if (!window.confirm(t("notification_templates.delete_confirm"))) return;
    await remove.mutateAsync(tpl.id);
  };

  const eventLabel = (ev: NotificationEvent) => t(`notifications.event.${ev}`);

  const knownVars = useMemo(() => variables.data?.variables ?? [], [variables.data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("notification_templates.title")}
        description={t("notification_templates.description")}
        actions={
          canManage && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 me-1" />
              {t("notification_templates.create")}
            </Button>
          )
        }
      />

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("notification_templates.name")}</TableHead>
              <TableHead>{t("notification_templates.event")}</TableHead>
              <TableHead>{t("notification_templates.enabled")}</TableHead>
              <TableHead className="w-[60%]">{t("notification_templates.body_ar")}</TableHead>
              {canManage && <TableHead className="text-end">{t("common.actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.data?.length ? (
              list.data.map((tpl) => (
                <TableRow key={tpl.id}>
                  <TableCell className="font-medium">{tpl.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{eventLabel(tpl.event)}</Badge>
                  </TableCell>
                  <TableCell>
                    {tpl.enabled ? (
                      <Badge variant="default">{t("common.yes")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("common.no")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-pre-wrap break-words max-w-[480px]">
                    {(tpl.body_ar || tpl.body_en || "").slice(0, 200)}
                    {(tpl.body_ar || tpl.body_en || "").length > 200 ? "…" : ""}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-end">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(tpl)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => onDelete(tpl)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={canManage ? 5 : 4} className="text-center text-muted-foreground py-8">
                  {t("notification_templates.no_templates")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editId == null
                ? t("notification_templates.create_dialog_title")
                : t("notification_templates.edit_dialog_title")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t("notification_templates.name")}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("notification_templates.event")}</Label>
                <select
                  className="border rounded-md h-10 px-3 bg-background"
                  value={form.event}
                  onChange={(e) =>
                    setForm({ ...form, event: e.target.value as NotificationEvent })
                  }
                >
                  {EVENTS.map((ev) => (
                    <option key={ev} value={ev}>
                      {eventLabel(ev)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>{t("notification_templates.enabled")}</Label>
                <label className="inline-flex items-center gap-2 h-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={form.enabled}
                    onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  />
                  <span>{form.enabled ? t("common.yes") : t("common.no")}</span>
                </label>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("notification_templates.body_ar")}</Label>
              <textarea
                className="border rounded-md p-2 bg-background text-sm font-mono min-h-[120px]"
                dir="rtl"
                value={form.body_ar}
                onChange={(e) => setForm({ ...form, body_ar: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("notification_templates.body_en")}</Label>
              <textarea
                className="border rounded-md p-2 bg-background text-sm font-mono min-h-[120px]"
                dir="ltr"
                value={form.body_en}
                onChange={(e) => setForm({ ...form, body_en: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("notification_templates.config")}</Label>
              <textarea
                className="border rounded-md p-2 bg-background text-xs font-mono min-h-[60px]"
                placeholder='{"days_before": 3}'
                value={form.config}
                onChange={(e) => setForm({ ...form, config: e.target.value })}
              />
            </div>

            {knownVars.length > 0 && (
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="font-medium">{t("notification_templates.variables_hint")}:</div>
                <div className="flex flex-wrap gap-1">
                  {knownVars.map((v) => (
                    <code key={v} className="px-1 rounded bg-muted">
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="text-sm text-red-500">{error}</div>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            {canManage && (
              <Button onClick={onSubmit} disabled={create.isPending || update.isPending}>
                {t("notification_templates.save")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
