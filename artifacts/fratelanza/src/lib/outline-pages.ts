export {
  cleanOutlineText,
  dedupeLines,
  dedupeReportLines,
  extractMeaningfulSections,
  genericScopeItems,
  isBoilerplateLine,
  isLowQualitySection,
  joinOutlinePages,
  normalizeOutlineText,
  PAGE_SEPARATOR,
  splitOutlineIntoPages,
} from "@workspace/outline-utils";

import { cleanOutlineText, splitOutlineIntoPages } from "@workspace/outline-utils";

export function parseOutlinePages(combined: string): string[] {
  if (!combined.trim()) return [""];
  if (combined.includes("---PAGE---")) {
    const pages = combined.split(/\n*---PAGE---\n*/).map((p) => cleanOutlineText(p)).filter(Boolean);
    return pages.length > 0 ? pages : [""];
  }
  return splitOutlineIntoPages(combined);
}
