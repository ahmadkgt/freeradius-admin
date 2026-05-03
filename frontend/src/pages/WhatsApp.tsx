import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, LogOut, MessageSquare } from "lucide-react";
import { api, type WhatsAppStatus } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";

export default function WhatsAppPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const status = useQuery<WhatsAppStatus>({
    queryKey: ["whatsapp-status"],
    queryFn: async () => (await api.get<WhatsAppStatus>("/notifications/whatsapp/status")).data,
    refetchInterval: 5_000,
  });

  // The QR PNG endpoint requires the Authorization header, so fetch via axios
  // and turn the blob into an object URL each time the status flips.
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!status.data?.has_qr) {
      setQrUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    api
      .get<Blob>("/notifications/whatsapp/qr.png", { responseType: "blob" })
      .then((resp) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(resp.data);
        setQrUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return createdUrl;
        });
      })
      .catch(() => {
        if (!cancelled) setQrUrl(null);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [status.data?.has_qr, status.data?.last_status_at]);

  const disconnect = useMutation({
    mutationFn: async () => (await api.post("/notifications/whatsapp/disconnect")).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-status"] }),
  });

  const onDisconnect = async () => {
    if (!window.confirm(t("whatsapp.disconnect_confirm"))) return;
    await disconnect.mutateAsync();
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t("whatsapp.title")} description={t("whatsapp.description")} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-emerald-500" />
            <div>
              <div className="text-sm text-muted-foreground">{t("whatsapp.title")}</div>
              <div className="text-lg font-semibold">
                {status.data?.connected ? (
                  <Badge className="bg-emerald-600">{t("whatsapp.status_connected")}</Badge>
                ) : (
                  <Badge variant="outline">{t("whatsapp.status_disconnected")}</Badge>
                )}
              </div>
            </div>
          </div>

          {status.data?.jid && (
            <div className="text-sm">
              <span className="text-muted-foreground">{t("whatsapp.status_jid")}:</span>{" "}
              <span className="font-mono">{status.data.jid}</span>
            </div>
          )}
          {status.data?.last_error && (
            <div className="text-sm text-red-500">
              <span className="text-muted-foreground">{t("whatsapp.status_last_error")}:</span>{" "}
              {status.data.last_error}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => qc.invalidateQueries({ queryKey: ["whatsapp-status"] })}
            >
              <RefreshCw className="h-4 w-4 me-1" />
              {t("whatsapp.refresh")}
            </Button>
            {status.data?.connected && (
              <Button variant="destructive" onClick={onDisconnect}>
                <LogOut className="h-4 w-4 me-1" />
                {t("whatsapp.disconnect")}
              </Button>
            )}
          </div>
        </Card>

        <Card className="p-6 space-y-3">
          <h3 className="font-semibold">{t("whatsapp.qr_scan_hint")}</h3>
          {status.isLoading ? (
            <div className="text-sm text-muted-foreground">{t("whatsapp.qr_loading")}</div>
          ) : status.data?.connected ? (
            <div className="text-sm text-muted-foreground">{t("whatsapp.qr_already_paired")}</div>
          ) : status.data?.has_qr && qrUrl ? (
            <div className="flex justify-center">
              <img
                alt="WhatsApp QR"
                src={qrUrl}
                className="w-72 h-72 object-contain bg-white p-3 rounded border"
              />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {status.data?.last_error
                ? t("whatsapp.qr_unavailable")
                : t("whatsapp.qr_loading")}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
