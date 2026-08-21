import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { useBranding } from "@/lib/branding-context";
import { setLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Languages } from "lucide-react";

export default function Login() {
  const { t, i18n } = useTranslation();
  const { login } = useAuth();
  const { brandName, tagline, logoDataUrl } = useBranding();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isAr = i18n.language === "ar";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await login(username.trim(), password);
    setBusy(false);
    if (!r.ok) setError(r.error === "SERVER_UNAVAILABLE" ? t("login.serverUnavailable") : (r.error ?? t("login.error")));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4 relative overflow-hidden" dir={isAr ? "rtl" : "ltr"}>
      <motion.div
        className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 6, repeat: Infinity }}
      />
      <motion.div
        className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
        animate={{ scale: [1.1, 1, 1.1], opacity: [0.5, 0.3, 0.5] }}
        transition={{ duration: 7, repeat: Infinity }}
      />

      <button
        onClick={() => setLanguage(isAr ? "en" : "ar")}
        className="absolute top-4 end-4 flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors z-10"
        data-testid="button-lang-toggle"
      >
        <Languages className="h-4 w-4" />
        {isAr ? "English" : "العربية"}
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm rounded-2xl border border-border bg-card/80 backdrop-blur-xl p-8 shadow-2xl relative z-10"
      >
        <div className="flex flex-col items-center mb-6">
          <motion.div
            initial={{ rotate: -180, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
            className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 overflow-hidden"
          >
            {logoDataUrl ? (
              <img src={logoDataUrl} alt={brandName} className="h-full w-full object-cover" />
            ) : (
              <Building2 className="h-7 w-7 text-primary" />
            )}
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-xl font-bold tracking-tight text-primary"
          >
            {brandName}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-sm text-muted-foreground mt-1"
          >
            {tagline || t("login.subtitle")}
          </motion.p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="username">{t("login.username")}</Label>
            <Input id="username" data-testid="input-username" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">{t("login.password")}</Label>
            <Input id="password" data-testid="input-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2"
            >
              {error}
            </motion.div>
          )}
          <Button type="submit" data-testid="button-sign-in" disabled={busy} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
            {busy ? t("login.signingIn") : t("login.signIn")}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
