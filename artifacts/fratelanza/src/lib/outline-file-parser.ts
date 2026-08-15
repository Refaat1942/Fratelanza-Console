import { cleanOutlineText, joinOutlinePages, normalizeOutlineText } from "@/lib/outline-pages";

/** Returns true when text looks like raw PDF/binary instead of readable outline */
export function isPdfOrBinaryJunk(text: string): boolean {
  const sample = text.slice(0, 4000);
  if (sample.startsWith("%PDF")) return true;
  if (/<<\s*\/Type\s*\//.test(sample)) return true;
  if (/\b\d+\s+\d+\s+obj\b/.test(sample) && /\bendobj\b/.test(sample)) return true;
  if (/StructElem|\/FontDescriptor|\/Metadata/.test(sample) && /\bstream\b/.test(sample)) return true;

  const letters = (sample.match(/[\u0600-\u06FFa-zA-Z]/g) ?? []).length;
  const digits = (sample.match(/\d/g) ?? []).length;
  if (sample.length > 200 && letters + digits < sample.length * 0.08) return true;

  return false;
}

export function detectOutlineLanguage(text: string): "English" | "Arabic" {
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return arabic > latin * 0.4 ? "Arabic" : "English";
}

export function validateOutlineText(text: string): void {
  const normalized = normalizeOutlineText(text);
  if (normalized.length < 10) {
    throw new Error("Could not extract enough text from this file.");
  }
  if (isPdfOrBinaryJunk(normalized)) {
    throw new Error(
      "This file contains PDF code, not readable text. Use a text-based PDF or paste the outline manually.",
    );
  }
}

function apiBase(): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
}

async function parseFileOnServer(file: File): Promise<{
  text: string;
  detectedLanguage: "English" | "Arabic";
}> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${apiBase()}/quotes/parse-outline-file`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });

  let data: { text?: string; detectedLanguage?: string; error?: string } = {};
  const contentType = r.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      data = await r.json();
    } catch {
      /* fall through */
    }
  }

  if (!r.ok) {
    const err = new Error(data.error ?? `Upload failed (${r.status})`) as Error & { status?: number };
    err.status = r.status;
    throw err;
  }

  const text = normalizeOutlineText(data.text ?? "");
  validateOutlineText(text);
  return {
    text,
    detectedLanguage: data.detectedLanguage === "Arabic" ? "Arabic" : detectOutlineLanguage(text),
  };
}

let pdfWorkerReady = false;

async function ensurePdfWorker(pdfjs: typeof import("pdfjs-dist")): Promise<void> {
  if (pdfWorkerReady) return;
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  } catch {
    pdfjs.GlobalWorkerOptions.workerSrc =
      `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  pdfWorkerReady = true;
}

type PdfTextItem = { str?: string; transform?: number[] };

/** Group PDF text fragments by vertical position into readable lines */
function groupPdfItemsIntoLines(items: PdfTextItem[]): string[] {
  type Positioned = { str: string; x: number; y: number };
  const positioned: Positioned[] = [];

  for (const item of items) {
    if (!item.str?.trim()) continue;
    const t = item.transform ?? [];
    positioned.push({ str: item.str, x: t[4] ?? 0, y: t[5] ?? 0 });
  }

  positioned.sort((a, b) => b.y - a.y || a.x - b.x);

  const rows: { y: number; parts: Positioned[] }[] = [];
  const yTolerance = 4;

  for (const p of positioned) {
    const row = rows.find((r) => Math.abs(r.y - p.y) <= yTolerance);
    if (row) {
      row.parts.push(p);
      row.y = (row.y + p.y) / 2;
    } else {
      rows.push({ y: p.y, parts: [p] });
    }
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => {
      row.parts.sort((a, b) => a.x - b.x);
      return cleanOutlineText(row.parts.map((p) => p.str).join(" "));
    })
    .filter((line) => line.length > 0);
}

export async function extractPdfTextInBrowser(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  await ensurePdfWorker(pdfjs);

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer, useSystemFonts: true }).promise;
  const pages: string[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const pageLines = groupPdfItemsIntoLines(content.items as PdfTextItem[]);
    if (pageLines.length > 0) pages.push(pageLines.join("\n"));
    page.cleanup();
  }

  return pages.length > 0 ? joinOutlinePages(pages) : "";
}

async function parsePdfFile(file: File): Promise<{ text: string; detectedLanguage: "English" | "Arabic" }> {
  let browserError: unknown;
  try {
    const text = await extractPdfTextInBrowser(file);
    validateOutlineText(text);
    return { text, detectedLanguage: detectOutlineLanguage(text) };
  } catch (err) {
    browserError = err;
  }

  try {
    return await parseFileOnServer(file);
  } catch (serverErr) {
    const browserMsg = browserError instanceof Error ? browserError.message : String(browserError);
    const serverMsg = serverErr instanceof Error ? serverErr.message : String(serverErr);
    const serverStatus = (serverErr as Error & { status?: number }).status;
    if (serverStatus === 404) {
      throw new Error(
        `PDF could not be read in the browser (${browserMsg}). Redeploy the API container for server-side parsing.`,
      );
    }
    throw new Error(`${browserMsg}. Server fallback: ${serverMsg}`);
  }
}

export async function extractOutlineFromFile(file: File): Promise<{
  text: string;
  detectedLanguage: "English" | "Arabic";
}> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isPdf = ext === "pdf" || file.type === "application/pdf";
  const isText = ext === "txt" || ext === "md" || ext === "csv" || file.type.startsWith("text/");

  if (isText) {
    const text = normalizeOutlineText(await file.text());
    validateOutlineText(text);
    return { text, detectedLanguage: detectOutlineLanguage(text) };
  }

  if (isPdf) {
    return parsePdfFile(file);
  }

  return parseFileOnServer(file);
}
