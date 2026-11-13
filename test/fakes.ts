import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CreateDecision, Decision, DecisionCreateParams } from "../src/decisions.js";
import type { DocumentType } from "../src/documents/index.js";
import type { Extractor, Source } from "../src/extract/index.js";
import { type DocumentInput, mimeTypeFromName } from "../src/input.js";

export const SAMPLES = join(import.meta.dirname, "..", "samples");

export async function sample(file: string): Promise<DocumentInput> {
  return { bytes: await readFile(join(SAMPLES, file)), mimeType: mimeTypeFromName(file), fileName: file };
}

export async function label(file: string): Promise<{ type: string; variant: string | null; data: any }> {
  return JSON.parse(await readFile(join(SAMPLES, "labels", file.replace(/\.\w+$/, ".json")), "utf8"));
}

export interface FakeDecisionsOptions {
  /** Answers for choice questions, by question name: [value, probability]. */
  choices?: Record<string, [string, number]>;
  /** Probability for predicate questions, by field path. Default 0.95. */
  predicates?: Record<string, number>;
}

/** Answers Decisions API requests from a script, and records every request. */
export function fakeDecisions(opts: FakeDecisionsOptions = {}) {
  const calls: DecisionCreateParams[] = [];
  const create: CreateDecision = async (params) => {
    calls.push(params);
    const answers: Decision["answers"] = params.questions.map((q) => {
      const name = q.name ?? null;
      if (q.type === "choice") {
        const values = q.choices.map((c) => String(c.value));
        const [value, probability] = opts.choices?.[name ?? ""] ?? [values[0]!, 0.97];
        const rest = (1 - probability) / Math.max(values.length - 1, 1);
        return {
          type: "choice",
          name,
          choice: value,
          confidence: probability,
          probabilities: values.map((v) => ({ value: v, probability: v === value ? probability : rest })),
        };
      }
      if (q.type === "predicate") {
        return { type: "predicate", name, probability: opts.predicates?.[name ?? ""] ?? 0.95 };
      }
      throw new Error("score questions aren't used");
    });
    return {
      answers,
      model: "gpt-6-luna",
      usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } },
    };
  };
  return { create, calls };
}

/** Returns whatever data you give it, as if a model had read the document. */
export function fakeExtractor(data: unknown, sources: Source[] = []) {
  const calls: Array<{ type: DocumentType<any>; prompt: string }> = [];
  const extractor: Extractor = {
    async extract(_doc, type, prompt) {
      calls.push({ type, prompt });
      return { data: structuredClone(data) as never, sources, model: "fake-extractor" };
    },
  };
  return { extractor, calls };
}
