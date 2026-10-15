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

/** The document title: its first level-1 heading ("# المواصفات الفنية لنظام …"). */
export function specTitle(md: string): string {
  for (const line of md.split(/\r?\n/)) {
    const m = HEADING.exec(line.trim());
    if (m) return m[1] === "#" ? m[2]!.replace(/\*\*/g, "").trim() : "";
  }
  return "";
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

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }

    const h = HEADING.exec(line);
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
