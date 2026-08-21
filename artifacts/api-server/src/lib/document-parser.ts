import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { normalizeOutlineText } from "@workspace/outline-utils";

const MAX_BYTES = 10 * 1024 * 1024;

export type ParsedDocument = {
  text: string;
  fileName: string;
  detectedLanguage: "English" | "Arabic";
};

function extOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

/** Reject raw PDF structure / binary masquerading as text */
export function isPdfOrBinaryJunk(text: string): boolean {
  const sample = text.slice(0, 4000);
  if (sample.startsWith("%PDF")) return true;
  if (/<<\s*\/Type\s*\//.test(sample)) return true;
  if (/\b\d+\s+\d+\s+obj\b/.test(sample) && /\bendobj\b/.test(sample)) return true;
  if (/StructElem|\/FontDescriptor/.test(sample) && /\bendobj\b/.test(sample)) return true;
  const letters = (sample.match(/[\u0600-\u06FFa-zA-Z]/g) ?? []).length;
  if (sample.length > 200 && letters < sample.length * 0.05) return true;
  return false;
}

function normalizeExtractedText(text: string): string {
  return normalizeOutlineText(
    text
      .replace(/\r\n/g, "\n")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ""),
  );
}

function validateReadableText(text: string): void {
  if (!text || text.length < 10) {
    throw new Error("Could not extract readable text from this file. Try a text-based PDF or paste the outline manually.");
  }
  if (isPdfOrBinaryJunk(text)) {
    throw new Error("PDF text extraction returned binary/structure data. Use a text-based PDF or paste the outline manually.");
  }
}

function detectLanguage(text: string): "English" | "Arabic" {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latinChars = (text.match(/[A-Za-z]/g) ?? []).length;
  return arabicChars > latinChars * 0.4 ? "Arabic" : "English";
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  // Lazy load — pdf-parse must not run at startup (v2 pulled pdf.js canvas and crashed Node).
  const mod = await import("pdf-parse");
  const pdfParse = (mod as { default?: (buf: Buffer) => Promise<{ text?: string }> }).default ?? mod;
  const result = await (pdfParse as (buf: Buffer) => Promise<{ text?: string }>)(buffer);
  return result.text ?? "";
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
}

function extractExcelText(buffer: Buffer): string {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]!;
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, defval: "" });
    const lines = rows
      .map((row) => (Array.isArray(row) ? row.map((c) => String(c ?? "").trim()).filter(Boolean).join(" | ") : ""))
      .filter(Boolean);
    if (lines.length > 0) {
      parts.push(`[${sheetName}]\n${lines.join("\n")}`);
    }
  }
  return parts.join("\n\n");
}

export async function extractTextFromUpload(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedDocument> {
  if (buffer.length > MAX_BYTES) {
    throw new Error("File too large (max 10MB)");
  }

  const ext = extOf(fileName);
  let raw = "";

  switch (ext) {
    case "pdf":
      raw = await extractPdfText(buffer);
      break;
    case "docx":
    case "doc":
      raw = await extractDocxText(buffer);
      break;
    case "txt":
    case "md":
    case "csv":
      raw = buffer.toString("utf8");
      break;
    case "xlsx":
    case "xls":
      raw = extractExcelText(buffer);
      break;
    default:
      throw new Error(`Unsupported file type ".${ext}". Use PDF, DOCX, XLSX, TXT, or MD.`);
  }

  const text = normalizeExtractedText(raw);
  validateReadableText(text);

  return {
    text,
    fileName,
    detectedLanguage: detectLanguage(text),
  };
}
