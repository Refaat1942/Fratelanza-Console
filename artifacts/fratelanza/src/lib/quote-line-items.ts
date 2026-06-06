export type QuoteLineItem = { desc: string; price: number };

/** Hidden separator — line-item JSON is stored after this in projectName as a backup. */
export const LINE_ITEMS_PACK_SEP = "\x1e";

export function packProjectName(items: QuoteLineItem[]): string {
  const summary = items.map((i) => i.desc).join("; ");
  const visible = summary.length > 200 ? `${items.length} Items Included` : summary;
  return `${visible}${LINE_ITEMS_PACK_SEP}${JSON.stringify(items)}`;
}

export function displayProjectName(projectName?: string | null): string {
  if (!projectName) return "—";
  const idx = projectName.indexOf(LINE_ITEMS_PACK_SEP);
  return idx >= 0 ? projectName.slice(0, idx) : projectName;
}

function splitLegacyDescriptions(projectName: string): string[] {
  const visible = displayProjectName(projectName);
  if (visible.includes(";")) {
    return visible.split(";").map((s) => s.trim()).filter(Boolean);
  }
  if (visible.includes(" + ")) {
    return visible.split(" + ").map((s) => s.trim()).filter(Boolean);
  }
  return visible.trim() ? [visible.trim()] : [];
}

export function resolveQuoteLineItems(q: {
  projectName?: string | null;
  lineItems?: QuoteLineItem[] | null;
  price: number;
}): QuoteLineItem[] {
  if (q.lineItems?.length) return q.lineItems;

  const packed = q.projectName ?? "";
  const sepIdx = packed.indexOf(LINE_ITEMS_PACK_SEP);
  if (sepIdx >= 0) {
    try {
      const parsed = JSON.parse(packed.slice(sepIdx + LINE_ITEMS_PACK_SEP.length)) as QuoteLineItem[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item) => ({
          desc: String(item.desc ?? ""),
          price: Number(item.price ?? 0),
        }));
      }
    } catch {
      /* fall through */
    }
  }

  const parts = splitLegacyDescriptions(packed);
  if (parts.length === 0) return [];
  if (parts.length === 1) return [{ desc: parts[0], price: q.price }];
  return parts.map((desc) => ({ desc, price: 0 }));
}
