import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL ?? "/api";

export const api = axios.create({ baseURL });

const TOKEN_STORAGE_KEY = "freeradius-admin-token";

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url ?? "";
    // Don't trigger logout on the login call itself — let the form show the error.
    if (status === 401 && !url.includes("/auth/login")) {
      window.dispatchEvent(new Event("auth:logout"));
    }
    return Promise.reject(error);
  },
);

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type UserStatus =
  | "active_online"
  | "active_offline"
  | "expiring_soon"
  | "expired"
  | "expired_online"
  | "disabled";

export interface UserSummary {
  username: string;
  password?: string | null;
  groups: string[];
  framed_ip?: string | null;
  status: UserStatus;
  profile_name?: string | null;
  manager_id?: number | null;
  manager_username?: string | null;
  expiration_at?: string | null;
  online: boolean;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  balance: string; // Decimal serialized as string
}

export interface SubscriptionInfo {
  profile_id?: number | null;
  profile_name?: string | null;
  manager_id?: number | null;
  manager_username?: string | null;
  enabled: boolean;
  expiration_at?: string | null;
  balance: string;
  debt: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface OnlineUser {
  username: string;
  nasipaddress: string;
  framedipaddress?: string | null;
  callingstationid?: string | null;
  acctstarttime?: string | null;
  acctsessiontime?: number | null;
  acctinputoctets?: number | null;
  acctoutputoctets?: number | null;
  profile_name?: string | null;
}

export interface AttrRow {
  id: number;
  attribute: string;
  op: string;
  value: string;
}

export interface UserDetail {
  username: string;
  password?: string | null;
  groups: string[];
  check_attrs: (AttrRow & { username: string })[];
  reply_attrs: (AttrRow & { username: string })[];
  subscription?: SubscriptionInfo | null;
  status: UserStatus;
  online: boolean;
}

export interface GroupSummary {
  groupname: string;
  user_count: number;
}

export interface GroupDetail {
  groupname: string;
  check_attrs: (AttrRow & { groupname: string })[];
  reply_attrs: (AttrRow & { groupname: string })[];
  members: string[];
}

export interface NasRow {
  id: number;
  nasname: string;
  shortname?: string | null;
  type?: string | null;
  ports?: number | null;
  secret?: string | null;
  server?: string | null;
  community?: string | null;
  description?: string | null;
}

export interface AccountingRow {
  radacctid: number;
  acctsessionid: string;
  username: string;
  groupname?: string | null;
  nasipaddress: string;
  framedipaddress?: string | null;
  callingstationid?: string | null;
  acctstarttime?: string | null;
  acctstoptime?: string | null;
  acctsessiontime?: number | null;
  acctinputoctets?: number | null;
  acctoutputoctets?: number | null;
  acctterminatecause?: string | null;
}

export interface PostAuthRow {
  id: number;
  username: string;
  reply: string;
  authdate: string;
}

export interface DashboardStats {
  total_users: number;
  total_groups: number;
  total_nas: number;
  active_sessions: number;
  sessions_today: number;
  auth_accepts_today: number;
  auth_rejects_today: number;
  total_input_bytes: number;
  total_output_bytes: number;
  active_users: number;
  active_online_users: number;
  active_offline_users: number;
  online_users: number;
  offline_users: number;
  expired_users: number;
  expired_online_users: number;
  expiring_today: number;
  expiring_soon: number;
  disabled_users: number;
}

export type ProfileType = "prepaid" | "postpaid" | "expired";
export type DurationUnit = "days" | "months" | "years";

export interface Profile {
  id: number;
  name: string;
  type: ProfileType;
  short_description?: string | null;
  unit_price: string;
  vat_percent: string;
  enabled: boolean;
  duration_value: number;
  duration_unit: DurationUnit;
  use_fixed_time: boolean;
  fixed_expiration_time?: string | null;
  download_rate_kbps?: number | null;
  upload_rate_kbps?: number | null;
  pool_name?: string | null;
  expired_next_profile_id?: number | null;
  awarded_reward_points: string;
  available_in_user_panel: boolean;
  is_public: boolean;
  enable_sub_managers: boolean;
  user_count: number;
  created_at: string;
  updated_at: string;
}

export interface SystemInfo {
  version: string;
  server_time: string;
  timezone: string;
  uptime_seconds: number;
  cpu_percent?: number | null;
  load_avg: number[];
  memory_total_bytes?: number | null;
  memory_available_bytes?: number | null;
  memory_used_percent?: number | null;
  disk_total_bytes?: number | null;
  disk_free_bytes?: number | null;
  disk_used_percent?: number | null;
  db_size_bytes?: number | null;
  active_connections: number;
  user_count: number;
  profile_count: number;
}

export interface TimeSeriesPoint {
  label: string;
  accepts: number;
  rejects: number;
}

export interface TopUser {
  username: string;
  sessions: number;
  total_bytes: number;
}

export type Permission =
  | "users.view"
  | "users.create"
  | "users.edit"
  | "users.delete"
  | "users.renew"
  | "users.toggle"
  | "profiles.view"
  | "profiles.manage"
  | "managers.view"
  | "managers.manage"
  | "invoices.view"
  | "invoices.manage"
  | "reports.view"
  | "settings.manage";

export const ALL_PERMISSIONS: Permission[] = [
  "users.view",
  "users.create",
  "users.edit",
  "users.delete",
  "users.renew",
  "users.toggle",
  "profiles.view",
  "profiles.manage",
  "managers.view",
  "managers.manage",
  "invoices.view",
  "invoices.manage",
  "reports.view",
  "settings.manage",
];

export interface AdminMe {
  id: number;
  username: string;
  full_name?: string | null;
  enabled: boolean;
  is_root: boolean;
  parent_id?: number | null;
  balance: string;
  permissions: string[];
  effective_permissions: string[];
}

export interface Manager {
  id: number;
  parent_id?: number | null;
  username: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  enabled: boolean;
  is_root: boolean;
  balance: string;
  profit_share_percent: string;
  max_users_quota?: number | null;
  permissions: string[];
  allowed_profile_ids: number[];
  created_at: string;
  updated_at: string;
  sub_count: number;
  user_count: number;
}

export interface ManagerTreeNode {
  id: number;
  username: string;
  full_name?: string | null;
  enabled: boolean;
  is_root: boolean;
  user_count: number;
  children: ManagerTreeNode[];
}

export interface ManagerCreatePayload {
  parent_id?: number | null;
  username: string;
  password: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  enabled?: boolean;
  balance?: string;
  profit_share_percent?: string;
  max_users_quota?: number | null;
  permissions?: string[];
  allowed_profile_ids?: number[];
}

export interface ManagerUpdatePayload {
  username?: string;
  password?: string | null;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  enabled?: boolean;
  balance?: string;
  profit_share_percent?: string;
  max_users_quota?: number | null;
  permissions?: string[];
  allowed_profile_ids?: number[];
}

export function hasPermission(
  effectivePermissions: string[] | undefined,
  perm: Permission,
): boolean {
  if (!effectivePermissions) return false;
  if (effectivePermissions.includes("*")) return true;
  return effectivePermissions.includes(perm);
}

// ---- Phase 3: Invoices, Payments, Ledger, Reports ----
export type InvoiceStatus =
  | "pending"
  | "partially_paid"
  | "paid"
  | "voided"
  | "written_off";

export type PaymentMethod = "cash" | "transfer" | "balance" | "other";

export type LedgerEntryType =
  | "credit"
  | "debit"
  | "invoice_payment"
  | "profit_share"
  | "manual_adjustment"
  | "opening_balance";

export interface InvoicePayment {
  id: number;
  invoice_id: number;
  amount: string;
  method: PaymentMethod;
  paid_at: string;
  recorded_by_manager_id?: number | null;
  recorded_by_username?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  subscriber_username: string;
  manager_id: number;
  manager_username?: string | null;
  issued_by_manager_id?: number | null;
  issued_by_username?: string | null;
  profile_id?: number | null;
  profile_name?: string | null;
  description?: string | null;
  amount: string;
  vat_percent: string;
  vat_amount: string;
  total_amount: string;
  paid_amount: string;
  balance_due: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceDetail extends Invoice {
  payments: InvoicePayment[];
}

export interface InvoiceCreatePayload {
  subscriber_username: string;
  profile_id?: number | null;
  description?: string | null;
  amount?: string | null;
  vat_percent?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  notes?: string | null;
}

export interface InvoiceUpdatePayload {
  description?: string | null;
  due_date?: string | null;
  notes?: string | null;
  status?: InvoiceStatus | null;
}

export interface InvoicePaymentCreatePayload {
  amount: string;
  method?: PaymentMethod;
  paid_at?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export interface RenewPayload {
  profile_id?: number | null;
  period_value?: number | null;
  period_unit?: "days" | "months" | "years" | null;
  issue_invoice?: boolean;
  notes?: string | null;
}

export interface ManagerLedgerEntry {
  id: number;
  manager_id: number;
  entry_type: LedgerEntryType;
  amount: string;
  balance_after: string;
  related_invoice_id?: number | null;
  related_invoice_number?: string | null;
  recorded_by_manager_id?: number | null;
  recorded_by_username?: string | null;
  description?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface ManagerCreditDebitPayload {
  amount: string;
  description?: string | null;
  notes?: string | null;
}

export interface ProfitByManager {
  manager_id: number;
  manager_username: string;
  invoiced: string;
  collected: string;
  outstanding: string;
  user_count: number;
}

export interface ProfitSummary {
  total_invoiced: string;
  total_collected: string;
  outstanding_subscriber_debt: string;
  manager_balance_total: string;
  by_manager: ProfitByManager[];
}

export interface RevenuePoint {
  bucket: string;
  invoiced_total: string;
  paid_total: string;
  invoice_count: number;
}

export interface DebtorRow {
  type: "subscriber" | "manager";
  id: string;
  label: string;
  debt: string;
  manager_username?: string | null;
}

export interface DebtSummary {
  total_subscriber_debt: string;
  total_subscriber_count: number;
  total_unpaid_invoice_amount: string;
  rows: DebtorRow[];
}
