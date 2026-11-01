import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useDocAssets, useSaveDocAssets, inkImage } from "@/lib/doc-assets";
import { DEFAULT_MARK_PREFS, type DocMarkPrefs, type MarksChoice, type SignatureChoice } from "@/lib/contract-document";
import { Stamp, Upload, Trash2, Loader2 } from "lucide-react";

type Slot = "stamp" | "signatureAr" | "signatureEn";

/** Settings: company stamp and the manager's signatures, and where they print by default. */
export function DocMarksCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { data } = useDocAssets();
  const save = useSaveDocAssets();
  const [busy, setBusy] = useState<Slot | "prefs" | "">("");
  const inputs = { stamp: useRef<HTMLInputElement>(null), signatureAr: useRef<HTMLInputElement>(null), signatureEn: useRef<HTMLInputElement>(null) };
  const prefs = { ...DEFAULT_MARK_PREFS, ...data?.prefs };

  const run = async (kind: Slot | "prefs", fn: () => Promise<unknown>, done: string) => {
    setBusy(kind);
    try { await fn(); toast({ title: done }); } catch (err) { toast({ title: t("common.error"), description: (err as Error).message, variant: "destructive" }); } finally { setBusy(""); }
  };
  const upload = (slot: Slot) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    await run(slot, async () => save({ [slot]: await inkImage(f) }), t("marks.uploaded"));
  };
  const setPref = (patch: Partial<DocMarkPrefs>) => run("prefs", () => save({ prefs: patch }), t("marks.prefsSaved"));

  const slot = (key: Slot, label: string) => {
    const src = data?.[key] ?? "";
    return (
      <div className="rounded border border-border p-3 space-y-2" data-testid={`mark-${key}`}>
        <Label>{label}</Label>
        <div className="h-28 rounded bg-white flex items-center justify-center overflow-hidden">
          {src ? <img src={src} alt={label} className="max-h-24 max-w-full object-contain" /> : <span className="text-xs text-gray-400">{t("marks.none")}</span>}
        </div>
        {isAdmin && <div className="flex gap-2">
          <input ref={inputs[key]} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={upload(key)} data-testid={`input-${key}`} />
          <Button size="sm" variant="outline" className="flex-1" disabled={!!busy} onClick={() => inputs[key].current?.click()}>
            {busy === key ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : <Upload className="h-4 w-4 me-1" />}{src ? t("marks.replace") : t("marks.upload")}
          </Button>
          {src && <Button size="sm" variant="ghost" className="text-destructive" disabled={!!busy} title={t("common.delete")}
            onClick={() => run(key, () => save({ [key]: "" }), t("marks.removed"))}><Trash2 className="h-4 w-4" /></Button>}
        </div>}
      </div>
    );
  };

  const defaults = (kind: "contracts" | "receipts") => {
    const stampKey = `${kind}Stamp` as const;
    const sigKey = `${kind}Signature` as const;
    return (
      <div className="rounded border border-border p-3 space-y-3" data-testid={`mark-defaults-${kind}`}>
        <div className="text-sm font-semibold">{t(`marks.${kind}`)}</div>
        <label className="flex items-center justify-between gap-2 text-sm">
          {t("marks.printStamp")}
          <Switch checked={prefs[stampKey]} disabled={!isAdmin || !!busy} onCheckedChange={(v) => setPref({ [stampKey]: v })} data-testid={`switch-${kind}-stamp`} />
        </label>
        <div className="flex items-center justify-between gap-2 text-sm">
          {t("marks.printSignature")}
          <Select value={prefs[sigKey]} disabled={!isAdmin || !!busy} onValueChange={(v) => setPref({ [sigKey]: v as SignatureChoice })}>
            <SelectTrigger className="w-40 h-8" data-testid={`select-${kind}-signature`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("marks.sigNone")}</SelectItem>
              <SelectItem value="ar">{t("marks.sigAr")}</SelectItem>
              <SelectItem value="en">{t("marks.sigEn")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  };

  return (
    <Card className="bg-card/60 backdrop-blur" data-testid="doc-marks">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Stamp className="h-5 w-5 text-primary" />{t("marks.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{t("marks.intro")}</p>
        <div className="grid gap-3 md:grid-cols-3">
          {slot("stamp", t("marks.stamp"))}
          {slot("signatureAr", t("marks.signatureAr"))}
          {slot("signatureEn", t("marks.signatureEn"))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {defaults("contracts")}
          {defaults("receipts")}
        </div>
        <p className="text-[11px] text-muted-foreground">{isAdmin ? t("marks.perDocument") : t("marks.adminOnly")}</p>
      </CardContent>
    </Card>
  );
}

/** On one contract / receipt: print the stamp? which signature? (starts from the Settings default) */
export function MarksControl({ kind, value, onChange }: { kind: "contracts" | "receipts"; value?: MarksChoice; onChange: (v: MarksChoice) => void }) {
  const { t } = useTranslation();
  const { data } = useDocAssets();
  const prefs = { ...DEFAULT_MARK_PREFS, ...data?.prefs };
  const stamp = value?.stamp ?? (kind === "contracts" ? prefs.contractsStamp : prefs.receiptsStamp);
  const signature = value?.signature ?? (kind === "contracts" ? prefs.contractsSignature : prefs.receiptsSignature);
  const hasStamp = !!data?.stamp;
  const hasSig = !!(data?.signatureAr || data?.signatureEn);
  return (
    <div className="rounded border border-border p-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" data-testid={`marks-control-${kind}`}>
      <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Stamp className="h-3.5 w-3.5" />{t("marks.onDocument")}</span>
      <label className={`flex items-center gap-2 ${hasStamp ? "" : "opacity-50"}`} title={hasStamp ? undefined : t("marks.uploadFirst")}>
        <Switch checked={stamp && hasStamp} disabled={!hasStamp} onCheckedChange={(v) => onChange({ ...value, stamp: v, signature })} data-testid={`marks-${kind}-stamp`} />
        {t("marks.stamp")}
      </label>
      <div className={`flex items-center gap-2 ${hasSig ? "" : "opacity-50"}`} title={hasSig ? undefined : t("marks.uploadFirst")}>
        {t("marks.signature")}
        <Select value={hasSig ? signature : "none"} disabled={!hasSig} onValueChange={(v) => onChange({ ...value, stamp, signature: v as SignatureChoice })}>
          <SelectTrigger className="w-32 h-8" data-testid={`marks-${kind}-signature`}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("marks.sigNone")}</SelectItem>
            {data?.signatureAr && <SelectItem value="ar">{t("marks.sigAr")}</SelectItem>}
            {data?.signatureEn && <SelectItem value="en">{t("marks.sigEn")}</SelectItem>}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
