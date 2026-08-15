import { cleanOutlineText, joinOutlinePages, splitOutlineIntoPages } from "@/lib/outline-pages";

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

export function normalizeOutlineText(text: string): string {
  if (!text.trim()) return "";
  if (text.includes("---PAGE---")) {
    const pages = text.split(/\n*---PAGE---\n*/).map(cleanOutlineText).filter(Boolean);
    return pages.length > 0 ? joinOutlinePages(pages) : "";
  }
  return joinOutlinePages(splitOutlineIntoPages(text));
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

  let data: { text?: string; detectedLanguage?: string; error?: string };
  try {
    data = await r.json();
  } catch {
    throw new Error(`Server error (${r.status}). Try again or paste the outline manually.`);
  }

  if (!r.ok) {
    throw new Error(data.error ?? `Upload failed (${r.status})`);
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
  // Version-matched CDN worker avoids broken hashed asset paths in production builds
  pdfjs.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  pdfWorkerReady = true;
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
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const cleaned = cleanOutlineText(line);
    if (cleaned) pages.push(cleaned);
    page.cleanup();
  }

  return pages.length > 0 ? joinOutlinePages(pages) : "";
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

  // PDF: server parser first (reliable on VPS), browser fallback if server unavailable
  if (isPdf) {
    try {
      return await parseFileOnServer(file);
    } catch (serverErr) {
      try {
        const text = await extractPdfTextInBrowser(file);
        validateOutlineText(text);
        return { text, detectedLanguage: detectOutlineLanguage(text) };
      } catch {
        throw serverErr instanceof Error ? serverErr : new Error(String(serverErr));
      }
    }
  }

  // DOCX and other formats — server only
  return parseFileOnServer(file);
}
