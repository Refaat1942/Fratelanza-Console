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
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/^--\s*\d+\s+of\s+\d+\s*--\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

export async function extractPdfTextInBrowser(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer, useSystemFonts: true }).promise;
  const parts: string[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) parts.push(line);
    page.cleanup();
  }

  return normalizeOutlineText(parts.join("\n\n"));
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
    const text = await extractPdfTextInBrowser(file);
    validateOutlineText(text);
    return { text, detectedLanguage: detectOutlineLanguage(text) };
  }

  // DOCX and other formats — server only
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${apiBase}/quotes/parse-outline-file`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });

  let data: { text?: string; detectedLanguage?: string; error?: string };
  try {
    data = await r.json();
  } catch {
    throw new Error(r.status === 404
      ? "Server file parser not available. For PDF use Upload — client parsing is used automatically."
      : `Server error (${r.status}). Try again or paste the outline manually.`);
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
