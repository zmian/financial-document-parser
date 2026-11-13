import type { CheckResult } from "./documents/index.js";
import type { Source } from "./extract/index.js";
import { type FlatField, type Leaf, normalizeText } from "./fields.js";

export interface FieldScore {
  path: string;
  value: Leaf;
  confidence: number;
  /** The text the model says it read. Shown to reviewers, never trusted on its own. */
  source: string | null;
  reasons: string[];
}

// Where these numbers come from: a field inside an equation that ties out is
// about as safe as it gets. One inside a failing equation is suspect, and the
// verifier only decides how suspect. Tune them against your own test set.
const TIES_OUT = 0.97;
const IN_FAILED_CHECK = 0.4;
const UNCHECKED = 0.5;
const QUOTE_NOT_FOUND = 0.3;

export function scoreFields(args: {
  fields: FlatField[];
  checks: CheckResult[];
  verified: Map<string, number>;
  sources: Source[];
  textLayer: string | null;
}): FieldScore[] {
  const { fields, checks, verified, sources, textLayer } = args;
  const sourceFor = new Map(sources.map((s) => [s.field, s.text]));
  const page = textLayer ? normalizeText(textLayer) : null;

  return fields
    .filter((f) => f.value !== null)
    .map((field) => {
      const reasons: string[] = [];
      const failed = checks.filter((c) => c.status === "fail" && c.fields.includes(field.path));
      const passed = checks.filter((c) => c.status === "pass" && c.fields.includes(field.path));
      const verifier = verified.get(field.path);

      let confidence: number;
      if (failed.length > 0) {
        confidence = Math.min(IN_FAILED_CHECK, verifier ?? IN_FAILED_CHECK);
        reasons.push(`Part of a failed check: ${failed.map((c) => c.id).join(", ")}`);
        if (verifier !== undefined) reasons.push(`Verifier: ${verifier.toFixed(2)}`);
      } else if (passed.length > 0) {
        confidence = TIES_OUT;
        reasons.push(`Ties out: ${passed.map((c) => c.id).join(", ")}`);
      } else if (verifier !== undefined) {
        confidence = verifier;
        reasons.push(`Verifier: ${verifier.toFixed(2)}`);
      } else {
        confidence = UNCHECKED;
        reasons.push("Not checked");
      }

      // A quote only proves the value wasn't made up. It says nothing about
      // whether the value belongs to this label, so finding it never raises the
      // score. Not finding it does lower it.
      const source = sourceFor.get(field.path) ?? null;
      if (source && page && !page.includes(normalizeText(source))) {
        confidence = Math.min(confidence, QUOTE_NOT_FOUND);
        reasons.push(`Quoted text "${source}" isn't in the document`);
      }

      return { path: field.path, value: field.value, confidence, source, reasons };
    });
}

/** A document is only as trustworthy as its weakest key field. */
export function documentScore(keyFields: string[], scores: FieldScore[]): { score: number; weakest: string | null } {
  const byPath = new Map(scores.map((s) => [s.path, s]));
  let score = 1;
  let weakest: string | null = null;
  for (const path of keyFields) {
    const confidence = byPath.get(path)?.confidence ?? 0; // missing counts as zero
    if (confidence < score) {
      score = confidence;
      weakest = path;
    }
  }
  return { score, weakest };
}
