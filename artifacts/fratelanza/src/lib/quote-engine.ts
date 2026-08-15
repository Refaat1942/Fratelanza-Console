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
  paymentTerms?: string;
  projectTitle?: string;
};

const TIER_META: Record<QuoteTierId, { labelEn: string; labelAr: string; priceFactor: number; durationFactor: number; scopeRatio: number }> = {
  min: { labelEn: "Essential (min)", labelAr: "أساسي (min)", priceFactor: 0.65, durationFactor: 0.75, scopeRatio: 0.7 },
  med: { labelEn: "Standard (med)", labelAr: "قياسي (med)", priceFactor: 1, durationFactor: 1, scopeRatio: 1 },
  max: { labelEn: "Premium (max)", labelAr: "متقدم (max)", priceFactor: 1.45, durationFactor: 1.35, scopeRatio: 1 },
};

const BASE_WEEKS_PER_SECTION = 2;
const BASE_PRICE_PER_SECTION = 8000;

import {
  extractMeaningfulSections,
  genericScopeItems,
  isBoilerplateLine,
  isLowQualitySection,
  dedupeReportLines,
  dedupeLines,
} from "@workspace/outline-utils";

function parsePrice(raw: string): number {
  return Number(raw.replace(/,/g, "").replace(/[^\d.]/g, ""));
}

function parseOutlineSections(outline: string): string[] {
  return extractMeaningfulSections(outline);
}

/** Parse numbered scope modules (01 Security, 02 Users, …) from official outlines */
function parseNumberedModules(outline: string): string[] {
  const modules: string[] = [];
  const lines = outline.split(/\r?\n/).map((l) => l.trim());

  for (const line of lines) {
    const inline = line.match(/^(0[1-9]|[1-9]\d)[\.\)\:\-]\s+(.+)$/);
    if (inline) {
      const title = inline[2]!.replace(/\s+/g, " ").trim();
      if (title.length >= 3 && !isBoilerplateLine(title)) {
        modules.push(`${inline[1]}. ${title}`);
      }
    }
  }

  if (modules.length > 0) return modules;

  for (let i = 0; i < lines.length; i++) {
    const numMatch = lines[i]?.match(/^(0[1-9]|[1-9]\d)$/);
    if (!numMatch) continue;
    const num = numMatch[1];
    const title = lines[i + 1]?.trim();
    if (!title || title.length < 2 || /^\d/.test(title)) continue;

    const bullets: string[] = [];
    for (let j = i + 2; j < lines.length && j < i + 6; j++) {
      const line = lines[j]!;
      if (/^(0[1-9]|[1-9]\d)$/.test(line)) break;
      if (line.startsWith(".") || line.length > 4) bullets.push(line.replace(/^\.\s*/, ""));
    }

    const desc = bullets.length > 0
      ? `${title} — ${bullets.slice(0, 2).join("; ")}`
      : title;
    modules.push(`${num}. ${desc}`);
  }

  return modules;
}

function extractTierPrices(outline: string): Partial<Record<QuoteTierId, number>> {
  const prices: Partial<Record<QuoteTierId, number>> = {};

  const lastCommaPrice = (line: string): number | null => {
    const nums = [...line.matchAll(/(\d{1,3}(?:,\d{3})+)/g)];
    if (nums.length === 0) return null;
    const p = parsePrice(nums[nums.length - 1]![1]!);
    return p >= 1000 ? p : null;
  };

  const linesWithTier = (tier: string) =>
    outline.split(/\r?\n/).filter((l) => new RegExp(`\\b${tier}\\b`, "i").test(l));

  for (const tier of ["min", "max"] as QuoteTierId[]) {
    const candidates = linesWithTier(tier);
    const tableLine =
      candidates.find((l) => new RegExp(`^${tier}\\t`, "i").test(l.trim())) ??
      candidates.find((l) => /\d{1,3}(?:,\d{3})+/.test(l));
    if (tableLine) {
      const p = lastCommaPrice(tableLine);
      if (p) prices[tier] = p;
    }
  }

  const medPrices = linesWithTier("med")
    .map((line) => lastCommaPrice(line))
    .filter((p): p is number => p !== null);
  if (medPrices.length > 0) {
    prices.med = Math.max(...medPrices);
  }

  return prices;
}

function extractTierDuration(outline: string, tier: QuoteTierId): { weeks: number; label: string } | null {
  const candidates = outline.split(/\r?\n/).filter((l) => new RegExp(`\\b${tier}\\b`, "i").test(l));
  const tableLine =
    candidates.find((l) => new RegExp(`^${tier}\\t`, "i").test(l.trim())) ??
    candidates.find((l) => /\d+\s*[–\-]\s*\d+/.test(l));
  if (!tableLine) return null;

  const m = tableLine.match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  const avg = (lo + hi) / 2;
  const isWeeks = /أساب|week|عوبس|ﺳأ|ﺳﺎﺑ/i.test(tableLine);
  if (isWeeks || (avg <= 24 && !tableLine.includes("311"))) {
    return { weeks: avg, label: `${lo}–${hi} weeks` };
  }
  return { weeks: Math.max(1, Math.round(avg / 40)), label: `${lo}–${hi} hours (~${Math.max(1, Math.round(avg / 40))} weeks)` };
}

function extractPaymentTerms(outline: string): string | undefined {
  const percents = [...outline.matchAll(/(\d{1,2})\s*%/g)].map((m) => Number(m[1]));
  if (percents.length >= 3 && percents.slice(0, 3).reduce((a, b) => a + b, 0) === 100) {
    return [
      `First payment: ${percents[0]}% upon contract signing and project kick-off`,
      `Second payment: ${percents[1]}% upon milestone completion per delivery plan`,
      `Final payment: ${percents[2]}% upon acceptance and delivery`,
    ].join("\n");
  }
  return undefined;
}

function extractProjectTitle(outline: string): string | undefined {
  const m = outline.match(/(?:مشروع|project)\s*(\d+[\w\s\-]*)/i)
    ?? outline.match(/(\d{2,4}\s*[\u0600-\u06FF\w\s\-]+(?:مشروع|project)[\u0600-\u06FF\w\s\-]*)/i);
  return m?.[1]?.trim();
}

function distributeLineItems(
  sections: string[],
  totalPrice: number,
  tier: QuoteTierId,
  language: "English" | "Arabic",
): QuoteTierLineItem[] {
  const meta = TIER_META[tier];
  const count = Math.max(1, Math.ceil(sections.length * meta.scopeRatio));
  const quality = sections.filter((s) => !isLowQualitySection(s));
  const picked =
    quality.length >= 2
      ? quality.slice(0, count)
      : genericScopeItems(count, language);

  const unit = Math.round(totalPrice / picked.length / 100) * 100 || Math.round(totalPrice / picked.length);
  const items = picked.map((desc) => ({ desc, price: unit }));
  const diff = totalPrice - items.reduce((s, i) => s + i.price, 0);
  if (diff !== 0 && items.length > 0) items[items.length - 1]!.price += diff;
  return items;
}

function buildTierFromExtracted(
  tier: QuoteTierId,
  sections: string[],
  price: number,
  duration: { weeks: number; label: string } | null,
  language: "English" | "Arabic",
): QuoteTierPackage {
  const meta = TIER_META[tier];
  const durationWeeks = duration?.weeks ?? Math.max(1, Math.ceil(sections.length * BASE_WEEKS_PER_SECTION * meta.durationFactor));
  const durationLabel = duration?.label ?? formatDuration(durationWeeks, language);

  return {
    tier,
    label: language === "Arabic" ? meta.labelAr : meta.labelEn,
    durationWeeks,
    durationLabel,
    price,
    lineItems: distributeLineItems(sections, price, tier, language),
  };
}

function tryParseOfficialQuote(outline: string, language: "English" | "Arabic"): QuoteEngineResult | null {
  const hasTiers = /\bmin\b/i.test(outline) && /\bmax\b/i.test(outline);
  const prices = extractTierPrices(outline);
  if (!hasTiers || !prices.min || !prices.max) return null;

  const medPrice = prices.med ?? Math.round((prices.min + prices.max) / 2);
  const modules = parseNumberedModules(outline);
  const sections = modules.length > 0 ? modules : parseOutlineSections(outline);

  const tiers: QuoteTierPackage[] = (["min", "med", "max"] as QuoteTierId[]).map((tier) => {
    const price = tier === "min" ? prices.min! : tier === "max" ? prices.max! : medPrice;
    const duration = extractTierDuration(outline, tier);
    return buildTierFromExtracted(tier, sections, price, duration, language);
  });

  const paymentTerms = extractPaymentTerms(outline);
  const projectTitle = extractProjectTitle(outline);

  return {
    sections,
    tiers,
    generatedReport: buildReport(sections, tiers, language, projectTitle, paymentTerms, "med"),
    recommendedTier: "med",
    paymentTerms,
    projectTitle,
  };
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
  const quality = sections.filter((s) => !isLowQualitySection(s));
  const scope = quality.length >= 2 ? quality : genericScopeItems(Math.max(3, sections.length), language);
  const count = Math.max(1, Math.ceil(scope.length * meta.scopeRatio));
  const picked = scope.slice(0, count);
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

function buildCustomerReport(
  tiers: QuoteTierPackage[],
  language: "English" | "Arabic",
  options: {
    projectTitle?: string;
    paymentTerms?: string;
    focusTier?: QuoteTierId;
  } = {},
): string {
  const focusTier = options.focusTier ?? "med";
  const focus = tiers.find((t) => t.tier === focusTier) ?? tiers[1] ?? tiers[0]!;
  const lines: string[] = [];

  if (options.projectTitle) {
    lines.push(options.projectTitle, "");
  }

  const pricingHeader = language === "Arabic" ? "التسعير والمدة" : "Pricing & Timeline";
  lines.push(pricingHeader, "────────────────────");
  for (const tier of tiers) {
    const row =
      language === "Arabic"
        ? `${tier.label}: ${tier.price.toLocaleString()} ج.م — ${tier.durationLabel}`
        : `${tier.label}: EGP ${tier.price.toLocaleString()} — ${tier.durationLabel}`;
    lines.push(row);
  }
  lines.push("");

  const scopeHeader =
    language === "Arabic"
      ? `نطاق العمل (${focus.label})`
      : `Scope of Work (${focus.label})`;
  lines.push(scopeHeader, "────────────────────");

  const scopeItems = dedupeLines(
    focus.lineItems
      .map((i) => i.desc.trim())
      .filter((d) => d.length > 0 && !isLowQualitySection(d)),
  );
  for (const item of scopeItems) {
    lines.push(`• ${item}`);
  }

  if (options.paymentTerms?.trim()) {
    lines.push(
      "",
      language === "Arabic" ? "شروط الدفع" : "Payment Terms",
      "────────────────────",
      options.paymentTerms.trim(),
    );
  }

  return dedupeReportLines(lines.join("\n"));
}

export function buildReportForTier(
  tiers: QuoteTierPackage[],
  language: "English" | "Arabic",
  tierId: QuoteTierId,
  paymentTerms?: string,
  projectTitle?: string,
): string {
  return buildCustomerReport(tiers, language, { focusTier: tierId, paymentTerms, projectTitle });
}

function buildReport(
  _sections: string[],
  tiers: QuoteTierPackage[],
  language: "English" | "Arabic",
  projectTitle?: string,
  paymentTerms?: string,
  recommendedTier: QuoteTierId = "med",
): string {
  return buildCustomerReport(tiers, language, {
    projectTitle,
    paymentTerms,
    focusTier: recommendedTier,
  });
}

export function generateQuoteFromOutline(
  outline: string,
  language: "English" | "Arabic" = "English",
): QuoteEngineResult {
  const official = tryParseOfficialQuote(outline, language);
  if (official) return official;

  const modules = parseNumberedModules(outline);
  const sections = modules.length > 0 ? modules : parseOutlineSections(outline);
  const tiers = (["min", "med", "max"] as QuoteTierId[]).map((tier) => buildTier(tier, sections, language));
  const paymentTerms = extractPaymentTerms(outline);
  return {
    sections,
    tiers,
    generatedReport: buildReport(sections, tiers, language, undefined, paymentTerms, "med"),
    recommendedTier: "med",
    paymentTerms,
  };
}

export function tierPackageToQuoteFields(tier: QuoteTierPackage) {
  return {
    lineItems: tier.lineItems,
    price: tier.price,
    milestones: `Delivery timeline: ${tier.durationLabel}`,
  };
}
