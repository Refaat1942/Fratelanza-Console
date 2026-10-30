/**
 * Specification documents for the technical proposal.
 *
 * The specification is kept as simple Markdown (editable in a text box):
 *   # / ## / ### headings, paragraphs, "- " and "1. " lists, | tables |, **bold**.
 * Word files are converted to the same Markdown (keeping headings, lists and
 * tables); the proposal renders it with the corporate styles. Everything is
 * HTML-escaped before formatting, so no markup from a document reaches the page.
 */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** **bold** and `code` inside a line (after escaping). */
function inline(text: string): string {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;

const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const numeric = (c: string) => /^[\d,.\s%−\-+×=]+(?:\s*(?:جنيه|جنيهًا|جنيهات|كيلو|EGP))?$/.test(c.replace(/\*\*/g, "")) && /\d/.test(c);

/** Section headings that are not a title ("1. مقدمة", "Introduction"…). */
const SECTION_LIKE = /^(?:\d{1,2}(?:\.\d{1,2})*[.)]?\s|مقدمة|مقدمه|introduction|overview|نبذة|الفهرس|المحتويات|contents)/i;
const NAMES_SYSTEM = /(?:نظام|منصة|منصه|تطبيق|موقع|بوابة|بوابه|برنامج|system|platform|application|app\b|portal|website)/i;

/**
 * The document title: its first level-1 heading ("# المواصفات الفنية لنظام …"),
 * or — when the document starts with a bold cover ("**نظام إدارة مركز …**") and
 * its headings are numbered sections — the cover line that names the system.
 */
export function specTitle(md: string): string {
  const lines = md.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const firstHeading = lines.find((l) => HEADING.test(l));
  const m = firstHeading ? HEADING.exec(firstHeading) : null;
  const headingText = m ? m[2]!.replace(/\*\*/g, "").trim() : "";
  if (m && m[1] === "#" && !SECTION_LIKE.test(headingText)) return headingText;
  // Cover lines before the first heading (bold or short), preferring one that names the system
  const cover: string[] = [];
  for (const l of lines) {
    if (HEADING.test(l)) break;
    const text = l.replace(/\*\*/g, "").trim();
    if (text && text.length <= 120 && !/[:：]/.test(text)) cover.push(text);
  }
  return cover.find((c) => NAMES_SYSTEM.test(c)) ?? cover[0] ?? "";
}

/** Main sections ("1. وصف عام للنظام", "2. إدارة الأصناف والمخزون", …) used as quotation items. */
export function specSections(md: string): string[] {
  const heads = md.split(/\r?\n/).map((l) => HEADING.exec(l.trim())).filter(Boolean) as RegExpExecArray[];
  const title = specTitle(md);
  const top = heads.filter((h) => h[2]!.replace(/\*\*/g, "").trim() !== title);
  const minLevel = Math.min(...top.map((h) => h[1]!.length));
  // Main sections are the highest level used after the title; skip sub-numbers like "2.1"
  return top
    .filter((h) => h[1]!.length === minLevel || /^\d{1,2}[.)]\s/.test(h[2]!.trim()) && !/^\d+\.\d+/.test(h[2]!.trim()))
    .map((h) => h[2]!.replace(/\*\*/g, "").replace(/^\d{1,2}[.)]\s*/, "").trim())
    // Introductions, conclusions and approval rules are not items to price
    .filter((t, i, all) => t && all.indexOf(t) === i
      && !/^(?:النتيجة المستهدفة|الخلاصة|الخاتمة|summary|conclusion|وصف عام|نبذة|مقدمة|overview|introduction|general description)/i.test(t)
      && !/^قواعد .*(?:الاعتماد|التنفيذ)|^(?:assumptions|approval)/i.test(t));
}

/** Does the text look like a structured document (headings / tables / paragraphs) rather than a one-per-line list? */
export function looksLikeSpec(md: string): boolean {
  const lines = md.split(/\r?\n/).filter((l) => l.trim());
  const headings = lines.filter((l) => HEADING.test(l.trim())).length;
  const tables = lines.filter((l) => TABLE_ROW.test(l)).length;
  const longLines = lines.filter((l) => l.length > 120).length;
  return headings >= 2 || tables >= 3 || longLines >= 3;
}

/**
 * Markdown → HTML for the proposal. Headings are shifted so the document fits
 * under the proposal's own section title: the first level used becomes a
 * section heading, the next a sub-heading.
 */
export function renderSpec(md: string, opts: { skipTitle?: string } = {}): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let skippedTitle = false;
  // Levels in use (excluding a skipped title) → spec-h1 / spec-h2 / spec-h3
  const levels = [...new Set(lines.flatMap((l) => {
    const m = HEADING.exec(l.trim());
    if (!m) return [];
    if (opts.skipTitle && m[2]!.replace(/\*\*/g, "").trim() === opts.skipTitle) return [];
    return [m[1]!.length];
  }))].sort((a, b) => a - b);

  const flushPara = () => {
    if (!para.length) return;
    const text = para.join(" ").trim();
    para = [];
    if (!text) return;
    // A line that is only bold ("**مثال:**") is a small label
    if (/^\*\*[^*]+\*\*$/.test(text)) out.push(`<p class="spec-label">${inline(text.slice(2, -2))}</p>`);
    else out.push(`<p>${inline(text)}</p>`);
  };
  const flushList = () => {
    if (!list) return;
    out.push(`<${list.type} class="spec-list">${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.type}>`);
    list = null;
  };

  // The proposal prints its own approval / signature block, so the document's is left out
  const SIGN = /(?:التوقيع|التوقيعات|اعتماد العميل|اعتماد الطرفين|signature|sign-?off)/i;
  let skipUntil = 0; // inside a signature section: skip until a heading at this level or higher
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }

    const h = HEADING.exec(line);
    if (skipUntil) {
      if (!h || h[1]!.length > skipUntil) continue;
      skipUntil = 0;
    }
    if (h && SIGN.test(h[2]!)) { flushPara(); flushList(); skipUntil = h[1]!.length; continue; }
    if (h) {
      flushPara(); flushList();
      const text = h[2]!.replace(/\*\*/g, "").trim();
      if (opts.skipTitle && !skippedTitle && text === opts.skipTitle) { skippedTitle = true; continue; }
      const rank = Math.max(0, levels.indexOf(h[1]!.length));
      out.push(`<h3 class="spec-h${Math.min(rank, 2) + 1}">${inline(text)}</h3>`);
      continue;
    }

    if (TABLE_ROW.test(raw)) {
      flushPara(); flushList();
      const rows: string[][] = [];
      let header: string[] | null = null;
      while (i < lines.length && TABLE_ROW.test(lines[i]!)) {
        const row = lines[i]!;
        if (TABLE_SEP.test(row)) { if (!header && rows.length) header = rows.pop()!; }
        else rows.push(cells(row));
        i += 1;
      }
      i -= 1;
      // A signature table ("الطرف الأول … التوقيع") is replaced by the proposal's own approval block
      if ([...(header ?? []), ...rows.flat()].join(" ").match(/التوقيع|signature/i)) continue;
      const head = header ? `<thead><tr>${header.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>` : "";
      const body = rows.map((r) => `<tr>${r.map((c) => `<td${numeric(c) ? ' class="num"' : ""}>${inline(c)}</td>`).join("")}</tr>`).join("");
      out.push(`<table class="spec-table">${head}<tbody>${body}</tbody></table>`);
      continue;
    }

    const b = BULLET.exec(raw);
    const n = b ? null : NUMBERED.exec(raw);
    if (b || n) {
      flushPara();
      const type = b ? "ul" : "ol";
      if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
      list.items.push((b ? b[1] : n![2])!.trim());
      continue;
    }

    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return `<div class="spec">${out.join("\n")}</div>`;
}

/* ───────────── Word (HTML from the server) → Markdown ───────────── */

function textOf(node: Node): string {
  let s = "";
  node.childNodes.forEach((c) => {
    if (c.nodeType === Node.TEXT_NODE) s += c.textContent ?? "";
    else if (c instanceof HTMLElement) {
      const t = textOf(c);
      if ((c.tagName === "STRONG" || c.tagName === "B") && t.trim()) s += `**${t.trim()}** `;
      else if (c.tagName === "BR") s += " ";
      else s += t;
    }
  });
  return s.replace(/\s+/g, " ").replace(/\*\*\s+\*\*/g, " ").trim();
}

/** Convert the HTML of a Word document into the Markdown used by the proposal. */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: string[] = [];
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName;
      if (/^H[1-6]$/.test(tag)) {
        const t = textOf(child).replace(/\*\*/g, "");
        if (t) out.push(`${"#".repeat(Number(tag[1]))} ${t}`, "");
      } else if (tag === "P") {
        const t = textOf(child);
        if (t) out.push(t, "");
      } else if (tag === "UL" || tag === "OL") {
        Array.from(child.children).forEach((li, i) => {
          const t = textOf(li);
          if (t) out.push(tag === "UL" ? `- ${t}` : `${i + 1}. ${t}`);
        });
        out.push("");
      } else if (tag === "TABLE") {
        const rows = Array.from(child.querySelectorAll("tr")).map((tr) => Array.from(tr.children).map((td) => textOf(td).replace(/\|/g, "/")));
        if (rows.length) {
          const width = Math.max(...rows.map((r) => r.length));
          const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
          out.push(`| ${pad(rows[0]!).join(" | ")} |`, `|${Array(width).fill("---").join("|")}|`);
          rows.slice(1).forEach((r) => out.push(`| ${pad(r).join(" | ")} |`));
          out.push("");
        }
      } else {
        walk(child);
      }
    }
  };
  walk(doc.body);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ───────────── Package contents from a specification ───────────── */

export type SpecTier = "starter" | "business" | "enterprise";
/** One deliverable from the specification and the first package that includes it. */
/** A package item: the deliverable, its section, its package and (from AI) its specs in a sentence. */
export type SpecItem = { text: string; section: string; tier: SpecTier; detail?: string };

const clean = (h: string) => h.replace(/\*\*/g, "").replace(/^\d{1,2}(?:\.\d{1,2})*[.)]?\s*/, "").trim();
const SKIP = /^(?:النتيجة المستهدفة|الخلاصة|الخاتمة|summary|conclusion|وصف عام|نبذة|مقدمة|مقدمه|overview|introduction|general description|قواعد .*(?:الاعتماد|التنفيذ)|assumptions|approval|الأهداف|الاهداف|أهداف|اهداف|objectives|goals|الوحدات الرئيسية|main modules|مراحل|المرحلة|المرحله|خطة العمل|خطه العمل|الجدول الزمني|phase|timeline|milestone|مسؤوليات|مسئوليات|التزامات العميل|responsibilit|نقاط تحتاج|حدود النطاق|خارج النطاق|out of scope|scope limits|معايير القبول|acceptance|اعتماد|التوقيع|التوقيعات|signature|sign-?off|ملاحظات|notes|افتراضات|الافتراضات|المراجع|references|الملاحق|appendix)/i;

/** Does the specification describe its own delivery phases? (then the generic stages are not repeated) */
export function hasOwnPhases(md: string): boolean {
  return md.split(/\r?\n/).some((l) => {
    const m = HEADING.exec(l.trim());
    return !!m && /(?:مراحل|خطة العمل|خطه العمل|الجدول الزمني|phases|timeline|work plan)/i.test(m[2]!);
  });
}

/**
 * Deliverables of a specification: each sub-section ("3.2 البيع الكاش العادي")
 * under its main section, or the main section itself when it has none.
 */
export function specItems(md: string): { text: string; section: string }[] {
  const title = specTitle(md);
  const heads = md.split(/\r?\n/).map((l) => HEADING.exec(l.trim())).filter(Boolean)
    .map((m) => ({ level: m![1]!.length, raw: m![2]!.replace(/\*\*/g, "").trim() }))
    .filter((h) => h.raw !== title);
  if (!heads.length) return [];
  // Main sections: numbered "N." headings, else the highest level used
  const numbered = heads.filter((h) => /^\d{1,2}[.)]\s/.test(h.raw) && !/^\d+\.\d+/.test(h.raw));
  const top = Math.min(...heads.map((h) => h.level));
  const isMain = (h: { level: number; raw: string }) => (numbered.length >= 2 ? numbered.includes(h) : h.level === top);

  const out: { text: string; section: string }[] = [];
  let section = "";
  let sectionHasSubs = false;
  let skipSection = false;
  const closeSection = () => { if (section && !sectionHasSubs && !skipSection) out.push({ text: section, section }); };
  for (const h of heads) {
    if (isMain(h)) {
      closeSection();
      section = clean(h.raw);
      skipSection = SKIP.test(section);
      sectionHasSubs = false;
    } else if (section && !skipSection) {
      const text = clean(h.raw);
      if (text && !SKIP.test(text) && !/^(?:مثال|example)/i.test(text)) { out.push({ text, section }); sectionHasSubs = true; }
    }
  }
  closeSection();
  return out.filter((x, i, all) => all.findIndex((y) => y.text === x.text) === i);
}

// Words that mark an item as advanced (Enterprise) or extended (Business); everything else is core (Starter)
const ADVANCED = /(?:فروع|تعدد|متعدد|multi|tenant|منشآت|تكامل|ربط|api|استيراد|import|excel|csv|ذكاء|ai\b|تحليل|analytics|متقدم|advanced|ميزانية|balance sheet|قائمة الدخل|أرباح|ارباح|profit|مستندات|documents|نسخ\s*(?:ال)?احتياطي|backup|تطبيق موبايل|mobile app|عمولة|عموله|commission|ضرائب|tax|سحابي|cloud|تخصيص|custom)/i;
const EXTENDED = /(?:تقارير|تقرير|report|صلاحيات|permission|مستخدم|user|تنبيه|تنبيهات|alert|إشعار|اشعار|notification|آجل|اجل|credit|تحصيل|collection|كشف حساب|statement|موردين|مورد|supplier|خزنة|خزنه|cash|مصروفات|expense|لوحة|dashboard|متابعة|متابعه|مرتجع|جرد|inventory count|حسابات|accounts)/i;

/**
 * First package for each deliverable: advanced → Enterprise, extended → Business,
 * core → Starter; then balanced so every package has its own items.
 */
export function autoTierItems(items: { text: string; section: string }[]): SpecItem[] {
  const tierOf = (x: { text: string; section: string }): SpecTier => {
    const s = `${x.text} ${x.section}`;
    if (ADVANCED.test(x.text)) return "enterprise";
    if (EXTENDED.test(x.text)) return "business";
    if (ADVANCED.test(s)) return "business";
    return "starter";
  };
  const out: SpecItem[] = items.map((x) => ({ ...x, tier: tierOf(x) }));
  const count = (t: SpecTier) => out.filter((x) => x.tier === t).length;
  if (out.length >= 3) {
    // Nothing basic found: the first items become the Starter core
    if (count("starter") === 0) out.slice(0, Math.max(1, Math.round(out.length / 3))).forEach((x) => { x.tier = "starter"; });
    // Starter must not hold almost everything: move its later items up
    const starters = out.filter((x) => x.tier === "starter");
    if (starters.length > out.length * 0.6) starters.slice(Math.ceil(out.length * 0.4)).forEach((x) => { x.tier = "business"; });
    if (count("business") === 0) { const s = out.filter((x) => x.tier === "starter"); if (s.length > 1) s[s.length - 1]!.tier = "business"; }
    if (count("enterprise") === 0) { const b = out.filter((x) => x.tier === "business"); if (b.length > 1) b[b.length - 1]!.tier = "enterprise"; }
  }
  return out;
}
