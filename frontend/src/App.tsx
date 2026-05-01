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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="nas" element={<NasPage />} />
          <Route path="accounting" element={<AccountingPage />} />
          <Route path="auth-log" element={<AuthLogPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
