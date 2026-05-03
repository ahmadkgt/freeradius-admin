import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  api,
  type DebtSummary,
  type ProfitSummary,
  type RevenuePoint,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/PageHeader";

function formatCurrency(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return "—";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(num);
}

interface SummaryCardProps {
  label: string;
  value: string;
  hint?: string;
}

function SummaryCard({ label, value, hint }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold mt-1 font-mono">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const currency = t("common.currency");

  const profit = useQuery({
    queryKey: ["reports", "profit"],
    queryFn: async () => (await api.get<ProfitSummary>("/reports/profit")).data,
  });
  const debt = useQuery({
    queryKey: ["reports", "debt"],
    queryFn: async () => (await api.get<DebtSummary>("/reports/debt")).data,
  });
  const revenue = useQuery({
    queryKey: ["reports", "revenue", 30],
    queryFn: async () =>
      (await api.get<RevenuePoint[]>("/reports/revenue", { params: { days: 30 } })).data,
  });

  return (
    <div>
      <PageHeader title={t("reports.title")} />

      <div className="space-y-6">
        {/* Profit summary */}
        <Card>
          <CardHeader>
            <CardTitle>{t("reports.profit.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard
                label={t("reports.profit.total_invoiced")}
                value={`${formatCurrency(profit.data?.total_invoiced)} ${currency}`}
              />
              <SummaryCard
                label={t("reports.profit.total_collected")}
                value={`${formatCurrency(profit.data?.total_collected)} ${currency}`}
              />
              <SummaryCard
                label={t("reports.profit.outstanding_debt")}
                value={`${formatCurrency(profit.data?.outstanding_subscriber_debt)} ${currency}`}
              />
              <SummaryCard
                label={t("reports.profit.manager_balance")}
                value={`${formatCurrency(profit.data?.manager_balance_total)} ${currency}`}
              />
            </div>

            {profit.data?.by_manager && profit.data.by_manager.length > 0 && (
              <>
                <div className="text-sm font-semibold mt-4">{t("reports.profit.by_manager")}</div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={profit.data.by_manager}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="manager_username" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar
                        dataKey={(row) => parseFloat(row.invoiced)}
                        name={t("reports.profit.invoiced")}
                        fill="#3b82f6"
                      />
                      <Bar
                        dataKey={(row) => parseFloat(row.collected)}
                        name={t("reports.profit.collected")}
                        fill="#10b981"
                      />
                      <Bar
                        dataKey={(row) => parseFloat(row.outstanding)}
                        name={t("reports.profit.outstanding")}
                        fill="#f59e0b"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("reports.debt.manager")}</TableHead>
                      <TableHead>{t("reports.profit.invoiced")}</TableHead>
                      <TableHead>{t("reports.profit.collected")}</TableHead>
                      <TableHead>{t("reports.profit.outstanding")}</TableHead>
                      <TableHead>{t("reports.profit.user_count")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profit.data.by_manager.map((row) => (
                      <TableRow key={row.manager_id}>
                        <TableCell className="font-medium">{row.manager_username}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatCurrency(row.invoiced)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatCurrency(row.collected)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatCurrency(row.outstanding)}
                        </TableCell>
                        <TableCell>{row.user_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>

        {/* Revenue by day */}
        <Card>
          <CardHeader>
            <CardTitle>{t("reports.revenue.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {revenue.data && revenue.data.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenue.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey={(p: RevenuePoint) => parseFloat(p.invoiced_total)}
                      name={t("reports.revenue.invoiced")}
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey={(p: RevenuePoint) => parseFloat(p.paid_total)}
                      name={t("reports.revenue.paid")}
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-muted-foreground text-sm">
                {t("reports.revenue.no_data")}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Debt summary */}
        <Card>
          <CardHeader>
            <CardTitle>{t("reports.debt.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
              <SummaryCard
                label={t("reports.debt.total_debt")}
                value={`${formatCurrency(debt.data?.total_subscriber_debt)} ${currency}`}
              />
              <SummaryCard
                label={t("reports.debt.subscriber_count")}
                value={String(debt.data?.total_subscriber_count ?? 0)}
              />
              <SummaryCard
                label={t("reports.debt.unpaid_invoice_amount")}
                value={`${formatCurrency(debt.data?.total_unpaid_invoice_amount)} ${currency}`}
              />
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("invoices.fields.subscriber")}</TableHead>
                  <TableHead>{t("invoices.fields.manager")}</TableHead>
                  <TableHead>{t("reports.debt.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(debt.data?.rows ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      {t("common.no_data")}
                    </TableCell>
                  </TableRow>
                ) : (
                  debt.data!.rows.map((row) => (
                    <TableRow key={`${row.type}-${row.id}`}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className="text-xs">{row.manager_username || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatCurrency(row.debt)} {currency}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
