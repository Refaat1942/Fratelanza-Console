import { TIERS, type Service, type Tier } from "@/lib/service-catalog";

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
  const idf = (w: string) => Math.log(1 + list.length / (df.get(w) ?? 1));
  return { list, idf };
}

/** Score needed for a match; weaker matches become additional development. */
const MIN_SCORE = 2.2;
/** Share of the requirement's meaning a feature must cover. */
const MIN_COVERAGE = 0.45;

/** Best package feature for one requirement, or "extra" when nothing fits. */
export function matchRequirement(svc: Service, text: string, index = indexService(svc)): string {
  const req = tokens(text);
  if (req.size === 0) return "extra";
  const n = quantity(text);
  const total = [...req].reduce((s, w) => s + 2 * index.idf(w), 0);
  let best: { key: string; score: number; tier: number } | null = null;
  for (const f of index.list) {
    // "10 pages" is not covered by "up to 5 pages"
    if (n != null && f.limit != null && n > f.limit) continue;
    let score = 0;
    for (const w of req) score += (f.title.has(w) ? 2 : f.body.has(w) ? 1 : 0) * index.idf(w);
    if (score / total < MIN_COVERAGE) continue;
    const tier = TIERS.indexOf(f.tier);
    if (score > 0 && (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && tier < best.tier))) best = { key: f.key, score, tier };
  }
  return best && best.score >= MIN_SCORE ? best.key : "extra";
}

/** Split the typed text into requirements (one per line / bullet) and match each one. */
export function analyzeRequirements(svc: Service, text: string, previous: Requirement[] = []): Requirement[] {
  const index = indexService(svc);
  const lines = text.split(/\r?\n|[•;؛]/).map((l) => l.replace(/^\s*([-*–]|\d+[.)-])\s*/, "").trim()).filter((l) => l.length > 1);
  return lines.map((line) => {
    const prev = previous.find((p) => p.text === line);
    const match = matchRequirement(svc, line, index);
    return { text: line, match, price: match === "extra" ? prev?.price ?? 0 : 0 };
  });
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
