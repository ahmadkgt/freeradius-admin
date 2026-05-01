import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import axios from "axios";
import { Languages, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

interface LocationState {
  from?: { pathname?: string };
}

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const { login, token, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <span className="text-sm text-muted-foreground">{t("common.loading")}</span>
      </div>
    );
  }
  if (token) {
    const from = (location.state as LocationState | null)?.from?.pathname || "/";
    return <Navigate to={from} replace />;
  }

  const toggleLang = () => {
    void i18n.changeLanguage(i18n.language?.startsWith("ar") ? "en" : "ar");
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      const from = (location.state as LocationState | null)?.from?.pathname || "/";
      navigate(from, { replace: true });
    } catch (err: unknown) {
      let detail: string | null = null;
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { detail?: string } | undefined;
        detail = data?.detail ?? null;
      }
      setError(detail || t("auth.error_invalid"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md flex justify-end mb-2">
        <Button variant="ghost" size="sm" onClick={toggleLang} title={t("common.language")}>
          <Languages className="h-4 w-4" />
          <span>{i18n.language?.startsWith("ar") ? "EN" : "AR"}</span>
        </Button>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold text-xl">
            R
          </div>
          <CardTitle>{t("auth.title")}</CardTitle>
          <CardDescription>{t("auth.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-username">{t("common.username")}</Label>
              <Input
                id="login-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">{t("common.password")}</Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              <LogIn className="h-4 w-4" />
              {submitting ? t("common.loading") : t("auth.sign_in")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
