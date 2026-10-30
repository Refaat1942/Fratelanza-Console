import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useAiStatus, useAiSettingsActions } from "@/lib/ai-client";
import { Sparkles, Save, Trash2, PlugZap, Loader2, Eye, EyeOff } from "lucide-react";

/** OpenAI key and model used to split packages (kept on the server, never shown in full). */
export function AiSettingsCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { data: status } = useAiStatus();
  const actions = useAiSettingsActions();
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "test" | "remove">("");

  const run = async (kind: "save" | "test" | "remove") => {
    setBusy(kind);
    try {
      if (kind === "test") {
        const r = await actions.test({ apiKey: key.trim() || undefined, model: model.trim() || undefined });
        toast({ title: t("ai.testOk", { model: r.model }) });
      } else if (kind === "remove") {
        await actions.removeKey();
        toast({ title: t("ai.removed") });
      } else {
        await actions.save({ ...(key.trim() ? { apiKey: key.trim() } : {}), ...(model.trim() ? { model: model.trim() } : {}) });
        setKey("");
        toast({ title: t("ai.saved") });
      }
    } catch (err) {
      toast({ title: t("common.error"), description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  return (
    <Card className="bg-card/60 backdrop-blur" data-testid="ai-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 flex-wrap">
          <Sparkles className="h-5 w-5 text-primary" />{t("ai.title")}
          {status && (status.configured
            ? <Badge className="bg-green-500/15 text-green-500 border-green-500/30" data-testid="ai-status">{t("ai.connected")} · {status.keyHint}{status.source === "env" ? ` (${t("ai.fromEnv")})` : ""}</Badge>
            : <Badge variant="outline" className="text-amber-500 border-amber-500/40" data-testid="ai-status">{t("ai.notConnected")}</Badge>)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("ai.intro")}</p>
        {!isAdmin ? <p className="text-xs text-muted-foreground">{t("ai.adminOnly")}</p> : <>
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <div className="space-y-1">
              <Label>{t("ai.apiKey")}</Label>
              <div className="relative">
                <Input type={show ? "text" : "password"} autoComplete="off" spellCheck={false} dir="ltr" value={key} onChange={(e) => setKey(e.target.value)}
                  placeholder={status?.configured ? t("ai.keyKeep") : "sk-..."} className="pe-9" data-testid="input-ai-key" />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">{t("ai.keyHelp")}{" "}
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-primary underline">platform.openai.com/api-keys</a></p>
            </div>
            <div className="space-y-1">
              <Label>{t("ai.model")}</Label>
              <Input dir="ltr" value={model} onChange={(e) => setModel(e.target.value)} placeholder={status?.model ?? "gpt-4o-mini"} data-testid="input-ai-model" />
              <p className="text-[11px] text-muted-foreground">{t("ai.modelHelp", { model: status?.defaultModel ?? "gpt-4o-mini" })}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run("save")} disabled={!!busy || (!key.trim() && !model.trim())} data-testid="button-ai-save">
              {busy === "save" ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}{t("common.save")}
            </Button>
            <Button variant="outline" onClick={() => run("test")} disabled={!!busy || (!key.trim() && !status?.configured)} data-testid="button-ai-test">
              {busy === "test" ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <PlugZap className="me-2 h-4 w-4" />}{t("ai.test")}
            </Button>
            {status?.source === "settings" && (
              <Button variant="ghost" className="text-destructive" onClick={() => run("remove")} disabled={!!busy} data-testid="button-ai-remove">
                <Trash2 className="me-2 h-4 w-4" />{t("ai.remove")}
              </Button>
            )}
          </div>
        </>}
      </CardContent>
    </Card>
  );
}
