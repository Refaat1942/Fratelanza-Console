/** Remove PDF TOC dots, leaders, stray page numbers, and spaced-dot artifacts */
export function cleanOutlineText(text: string): string {
  return text
    .replace(/[\u2024\u2025\u2026\u00B7·…]{2,}/g, " ")
    .replace(/(?:^|\s)(?:\.\s+){3,}/g, " ")
    .replace(/\b(\d+)\s+(?:\.\s+){2,}/g, "$1 ")
    .replace(/\.{4,}/g, " ")
    .replace(/_{3,}/g, " ")
    .replace(/-{4,}/g, " ")
    .replace(/[^\S\n]{3,}/g, " ")
    .replace(/^(.+?)[\s\.]{2,}\d+\s*$/gm, "$1")
    .replace(/^\s*\d+\s*[\.\)]\s+(?=\d+\s)/gm, "")
    .replace(/^--\s*\d+\s+of\s+\d+\s*--\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^[\d\s\.\-_·…]+$/.test(l))
    .join("\n")
    .trim();
}

const BOILERPLATE_RE = [
  /^FRATELANZA\s*$/i,
  /^(?:page|صفحة)\s*\d+/i,
  /^--\s*\d+\s+of\s+\d+\s*--$/i,
  /^(?:version|الإصدار|تاريخ|date)\s*[:\-—]/i,
  /^(?:BRD|FRD)\b/i,
  /^confidential|سري\s*$/i,
  /^[\d\s\.\-_·…]+$/,
];

export function isBoilerplateLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length < 3) return true;
  if (/^[\s\.\-_·…\d]+$/.test(t)) return true;

  const withoutDots = t.replace(/[\s\.\-_·…]/g, "");
  if (withoutDots.length < 6 && t.length > 12) return true;

  if (/^FRATELANZA\b/i.test(t) && /(?:الإصدار|version|تاريخ|BRD|FRD|ERP\s)/i.test(t) && t.length < 200) {
    return true;
  }

  if (/\.{3,}/.test(t) && withoutDots.length < 20) return true;

  return BOILERPLATE_RE.some((re) => re.test(t));
}

export function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 100);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function mergeIntoChunks(text: string, minLen: number, maxLen: number): string[] {
  const words = text.replace(/\n/g, " ").split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    if (isBoilerplateLine(word)) continue;
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLen && current.length >= minLen) {
      chunks.push(current.trim());
      current = word;
    } else {
      current = next;
    }
  }

  if (current.trim().length >= minLen) chunks.push(current.trim());
  return dedupeLines(chunks);
}

/** Pull readable scope sections from messy PDF/DOCX text */
export function extractMeaningfulSections(outline: string): string[] {
  const cleaned = cleanOutlineText(outline);
  if (!cleaned) return [];

  const paragraphs = cleaned
    .split(/\n\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 15 && !isBoilerplateLine(p));

  const lines = cleaned
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 8 && !isBoilerplateLine(l));

  const dedupedLines = dedupeLines(lines);
  const dedupedParagraphs = dedupeLines(paragraphs);

  const fragmented =
    dedupedLines.length > 12 &&
    dedupedLines.filter((l) => l.length < 45).length > dedupedLines.length * 0.6;

  if (fragmented) {
    if (dedupedParagraphs.length >= 2) return dedupedParagraphs.slice(0, 20);
    return mergeIntoChunks(cleaned, 60, 350).slice(0, 12);
  }

  if (dedupedLines.length >= 2) return dedupedLines.slice(0, 25);
  if (dedupedParagraphs.length >= 1) return dedupedParagraphs;
  return dedupedLines;
}

export function isLowQualitySection(desc: string): boolean {
  if (/\.{3,}/.test(desc)) return true;
  if ((desc.match(/FRATELANZA/gi) ?? []).length >= 2) return true;
  if (/^FRATELANZA\b/i.test(desc) && desc.length < 180) return true;
  const words = desc.split(/\s+/);
  if (words.length > 10 && desc.length < 55) return true;
  return false;
}

export const GENERIC_SCOPE_EN = [
  "Requirements analysis & BRD/FRD",
  "Core ERP setup & configuration",
  "Manufacturing & inventory modules",
  "HR & resource management",
  "Integration, testing & UAT",
  "Training & go-live support",
];

export const GENERIC_SCOPE_AR = [
  "تحليل المتطلبات وإعداد BRD/FRD",
  "إعداد النظام الأساسي ERP",
  "وحدات التصنيع والمخزون",
  "الموارد البشرية وإدارة الموارد",
  "التكامل والاختبار وقبول المستخدم",
  "التدريب والتشغيل الفعلي",
];

export function genericScopeItems(count: number, language: "English" | "Arabic"): string[] {
  const pool = language === "Arabic" ? GENERIC_SCOPE_AR : GENERIC_SCOPE_EN;
  return pool.slice(0, Math.max(1, Math.min(count, pool.length)));
}

export const PAGE_SEPARATOR = "\n\n---PAGE---\n\n";

export function splitOutlineIntoPages(text: string): string[] {
  const cleaned = cleanOutlineText(text);
  if (!cleaned) return [""];

  if (cleaned.includes("---PAGE---")) {
    return cleaned.split(/\n*---PAGE---\n*/).map((p) => p.trim()).filter(Boolean);
  }

  const paragraphs = cleaned.split(/\n\n+/).filter(Boolean);
  if (paragraphs.length <= 1) {
    const lines = cleaned.split("\n");
    if (lines.length <= 12) return [cleaned];
    const pages: string[] = [];
    for (let i = 0; i < lines.length; i += 10) {
      pages.push(lines.slice(i, i + 10).join("\n"));
    }
    return pages;
  }

  const pages: string[] = [];
  for (let i = 0; i < paragraphs.length; i += 2) {
    pages.push(paragraphs.slice(i, i + 2).join("\n\n"));
  }
  return pages.length > 0 ? pages : [cleaned];
}

export function joinOutlinePages(pages: string[]): string {
  return pages.map((p) => p.trim()).filter(Boolean).join(PAGE_SEPARATOR);
}

export function normalizeOutlineText(text: string): string {
  if (!text.trim()) return "";
  if (text.includes("---PAGE---")) {
    const pages = text.split(/\n*---PAGE---\n*/).map(cleanOutlineText).filter(Boolean);
    return pages.length > 0 ? joinOutlinePages(pages) : "";
  }
  return joinOutlinePages(splitOutlineIntoPages(text));
}
