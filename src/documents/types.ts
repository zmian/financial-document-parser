import type { z } from "zod";

export interface Variant {
  id: string;
  /** Shown to the classifier as the description of this answer. */
  description: string;
  /** Extra rules for the extraction prompt when this variant is picked. */
  instructions: string[];
}

export type CheckStatus = "pass" | "fail" | "skip";

export interface CheckResult {
  id: string;
  description: string;
  status: CheckStatus;
  /** Field paths the check depends on, e.g. "grossPay" or "taxes[0].currentPeriod". */
  fields: string[];
  detail: string;
}

export interface DocumentType<T = unknown> {
  id: string;
  label: string;
  /** Shown to the classifier as the description of this answer. */
  description: string;
  variantQuestion: string;
  variants: Variant[];
  schema: z.ZodType<T>;
  /** How this kind of document works, for the extraction prompt. */
  context: string[];
  /**
   * Fields that decide the document score. A document is only as trustworthy
   * as the weakest of these.
   */
  keyFields: string[];
  checks(data: T, variantId: string | null): CheckResult[];
  /** Plain words for a field, used in verifier questions and review screens. */
  describeField(path: string, data: T): string;
}
