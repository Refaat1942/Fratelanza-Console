/** Remove PDF TOC dots, leaders, and stray page numbers */
export function cleanOutlineText(text: string): string {
  return text
    .replace(/[\u2024\u2025\u2026\u00B7·…]{2,}/g, " ")
    .replace(/\.{4,}/g, " ")
    .replace(/_{3,}/g, " ")
    .replace(/-{4,}/g, " ")
    .replace(/[^\S\n]{3,}/g, " ")
    .replace(/^(.+?)[\s\.]{2,}\d+\s*$/gm, "$1")
    .replace(/^\s*\d+\s*[\.\)]\s+/gm, "")
    .replace(/^--\s*\d+\s+of\s+\d+\s*--\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^[\d\s\.\-_]+$/.test(l))
    .join("\n")
    .trim();
}

export const PAGE_SEPARATOR = "\n\n---PAGE---\n\n";

export function splitOutlineIntoPages(text: string): string[] {
  const cleaned = cleanOutlineText(text);
  if (!cleaned) return [""];

  if (cleaned.includes("---PAGE---")) {
    return cleaned.split(/\n*---PAGE---\n*/).map((p) => p.trim()).filter(Boolean);
  }

  const sectionChunks = cleaned.split(/\n(?=(?:\/\s*)?\d{1,2}\s+[\/\u0600-\u06FFA-Za-z])/).filter(Boolean);
  if (sectionChunks.length > 1) {
    const pages: string[] = [];
    for (let i = 0; i < sectionChunks.length; i += 2) {
      pages.push(sectionChunks.slice(i, i + 2).join("\n\n"));
    }
    return pages;
  }

  const paragraphs = cleaned.split(/\n\n+/).filter(Boolean);
  if (paragraphs.length <= 1) {
    const lines = cleaned.split("\n");
    if (lines.length <= 12) return [cleaned];
    const pages: string[] = [];
    for (let i = 0; i < lines.length; i += 12) {
      pages.push(lines.slice(i, i + 12).join("\n"));
    }
    return pages;
  }

  const pages: string[] = [];
  for (let i = 0; i < paragraphs.length; i += 3) {
    pages.push(paragraphs.slice(i, i + 3).join("\n\n"));
  }
  return pages.length > 0 ? pages : [cleaned];
}

export function joinOutlinePages(pages: string[]): string {
  return pages.map((p) => p.trim()).filter(Boolean).join(PAGE_SEPARATOR);
}

export function parseOutlinePages(combined: string): string[] {
  if (!combined.trim()) return [""];
  if (combined.includes("---PAGE---")) {
    const pages = combined.split(/\n*---PAGE---\n*/).map((p) => cleanOutlineText(p)).filter(Boolean);
    return pages.length > 0 ? pages : [""];
  }
  return splitOutlineIntoPages(combined);
}
