import { useRef, useState } from "react";
import type { QuoteTierPackage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Sparkles, Upload, Check, Clock, FileCheck } from "lucide-react";
import type { QuoteLineItem } from "@/lib/quote-line-items";
import { extractOutlineFromFile, isPdfOrBinaryJunk, validateOutlineText } from "@/lib/outline-file-parser";
import { buildReportForTier, generateQuoteFromOutline, type QuoteTierId } from "@/lib/quote-engine";
import { dedupeReportLines } from "@/lib/outline-pages";

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
  paymentTerms?: string;
  onApply: (payload: SmartQuoteApplyPayload) => void;
  onOutlineChange: (v: string) => void;
  onReportChange: (v: string) => void;
  onTierPackagesChange?: (tiers: QuoteTierPackage[]) => void;
  onPaymentTermsChange?: (v: string) => void;
  onLanguageDetected?: (lang: string) => void;
};

const QUOTE_ENGINE_VERSION = "2026.08.15-b";

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
  paymentTerms = "",
  onApply,
  onOutlineChange,
  onReportChange,
  onTierPackagesChange,
  onPaymentTermsChange,
  onLanguageDetected,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);
  const [localTiers, setLocalTiers] = useState<QuoteTierPackage[] | null>(tierPackages);
  const [localSelected, setLocalSelected] = useState(selectedTier);
  const [localReport, setLocalReport] = useState(generatedReport);
  const [parsing, setParsing] = useState(false);
  const [uploadName, setUploadName] = useState<string | null>(null);

  const lang = language === "Arabic" ? "Arabic" : "English";

  const syncTiers = (tiers: QuoteTierPackage[]) => {
    setLocalTiers(tiers);
    onTierPackagesChange?.(tiers);
  };

  const applyGenerateResult = (result: {
    tiers: QuoteTierPackage[];
    recommendedTier: QuoteTierId;
    generatedReport: string;
    paymentTerms?: string;
  }) => {
    syncTiers(result.tiers);
    setLocalSelected(result.recommendedTier);
    const report = dedupeReportLines(result.generatedReport);
    setLocalReport(report);
    onReportChange(report);
    if (result.paymentTerms) {
      onPaymentTermsChange?.(result.paymentTerms);
    }
  };

  const updateTierField = (tierId: QuoteTierId, field: keyof QuoteTierPackage, value: string | number) => {
    if (!localTiers) return;
    syncTiers(
      localTiers.map((tier) => (tier.tier === tierId ? { ...tier, [field]: value } : tier)),
    );
  };

  const runGenerate = (outline: string, detectedLang: string) => {
    validateOutlineText(outline);
    setGenerating(true);
    try {
      const result = generateQuoteFromOutline(
        outline.trim(),
        detectedLang === "Arabic" ? "Arabic" : "English",
      );
      applyGenerateResult(result);
      toast({ title: t("quotes.generated") });
    } catch (err) {
      toast({
        title: t("quotes.generateFailed"),
        description: err instanceof Error ? err.message : t("common.error"),
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const { text, detectedLanguage } = await extractOutlineFromFile(file);
      onOutlineChange(text);
      setUploadName(file.name);
      if (onLanguageDetected) onLanguageDetected(detectedLanguage);
      toast({ title: t("quotes.outlineStored") });
      runGenerate(text, detectedLanguage);
    } catch (err) {
      toast({
        title: t("quotes.uploadFailed"),
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const applyTier = (tier: QuoteTierPackage) => {
    if (!localTiers) return;
    setLocalSelected(tier.tier);
    const report = dedupeReportLines(
      buildReportForTier(localTiers, lang, tier.tier, paymentTerms),
    );
    setLocalReport(report);
    onReportChange(report);

    const milestones =
      lang === "Arabic"
        ? `مراحل التسليم: ${tier.durationLabel}`
        : `Delivery phases: ${tier.durationLabel}`;

    const payload: SmartQuoteApplyPayload = {
      lineItems: tier.lineItems,
      price: tier.price,
      milestones,
      notes: "",
      technicalOutline,
      tierPackages: localTiers,
      selectedTier: tier.tier,
      generatedReport: report,
      paymentTerms: paymentTerms || undefined,
      language,
    };
    onApply(payload);
    toast({ title: t("quotes.tierApplied", { tier: tier.label }) });
  };

  const tiers = localTiers ?? tierPackages;
  const outlineStored = Boolean(technicalOutline.trim()) && !isPdfOrBinaryJunk(technicalOutline);

  return (
    <div className="space-y-5 rounded-lg border border-primary/20 bg-card/40 p-5">
      <div>
        <div className="flex items-center gap-2 text-base font-semibold text-primary">
          <Sparkles className="h-5 w-5" />
          {t("quotes.smartEngine")}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{t("quotes.smartEngineUploadHint")}</p>
        <p className="text-[10px] text-muted-foreground/50 mt-0.5">Engine {QUOTE_ENGINE_VERSION}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md,.csv"
          className="hidden"
          onChange={handleUpload}
        />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={parsing || generating}>
          <Upload className="h-4 w-4 me-2" />
          {parsing ? t("quotes.parsingFile") : t("quotes.uploadOutline")}
        </Button>
        {outlineStored && (
          <Badge variant="secondary" className="gap-1.5 font-normal">
            <FileCheck className="h-3.5 w-3.5 text-primary" />
            {uploadName ?? t("quotes.outlineStored")}
          </Badge>
        )}
        {isPdfOrBinaryJunk(technicalOutline) && (
          <span className="text-xs text-destructive">{t("quotes.pdfBinaryError")}</span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("quotes.outlineBackendHint")}</p>

      {tiers && tiers.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {tiers.map((tier) => (
            <Card
              key={tier.tier}
              className={`flex flex-col ${TIER_STYLES[tier.tier] ?? ""} ${localSelected === tier.tier ? "ring-2 ring-primary" : ""}`}
            >
              <CardHeader className="pb-2 pt-4 px-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    value={tier.label}
                    onChange={(e) => updateTierField(tier.tier, "label", e.target.value)}
                    className="font-semibold text-sm h-8"
                    data-testid={`input-tier-label-${tier.tier}`}
                  />
                  {tier.tier === "med" && (
                    <Badge variant="outline" className="text-[10px] text-primary border-primary/40 shrink-0">
                      {t("quotes.recommended")}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">{t("quotes.itemPrice")}</Label>
                    <Input
                      type="number"
                      value={tier.price || ""}
                      onChange={(e) => updateTierField(tier.tier, "price", Number(e.target.value) || 0)}
                      className="h-8 font-semibold text-primary"
                      data-testid={`input-tier-price-${tier.tier}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">{t("quotes.duration")}</Label>
                    <div className="relative">
                      <Clock className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={tier.durationLabel}
                        onChange={(e) => updateTierField(tier.tier, "durationLabel", e.target.value)}
                        className="h-8 pl-7 text-xs"
                        data-testid={`input-tier-duration-${tier.tier}`}
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <Button
                  type="button"
                  size="sm"
                  variant={localSelected === tier.tier ? "default" : "outline"}
                  className="w-full"
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

      <div className="space-y-2">
        <Label>{t("quotes.generatedReport")}</Label>
        <p className="text-xs text-muted-foreground">{t("quotes.customerReportExportHint")}</p>
        <Textarea
          value={localReport || generatedReport}
          onChange={(e) => {
            setLocalReport(e.target.value);
            onReportChange(e.target.value);
          }}
          rows={14}
          className="min-h-[240px] text-sm font-mono"
          data-testid="input-generated-report"
        />
      </div>
    </div>
  );
}
