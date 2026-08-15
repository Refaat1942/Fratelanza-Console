import { useRef, useState } from "react";
import { useGenerateQuoteFromOutline } from "@workspace/api-client-react";
import type { QuoteTierPackage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PrivacyWrapper } from "@/components/privacy-wrapper";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Sparkles, Upload, Check, Clock, Layers } from "lucide-react";
import type { QuoteLineItem } from "@/lib/quote-line-items";

export type SmartQuoteApplyPayload = {
  lineItems: QuoteLineItem[];
  price: number;
  milestones: string;
  notes: string;
  technicalOutline: string;
  tierPackages: QuoteTierPackage[];
  selectedTier: "min" | "med" | "max";
  generatedReport: string;
  paymentTerms?: string;
  language?: string;
};

type Props = {
  language: string;
  technicalOutline: string;
  tierPackages: QuoteTierPackage[] | null;
  selectedTier: "min" | "med" | "max";
  generatedReport: string;
  onApply: (payload: SmartQuoteApplyPayload) => void;
  onOutlineChange: (v: string) => void;
  onReportChange: (v: string) => void;
  onLanguageDetected?: (lang: string) => void;
};

const TIER_STYLES: Record<string, string> = {
  min: "border-blue-500/40 bg-blue-500/5",
  med: "border-primary/50 bg-primary/5 ring-1 ring-primary/30",
  max: "border-amber-500/40 bg-amber-500/5",
};

export function SmartQuotePanel({
  language,
  technicalOutline,
  tierPackages,
  selectedTier,
  generatedReport,
  onApply,
  onOutlineChange,
  onReportChange,
  onLanguageDetected,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const generate = useGenerateQuoteFromOutline();
  const [localTiers, setLocalTiers] = useState<QuoteTierPackage[] | null>(tierPackages);
  const [localSelected, setLocalSelected] = useState(selectedTier);
  const [localReport, setLocalReport] = useState(generatedReport);
  const [parsing, setParsing] = useState(false);
  const [localPaymentTerms, setLocalPaymentTerms] = useState<string | undefined>();

  const applyGenerateResult = (result: {
    tiers: QuoteTierPackage[];
    recommendedTier: "min" | "med" | "max";
    generatedReport: string;
    paymentTerms?: string;
  }) => {
    setLocalTiers(result.tiers);
    setLocalSelected(result.recommendedTier);
    setLocalReport(result.generatedReport);
    setLocalPaymentTerms(result.paymentTerms);
    onReportChange(result.generatedReport);
  };

  const handleGenerate = () => {
    if (!technicalOutline.trim()) {
      toast({ title: t("quotes.outlineRequired"), variant: "destructive" });
      return;
    }
    generate.mutate(
      {
        data: {
          outline: technicalOutline.trim(),
          language: language === "Arabic" ? "Arabic" : "English",
        },
      },
      {
        onSuccess: (result) => {
          applyGenerateResult(result);
          toast({ title: t("quotes.generated") });
        },
        onError: () => toast({ title: t("common.error"), variant: "destructive" }),
      },
    );
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const textTypes = new Set(["txt", "md", "csv"]);
      if (textTypes.has(ext)) {
        const text = await file.text();
        if (text.startsWith("%PDF")) {
          throw new Error(t("quotes.pdfBinaryError"));
        }
        onOutlineChange(text);
        toast({ title: t("quotes.outlineLoaded"), description: file.name });
      } else {
        const r = await fetch(`${apiBase}/quotes/parse-outline-file`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? t("common.error"));
        onOutlineChange(data.text);
        if (data.detectedLanguage && onLanguageDetected) {
          onLanguageDetected(data.detectedLanguage);
        }
        toast({
          title: t("quotes.outlineLoaded"),
          description: `${file.name} — ${data.text.length.toLocaleString()} chars extracted`,
        });
        generate.mutate(
          {
            data: {
              outline: data.text,
              language: data.detectedLanguage === "Arabic" ? "Arabic" : "English",
            },
          },
          {
            onSuccess: (result) => {
              applyGenerateResult(result);
              toast({ title: t("quotes.generatedFromFile") });
            },
            onError: () => toast({ title: t("quotes.parseOkGenerateFailed"), variant: "destructive" }),
          },
        );
      }
    } catch (err) {
      toast({ title: t("quotes.uploadFailed"), description: (err as Error).message, variant: "destructive" });
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const applyTier = (tier: QuoteTierPackage) => {
    if (!localTiers) return;
    setLocalSelected(tier.tier);
    const payload: SmartQuoteApplyPayload = {
      lineItems: tier.lineItems,
      price: tier.price,
      milestones: `Delivery timeline: ${tier.durationLabel}`,
      notes: localReport || generatedReport,
      technicalOutline,
      tierPackages: localTiers,
      selectedTier: tier.tier,
      generatedReport: localReport || generatedReport,
      paymentTerms: localPaymentTerms,
      language,
    };
    onApply(payload);
    toast({ title: t("quotes.tierApplied", { tier: tier.label }) });
  };

  const tiers = localTiers ?? tierPackages;

  return (
    <div className="space-y-4 rounded-lg border border-primary/20 bg-card/40 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Sparkles className="h-4 w-4" />
        {t("quotes.smartEngine")}
      </div>
      <p className="text-xs text-muted-foreground">{t("quotes.smartEngineHint")}</p>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>{t("quotes.technicalOutline")}</Label>
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md,.csv"
              className="hidden"
              onChange={handleUpload}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={parsing}>
              <Upload className="h-3.5 w-3.5 mr-1" />
              {parsing ? t("quotes.parsingFile") : t("quotes.uploadOutline")}
            </Button>
            <Button type="button" size="sm" onClick={handleGenerate} disabled={generate.isPending || parsing}>
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              {generate.isPending ? t("quotes.generating") : t("quotes.generateTiers")}
            </Button>
          </div>
        </div>
        <Textarea
          value={technicalOutline}
          onChange={(e) => onOutlineChange(e.target.value)}
          rows={5}
          placeholder={t("quotes.outlinePlaceholder")}
          data-testid="input-technical-outline"
        />
      </div>

      {tiers && tiers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {tiers.map((tier) => (
            <Card
              key={tier.tier}
              className={`${TIER_STYLES[tier.tier] ?? ""} ${localSelected === tier.tier ? "ring-2 ring-primary" : ""}`}
            >
              <CardHeader className="pb-2 pt-3 px-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">{tier.label}</CardTitle>
                  {tier.tier === "med" && (
                    <Badge variant="outline" className="text-[10px] text-primary border-primary/40">
                      {t("quotes.recommended")}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-2">
                <div className="flex items-center gap-2 text-lg font-bold text-primary">
                  <PrivacyWrapper value={tier.price} />
                  <span className="text-xs font-normal text-muted-foreground">EGP</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> {tier.durationLabel}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" /> {tier.lineItems.length} {t("quotes.scopeItems")}
                </div>
                <ul className="text-xs text-muted-foreground space-y-0.5 max-h-24 overflow-y-auto">
                  {tier.lineItems.slice(0, 4).map((item, i) => (
                    <li key={i} className="truncate">• {item.desc}</li>
                  ))}
                  {tier.lineItems.length > 4 && (
                    <li className="text-primary/70">+{tier.lineItems.length - 4} more</li>
                  )}
                </ul>
                <Button
                  type="button"
                  size="sm"
                  variant={localSelected === tier.tier ? "default" : "outline"}
                  className="w-full mt-1"
                  onClick={() => applyTier(tier)}
                  data-testid={`button-apply-tier-${tier.tier}`}
                >
                  <Check className="h-3.5 w-3.5 mr-1" /> {t("quotes.applyTier")}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {(localReport || generatedReport) && (
        <div className="space-y-1">
          <Label>{t("quotes.generatedReport")}</Label>
          <Textarea
            value={localReport || generatedReport}
            onChange={(e) => {
              setLocalReport(e.target.value);
              onReportChange(e.target.value);
            }}
            rows={6}
            className="font-mono text-xs"
            data-testid="input-generated-report"
          />
          <p className="text-xs text-muted-foreground">{t("quotes.reportEditableHint")}</p>
        </div>
      )}
    </div>
  );
}
