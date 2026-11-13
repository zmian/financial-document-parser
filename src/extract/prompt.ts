import { z } from "zod";
import type { DocumentType, Variant } from "../documents/index.js";

const RULES = [
  "Read the label for every value before you take it: the row name, the column header and the section it's in.",
  "If a value isn't printed on the document, return null. Never use 0 or an empty string as a placeholder, and don't calculate a value that isn't printed.",
  "Write money as plain numbers with no currency symbols or commas: $1,234.56 becomes 1234.56.",
  "Write dates as YYYY-MM-DD.",
  "In sources, list every money and date field you filled in, with the exact text you read for it, copied character for character from the document.",
];

export function buildPrompt(type: DocumentType, variant: Variant | null): string {
  const sections = [
    `Extract the data from this ${type.label} into the schema.`,
    "Rules:\n" + RULES.map((r) => `- ${r}`).join("\n"),
    `About ${type.label}s:\n` + type.context.map((c) => `- ${c}`).join("\n"),
  ];
  if (variant && variant.instructions.length > 0) {
    sections.push(`About this one:\n` + variant.instructions.map((i) => `- ${i}`).join("\n"));
  }
  return sections.join("\n\n");
}

const Source = z.object({
  field: z.string().describe("The field path, e.g. 'grossPay' or 'taxes[0].currentPeriod'."),
  text: z.string().describe("The exact text on the document this value came from."),
});

/** The schema the model fills: the document's data plus where each value came from. */
export function extractionSchema<T>(type: DocumentType<T>) {
  return z.object({
    data: type.schema,
    sources: z.array(Source),
  });
}

export type Source = z.infer<typeof Source>;
