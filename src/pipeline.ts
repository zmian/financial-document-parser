import { type Classification, classify } from "./classify.js";
import { config } from "./config.js";
import { type CreateDecision, openaiDecisions } from "./decisions.js";
import { type CheckResult, findDocumentType } from "./documents/index.js";
import { type Extractor, buildPrompt, defaultExtractor } from "./extract/index.js";
import { flatten } from "./fields.js";
import { type DocumentInput, prepare } from "./input.js";
import { type FieldScore, documentScore, scoreFields } from "./score.js";
import { verifyFields } from "./verify.js";

export interface Dependencies {
  createDecision: CreateDecision;
  extractor: Extractor;
}

export interface ParseOptions {
  /** Skip the type question when you already know what was uploaded. */
  type?: string;
}

export interface ParseResult {
  status: "accepted" | "needs_review";
  /** Why a person should look at it. Empty when accepted. */
  reviewReasons: string[];
  classification: Classification;
  /** Null when we stopped before extracting (unknown or unsure document type). */
  data: unknown;
  checks: CheckResult[];
  fields: FieldScore[];
  score: number;
  weakestField: string | null;
  models: { decisions: string; extraction: string | null };
}

export function defaultDependencies(): Dependencies {
  return { createDecision: openaiDecisions(), extractor: defaultExtractor() };
}

export async function parseDocument(
  input: DocumentInput,
  options: ParseOptions = {},
  deps: Dependencies = defaultDependencies(),
): Promise<ParseResult> {
  const doc = await prepare(input);
  const reviewReasons: string[] = [];

  // 1. Classify. Unsure means a person decides, never a default type.
  const classification = await classify(deps.createDecision, doc, options.type);
  const typeGuess = classification.type;
  const type = findDocumentType(typeGuess.value);

  if (!type || typeGuess.probability < config.thresholds.type) {
    reviewReasons.push(
      !type
        ? `Not a supported document type (classified as "${typeGuess.value}").`
        : `Unsure of the document type: ${typeGuess.value} at ${typeGuess.probability.toFixed(2)}.`,
    );
    return {
      status: "needs_review",
      reviewReasons,
      classification,
      data: null,
      checks: [],
      fields: [],
      score: 0,
      weakestField: null,
      models: { decisions: config.decisionModel, extraction: null },
    };
  }

  // 2. Pick the variant. If we're unsure, extract with the type's general rules
  //    only, and flag it so a person confirms.
  const variantGuess = classification.variant;
  let variant = variantGuess ? (type.variants.find((v) => v.id === variantGuess.value) ?? null) : null;
  if (!variantGuess || !variant || variantGuess.probability < config.thresholds.variant) {
    reviewReasons.push(
      `Unsure of the ${type.label} variant${variantGuess ? `: ${variantGuess.value} at ${variantGuess.probability.toFixed(2)}` : ""}.`,
    );
    variant = null;
  }

  // 3. Extract with only the schema and rules for this type and variant.
  const extraction = await deps.extractor.extract(doc, type, buildPrompt(type, variant));
  const parsed = type.schema.parse(extraction.data);

  // 4. Check the numbers in plain code.
  const checks = type.checks(parsed, variant?.id ?? null);
  for (const check of checks.filter((c) => c.status === "fail")) {
    reviewReasons.push(`Check failed: ${check.description}. ${check.detail}`);
  }

  // 5. Ask the verifier about every field a passing check doesn't already vouch for.
  const fields = flatten(parsed).filter((f) => f.value !== null);
  const vouched = new Set(checks.filter((c) => c.status === "pass").flatMap((c) => c.fields));
  const failing = new Set(checks.filter((c) => c.status === "fail").flatMap((c) => c.fields));
  const doubtful = fields.filter((f) => !vouched.has(f.path) || failing.has(f.path));
  const verified = await verifyFields(deps.createDecision, doc, type, parsed, doubtful);

  // 6. Score every field, then the document.
  const scores = scoreFields({ fields, checks, verified, sources: extraction.sources, textLayer: doc.textLayer });
  const { score, weakest } = documentScore(type.keyFields, scores);

  const shaky = scores.filter((s) => s.confidence < config.thresholds.field && !failing.has(s.path));
  if (shaky.length > 0) {
    reviewReasons.push(`Low confidence: ${shaky.map((s) => s.path).join(", ")}.`);
  }
  if (score < config.thresholds.field && weakest) {
    reviewReasons.push(`Weakest key field: ${weakest} at ${score.toFixed(2)}.`);
  }

  return {
    status: reviewReasons.length === 0 ? "accepted" : "needs_review",
    reviewReasons,
    classification,
    data: parsed,
    checks,
    fields: scores,
    score,
    weakestField: weakest,
    models: { decisions: config.decisionModel, extraction: extraction.model },
  };
}
