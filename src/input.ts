import { pdf } from "pdf-to-img";
import { config } from "./config.js";

export type MimeType = "application/pdf" | "image/png" | "image/jpeg";

export interface DocumentInput {
  bytes: Buffer;
  mimeType: MimeType;
  fileName?: string;
}

/**
 * What the models get to look at. The decision model can't read a PDF, so every
 * document becomes page images. If the PDF has a text layer we keep it too, but
 * only to confirm that quoted evidence really appears in the document.
 */
export interface PreparedDocument {
  input: DocumentInput;
  pages: Buffer[]; // PNG or JPEG, first page first
  imageMimeType: "image/png" | "image/jpeg";
  textLayer: string | null;
}

export function mimeTypeFromName(fileName: string): MimeType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  throw new Error(`Unsupported file type: ${fileName}. Use a PDF, PNG or JPEG.`);
}

export async function prepare(input: DocumentInput): Promise<PreparedDocument> {
  if (input.bytes.length === 0) throw new Error("The file is empty.");

  if (input.mimeType !== "application/pdf") {
    return { input, pages: [input.bytes], imageMimeType: input.mimeType, textLayer: null };
  }

  const pages: Buffer[] = [];
  const doc = await pdf(input.bytes, { scale: 2 });
  try {
    for (let i = 1; i <= Math.min(doc.length, config.maxPagesToRender); i++) {
      pages.push(await doc.getPage(i));
    }
  } finally {
    await doc.destroy();
  }

  return { input, pages, imageMimeType: "image/png", textLayer: await readTextLayer(input.bytes) };
}

async function readTextLayer(bytes: Buffer): Promise<string | null> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const doc = await task.promise;
  try {
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if ("str" in item) parts.push(item.str);
      }
    }
    const text = parts.join(" ").trim();
    // A scanned PDF has no text layer. That's fine, we just can't check quotes.
    return text.length > 0 ? text : null;
  } finally {
    await task.destroy();
  }
}

export function dataUrl(bytes: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}
