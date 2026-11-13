import { config } from "../config.js";
import type { DocumentType } from "../documents/index.js";
import type { PreparedDocument } from "../input.js";
import { anthropicExtractor } from "./anthropic.js";
import { openaiExtractor } from "./openai.js";
import type { Source } from "./prompt.js";

export interface Extraction<T = unknown> {
  data: T;
  sources: Source[];
  model: string;
}

export interface Extractor {
  extract<T>(doc: PreparedDocument, type: DocumentType<T>, prompt: string): Promise<Extraction<T>>;
}

export function defaultExtractor(): Extractor {
  return config.extractionProvider === "anthropic" ? anthropicExtractor() : openaiExtractor();
}

export { buildPrompt, extractionSchema } from "./prompt.js";
export type { Source } from "./prompt.js";
