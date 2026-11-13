import { config } from "./config.js";
import type { CreateDecision } from "./decisions.js";
import type { DocumentType } from "./documents/index.js";
import { type FlatField, money } from "./fields.js";
import { type PreparedDocument, dataUrl } from "./input.js";

// The Decisions API takes up to 400 questions per request.
const MAX_QUESTIONS = 400;

const isLineLabel = (path: string) => /\]\.(name|description)$/.test(path);

/** Say the value the way a person reads it on the page. */
function show(value: FlatField["value"]): string {
  if (typeof value === "number") return money(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    }
  }
  if (typeof value === "string" && /^[a-z0-9]+(_[a-z0-9]+)+$/.test(value)) return `"${value.replace(/_/g, " ")}"`;
  return JSON.stringify(value);
}

/**
 * A second opinion from a model built for yes/no questions. "Is 4,000.00 the
 * gross pay for this period?" comes back as a probability we can threshold.
 * This checks that a value and its label go together, which is the thing a
 * page number or a quote can't tell you.
 */
export async function verifyFields<T>(
  createDecision: CreateDecision,
  doc: PreparedDocument,
  type: DocumentType<T>,
  data: T,
  fields: FlatField[],
): Promise<Map<string, number>> {
  const asked = fields.slice(0, MAX_QUESTIONS);
  if (asked.length === 0) return new Map();

  const decision = await createDecision({
    model: config.decisionModel,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: `These are the pages of a ${type.label}.` },
          ...doc.pages.map((page) => ({ type: "input_image" as const, image_url: dataUrl(page, doc.imageMimeType), detail: "high" as const })),
        ],
      },
    ],
    questions: asked.map((field) => ({
      type: "predicate" as const,
      name: field.path,
      instructions: isLineLabel(field.path)
        ? `Does this ${type.label} have a line labeled ${show(field.value)}?`
        : `Is ${show(field.value)} ${type.describeField(field.path, data)} on this ${type.label}?`,
    })),
  });

  const probabilities = new Map<string, number>();
  for (const answer of decision.answers) {
    if (answer.type === "predicate" && answer.name) probabilities.set(answer.name, answer.probability);
  }
  return probabilities;
}
