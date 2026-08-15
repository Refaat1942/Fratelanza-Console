import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

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

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/^--\s*\d+\s+of\s+\d+\s*--\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function detectLanguage(text: string): "English" | "Arabic" {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latinChars = (text.match(/[A-Za-z]/g) ?? []).length;
  return arabicChars > latinChars * 0.4 ? "Arabic" : "English";
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value ?? "";
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
    default:
      throw new Error(`Unsupported file type ".${ext}". Use PDF, DOCX, TXT, or MD.`);
  }

  const text = normalizeExtractedText(raw);
  if (!text || text.length < 10) {
    throw new Error("Could not extract readable text from this file. Try a text-based PDF or paste the outline manually.");
  }

  if (text.startsWith("%PDF")) {
    throw new Error("PDF text extraction failed. The file may be scanned/image-only — paste the outline manually or use a text-based PDF.");
  }

  return {
    text,
    fileName,
    detectedLanguage: detectLanguage(text),
  };
}
