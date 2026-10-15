import { SERVICES, TIERS, type Service, type Tier } from "@/lib/service-catalog";

/**
 * Customer requirement → package feature matching (no AI service needed).
 * Words are normalised (Arabic letter forms, "ال", plurals) and mapped through
 * a small synonym list, then each requirement goes to the package feature that
 * shares the most meaning. Anything without a match is "additional development".
 */

export type Requirement = {
  text: string;
  /** "<tier>:<featureIndex>" = covered by that package feature, "extra" = additional development */
  match: string;
  /** Price of additional development (only when match = "extra") */
  price: number;
  /** Section heading from the requirements document (e.g. "وحدة المخازن") */
  group?: string;
};

const SYNONYMS: string[][] = [
  ["stock", "مخزون", "مخازن", "مخزن", "inventory", "warehouse", "جرد", "كميات", "كميه", "quantities"],
  ["sales", "مبيعات", "بيع", "sell", "selling", "pos", "كاشير", "cashier", "نقطه"],
  ["report", "تقارير", "تقرير", "reports", "reporting", "analytics", "تحليلات", "تحليل", "احصائيات", "statistics", "analysis"],
  ["users", "مستخدمين", "مستخدم", "user", "staff", "موظف", "موظفين", "employees"],
  ["permissions", "صلاحيات", "ادوار", "دور", "roles", "role", "permission", "access"],
  ["branches", "فروع", "فرع", "branch", "multi-branch"],
  ["barcode", "باركود", "scanner", "scan", "scanning", "قراءه", "قارئ", "qr"],
  ["website", "موقع", "مواقع", "site", "web", "ويب", "الكتروني", "online-site"],
  ["payment", "دفع", "payments", "pay", "فيزا", "visa", "بطاقات", "cards", "gateway", "gateways", "اونلاين", "online", "محافظ", "wallet"],
  ["alerts", "اشعارات", "اشعار", "تنبيهات", "تنبيه", "notifications", "notification", "alert", "reminders", "تذكير"],
  ["expiry", "صلاحيه", "انتهاء", "expiration", "batch", "تشغيله"],
  ["suppliers", "موردين", "مورد", "supplier", "purchasing", "purchase", "مشتريات", "purchases", "شراء"],
  ["invoice", "فاتوره", "فواتير", "invoices", "billing", "receipt", "ايصال"],
  ["integration", "ربط", "تكامل", "تكاملات", "integrations", "integrate", "api", "connect", "linking"],
  ["dashboard", "لوحه", "dashboards", "مؤشرات", "kpi", "kpis", "panel", "admin"],
  ["language", "لغات", "لغتين", "لغه", "انجليزي", "english", "multilingual", "languages", "arabic"],
  ["seo", "محركات", "google", "جوجل", "search"],
  ["contact", "تواصل", "contact", "نموذج", "form", "forms", "رسائل", "messages"],
  ["pages", "صفحات", "صفحه", "page"],
  ["content", "محتوي", "cms", "اخبار", "news", "مقالات", "blog"],
  ["social", "سوشيال", "اجتماعي", "facebook", "فيسبوك", "instagram", "انستجرام", "media"],
  ["app", "تطبيق", "تطبيقات", "application", "android", "اندرويد", "ios", "ايفون", "iphone", "mobile", "موبايل", "جوال"],
  ["products", "منتجات", "منتج", "product", "catalog", "catalogue", "اصناف", "صنف", "items", "item"],
  ["orders", "طلبات", "طلب", "order", "requests", "request"],
  ["coupons", "خصومات", "خصم", "كوبون", "كوبونات", "قسائم", "coupon", "discounts", "discount", "offers", "عروض"],
  ["customers", "عملاء", "عميل", "customer", "clients", "client", "crm"],
  ["contracts", "عقود", "عقد", "contract"],
  ["installments", "اقساط", "قسط", "installment", "instalments", "instalment", "تحصيل", "collection"],
  ["units", "وحدات", "وحده", "شقق", "شقه", "unit", "apartments", "apartment", "عقارات", "property", "properties"],
  ["leads", "فرص", "lead", "opportunities", "opportunity", "متابعه", "followup", "follow-up", "متابعات"],
  ["booking", "حجز", "حجوزات", "bookings", "reservation", "reservations", "مواعيد", "appointments"],
  ["automation", "اتمته", "automate", "automated", "تلقائي", "automatic", "workflow", "workflows", "تدفقات"],
  ["ai", "ذكاء", "اصطناعي", "chatbot", "شات", "بوت", "bot", "assistant", "مساعد"],
  ["whatsapp", "واتساب", "واتس"],
  ["commission", "عمولات", "عموله", "commissions"],
  ["accounting", "حسابات", "محاسبه", "accounts", "accounts", "ماليه", "finance", "financial"],
  ["hr", "رواتب", "payroll", "حضور", "انصراف", "attendance"],
  ["providers", "مقدمي", "مقدم", "provider", "vendors", "vendor"],
  ["projects", "مشروعات", "مشاريع", "مشروع", "project"],
  ["design", "تصميم", "واجهات", "واجهه", "ui", "ux", "interface"],
  ["responsive", "متجاوب", "devices", "اجهزه", "tablet"],
  ["scalable", "توسع", "scalability", "scale", "growth"],
  ["shipping", "شحن", "delivery", "توصيل", "shipment"],
];

const STOP = new Set([
  "من", "في", "علي", "الي", "عن", "مع", "او", "ان", "هذا", "هذه", "التي", "الذي", "كل", "عند", "بعد", "قبل", "لكل", "يكون", "يتم", "امكانيه", "نريد", "عاوز", "عايز", "ابغي", "محتاج", "نحتاج", "يجب", "خاص", "خاصه", "حسب", "مثل", "بين", "داخل",
  "نظام", "برنامج", "سيستم", "شركه", "شركتنا", "company", "business", "system", "software", "the", "and", "for", "with", "to", "of", "a", "an", "in", "on", "by", "be", "is", "are", "we", "our", "need", "needs", "want", "should", "able", "ability", "can", "must", "all", "each", "per", "that", "this", "from", "into", "have",
]);

/** Normalise an Arabic/English word for comparison. */
function norm(word: string): string {
  let w = word.toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي");
  if (/^[a-z]/.test(w)) {
    if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
    else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
    return w;
  }
  if (w.length > 4 && w.startsWith("وال")) w = w.slice(3);
  else if (w.length > 4 && (w.startsWith("بال") || w.startsWith("لل") || w.startsWith("كال"))) w = w.slice(w.startsWith("لل") ? 2 : 3);
  else if (w.length > 3 && w.startsWith("ال")) w = w.slice(2);
  else if (w.length > 3 && w.startsWith("و")) w = w.slice(1);
  return w;
}

const CANON = new Map<string, string>();
for (const group of SYNONYMS) for (const word of group) CANON.set(norm(word), group[0]!);

/** Meaningful tokens of a text (synonyms collapsed to one key). */
export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.split(/[^\p{L}\p{N}-]+/u)) {
    const w = norm(raw);
    if (w.length < 2 || STOP.has(w) || STOP.has(raw.toLowerCase())) continue;
    out.add(CANON.get(w) ?? w);
  }
  return out;
}

type Indexed = { key: string; tier: Tier; title: Set<string>; body: Set<string>; limit: number | null };

/** Largest number in a text ("up to 5 pages" → 5), used for quantity limits. */
function quantity(text: string): number | null {
  const nums = (text.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).match(/\d+/g) ?? []).map(Number);
  return nums.length ? Math.max(...nums) : null;
}

function indexService(svc: Service) {
  const list: Indexed[] = [];
  for (const pkg of svc.packages) {
    pkg.features.forEach((f, i) => {
      list.push({ key: `${pkg.tier}:${i}`, tier: pkg.tier, title: tokens(`${f.ar} ${f.en}`), body: tokens(`${f.dAr} ${f.dEn}`), limit: quantity(f.en) });
    });
  }
  // Rarer words say more: weight each word by how few features use it
  const df = new Map<string, number>();
  for (const f of list) for (const w of new Set([...f.title, ...f.body])) df.set(w, (df.get(w) ?? 0) + 1);
  // Words no package mentions (e.g. "loyalty", "chat") weigh the most: they are what the packages lack
  const idf = (w: string) => Math.log(1 + list.length / (df.get(w) ?? 2));
  return { list, idf, known: (w: string) => df.has(w) };
}

/** Words too general to justify a match on their own ("للعملاء" in "تطبيق موبايل للعملاء"). */
const GENERIC = new Set(["customers", "users", "management", "اداره"]);

/** Score needed for a match; weaker matches become additional development. */
const MIN_SCORE = 2.2;
/** Share of the requirement's meaning a feature must cover. */
const MIN_COVERAGE = 0.34;

/** Best package feature for one requirement, or "extra" when nothing fits. */
export function matchRequirement(svc: Service, text: string, index = indexService(svc)): string {
  const req = tokens(text);
  if (req.size === 0) return "extra";
  const n = quantity(text);
  const total = [...req].reduce((s, w) => s + 2 * index.idf(w), 0);
  // The most specific word the packages know about ("باركود" in "قراءة الباركود عند البيع")
  const specific = [...req].filter(index.known).sort((a, b) => index.idf(b) - index.idf(a))[0];
  let best: { key: string; score: number; tier: number } | null = null;
  for (const f of index.list) {
    // "10 pages" is not covered by "up to 5 pages"
    if (n != null && f.limit != null && n > f.limit) continue;
    let score = 0;
    for (const w of req) score += (f.title.has(w) ? 2 : f.body.has(w) ? 1 : 0) * index.idf(w);
    if (specific && (f.title.has(specific) || f.body.has(specific))) score += index.idf(specific);
    // Sharing only a general word while the requirement asks for something else → no match
    const shared = [...req].filter((w) => f.title.has(w) || f.body.has(w));
    if (shared.length && shared.every((w) => GENERIC.has(w)) && [...req].some((w) => !GENERIC.has(w))) continue;
    if (score / total < MIN_COVERAGE) continue;
    const tier = TIERS.indexOf(f.tier);
    if (score > 0 && (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && tier < best.tier))) best = { key: f.key, score, tier };
  }
  return best && best.score >= MIN_SCORE ? best.key : "extra";
}

/** A heading line in the requirements text starts with "#" (e.g. "# وحدة المخازن"). */
const HEADING = /^\s*#+\s*/;

/**
 * Split the text into requirements (one per line / bullet) and match each one.
 * Lines starting with "#" are section headings and group the requirements under them.
 */
export function analyzeRequirements(svc: Service, text: string, previous: Requirement[] = []): Requirement[] {
  const index = indexService(svc);
  const out: Requirement[] = [];
  let group = "";
  for (const raw of text.split(/\r?\n|[•;؛]/)) {
    if (HEADING.test(raw)) { group = raw.replace(HEADING, "").trim(); continue; }
    const line = raw.replace(/^\s*([-*–]|\d+[.)-])\s*/, "").trim();
    if (line.length <= 1) continue;
    const prev = previous.find((p) => p.text === line);
    const match = svc.packages.length ? matchRequirement(svc, line, index) : "extra";
    out.push({ text: line, match, price: match === "extra" ? prev?.price ?? 0 : 0, ...(group ? { group } : {}) });
  }
  return out;
}

/** Smallest package that covers every matched requirement ("" when nothing matched). */
export function suggestedTier(reqs: Requirement[]): Tier | "" {
  let max = -1;
  for (const r of reqs) {
    const tier = r.match.split(":")[0] as Tier;
    const i = TIERS.indexOf(tier);
    if (i > max) max = i;
  }
  return max >= 0 ? TIERS[max]! : "";
}

export function featureOf(svc: Service, match: string) {
  const [tier, idx] = match.split(":");
  const pkg = svc.packages.find((p) => p.tier === tier);
  const feature = pkg?.features[Number(idx)];
  return pkg && feature ? { tier: pkg.tier, feature } : null;
}

/* ───────────── Requirements document (Word / PDF) ───────────── */

/** Lines that are titles, page furniture or contact details rather than requirements. */
const NOISE = [
  /^(?:page|صفحة|صفحه)\s*\d+/i,
  /^[-–—_=*\s]*(?:page|صفحة|صفحه)[-–—_=*\s\d]*$/i,
  /^(?:table of contents|contents|فهرس|المحتويات|الفهرس)$/i,
  /^(?:introduction|overview|مقدمة|مقدمه|نبذة|نبذه|الخلاصة|summary|conclusion|appendix|ملحق)\s*[:\-]?$/i,
  /^(?:version|الإصدار|الاصدار|date|التاريخ|prepared by|اعداد|إعداد)\s*[:\-]/i,
  /(?:www\.|https?:\/\/|@[a-z0-9-]+\.)/i,
  /^[\d\s.\-_/:]+$/,
  /^(?:BRD|FRD|SRS)\b/i,
  // Document titles: "مستند متطلبات نظام …", "Requirements document", "متطلبات نظام …"
  /^(?:مستند|وثيقة|وثيقه|ملف)\s+(?:ال)?متطلبات/,
  /^(?:ال)?متطلبات\s+(?:نظام|مشروع|منصة|منصه|تطبيق|موقع)/,
  /\brequirements?\s*(?:document|specification|spec)?\s*$/i,
  /^(?:software|system|project)\s+requirements?\b/i,
];

/**
 * Section heading? When the document marks headings with a colon ("شؤون الطلاب:")
 * only those count; otherwise a very short line (≤ 3 words, no punctuation)
 * followed by a longer one, and not right after another heading.
 */
function looksLikeHeading(line: string, next: string | undefined, colonHeadings: boolean, afterHeading: boolean): boolean {
  const clean = line.replace(/^\s*(?:\d{1,2}(?:\.\d{1,2})*[.)\-]?|[IVX]+[.)])\s*/, "").trim();
  if (colonHeadings) return /[:：]\s*$/.test(line) && clean.length <= 70;
  if (afterHeading || !next) return false;
  const words = clean.split(/\s+/).length;
  // English headings are Title Case ("Student Affairs"), unlike items ("Contact form")
  if (/^[A-Za-z]/.test(clean) && !clean.split(/\s+/).every((w) => /^[A-Z0-9&]/.test(w) || /^(?:and|of|the|for|&)$/.test(w))) return false;
  return words <= 3 && clean.length <= 35 && !/[.،,؛;!?؟]/.test(clean) && next.trim().split(/\s+/).length > words;
}

/**
 * Turn the text of an uploaded requirements document into requirement lines:
 * section titles become "# heading" lines, bullets and numbered items become
 * requirements, long paragraphs are split into sentences, and page numbers,
 * contact lines and duplicates are dropped.
 */
export function requirementsFromDocument(text: string, max = 80): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let count = 0;
  const clean = (raw: string) => raw
    .replace(/^\s*(?:[-*•▪◦●○■□✓✔➢➤►–]|\(?\d{1,3}(?:\.\d{1,3})*[.)\-]|\(?[a-zA-Zأ-ي][.)])\s*/, "")
    .replace(/\s+/g, " ").replace(/[:：]\s*$/, "").trim();
  const push = (raw: string) => {
    const line = clean(raw);
    if (line.length < 4 || line.length > 220 || NOISE.some((re) => re.test(line)) || tokens(line).size === 0) return;
    const key = line.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(line);
    count += 1;
  };
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // A document that ends some short lines with ":" uses that to mark its headings
  const colonHeadings = lines.filter((l) => /[:：]\s*$/.test(l) && l.length <= 70 && !NOISE.some((re) => re.test(clean(l)))).length >= 2;
  lines.forEach((line, i) => {
    if (count >= max) return;
    // First line that names the system ("نظام إدارة المدرسة", "School Management System") is the document title
    if (i === 0 && line.split(/\s+/).length <= 7 && !/[.،,؛;]/.test(line) && /(?:نظام|منصه|منصة|تطبيق|موقع|مشروع|system|platform|portal|app|website|project)/i.test(line)) return;
    const afterHeading = out.length > 0 && out[out.length - 1]!.startsWith("# ");
    if (looksLikeHeading(line, lines[i + 1], colonHeadings, afterHeading)) {
      const h = clean(line);
      if (h.length >= 3 && !NOISE.some((re) => re.test(h))) {
        if (out.length && out[out.length - 1]!.startsWith("# ")) out.pop(); // heading with nothing under it
        out.push(`# ${h}`);
      }
      return;
    }
    if (line.length > 220) {
      for (const part of line.split(/(?<=[.!؟?؛;])\s+/)) push(part);
    } else {
      for (const part of line.split(/\s*[•▪●]\s*/)) push(part);
    }
  });
  while (out.length && out[out.length - 1]!.startsWith("# ")) out.pop();
  return out;
}

/** Words that name a service outright (document title / body). */
const SERVICE_WORDS: Record<string, string[]> = {
  pharmacy: ["صيدليه", "صيدليات", "صيدلي", "pharmacy", "pharmacies", "ادويه", "دواء"],
  real_estate: ["عقار", "عقارات", "عقاري", "real", "estate", "شقق", "كمبوند"],
  ecommerce: ["متجر", "store", "shop", "ecommerce", "e-commerce", "سله"],
  websites: ["website", "موقع", "landing"],
  mobile_apps: ["تطبيق", "app", "android", "ios"],
  erp: ["erp", "مخازن", "موارد", "حسابات", "مشتريات"],
  marketplace: ["marketplace", "مقدمي", "عموله", "عمولات"],
  ai_automation: ["ذكاء", "ai", "اتمته", "automation", "chatbot"],
  platforms: ["منصه", "platform", "بوابه", "portal"],
};

/**
 * Which service a requirements document is about, or null for a custom project.
 * Most requirement lines must actually match that service's package features.
 */
export function detectService(text: string): Service | null {
  const lines = requirementsFromDocument(text).filter((l) => !l.startsWith("# "));
  if (!lines.length) return null;
  const words = tokens(text);
  let best: { svc: Service; score: number } | null = null;
  for (const svc of SERVICES) {
    const index = indexService(svc);
    const matched = lines.filter((l) => matchRequirement(svc, l, index) !== "extra").length;
    const named = (SERVICE_WORDS[svc.key] ?? []).some((w) => words.has(CANON.get(w) ?? w));
    const score = matched / lines.length + (named ? 0.2 : 0);
    if (!best || score > best.score) best = { svc, score };
  }
  return best && best.score >= 0.6 ? best.svc : null;
}
