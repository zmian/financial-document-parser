# Financial document parser

Parse pay stubs and bank statements with LLMs, and know when to trust the result.

This is the companion repo to [Parsing financial documents with AI](https://zeeshanmian.com/writing/parsing-financial-documents-with-ai). It's a starting point, not a hosted product. Clone it, add your own API keys, then hand it to your coding agent and make it yours.

## How it works

Classify first, then extract.

1. **Prepare.** Render the PDF to page images. If the PDF has a text layer, keep it too, but only to check quotes later. No OCR.
2. **Classify.** One call to OpenAI's [Decisions API](https://developers.openai.com/api/docs/guides/decisions) with the first page asks two things at once: what type of document is this and which variant. Each answer comes back with a probability. Below the threshold, or "other", the document goes to a person. It never falls back to a default type.
3. **Extract.** Claude or GPT fills the Zod schema for that one type, with the rules for that one variant.
4. **Check.** Plain code makes sure the numbers add up. Gross minus taxes minus deductions has to equal net. Opening balance plus credits minus debits has to equal closing.
5. **Verify.** Every field a passing check doesn't already vouch for, and every field in a failing one, goes back to the Decisions API as a yes/no question: "Is 4,200.00 the current-period amount for the Regular line on this pay stub?"
6. **Score.** Each field gets a confidence from those signals. The document score is its weakest key field. Anything under the threshold, or with a failed check, is flagged for review with the reasons.

The extractor is asked to quote the source text for money and date fields. If the PDF has a text layer and a supplied quote doesn't match it, the score goes down. A match leaves the score alone. A model can put your YTD take-home in the deductions field and quote a number that really is on the page. Even if the totals tie out, check the label and column when reviewing the value.

## Quick start

Use Node 24 LTS and an OpenAI API key with access to the Decisions API. Run `npm ci` and `npm test` first if you want to try the pipeline with fake model clients and no key.

```bash
git clone <this repo>
cd financial-document-parser
npm ci
cp .env.example .env   # add OPENAI_API_KEY
```

Parse a sample:

```bash
npm run parse -- samples/pay-stub-standard.pdf
npm run parse -- samples/bank-statement-credit-card.pdf --json
```

If a shell-exported `OPENAI_API_KEY` is overriding the key in `.env`, ignore it for this command:

```bash
env -u OPENAI_API_KEY npm run parse -- samples/pay-stub-standard.pdf --json
```

A `401` means OpenAI rejected the credential. A `429` with `credit_balance_exhausted` means the organization that owns the key needs API credits.

Or run the local API. It listens on loopback and has no authentication. Keep it local.

```bash
npm run dev
curl -F file=@samples/pay-stub-peo.pdf http://127.0.0.1:3000/v1/documents/parse
```

Add `?type=pay_stub` when you already know what was uploaded. That skips the type question but still asks for the variant.

To extract with Claude instead of GPT, set `EXTRACTION_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` in `.env`. Classification always uses the Decisions API.

## What you get back

```ts
{
  status: "accepted" | "needs_review",
  reviewReasons: string[],          // empty when accepted
  classification: {
    type:    { value, probability, probabilities },
    variant: { value, probability, probabilities } | null,
  },
  data: PayStub | BankStatement | null,   // null if we stopped before extracting
  checks: [{ id, description, status: "pass" | "fail" | "skip", fields, detail }],
  fields: [{ path, value, confidence, source, reasons }],
  score: number,                    // the weakest key field
  weakestField: string | null,
  models: { decisions, extraction },
}
```

It's headless on purpose. Store the result in your own database and show the flagged ones in your own admin tools, next to everything else your team already uses. `checks` and `fields[].reasons` tell a reviewer exactly where to look.

## Samples

`samples/` has made-up documents, and `samples/labels/` has the right answer for each. Regenerate them with `npm run samples`.

| File                             | Type           | Variant     | What it tests                                                       |
| -------------------------------- | -------------- | ----------- | ------------------------------------------------------------------- |
| `pay-stub-standard.pdf`          | pay stub       | standard    | Rate and hours columns, NY state taxes                              |
| `pay-stub-semimonthly.pdf`       | pay stub       | standard    | Negative amounts, "OASDI", employer benefits that aren't deductions |
| `pay-stub-peo.pdf`               | pay stub       | peo         | The PEO's name is the biggest thing on the page                     |
| `pay-stub-peo-photo.png`         | pay stub       | peo         | Same stub as an image, no text layer                                |
| `pay-stub-bonus.pdf`             | pay stub       | off_cycle   | Lines with only YTD amounts                                         |
| `bank-statement-checking.pdf`    | bank statement | checking    | Separate withdrawal and deposit columns, printed totals             |
| `bank-statement-savings.pdf`     | bank statement | savings     | One signed amount column, joint holders                             |
| `bank-statement-credit-card.pdf` | bank statement | credit_card | Balance is what's owed, so the equation flips                       |
| `other-utility-bill.pdf`         | other          |             | Should be sent to a person, not parsed                              |

## Measuring it

```bash
npm run eval
```

Runs every labeled sample through the real pipeline and prints four numbers:

- **Classification accuracy:** how often the type and variant are right.
- **Field accuracy:** the share of fields that match the label, money to the cent.
- **Check pass rate:** the share of documents where every check ties out. You can track this one on live traffic too.
- **Flag precision:** of the documents sent to a person, how many actually had a problem.

It also lists any document that was accepted with a wrong value, which is the miss that matters most. Full results go to `out/`.

Put your own documents in `samples/` with a label in `samples/labels/` and they're included. Ten to fifteen real documents per type is enough to start. Keep real documents out of git.

`npm test` runs the checks, the pipeline and the API against fake model clients, so it needs no keys.

## Make it yours

The layout:

```
src/
  pipeline.ts          the six steps above
  classify.ts          Decisions API: type and variant
  extract/             prompt and the OpenAI and Anthropic extractors
  verify.ts            Decisions API: yes/no questions per field
  score.ts             field and document scores
  documents/
    index.ts           the list of supported types
    pay-stub/          schema, variants, checks
    bank-statement/    schema, variants, checks
  server.ts            HTTP API (Hono)
  cli.ts               command line
scripts/
  generate-samples.ts  made-up documents and labels
  eval.ts              the four numbers
```

**A new document type** is a folder like `src/documents/pay-stub/` with a Zod schema, a list of variants and a function that returns checks. Add it to `src/documents/index.ts` and the classifier picks it up. Write the checks first. They'll tell you more about how good your extraction is than any amount of prompt tuning.

**A new variant** is an entry in that type's `variants` list: a description for the classifier and a few rules for the extraction prompt. Add one when a provider's layout keeps tripping the model, not before.

**Thresholds** live in `.env`. The defaults are a guess. Run the eval on your own documents and set them from what you see.

`AGENTS.md` has the same rules written for a coding agent.

## What it doesn't do yet

- **Multi-account statements.** A consolidated statement with several accounts in one PDF needs to be split before extraction.
- **Redaction.** OpenAI receives page images for classification and verification. The extractor receives the full original PDF or image, using OpenAI by default or Anthropic if selected. Start with the synthetic samples. Before using real documents, redact the original file, including its text layer, and check the providers’ data retention settings. The CLI, API responses and eval output can contain extracted financial data.
- **Brokerage statements, tax forms and loans.** Same pattern, new folder.
- **Storage and a review screen.** On purpose. Those belong in your system.

The Decisions API uses `gpt-6-luna`. Treat the starter’s scores as review rules and test them on your own labeled documents before relying on the thresholds.

## License

MIT
