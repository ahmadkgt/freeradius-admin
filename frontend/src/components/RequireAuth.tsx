import { useTranslation } from "react-i18next";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";

export default function RequireAuth() {
  const { t } = useTranslation();
  const { token, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <span className="text-sm text-muted-foreground">{t("common.loading")}</span>
      </div>
    );
  }
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
