import { Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import RequireAuth from "@/components/RequireAuth";
import Dashboard from "@/pages/Dashboard";
import UsersPage from "@/pages/Users";
import GroupsPage from "@/pages/Groups";
import NasPage from "@/pages/Nas";
import AccountingPage from "@/pages/Accounting";
import AuthLogPage from "@/pages/AuthLog";
import LoginPage from "@/pages/Login";
import ProfilesPage from "@/pages/Profiles";
import OnlineUsersPage from "@/pages/OnlineUsers";
import SystemInfoPage from "@/pages/SystemInfo";
import ManagersPage from "@/pages/Managers";
import InvoicesPage from "@/pages/Invoices";
import ReportsPage from "@/pages/Reports";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="online-users" element={<OnlineUsersPage />} />
          <Route path="profiles" element={<ProfilesPage />} />
          <Route path="managers" element={<ManagersPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="nas" element={<NasPage />} />
          <Route path="accounting" element={<AccountingPage />} />
          <Route path="auth-log" element={<AuthLogPage />} />
          <Route path="system" element={<SystemInfoPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
