import defaultLogo from "@/assets/fratelanza-logo.png?inline";
import { COMPANY, amountToArabicWords, computeStages, formatMoney, today } from "@/lib/contract-document";
import { featureOf, type Requirement } from "@/lib/requirements-match";
import { hasOwnPhases, looksLikeSpec, renderSpec, type SpecItem } from "@/lib/spec-document";
import {
  EXTERNAL_FEES_NOTE, MILESTONES, PRICE_NOTE, PROVIDES, STAGES, TIERS, TIER_NAME,
  serviceByKey, isCustomService, type Milestone, type Tier,
} from "@/lib/service-catalog";

/* ───────────────────────── Data ───────────────────────── */

export type Lang = "ar" | "en";

export type ProposalCustomer = {
  company: string;
  contactName: string;
  contactTitle: string;
  phone: string;
  email: string;
  address: string;
  /** Client's line of business, e.g. "pharmacy chain", "real estate developer" */
  business: string;
  /** What the client needs, in a sentence */
  needs: string;
};

export type ProposalData = {
  date: string;
  validDays: number;
  language: Lang;
  customer: ProposalCustomer;
  serviceKey: string;
  /** Package the customer chose ("" = offer the packages without choosing one) */
  tier: Tier | "";
  /** Which packages appear in the documents */
  included: Record<Tier, boolean>;
  /** @deprecated older saves; replaced by `included` */
  showAllPackages?: boolean;
  /** Package prices for this client (start from the guide prices) */
  prices: Record<Tier, number>;
  /** @deprecated older saves: agreed price of the chosen package (now edited in `prices`) */
  finalPrice?: number;
  /** Discount on the chosen package */
  discountType: "none" | "percent" | "amount";
  discountValue: number;
  /** Extra notes printed on both documents */
  notes: string;
  /** Customer requirements as typed (one per line) */
  requirementsText: string;
  /** Each requirement with how it is delivered (package feature or additional development) */
  requirements: Requirement[];
  /** Custom project: price of the whole scope (requirement prices are added on top) */
  projectPrice: number;
  /** Name of the uploaded requirements document, if any */
  sourceFile: string;
  /** quote = sales quotation, technical = technical proposal (older saves had both in one) */
  kind?: "quote" | "technical";
  /**
   * Technical proposal scope: "spec" prints the specification document as written
   * (headings, paragraphs, lists, tables); "matched" lists requirements against the packages.
   */
  scopeMode?: "spec" | "matched";
  /** Project name from the specification title, shown in the header */
  projectTitle?: string;
  /** Package contents taken from the specification (each item's first package) */
  tierItems?: SpecItem[];
  /** Payment milestones of this quotation (default 30 / 30 / 30 / 10) */
  milestones?: Milestone[];
  /** Quotation: the technical proposal its packages were read from */
  technicalId?: number | null;
};

export function defaultProposal(serviceKey = "websites"): ProposalData {
  return {
    date: today(),
    validDays: 15,
    language: "ar",
    customer: { company: "", contactName: "", contactTitle: "", phone: "", email: "", address: "", business: "", needs: "" },
    serviceKey,
    tier: "business",
    included: { starter: true, business: true, enterprise: true },
    prices: guidePrices(serviceKey),
    discountType: "none",
    discountValue: 0,
    notes: "",
    requirementsText: "",
    requirements: [],
    projectPrice: 0,
    sourceFile: "",
  };
}

export function guidePrices(serviceKey: string): Record<Tier, number> {
  const s = serviceByKey(serviceKey);
  return Object.fromEntries(TIERS.map((t) => [t, s.packages.find((p) => p.tier === t)?.price ?? 0])) as Record<Tier, number>;
}

/**
 * Suggested package prices when the service has none (a custom project built
 * from a specification): the Management & ERP guide prices, scaled by how many
 * items each package covers (about 15 items ≈ the guide price), rounded to 1,000.
 */
export function suggestedPrices(d: Pick<ProposalData, "serviceKey" | "tierItems">): Record<Tier, number> {
  const guide = guidePrices(d.serviceKey);
  if (TIERS.some((t) => guide[t] > 0)) return guide;
  const base = guidePrices("erp");
  const items = d.tierItems ?? [];
  const cumulative = (tier: Tier) => items.filter((x) => TIERS.indexOf(x.tier) <= TIERS.indexOf(tier)).length;
  const scale = (n: number, ref: number) => Math.min(2.5, Math.max(0.75, n / ref));
  const refs: Record<Tier, number> = { starter: 6, business: 11, enterprise: 15 };
  return Object.fromEntries(TIERS.map((t) => {
    const factor = items.length ? scale(cumulative(t), refs[t]) : 1;
    return [t, Math.round((base[t] * factor) / 1000) * 1000];
  })) as Record<Tier, number>;
}

/** Fill in prices that are still 0 with the suggested ones. */
export function withSuggestedPrices(d: ProposalData): Record<Tier, number> {
  const s = suggestedPrices(d);
  return Object.fromEntries(TIERS.map((t) => [t, Number(d.prices[t]) > 0 ? Number(d.prices[t]) : s[t]])) as Record<Tier, number>;
}

/** The quotation's payment milestones (its own, or the default 30 / 30 / 30 / 10). */
export function milestonesOf(d: Pick<ProposalData, "milestones">): Milestone[] {
  return d.milestones?.length ? d.milestones : MILESTONES;
}

/** Packages built from the specification's own items? */
export function hasSpecTiers(d: Pick<ProposalData, "tierItems">): boolean {
  return (d.tierItems?.length ?? 0) > 0;
}

/** Priced as one custom project (no packages)? */
export function isSinglePrice(d: Pick<ProposalData, "serviceKey" | "tierItems">): boolean {
  return isCustomService(d.serviceKey) && !hasSpecTiers(d);
}

/** What a package adds over the one before it: specification items, or the catalog features. */
export function packageContents(d: ProposalData, tier: Tier): { title: string; detail: string }[] {
  const lang = d.language;
  if (hasSpecTiers(d)) {
    return (d.tierItems ?? []).filter((x) => x.tier === tier)
      .map((x) => ({ title: x.text, detail: x.section && x.section !== x.text ? x.section : "" }));
  }
  const pkg = serviceByKey(d.serviceKey).packages.find((p) => p.tier === tier);
  return (pkg?.features ?? []).map((f) => ({ title: lang === "ar" ? f.ar : f.en, detail: lang === "ar" ? f.dAr : f.dEn }));
}

/** Spec mode unless chosen otherwise: structured documents print as written. */
export function scopeModeOf(d: Pick<ProposalData, "scopeMode" | "requirementsText">): "spec" | "matched" {
  return d.scopeMode ?? (looksLikeSpec(d.requirementsText ?? "") ? "spec" : "matched");
}

/** Bring an older saved proposal up to the current shape. */
export function normalizeProposal(d: ProposalData): ProposalData {
  const out = { ...d, prices: { ...d.prices } };
  if (!out.included) {
    out.included = out.showAllPackages === false && out.tier
      ? { starter: out.tier === "starter", business: out.tier === "business", enterprise: out.tier === "enterprise" }
      : { starter: true, business: true, enterprise: true };
  }
  if (out.tier && Number(out.finalPrice) > 0) out.prices[out.tier] = Number(out.finalPrice);
  delete out.finalPrice;
  delete out.showAllPackages;
  out.discountType ??= "none";
  out.discountValue = Number(out.discountValue) || 0;
  out.requirementsText ??= "";
  out.requirements = Array.isArray(out.requirements) ? out.requirements : [];
  out.projectPrice = Number(out.projectPrice) || 0;
  out.sourceFile ??= "";
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Requirements outside the packages, priced one by one. */
export function extraItems(d: ProposalData) {
  return (d.requirements ?? []).filter((r) => r.match === "extra");
}

/** Package price + additional requirements → discount → total. */
export function proposalTotals(d: ProposalData, tier: Tier | "" = d.tier) {
  const packagePrice = isSinglePrice(d) ? Math.max(0, Number(d.projectPrice) || 0)
    : tier ? Math.max(0, Number(d.prices[tier] ?? 0)) : 0;
  const extras = r2(extraItems(d).reduce((s, r) => s + Math.max(0, Number(r.price) || 0), 0));
  const subtotal = r2(packagePrice + extras);
  const v = Math.max(0, Number(d.discountValue) || 0);
  const discount = d.discountType === "percent" ? r2((subtotal * Math.min(v, 100)) / 100)
    : d.discountType === "amount" ? Math.min(v, subtotal) : 0;
  return { packagePrice, extras, subtotal, discount, discountPct: subtotal ? r2((discount / subtotal) * 100) : 0, total: r2(subtotal - discount) };
}

/** What the customer pays for the chosen package (after discount). */
export function proposalAmount(d: ProposalData): number {
  return proposalTotals(d).total;
}

/* ───────────────────────── Text ───────────────────────── */

const T = {
  ar: {
    quote: "عرض سعر", technical: "العرض الفني", date: "التاريخ", validUntil: "صالح حتى",
    preparedFor: "مقدم إلى", company: "العميل / الشركة", contact: "مسؤول التواصل", business: "مجال النشاط",
    phone: "الهاتف", email: "البريد الإلكتروني", address: "العنوان",
    dear: (n: string) => `السادة / ${n} المحترمين،`, greeting: "تحية طيبة وبعد،",
    benefitsTitle: "كيف يخدم الحل نشاطكم", packagesTitle: "الباقات والأسعار", packageCol: "الباقة", includesCol: "المحتويات", priceCol: "السعر",
    recommended: "الباقة المختارة", egp: "ج.م",
    totalTitle: "قيمة العرض", totalFor: (p: string) => `إجمالي قيمة باقة ${p}`, words: "فقط",
    priceOf: (p: string) => `سعر باقة ${p}`, discount: "الخصم", totalAfter: "الإجمالي بعد الخصم",
    scopeTitle: "نطاق العمل والتكلفة", projectValue: "قيمة تنفيذ المشروع", itemsSum: "بنود مسعّرة منفصلة", inProject: "ضمن قيمة المشروع",
    specPackagesTitle: "الباقات المقترحة ومحتوياتها", specPackagesIntro: "تم تقسيم بنود المواصفات على ثلاث باقات، كل باقة تشمل محتويات الباقة السابقة وتضيف إليها، ليختار العميل ما يناسبه.", sectionCol: "القسم",
    specTitle: "نطاق العمل والمواصفات الفنية", specIntro: (p: string) => `يوضح هذا العرض الفني المواصفات الفنية ونطاق العمل لمشروع «${p}»، وتفاصيل كل جزء منه، ومراحل التنفيذ والتسليم، ويُعد مكملاً لعرض السعر وللعقد عند التعاقد.`,
    scopeTechTitle: "نطاق العمل التفصيلي", fromDoc: (f: string) => `وفقاً لمستند المتطلبات المقدم من العميل (${f})، يشمل نطاق العمل البنود التالية:`, scopeIntro: "يشمل نطاق العمل البنود التالية حسب متطلبات العميل:",
    general: "متطلبات عامة",
    compareTitle: "قيمة العرض لكل باقة", itemCol: "البند", packagePriceRow: "سعر الباقة",
    chooseNote: "يختار العميل الباقة المناسبة له، وتُحسب الدفعات وفق قيمة الباقة المختارة.",
    extrasTitle: "متطلبات إضافية خارج الباقة", extrasSum: "المتطلبات الإضافية", subtotal: "الإجمالي قبل الخصم", grandTotal: "الإجمالي",
    reqTitle: "متطلبات العميل والحل المقترح", reqCol: "المتطلب", solutionCol: "الحل المقترح", inCol: "ضمن", extraLabel: "تطوير إضافي",
    extraDetail: "تطوير خاص لهذا المتطلب ضمن نطاق المشروع، ويُسعّر منفصلاً في العرض المالي.",
    reqIntro: "تم تحليل متطلبات العميل وربط كل متطلب بالبند الذي يحققه في الباقات، مع تحديد المتطلبات التي تحتاج إلى تطوير إضافي.",
    milestonesTitle: "مراحل الدفع", stageCol: "المرحلة", pctCol: "النسبة", amountCol: "المبلغ", total: "الإجمالي",
    providesTitle: "المزايا التي تقدمها الشركة", notesTitle: "ملاحظات مهمة",
    validity: (d: number) => `هذا العرض صالح لمدة ${d} يوماً من تاريخه.`,
    overviewTitle: "نبذة عن المشروع", needs: "احتياج العميل", contentsTitle: "الباقات وتفاصيل المحتويات",
    plus: (p: string) => `تشمل جميع محتويات باقة ${p}، بالإضافة إلى:`, featureCol: "البند", detailCol: "التفاصيل",
    stagesTitle: "مراحل التنفيذ", approvalTitle: "الاعتماد", forCompany: "عن شركة فراتيلانزا", forClient: "اعتماد العميل",
    name: "الاسم", signature: "التوقيع", sigDate: "التاريخ", manager: "المدير العام", title: "الصفة",
    firstParty: "الطرف الأول (الجهة المنفذة)", secondParty: "الطرف الثاني (العميل)",
    yourBusiness: "نشاطكم", contactLine: "للتواصل",
    intro: (svc: string, company: string, business: string, needs: string) =>
      `يسعد شركة فراتيلانزا للتدريب والبرمجة وحلول الذكاء الاصطناعي أن تتقدم إليكم بهذا العرض الخاص بخدمة «${svc}»`
      + (needs ? `، لتنفيذ ${needs}` : "")
      + (business ? `، بما يتناسب مع طبيعة عمل ${company || "شركتكم"} في مجال ${business}` : "")
      + `، مع الالتزام بأعلى معايير الجودة والتسليم في المواعيد المتفق عليها.`,
    techIntroCustom: (company: string) =>
      `يوضح هذا العرض الفني نطاق العمل المقترح لتنفيذ المشروع البرمجي الخاص بـ ${company || "العميل"} وتفاصيل بنوده، ومراحل التنفيذ والتسليم، ويُعد مكملاً لعرض السعر وللعقد عند التعاقد.`,
    techIntro: (svc: string, company: string) =>
      `يوضح هذا العرض الفني محتويات باقات خدمة «${svc}» المقدمة إلى ${company || "العميل"}، وتفاصيل كل بند، ومراحل التنفيذ والتسليم، ويُعد مكملاً لعرض السعر وللعقد عند التعاقد.`,
  },
  en: {
    quote: "Sales Quotation", technical: "Technical Proposal", date: "Date", validUntil: "Valid until",
    preparedFor: "Prepared for", company: "Client / Company", contact: "Contact person", business: "Line of business",
    phone: "Phone", email: "Email", address: "Address",
    dear: (n: string) => `Dear ${n},`, greeting: "",
    benefitsTitle: "How this solution serves your business", packagesTitle: "Packages & prices", packageCol: "Package", includesCol: "Includes", priceCol: "Price",
    recommended: "Selected", egp: "EGP",
    totalTitle: "Quotation value", totalFor: (p: string) => `Total for the ${p} package`, words: "",
    priceOf: (p: string) => `${p} package price`, discount: "Discount", totalAfter: "Total after discount",
    scopeTitle: "Scope of work and cost", projectValue: "Project delivery price", itemsSum: "Separately priced items", inProject: "Included in project price",
    specPackagesTitle: "Proposed packages and their contents", specPackagesIntro: "The specification items are split into three packages; each one includes the previous package and adds to it, so the client can choose what suits them.", sectionCol: "Section",
    specTitle: "Scope of work and technical specification", specIntro: (p: string) => `This technical proposal sets out the technical specification and scope of work for "${p}", the details of each part, and the delivery stages. It complements the sales quotation and forms part of the contract once signed.`,
    scopeTechTitle: "Detailed scope of work", fromDoc: (f: string) => `Based on the requirements document provided by the client (${f}), the scope of work covers:`, scopeIntro: "The scope of work covers the following, per the client's requirements:",
    general: "General requirements",
    compareTitle: "Quotation value per package", itemCol: "Item", packagePriceRow: "Package price",
    chooseNote: "The client chooses the package that suits them; payments follow the value of the chosen package.",
    extrasTitle: "Additional requirements (outside the package)", extrasSum: "Additional requirements", subtotal: "Subtotal", grandTotal: "Total",
    reqTitle: "Customer requirements and proposed solution", reqCol: "Requirement", solutionCol: "Proposed solution", inCol: "In", extraLabel: "Additional development",
    extraDetail: "Custom development for this requirement within the project scope, priced separately in the financial proposal.",
    reqIntro: "We analysed the customer's requirements and linked each one to the package item that delivers it, and flagged those that need additional development.",
    milestonesTitle: "Payment milestones", stageCol: "Milestone", pctCol: "Share", amountCol: "Amount", total: "Total",
    providesTitle: "What we provide", notesTitle: "Important notes",
    validity: (d: number) => `This quotation is valid for ${d} days from its date.`,
    overviewTitle: "Project overview", needs: "Client requirement", contentsTitle: "Packages and their contents",
    plus: (p: string) => `Includes everything in the ${p} package, plus:`, featureCol: "Item", detailCol: "Details",
    stagesTitle: "Delivery stages", approvalTitle: "Approval", forCompany: "For Fratelanza", forClient: "Client approval",
    name: "Name", signature: "Signature", sigDate: "Date", manager: "General Manager", title: "Title",
    firstParty: "First party (service provider)", secondParty: "Second party (client)",
    yourBusiness: "your business", contactLine: "Contact",
    intro: (svc: string, company: string, business: string, needs: string) =>
      `Fratelanza for Training, Software & AI Solutions is pleased to submit this proposal for ${svc}`
      + (needs ? ` to deliver ${needs}` : "")
      + (business ? `, tailored to how ${company || "your company"} works in ${business}` : "")
      + `, built to high quality standards and delivered on the agreed schedule.`,
    techIntroCustom: (company: string) =>
      `This technical proposal sets out the proposed scope of work for ${company || "the client"}'s software project, the details of each item, and the delivery stages. It complements the sales quotation and forms part of the contract once signed.`,
    techIntro: (svc: string, company: string) =>
      `This technical proposal sets out the contents of each ${svc} package offered to ${company || "the client"}, the details of every item, and the delivery stages. It complements the sales quotation and forms part of the contract once signed.`,
  },
};

const COMPANY_EN = {
  name: "Fratelanza for Training, Software & AI Solutions",
  address: "261, 4th District, Central Axis, 6th of October, Giza, Egypt",
};
const CONTACT = "www.fratelanza.com | 01097138338";

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(date: string, lang: Lang) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? "");
  if (!m) return "";
  return lang === "ar" ? `${m[3]} / ${m[2]} / ${m[1]}` : new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function addDays(date: string, days: number) {
  const d = new Date(`${(date || today()).slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + (Number(days) || 0));
  return d.toISOString().slice(0, 10);
}

const money = (n: number, lang: Lang) => `${formatMoney(n)} ${T[lang].egp}`;

/* ───────────────────────── Shell ───────────────────────── */

export type ProposalHtmlOptions = { logoDataUrl?: string | null };

function shell(lang: Lang, title: string, body: string, opts: ProposalHtmlOptions) {
  const logo = opts.logoDataUrl || defaultLogo;
  const ar = lang === "ar";
  const footer = ar ? `${COMPANY.name} – ${CONTACT}` : `${COMPANY_EN.name} – ${CONTACT}`;
  const pageOf = ar ? `"صفحة " counter(page) " من " counter(pages)` : `"Page " counter(page) " of " counter(pages)`;
  const font = ar ? "'Noto Naskh Arabic', Tahoma, sans-serif" : "'Inter', 'Segoe UI', Arial, sans-serif";
  const start = ar ? "right" : "left";
  const end = ar ? "left" : "right";
  return `<!doctype html>
<html lang="${lang}" dir="${ar ? "rtl" : "ltr"}"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;600;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 14mm 15mm 18mm 15mm;
    @bottom-${start} { content: "${footer}"; font-family: ${font}; font-size: 8pt; color: #6b7280; vertical-align: top; padding-top: 3mm; }
    @bottom-${end} { content: ${pageOf}; font-family: ${font}; font-size: 8.5pt; color: #6b7280; vertical-align: top; padding-top: 3mm; } }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; }
  body { font-family: ${font}; color: #111827; font-size: ${ar ? "12pt" : "10.5pt"}; line-height: ${ar ? 1.85 : 1.6}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 180mm; margin: 0 auto; padding: 4mm 0; }
  header { display: flex; align-items: center; gap: 14px; padding-bottom: 8px; }
  header img { width: 64px; height: 64px; object-fit: contain; border-radius: 50%; }
  header .co { flex: 1; line-height: 1.45; }
  header .co b { display: block; font-size: ${ar ? "13.5pt" : "12pt"}; color: #0a192f; }
  header .co span { font-size: 9pt; color: #4b5563; }
  header .contact { text-align: ${end}; font-size: 9pt; color: #374151; line-height: 1.6; }
  .accent { height: 4px; background: linear-gradient(${ar ? "270deg" : "90deg"}, #0a192f, #00bfff); border-radius: 2px; margin-bottom: 14px; }
  .titlebar { background: #0a192f; color: #fff; border-radius: 8px; padding: 12px 18px; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  .titlebar h1 { margin: 0; font-size: ${ar ? "18pt" : "16pt"}; letter-spacing: ${ar ? 0 : ".5px"}; }
  .titlebar .svc { color: #7dd3fc; font-size: ${ar ? "12pt" : "11pt"}; font-weight: 600; }
  .titlebar .tag { color: #cbd5e1; font-size: 9.5pt; }
  .titlebar .meta { font-size: 9.5pt; text-align: ${end}; line-height: 1.6; color: #e0f2fe; }
  h2 { font-size: ${ar ? "13pt" : "12pt"}; margin: 16px 0 6px; color: #0a192f; border-${start}: 4px solid #00bfff; padding-${start}: 8px; page-break-after: avoid; break-after: avoid; }
  p { margin: 4px 0; text-align: justify; }
  .client { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 18px; border: 1px solid #dbe3ee; background: #f8fafc; border-radius: 8px; padding: 10px 14px; margin-top: 12px; font-size: ${ar ? "11pt" : "10pt"}; }
  .client .lbl { color: #6b7280; }
  .client .full { grid-column: 1 / -1; }
  .client .hd { grid-column: 1 / -1; font-weight: 700; color: #0a192f; border-bottom: 1px solid #e5e7eb; margin-bottom: 4px; }
  ul.check { list-style: none; padding: 0; margin: 4px 0; }
  ul.check li { position: relative; padding-${start}: 20px; margin: 3px 0; }
  ul.check li::before { content: "✓"; position: absolute; ${start}: 0; color: #00a3d9; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: ${ar ? "10.5pt" : "9.5pt"}; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 9px; vertical-align: top; text-align: ${start}; }
  th { background: #0a192f; color: #fff; font-weight: 600; }
  td.num { text-align: center; white-space: nowrap; }
  tr.rec td { background: #ecfeff; }
  tr.total td { background: #f1f5f9; font-weight: 700; }
  tr.disc td { color: #b91c1c; }
  .spec h3 { color: #0a192f; margin: 14px 0 4px; page-break-after: avoid; break-after: avoid; }
  .spec h3.spec-h1 { font-size: ${ar ? "12.5pt" : "11.5pt"}; background: #f1f5f9; border-${start}: 4px solid #0a192f; padding: 4px 10px; border-radius: 4px; }
  .spec h3.spec-h2 { font-size: ${ar ? "11.5pt" : "10.5pt"}; color: #0369a1; }
  .spec h3.spec-h3 { font-size: ${ar ? "11pt" : "10pt"}; color: #374151; }
  .spec p { margin: 4px 0 6px; }
  .spec p.spec-label { color: #0369a1; font-weight: 700; margin-top: 8px; }
  .spec ul.spec-list, .spec ol.spec-list { margin: 4px 0 8px; padding-${start}: 22px; }
  .spec ul.spec-list li, .spec ol.spec-list li { margin: 2px 0; }
  .spec table.spec-table { margin: 6px 0 10px; }
  .spec table.spec-table th { background: #1e3a5f; }
  .spec table.spec-table tbody tr:nth-child(even) td { background: #f8fafc; }
  .spec table.spec-table tbody tr:last-child td b { color: #0a192f; }
  .spec code { font-family: Consolas, monospace; font-size: 90%; background: #f1f5f9; padding: 0 3px; border-radius: 3px; }
  tr.grp td { background: #e0f2fe; color: #0a192f; font-weight: 700; }
  table.sum { width: 60%; margin-${start}: auto; margin-${end}: 0; }
  table.sum td { border: 0; border-bottom: 1px solid #e5e7eb; padding: 4px 8px; }
  table.sum td.num { text-align: ${end}; }
  table.sum tr.disc td { color: #b91c1c; font-weight: 600; }
  .pkg { font-weight: 700; color: #0a192f; white-space: nowrap; }
  .badge { display: inline-block; background: #00bfff; color: #fff; font-size: 8pt; border-radius: 10px; padding: 0 8px; margin-top: 3px; font-weight: 600; }
  td ul { margin: 0; padding-${start}: 16px; }
  .totalbox { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; border: 2px solid #0a192f; border-radius: 8px; padding: 10px 16px; margin: 10px 0; }
  .totalbox b { font-size: ${ar ? "15pt" : "13pt"}; color: #0a192f; white-space: nowrap; }
  .totalbox .w { font-size: 9.5pt; color: #4b5563; width: 100%; }
  .pkgblock { border: 1px solid #dbe3ee; border-radius: 8px; padding: 8px 12px 4px; margin: 10px 0; page-break-inside: avoid; break-inside: avoid; }
  .pkgblock.rec { border-color: #00bfff; box-shadow: inset 0 0 0 1px #00bfff; }
  .pkgblock h3 { margin: 0 0 4px; font-size: ${ar ? "12.5pt" : "11.5pt"}; color: #0a192f; display: flex; gap: 8px; align-items: center; }
  .pkgblock .plus { color: #4b5563; font-size: 9.5pt; margin-bottom: 4px; }
  .stages { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 6px 0; }
  .stages div { border: 1px solid #dbe3ee; border-radius: 8px; padding: 8px; font-size: 9.5pt; line-height: 1.5; }
  .stages b { display: block; color: #0a192f; margin-bottom: 2px; }
  .stages .n { display: inline-block; width: 20px; height: 20px; border-radius: 50%; background: #00bfff; color: #fff; text-align: center; font-size: 9pt; line-height: 20px; margin-${end}: 4px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 18px; page-break-inside: avoid; break-inside: avoid; }
  .sign div { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 14px; line-height: 2.2; font-size: ${ar ? "11pt" : "10pt"}; }
  .sign b { display: block; color: #0a192f; border-bottom: 1px solid #e5e7eb; margin-bottom: 2px; }
  .muted { color: #6b7280; font-size: 9.5pt; }
  footer { display: none; }
  @media screen { body { background: #e5e7eb; } .page { background: #fff; padding: 12mm 15mm; margin: 12px auto; box-shadow: 0 2px 10px rgba(0,0,0,.15); max-width: 210mm; } footer { display: block; text-align: center; font-size: 8.5pt; color: #6b7280; max-width: 210mm; margin: 0 auto 12px; } }
  @media (max-width: 640px) { .client, .sign { grid-template-columns: 1fr; } .stages { grid-template-columns: 1fr 1fr; } }
</style></head>
<body>
<div class="page">
  <header>
    <img src="${logo}" alt="Fratelanza">
    <div class="co">${ar ? `<b>${COMPANY.line1}</b><span>${COMPANY.line2}</span>` : `<b>Fratelanza</b><span>Training, Software &amp; AI Solutions</span>`}</div>
    <div class="contact">www.fratelanza.com<br>01097138338</div>
  </header>
  <div class="accent"></div>
  ${body}
</div>
<footer>${esc(footer)} – ${esc(ar ? COMPANY.address : COMPANY_EN.address)}</footer>
</body></html>`;
}

/* ───────────────────────── Shared blocks ───────────────────────── */

function titleBar(d: ProposalData, title: string, withValidity: boolean) {
  const t = T[d.language];
  const svc = serviceByKey(d.serviceKey);
  return `<div class="titlebar">
    <div><h1>${esc(title)}</h1><div class="svc">${esc(d.projectTitle?.trim() || svc.name[d.language])}</div><div class="tag">${esc(d.projectTitle?.trim() ? svc.name[d.language] : svc.tagline[d.language])}</div></div>
    <div class="meta">${t.date}: ${esc(fmtDate(d.date, d.language))}${withValidity ? `<br>${t.validUntil}: ${esc(fmtDate(addDays(d.date, d.validDays), d.language))}` : ""}</div>
  </div>`;
}

function clientBox(d: ProposalData) {
  const t = T[d.language];
  const c = d.customer;
  const row = (label: string, v: string, full = false) => (v.trim() ? `<div class="${full ? "full" : ""}"><span class="lbl">${label}:</span> ${esc(v)}</div>` : "");
  const contact = [c.contactName, c.contactTitle].filter((x) => x.trim()).join(d.language === "ar" ? " – " : ", ");
  return `<div class="client">
    <div class="hd">${t.preparedFor}</div>
    ${row(t.company, c.company)}${row(t.contact, contact)}${row(t.business, c.business)}${row(t.phone, c.phone)}${row(t.email, c.email)}${row(t.address, c.address, true)}
  </div>`;
}

function benefits(d: ProposalData) {
  const t = T[d.language];
  const svc = serviceByKey(d.serviceKey);
  const biz = d.customer.company.trim() || d.customer.business.trim() || t.yourBusiness;
  // English possessive: "Al Nour Pharmacies'" rather than "Pharmacies's"
  const possessive = biz !== t.yourBusiness && /s$/i.test(biz) ? `${biz}'` : `${biz}'s`;
  return `<ul class="check">${svc.benefits.map((b) => `<li>${esc(b[d.language].replace("{biz}'s", possessive).replace("{biz}", biz))}</li>`).join("")}</ul>`;
}

function intro(d: ProposalData) {
  const t = T[d.language];
  const svc = serviceByKey(d.serviceKey);
  const c = d.customer;
  const addressee = c.contactName.trim() || c.company.trim();
  return `${addressee ? `<p><b>${esc(t.dear(addressee))}</b>${t.greeting ? ` ${t.greeting}` : ""}</p>` : ""}
  <p>${esc(t.intro(svc.name[d.language], c.company.trim(), c.business.trim(), c.needs.trim()))}</p>`;
}

function notesList(d: ProposalData, withValidity: boolean) {
  const t = T[d.language];
  const svc = serviceByKey(d.serviceKey);
  const items = [
    // Custom projects are priced firmly, so no "guide prices" note
    ...(isSinglePrice(d) || hasSpecTiers(d) ? [] : [PRICE_NOTE[d.language]]), svc.scopeNote[d.language], EXTERNAL_FEES_NOTE[d.language],
    ...d.notes.split("\n").map((x) => x.trim()).filter(Boolean),
    ...(withValidity ? [t.validity(d.validDays)] : []),
  ];
  return `<h2>${t.notesTitle}</h2><ul class="check">${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
}

function provides(d: ProposalData) {
  const t = T[d.language];
  return `<h2>${t.providesTitle}</h2><ul class="check">${PROVIDES.map((x) => `<li>${esc(x[d.language])}</li>`).join("")}</ul>`;
}

function approval(d: ProposalData) {
  const t = T[d.language];
  const blank = "................................";
  const ar = d.language === "ar";
  const c = d.customer;
  const clientName = c.company.trim() || c.contactName.trim();
  return `<h2>${t.approvalTitle}</h2>
  <div class="sign">
    <div><b>${t.firstParty}</b>${esc(ar ? COMPANY.name : "Fratelanza for Training, Software & AI Solutions")}<br>
      ${t.name}: ${ar ? COMPANY.manager : "Ahmed Mohamed Refaat El-Sayed"}<br>${t.title}: ${t.manager}<br>${t.signature}: ${blank}<br>${t.sigDate}: ${blank}</div>
    <div><b>${t.secondParty}</b>${clientName ? esc(clientName) : blank}<br>
      ${t.name}: ${esc(c.contactName) || blank}<br>${t.title}: ${esc(c.contactTitle) || blank}<br>${t.signature}: ${blank}<br>${t.sigDate}: ${blank}</div>
  </div>`;
}

function shownTiers(d: ProposalData): Tier[] {
  const list = TIERS.filter((tier) => d.included?.[tier] !== false || tier === d.tier);
  return list.length ? list : TIERS;
}

/** Requirements in document order, grouped under their section headings. */
function grouped(reqs: Requirement[], fallback: string) {
  const groups: { title: string; items: { r: Requirement; n: number }[] }[] = [];
  reqs.forEach((r, i) => {
    const title = r.group?.trim() || fallback;
    let g = groups[groups.length - 1];
    if (!g || g.title !== title) { g = { title, items: [] }; groups.push(g); }
    g.items.push({ r, n: i + 1 });
  });
  return groups;
}

/** Custom project, financial view: scope items by section with their price. */
function customScopeTable(d: ProposalData) {
  const t = T[d.language];
  const lang = d.language;
  const groups = grouped(d.requirements ?? [], t.general);
  if (!groups.length) return "";
  const many = groups.length > 1 || groups[0]!.title !== t.general;
  const rows = groups.map((g) => `${many ? `<tr class="grp"><td colspan="3">${esc(g.title)}</td></tr>` : ""}${g.items.map(({ r, n }) =>
    `<tr><td class="num">${n}</td><td>${esc(r.text)}</td><td class="num">${Number(r.price) > 0 ? money(Number(r.price), lang) : `<span class="muted">${t.inProject}</span>`}</td></tr>`).join("")}`).join("");
  return `<h2>${t.scopeTitle}</h2>
  <table><thead><tr><th style="width:6%">#</th><th>${t.reqCol}</th><th style="width:22%">${t.priceCol}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ───────────────────────── Sales quotation ───────────────────────── */

export function buildQuoteHtml(d: ProposalData, opts: ProposalHtmlOptions = {}): string {
  const t = T[d.language];
  const lang = d.language;
  const svc = serviceByKey(d.serviceKey);
  const tot = proposalTotals(d);
  const amount = tot.total;
  const custom = isSinglePrice(d);

  const rows = custom ? "" : shownTiers(d).map((tier, i, all) => {
    // The client chooses: every package is shown the same way (the chosen one is internal only)
    const price = Number(d.prices[tier] ?? 0);
    const prev = i > 0 ? all[i - 1]! : null;
    return `<tr>
      <td class="pkg">${TIER_NAME[tier]}</td>
      <td>${prev ? `<div class="muted">${esc(t.plus(TIER_NAME[prev]))}</div>` : ""}<ul>${packageContents(d, tier).map((x) => `<li>${esc(x.title)}</li>`).join("")}</ul></td>
      <td class="num"><b>${money(price, lang)}</b></td>
    </tr>`;
  }).join("");

  let totals = "";
  const extrasTable = (items: Requirement[]) => items.length ? `<h2>${t.extrasTitle}</h2>
    <table><thead><tr><th style="width:6%">#</th><th>${t.reqCol}</th><th style="width:20%">${t.priceCol}</th></tr></thead>
    <tbody>${items.map((r, i) => `<tr><td class="num">${i + 1}</td><td>${esc(r.text)}</td><td class="num">${money(Number(r.price) || 0, lang)}</td></tr>`).join("")}</tbody></table>` : "";
  if (custom && amount > 0) {
    const calc = computeStages(amount, milestonesOf(d));
    // Breakdown only when there is more than one figure to add up (or a discount)
    const showSum = tot.discount > 0 || (tot.extras > 0 && tot.packagePrice > 0);
    totals = `<h2>${t.totalTitle}</h2>
    ${showSum ? `<table class="sum"><tbody>
      ${tot.packagePrice > 0 ? `<tr><td>${esc(t.projectValue)}</td><td class="num">${money(tot.packagePrice, lang)}</td></tr>` : ""}
      ${tot.extras > 0 ? `<tr><td>${esc(t.itemsSum)}</td><td class="num">${money(tot.extras, lang)}</td></tr>` : ""}
      ${tot.extras > 0 && tot.discount > 0 ? `<tr><td><b>${esc(t.subtotal)}</b></td><td class="num"><b>${money(tot.subtotal, lang)}</b></td></tr>` : ""}
      ${tot.discount > 0 ? `<tr class="disc"><td>${esc(t.discount)}${d.discountType === "percent" ? ` (${tot.discountPct}%)` : ""}</td><td class="num">− ${money(tot.discount, lang)}</td></tr>` : ""}
    </tbody></table>` : ""}
    <div class="totalbox"><span>${esc(tot.discount > 0 ? t.totalAfter : t.grandTotal)}</span><b>${money(amount, lang)}</b>
      ${lang === "ar" ? `<span class="w">${t.words} ${esc(amountToArabicWords(amount))} جنيهاً مصرياً لا غير.</span>` : ""}</div>
    <h2>${t.milestonesTitle}</h2>
    <table><thead><tr><th>${t.stageCol}</th><th>${t.pctCol}</th><th>${t.amountCol}</th></tr></thead>
    <tbody>${calc.rows.map((r) => `<tr><td>${esc(lang === "ar" ? r.ar : r.en)}</td><td class="num">${r.pct}%</td><td class="num">${money(r.amount, lang)}</td></tr>`).join("")}
    <tr class="total"><td>${t.total}</td><td class="num">${milestonesOf(d).reduce((a, m) => a + (Number(m.pct) || 0), 0)}%</td><td class="num">${money(calc.totalAllocated, lang)}</td></tr></tbody></table>`;
  } else if (custom) {
    totals = `<h2>${t.milestonesTitle}</h2>
    <table><thead><tr><th>${t.stageCol}</th><th>${t.pctCol}</th></tr></thead>
    <tbody>${milestonesOf(d).map((m) => `<tr><td>${esc(lang === "ar" ? m.ar : m.en)}</td><td class="num">${m.pct}%</td></tr>`).join("")}</tbody></table>`;
  } else {
    // Every offered package side by side: price, additions, discount, total, and each payment in % and amount
    const cols = shownTiers(d).map((tier) => {
      const tt = proposalTotals(d, tier);
      return { tier, tt, calc: computeStages(tt.total, milestonesOf(d)) };
    });
    const anyExtras = cols.some((c) => c.tt.extras > 0);
    const anyDiscount = cols.some((c) => c.tt.discount > 0);
    const head = `<tr><th>${t.itemCol}</th>${cols.map((c) => `<th class="num">${TIER_NAME[c.tier]}</th>`).join("")}</tr>`;
    totals = `${extrasTable(extraItems(d))}
    <h2>${t.compareTitle}</h2>
    <table><thead>${head}</thead><tbody>
      <tr><td>${t.packagePriceRow}</td>${cols.map((c) => `<td class="num">${money(c.tt.packagePrice, lang)}</td>`).join("")}</tr>
      ${anyExtras ? `<tr><td>+ ${t.extrasSum}</td>${cols.map((c) => `<td class="num">${money(c.tt.extras, lang)}</td>`).join("")}</tr>` : ""}
      ${anyDiscount ? `<tr class="disc"><td>${t.discount}${d.discountType === "percent" ? ` (${Math.min(100, Number(d.discountValue) || 0)}%)` : ""}</td>${cols.map((c) => `<td class="num">− ${money(c.tt.discount, lang)}</td>`).join("")}</tr>` : ""}
      <tr class="total"><td>${anyDiscount ? t.totalAfter : t.total}</td>${cols.map((c) => `<td class="num">${money(c.tt.total, lang)}</td>`).join("")}</tr>
    </tbody></table>
    <h2>${t.milestonesTitle}</h2>
    <table><thead><tr><th>${t.stageCol}</th><th>${t.pctCol}</th>${cols.map((c) => `<th class="num">${TIER_NAME[c.tier]}</th>`).join("")}</tr></thead>
    <tbody>${milestonesOf(d).map((m, i) => `<tr><td>${esc(lang === "ar" ? m.ar : m.en)}</td><td class="num">${m.pct}%</td>${cols.map((c) => `<td class="num">${money(c.calc.rows[i]!.amount, lang)}</td>`).join("")}</tr>`).join("")}
    <tr class="total"><td>${t.total}</td><td class="num">${milestonesOf(d).reduce((a, m) => a + (Number(m.pct) || 0), 0)}%</td>${cols.map((c) => `<td class="num">${money(c.calc.totalAllocated, lang)}</td>`).join("")}</tr></tbody></table>
    <p class="muted">${esc(t.chooseNote)}</p>`;
  }

  const body = `
  ${titleBar(d, t.quote, true)}
  ${clientBox(d)}
  <h2>${lang === "ar" ? "مقدمة" : "Introduction"}</h2>
  ${intro(d)}
  <h2>${t.benefitsTitle}</h2>
  ${benefits(d)}
  ${custom ? customScopeTable(d) : `<h2>${t.packagesTitle}</h2>
  <table><thead><tr><th style="width:18%">${t.packageCol}</th><th>${t.includesCol}</th><th style="width:20%">${t.priceCol}</th></tr></thead><tbody>${rows}</tbody></table>`}
  ${totals}
  ${provides(d)}
  ${notesList(d, true)}
  ${approval(d)}`;
  return shell(lang, `${t.quote} – ${d.customer.company || svc.name[lang]}`, body, opts);
}

/* ───────────────────────── Technical proposal ───────────────────────── */

function requirementsTable(d: ProposalData) {
  const reqs = d.requirements ?? [];
  if (!reqs.length) return "";
  const t = T[d.language];
  const lang = d.language;
  const svc = serviceByKey(d.serviceKey);
  const groups = grouped(reqs, t.general);
  const many = groups.length > 1 || groups[0]!.title !== t.general;
  const lead = d.sourceFile ? t.fromDoc(d.sourceFile) : null;

  if (isCustomService(d.serviceKey)) {
    // Custom project: the scope of work, section by section
    return `<h2>${t.scopeTechTitle}</h2>
    <p>${esc(lead ?? t.scopeIntro)}</p>
    ${groups.map((g) => `<div class="pkgblock">${many ? `<h3>${esc(g.title)}</h3>` : ""}
      <ul class="check">${g.items.map(({ r }) => `<li>${esc(r.text)}</li>`).join("")}</ul></div>`).join("")}`;
  }

  const rows = groups.map((g) => `${many ? `<tr class="grp"><td colspan="4">${esc(g.title)}</td></tr>` : ""}${g.items.map(({ r, n }) => {
    const f = featureOf(svc, r.match);
    const solution = f
      ? `<b>${esc(lang === "ar" ? f.feature.ar : f.feature.en)}</b><br><span class="muted">${esc(lang === "ar" ? f.feature.dAr : f.feature.dEn)}</span>`
      : `<b>${t.extraLabel}</b><br><span class="muted">${esc(t.extraDetail)}</span>`;
    return `<tr><td class="num">${n}</td><td>${esc(r.text)}</td><td>${solution}</td><td class="num">${f ? TIER_NAME[f.tier] : `<span class="badge">${t.extraLabel}</span>`}</td></tr>`;
  }).join("")}`).join("");
  return `<h2>${t.reqTitle}</h2>
  <p>${esc(lead ?? t.reqIntro)}</p>
  <table><thead><tr><th style="width:5%">#</th><th style="width:32%">${t.reqCol}</th><th>${t.solutionCol}</th><th style="width:15%">${t.inCol}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function buildTechnicalHtml(d: ProposalData, opts: ProposalHtmlOptions = {}): string {
  const t = T[d.language];
  const lang = d.language;
  const svc = serviceByKey(d.serviceKey);
  const tiers = shownTiers(d);

  const custom = isCustomService(d.serviceKey);
  const spec = scopeModeOf(d) === "spec" && d.requirementsText.trim();
  const specTiers = hasSpecTiers(d);
  // Packages from the specification's own items, or the catalog packages (not for a single-price custom project / plain spec)
  const showBlocks = specTiers || (!custom && !spec);
  const blocks = !showBlocks ? "" : tiers.map((tier, i) => {
    const prev = i > 0 ? tiers[i - 1]! : null;
    const items = packageContents(d, tier);
    return `<div class="pkgblock">
      <h3>${lang === "ar" ? "باقة" : "Package:"} ${TIER_NAME[tier]}</h3>
      ${prev ? `<div class="plus">${esc(t.plus(TIER_NAME[prev]))}</div>` : ""}
      <table><thead><tr><th style="width:34%">${t.featureCol}</th><th>${specTiers ? t.sectionCol : t.detailCol}</th></tr></thead>
      <tbody>${items.map((x) => `<tr><td><b>${esc(x.title)}</b></td><td>${esc(x.detail)}</td></tr>`).join("")}</tbody></table>
    </div>`;
  }).join("");

  const body = `
  ${titleBar(d, t.technical, false)}
  ${clientBox(d)}
  <h2>${t.overviewTitle}</h2>
  <p>${esc(spec && d.projectTitle?.trim() ? t.specIntro(d.projectTitle.trim()) : custom ? t.techIntroCustom(d.customer.company.trim()) : t.techIntro(svc.name[lang], d.customer.company.trim()))}</p>
  ${d.customer.needs.trim() ? `<p><b>${t.needs}:</b> ${esc(d.customer.needs)}</p>` : ""}
  ${benefits(d)}
  ${spec ? `<h2>${t.specTitle}</h2>${renderSpec(d.requirementsText, { skipTitle: d.projectTitle?.trim() })}` : requirementsTable(d)}
  ${showBlocks ? `<h2>${specTiers ? t.specPackagesTitle : t.contentsTitle}</h2>
  ${specTiers ? `<p>${esc(t.specPackagesIntro)}</p>` : ""}
  ${blocks}` : ""}
  ${spec && hasOwnPhases(d.requirementsText) ? "" : `<h2>${t.stagesTitle}</h2>
  <div class="stages">${STAGES.map((s, i) => `<div><b><span class="n">${i + 1}</span>${esc(lang === "ar" ? s.ar : s.en)}</b>${esc(lang === "ar" ? s.dAr : s.dEn)}</div>`).join("")}</div>`}
  ${provides(d)}
  ${notesList(d, false)}
  ${approval(d)}`;
  return shell(lang, `${t.technical} – ${d.customer.company || svc.name[lang]}`, body, opts);
}

/* ───────────── Older "custom quotes" in the corporate design ───────────── */

export type LegacyQuote = {
  clientName: string;
  lineItems?: { desc: string; price: number }[] | null;
  price: number;
  language?: string | null;
  date?: string | null;
  paymentTerms?: string | null;
  generatedReport?: string | null;
  technicalOutline?: string | null;
};

/**
 * A custom quote from the "Custom quotes" tab as a custom-project proposal, so it
 * prints with the same corporate quotation / technical proposal layout.
 * Line items become priced scope items; without line items the report text
 * becomes the scope and the quote price is the project price.
 */
export function proposalFromLegacyQuote(q: LegacyQuote, toLines: (text: string) => string[]): ProposalData {
  const d = defaultProposal("custom");
  d.serviceKey = "custom";
  d.tier = "";
  d.language = q.language === "English" ? "en" : "ar";
  d.date = (q.date || d.date).slice(0, 10);
  d.customer.company = q.clientName || "";
  const items = (q.lineItems ?? []).filter((i) => i.desc?.trim());
  if (items.length) {
    d.requirements = items.map((i) => ({ text: i.desc.trim(), match: "extra", price: Math.max(0, Number(i.price) || 0) }));
    const itemsSum = d.requirements.reduce((s, r) => s + r.price, 0);
    d.projectPrice = Math.max(0, Number(q.price) - itemsSum);
  } else {
    let group = "";
    d.requirements = toLines(q.generatedReport || q.technicalOutline || "").flatMap((line) => {
      if (line.startsWith("# ")) { group = line.slice(2); return []; }
      return [{ text: line, match: "extra", price: 0, ...(group ? { group } : {}) }];
    });
    d.projectPrice = Math.max(0, Number(q.price) || 0);
  }
  d.notes = (q.paymentTerms ?? "").trim();
  return d;
}
