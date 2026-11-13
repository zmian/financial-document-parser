import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parseArgs } from "node:util";
import { config } from "./config.js";
import { mimeTypeFromName } from "./input.js";
import { type ParseResult, parseDocument } from "./pipeline.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    type: { type: "string" },
    json: { type: "boolean", default: false },
  },
});

const path = positionals[0];
if (!path) {
  console.error("Usage: npm run parse -- <file.pdf> [--type pay_stub|bank_statement] [--json]");
  process.exit(1);
}

const result = await parseDocument(
  { bytes: await readFile(path), mimeType: mimeTypeFromName(path), fileName: basename(path) },
  { type: values.type },
);

if (values.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  print(result);
}

function print(r: ParseResult) {
  const { type, variant } = r.classification;
  console.log(`\n${basename(path!)}`);
  console.log(`  type     ${type.value} (${type.probability.toFixed(2)})`);
  if (variant) console.log(`  variant  ${variant.value} (${variant.probability.toFixed(2)})`);

  if (r.checks.length > 0) {
    console.log("\nChecks");
    for (const c of r.checks) {
      const mark = c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : "–";
      console.log(`  ${mark} ${c.description}`);
      if (c.status !== "pass") console.log(`      ${c.detail}`);
    }
  }

  const low = r.fields.filter((f) => f.confidence < config.thresholds.field);
  if (low.length > 0) {
    console.log("\nFields to look at");
    for (const f of low) console.log(`  ${f.path} = ${JSON.stringify(f.value)}  (${f.confidence.toFixed(2)}: ${f.reasons.join("; ")})`);
  }

  console.log(`\nScore ${r.score.toFixed(2)}${r.weakestField ? ` (weakest: ${r.weakestField})` : ""}`);
  console.log(r.status === "accepted" ? "Accepted" : "Needs review");
  for (const reason of r.reviewReasons) console.log(`  - ${reason}`);
  console.log("\nRun with --json for the full result.\n");
}
