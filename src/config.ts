// Load .env if there is one. Real environment variables win.
try {
  process.loadEnvFile();
} catch {
  // No .env file. That's fine.
}

export type ExtractionProvider = "openai" | "anthropic";

function number(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (Number.isNaN(value)) throw new Error(`${name} must be a number, got "${raw}"`);
  return value;
}

export const config = {
  decisionModel: "gpt-6-luna",
  extractionProvider: (process.env.EXTRACTION_PROVIDER ?? "openai") as ExtractionProvider,
  openaiExtractionModel: process.env.OPENAI_EXTRACTION_MODEL ?? "gpt-6.1-sol",
  anthropicExtractionModel: process.env.ANTHROPIC_EXTRACTION_MODEL ?? "claude-sonnet-5-5",
  thresholds: {
    type: number("TYPE_THRESHOLD", 0.85),
    variant: number("VARIANT_THRESHOLD", 0.7),
    field: number("FIELD_THRESHOLD", 0.8),
  },
  // Pages past this are not rendered for the verifier. Pay stubs and bank
  // statements put what matters up front.
  maxPagesToRender: 4,
};
