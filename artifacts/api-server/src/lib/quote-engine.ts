export type QuoteTierId = "min" | "med" | "max";

export type QuoteTierLineItem = { desc: string; price: number };

export type QuoteTierPackage = {
  tier: QuoteTierId;
  label: string;
  durationWeeks: number;
  durationLabel: string;
  price: number;
  lineItems: QuoteTierLineItem[];
};

export type QuoteEngineResult = {
  sections: string[];
  tiers: QuoteTierPackage[];
  generatedReport: string;
  recommendedTier: QuoteTierId;
};

const TIER_META: Record<QuoteTierId, { labelEn: string; labelAr: string; priceFactor: number; durationFactor: number; scopeRatio: number }> = {
  min: { labelEn: "Essential", labelAr: "أساسي", priceFactor: 0.65, durationFactor: 0.75, scopeRatio: 0.7 },
  med: { labelEn: "Standard", labelAr: "قياسي", priceFactor: 1, durationFactor: 1, scopeRatio: 1 },
  max: { labelEn: "Premium", labelAr: "متقدم", priceFactor: 1.45, durationFactor: 1.35, scopeRatio: 1 },
};

const BASE_WEEKS_PER_SECTION = 2;
const BASE_PRICE_PER_SECTION = 8000;

function parseOutlineSections(outline: string): string[] {
  const lines = outline
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const sections: string[] = [];
  for (const line of lines) {
    const cleaned = line
      .replace(/^[-*•]\s*/, "")
      .replace(/^\d+[\).\]]\s*/, "")
      .trim();
    if (cleaned.length >= 3) sections.push(cleaned);
  }

  if (sections.length === 0 && outline.trim()) {
    return outline
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 3);
  }

  return sections;
}

function formatDuration(weeks: number, language: "English" | "Arabic"): string {
  const rounded = Math.max(1, Math.round(weeks));
  if (language === "Arabic") return rounded === 1 ? "أسبوع واحد" : `${rounded} أسابيع`;
  return rounded === 1 ? "1 week" : `${rounded} weeks`;
}

function buildTier(
  tier: QuoteTierId,
  sections: string[],
  language: "English" | "Arabic",
): QuoteTierPackage {
  const meta = TIER_META[tier];
  const count = Math.max(1, Math.ceil(sections.length * meta.scopeRatio));
  const picked = sections.slice(0, count);
  const durationWeeks = Math.max(1, picked.length * BASE_WEEKS_PER_SECTION * meta.durationFactor);
  const unitPrice = Math.round((BASE_PRICE_PER_SECTION * meta.priceFactor) / 100) * 100;
  const lineItems = picked.map((desc) => ({ desc, price: unitPrice }));
  const price = lineItems.reduce((s, i) => s + i.price, 0);

  return {
    tier,
    label: language === "Arabic" ? meta.labelAr : meta.labelEn,
    durationWeeks,
    durationLabel: formatDuration(durationWeeks, language),
    price,
    lineItems,
  };
}

function buildReport(sections: string[], tiers: QuoteTierPackage[], language: "English" | "Arabic"): string {
  const header = language === "Arabic" ? "مخطط المشروع المقترح" : "Proposed Project Outline";
  const tierHeader = language === "Arabic" ? "خيارات التسعير والمدة" : "Pricing & Timeline Options";
  const lines = [header, "================", "", ...sections.map((s, i) => `${i + 1}. ${s}`), "", tierHeader, "----------------"];

  for (const tier of tiers) {
    const prefix = language === "Arabic"
      ? `${tier.label}: ${tier.price.toLocaleString()} ج.م — ${tier.durationLabel}`
      : `${tier.label}: EGP ${tier.price.toLocaleString()} — ${tier.durationLabel}`;
    lines.push(prefix);
    for (const item of tier.lineItems) {
      lines.push(`  • ${item.desc}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function generateQuoteFromOutline(
  outline: string,
  language: "English" | "Arabic" = "English",
): QuoteEngineResult {
  const sections = parseOutlineSections(outline);
  const tiers = (["min", "med", "max"] as QuoteTierId[]).map((tier) => buildTier(tier, sections, language));
  return {
    sections,
    tiers,
    generatedReport: buildReport(sections, tiers, language),
    recommendedTier: "med",
  };
}

export function tierPackageToQuoteFields(tier: QuoteTierPackage) {
  return {
    lineItems: tier.lineItems,
    price: tier.price,
    milestones: `Delivery timeline: ${tier.durationLabel}`,
  };
}
