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

export interface UserSummary {
  username: string;
  password?: string | null;
  groups: string[];
  framed_ip?: string | null;
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
