/**
 * Runs every labeled sample through the real pipeline and prints the four
 * numbers worth tracking per change: classification accuracy, field accuracy,
 * check pass rate and flag precision.
 *
 *   npm run eval
 *   npm run eval -- --only pay-stub   # just files whose name contains "pay-stub"
 *
 * Needs API keys. Add your own documents to samples/ with a label in
 * samples/labels/ and they're included automatically.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type Leaf, flatten, normalizeText, sameMoney } from "../src/fields.js";
import { mimeTypeFromName } from "../src/input.js";
import { type ParseResult, parseDocument } from "../src/pipeline.js";

const ROOT = join(import.meta.dirname, "..");
const { values } = parseArgs({ options: { only: { type: "string" } } });

interface Label {
  file: string;
  type: string;
  variant: string | null;
  data: unknown;
}

const labels: Label[] = [];
for (const f of (await readdir(join(ROOT, "samples", "labels"))).sort()) {
  const label: Label = JSON.parse(await readFile(join(ROOT, "samples", "labels", f), "utf8"));
  if (!values.only || label.file.includes(values.only)) labels.push(label);
}

// Line items can come back in any order. Sort them the same way on both sides.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    const key = (v: any) => `${v?.type ?? v?.date ?? ""}|${v?.currentPeriod ?? v?.amount ?? v?.ytd ?? ""}`;
    return value.map(canonical).sort((a, b) => key(a).localeCompare(key(b)));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}

function same(expected: Leaf, actual: Leaf | undefined): boolean {
  if (actual === undefined) return false;
  if (typeof expected === "number" && typeof actual === "number") return sameMoney(expected, actual, 0.005);
  if (typeof expected === "string" && typeof actual === "string") return normalizeText(expected).replace(/[.,]/g, "") === normalizeText(actual).replace(/[.,]/g, "");
  return expected === actual;
}

// Line labels ("Fed Withholdng" vs "FED WITHHOLDNG") are for matching, not scoring.
const isLineLabel = (path: string) => /\]\.(name|description)$/.test(path);

function compareFields(expected: unknown, actual: unknown) {
  const want = flatten(canonical(expected)).filter((f) => !isLineLabel(f.path));
  const got = new Map(flatten(canonical(actual)).map((f) => [f.path, f.value]));
  const wrong = want.filter((f) => !same(f.value, got.get(f.path))).map((f) => ({ path: f.path, expected: f.value, actual: got.get(f.path) ?? null }));
  return { total: want.length, wrong };
}

interface Row {
  file: string;
  result: ParseResult | null;
  error: string | null;
  classifiedRight: boolean;
  fields: { total: number; wrong: Array<{ path: string; expected: Leaf; actual: Leaf }> } | null;
}

const rows: Row[] = [];
for (const label of labels) {
  process.stdout.write(`${label.file} ... `);
  const bytes = await readFile(join(ROOT, "samples", label.file));
  try {
    const result = await parseDocument({ bytes, mimeType: mimeTypeFromName(label.file), fileName: label.file });
    const { type, variant } = result.classification;
    const classifiedRight = type.value === label.type && (label.variant === null || variant?.value === label.variant);
    const fields = label.data && result.data ? compareFields(label.data, result.data) : null;
    rows.push({ file: label.file, result, error: null, classifiedRight, fields });
    console.log(`${result.status}${fields?.wrong.length ? `, ${fields.wrong.length} wrong field(s)` : ""}`);
  } catch (error) {
    rows.push({ file: label.file, result: null, error: (error as Error).message, classifiedRight: false, fields: null });
    console.log(`error: ${(error as Error).message}`);
  }
}

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(1)}%  (${n}/${d})`);

const ran = rows.filter((r) => r.result);
const extracted = ran.filter((r) => r.fields);
const fieldTotal = extracted.reduce((t, r) => t + r.fields!.total, 0);
const fieldWrong = extracted.reduce((t, r) => t + r.fields!.wrong.length, 0);
const checksClean = extracted.filter((r) => r.result!.checks.every((c) => c.status !== "fail"));
const flagged = ran.filter((r) => r.result!.status === "needs_review");
// A flag is right when something was actually wrong, or the document isn't one we support.
const hadProblem = (r: Row) => !r.classifiedRight || (r.fields?.wrong.length ?? 0) > 0 || labels.find((l) => l.file === r.file)?.type === "other";
const missed = ran.filter((r) => r.result!.status === "accepted" && hadProblem(r));

console.log("\nResults");
console.log(`  Classification accuracy  ${pct(ran.filter((r) => r.classifiedRight).length, ran.length)}`);
console.log(`  Field accuracy           ${pct(fieldTotal - fieldWrong, fieldTotal)}`);
console.log(`  Check pass rate          ${pct(checksClean.length, extracted.length)}`);
console.log(`  Flag precision           ${pct(flagged.filter(hadProblem).length, flagged.length)}`);
if (missed.length > 0) console.log(`\n  Accepted with a problem (the worst kind of miss): ${missed.map((r) => r.file).join(", ")}`);

for (const r of rows.filter((r) => r.error || r.fields?.wrong.length || !r.classifiedRight)) {
  console.log(`\n${r.file}`);
  if (r.error) console.log(`  error: ${r.error}`);
  if (!r.classifiedRight && r.result) console.log(`  classified as ${r.result.classification.type.value} / ${r.result.classification.variant?.value ?? "-"}`);
  for (const w of r.fields?.wrong ?? []) console.log(`  ${w.path}: expected ${JSON.stringify(w.expected)}, got ${JSON.stringify(w.actual)}`);
}

await mkdir(join(ROOT, "out"), { recursive: true });
const outFile = join(ROOT, "out", `eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await writeFile(outFile, JSON.stringify(rows, null, 2));
console.log(`\nFull results: ${outFile}`);
