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
import { Sparkles, Upload, Check, Clock, Plus, X } from "lucide-react";
import type { QuoteLineItem } from "@/lib/quote-line-items";
import { extractOutlineFromFile, isPdfOrBinaryJunk, validateOutlineText } from "@/lib/outline-file-parser";
import { generateQuoteFromOutline, type QuoteTierId } from "@/lib/quote-engine";

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

const TIER_STYLES: Record<string, string> = {
  min: "border-blue-500/40 bg-blue-500/5",
  med: "border-primary/50 bg-primary/5 ring-1 ring-primary/30",
  max: "border-amber-500/40 bg-amber-500/5",
};

function sumLineItems(items: QuoteLineItem[]): number {
  return items.reduce((s, i) => s + Number(i.price || 0), 0);
}

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
  const [localPaymentTerms, setLocalPaymentTerms] = useState(paymentTerms);

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
    setLocalReport(result.generatedReport);
    onReportChange(result.generatedReport);
    if (result.paymentTerms) {
      setLocalPaymentTerms(result.paymentTerms);
      onPaymentTermsChange?.(result.paymentTerms);
    }
  };

  const updateTierField = (tierId: QuoteTierId, field: keyof QuoteTierPackage, value: string | number) => {
    if (!localTiers) return;
    syncTiers(
      localTiers.map((t) => (t.tier === tierId ? { ...t, [field]: value } : t)),
    );
  };

  const updateTierLine = (tierId: QuoteTierId, index: number, field: "desc" | "price", value: string) => {
    if (!localTiers) return;
    syncTiers(
      localTiers.map((tier) => {
        if (tier.tier !== tierId) return tier;
        const lineItems = tier.lineItems.map((item, i) =>
          i === index
            ? field === "desc"
              ? { ...item, desc: value }
              : { ...item, price: value === "" ? 0 : Number(value) }
            : item,
        );
        return { ...tier, lineItems, price: sumLineItems(lineItems) };
      }),
    );
  };

  const addTierLine = (tierId: QuoteTierId) => {
    if (!localTiers) return;
    syncTiers(
      localTiers.map((tier) => {
        if (tier.tier !== tierId) return tier;
        const lineItems = [...tier.lineItems, { desc: "", price: 0 }];
        return { ...tier, lineItems, price: sumLineItems(lineItems) };
      }),
    );
  };

  const removeTierLine = (tierId: QuoteTierId, index: number) => {
    if (!localTiers) return;
    syncTiers(
      localTiers.map((tier) => {
        if (tier.tier !== tierId) return tier;
        const lineItems = tier.lineItems.filter((_, i) => i !== index);
        return { ...tier, lineItems, price: sumLineItems(lineItems) };
      }),
    );
  };

  const recalcTierTotal = (tierId: QuoteTierId) => {
    if (!localTiers) return;
    syncTiers(
      localTiers.map((tier) =>
        tier.tier === tierId ? { ...tier, price: sumLineItems(tier.lineItems) } : tier,
      ),
    );
  };

  const runGenerate = (outline: string, lang: string) => {
    validateOutlineText(outline);
    setGenerating(true);
    try {
      const result = generateQuoteFromOutline(
        outline.trim(),
        lang === "Arabic" ? "Arabic" : "English",
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

  const handleGenerate = () => {
    if (!technicalOutline.trim()) {
      toast({ title: t("quotes.outlineRequired"), variant: "destructive" });
      return;
    }
    if (isPdfOrBinaryJunk(technicalOutline)) {
      toast({
        title: t("quotes.uploadFailed"),
        description: t("quotes.pdfBinaryError"),
        variant: "destructive",
      });
      return;
    }
    runGenerate(technicalOutline.trim(), language);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const { text, detectedLanguage } = await extractOutlineFromFile(file);
      onOutlineChange(text);
      if (onLanguageDetected) onLanguageDetected(detectedLanguage);
      toast({
        title: t("quotes.outlineLoaded"),
        description: `${file.name} — ${text.length.toLocaleString()} chars`,
      });
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
    const payload: SmartQuoteApplyPayload = {
      lineItems: tier.lineItems,
      price: tier.price,
      milestones: tier.durationLabel
        ? `Delivery timeline: ${tier.durationLabel}`
        : "",
      notes: localReport || generatedReport,
      technicalOutline,
      tierPackages: localTiers,
      selectedTier: tier.tier,
      generatedReport: localReport || generatedReport,
      paymentTerms: localPaymentTerms || undefined,
      language,
    };
    onApply(payload);
    toast({ title: t("quotes.tierApplied", { tier: tier.label }) });
  };

  const tiers = localTiers ?? tierPackages;

  return (
    <div className="space-y-5 rounded-lg border border-primary/20 bg-card/40 p-5">
      <div>
        <div className="flex items-center gap-2 text-base font-semibold text-primary">
          <Sparkles className="h-5 w-5" />
          {t("quotes.smartEngine")}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{t("quotes.smartEngineHint")}</p>
        <p className="text-xs text-muted-foreground mt-1">{t("quotes.allEditableHint")}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Label className="text-sm">{t("quotes.technicalOutline")}</Label>
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
            <Button type="button" size="sm" onClick={handleGenerate} disabled={generating || parsing}>
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              {generating || parsing ? t("quotes.generating") : t("quotes.generateTiers")}
            </Button>
          </div>
        </div>
        <Textarea
          value={technicalOutline}
          onChange={(e) => onOutlineChange(e.target.value)}
          rows={8}
          placeholder={t("quotes.outlinePlaceholder")}
          data-testid="input-technical-outline"
          className={`min-h-[160px] text-sm ${isPdfOrBinaryJunk(technicalOutline) ? "border-destructive" : ""}`}
        />
        {isPdfOrBinaryJunk(technicalOutline) && (
          <p className="text-xs text-destructive">{t("quotes.pdfBinaryError")}</p>
        )}
      </div>

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
                      onBlur={() => recalcTierTotal(tier.tier)}
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
              <CardContent className="px-4 pb-4 flex-1 flex flex-col gap-2">
                <Label className="text-xs font-semibold">{t("quotes.lineItems")}</Label>
                <div className="space-y-1.5 flex-1 max-h-[280px] overflow-y-auto pr-1">
                  {tier.lineItems.map((item, i) => (
                    <div key={i} className="flex gap-1.5 items-start">
                      <Input
                        value={item.desc}
                        onChange={(e) => updateTierLine(tier.tier, i, "desc", e.target.value)}
                        placeholder={t("quotes.itemDescription")}
                        className="flex-1 text-xs min-h-8"
                        data-testid={`input-tier-${tier.tier}-desc-${i}`}
                      />
                      <Input
                        type="number"
                        value={item.price === 0 ? "" : item.price}
                        onChange={(e) => updateTierLine(tier.tier, i, "price", e.target.value)}
                        placeholder="EGP"
                        className="w-20 text-xs min-h-8"
                        data-testid={`input-tier-${tier.tier}-price-${i}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeTierLine(tier.tier, i)}
                        className="p-1.5 text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={() => addTierLine(tier.tier)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> {t("quotes.addItem")}
                </Button>
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

      <div className="space-y-2">
        <Label>{t("quotes.generatedReport")}</Label>
        <Textarea
          value={localReport || generatedReport}
          onChange={(e) => {
            setLocalReport(e.target.value);
            onReportChange(e.target.value);
          }}
          rows={10}
          className="min-h-[200px] text-sm"
          data-testid="input-generated-report"
        />
      </div>

      <div className="space-y-2">
        <Label>{t("quotes.paymentTerms")}</Label>
        <Textarea
          value={localPaymentTerms || paymentTerms}
          onChange={(e) => {
            setLocalPaymentTerms(e.target.value);
            onPaymentTermsChange?.(e.target.value);
          }}
          rows={4}
          className="text-sm min-h-[100px]"
          placeholder={t("quotes.paymentTermsPlaceholder")}
          data-testid="input-tier-payment-terms"
        />
      </div>
    </div>
  );
}
