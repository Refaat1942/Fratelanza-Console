import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useBranding, ACCENT_PRESETS } from "@/lib/branding-context";
import { setLanguage } from "@/lib/i18n";
import { useTheme } from "@/lib/theme-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Upload, Trash2, RotateCcw, Check, Sun, Moon, Languages } from "lucide-react";

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { brandName, tagline, logoDataUrl, accentHsl, setBranding, resetBranding } = useBranding();
  const { theme, toggleTheme } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(brandName);
  const [tag, setTag] = useState(tagline);

  const onLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 2 MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBranding({ logoDataUrl: String(reader.result) });
      toast({ title: t("branding.saved") });
    };
    reader.readAsDataURL(f);
  };

  const saveText = () => {
    setBranding({ brandName: name.trim() || "FRATELANZA", tagline: tag });
    toast({ title: t("branding.saved") });
  };

  const isAr = i18n.language === "ar";

  return (
    <div className="space-y-6 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="bg-card/60 backdrop-blur">
          <CardHeader>
            <CardTitle>{t("branding.settings")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Logo */}
            <div className="flex items-center gap-6 flex-wrap">
              <div className="h-24 w-24 rounded-2xl bg-primary/10 border border-border flex items-center justify-center overflow-hidden shrink-0">
                {logoDataUrl ? (
                  <img src={logoDataUrl} alt="logo" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-primary">{(name || "F").charAt(0)}</span>
                )}
              </div>
              <div className="flex-1 min-w-[220px] space-y-2">
                <Label>{t("branding.logo")}</Label>
                <p className="text-xs text-muted-foreground">{t("branding.logoHint")}</p>
                <div className="flex gap-2 flex-wrap">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onLogo} />
                  <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="button-upload-logo">
                    <Upload className="me-2 h-4 w-4" /> {t("branding.uploadLogo")}
                  </Button>
                  {logoDataUrl && (
                    <Button variant="outline" onClick={() => setBranding({ logoDataUrl: null })}>
                      <Trash2 className="me-2 h-4 w-4" /> {t("branding.removeLogo")}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Brand text */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t("branding.brandName")}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-brand-name" />
              </div>
              <div className="space-y-1">
                <Label>{t("branding.tagline")}</Label>
                <Input value={tag} onChange={(e) => setTag(e.target.value)} data-testid="input-tagline" />
              </div>
            </div>
            <div>
              <Button onClick={saveText} data-testid="button-save-brand">
                <Check className="me-2 h-4 w-4" /> {t("common.save")}
              </Button>
            </div>

            <Separator />

            {/* Accent color */}
            <div className="space-y-3">
              <Label>{t("branding.accentColor")} — {t("branding.colorPresets")}</Label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {ACCENT_PRESETS.map((p) => {
                  const active = p.hsl === accentHsl;
                  return (
                    <button
                      key={p.hsl}
                      onClick={() => { setBranding({ accentHsl: p.hsl }); toast({ title: t("branding.saved") }); }}
                      className={`group flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all ${active ? "border-primary shadow-lg shadow-primary/20" : "border-border hover:border-primary/40"}`}
                      data-testid={`button-accent-${p.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <div
                        className="h-10 w-10 rounded-full ring-2 ring-background"
                        style={{ background: `hsl(${p.hsl})` }}
                      />
                      <span className="text-[11px] font-medium">{p.name}</span>
                      {active && <Check className="absolute h-3 w-3 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Quick toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button variant="outline" onClick={toggleTheme} className="justify-start" data-testid="button-toggle-theme-settings">
                {theme === "dark" ? <Sun className="me-2 h-4 w-4" /> : <Moon className="me-2 h-4 w-4" />}
                {theme === "dark" ? t("theme.light") : t("theme.dark")}
              </Button>
              <Button variant="outline" onClick={() => setLanguage(isAr ? "en" : "ar")} className="justify-start" data-testid="button-toggle-lang-settings">
                <Languages className="me-2 h-4 w-4" />
                {isAr ? "English" : "العربية"}
              </Button>
            </div>

            <Separator />

            <div>
              <Button
                variant="outline"
                onClick={() => {
                  if (confirm(t("branding.resetConfirm"))) {
                    resetBranding();
                    setName("FRATELANZA");
                    setTag("Management Console");
                    toast({ title: t("common.success") });
                  }
                }}
                data-testid="button-reset-branding"
              >
                <RotateCcw className="me-2 h-4 w-4" /> {t("common.reset")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
