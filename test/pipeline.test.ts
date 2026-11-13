import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/pipeline.js";
import { fakeDecisions, fakeExtractor, label, sample } from "./fakes.js";

async function run(file: string, opts: { data?: unknown; decisions?: Parameters<typeof fakeDecisions>[0]; sources?: Array<{ field: string; text: string }> } = {}) {
  const truth = await label(file);
  const decisions = fakeDecisions(opts.decisions);
  const extraction = fakeExtractor(opts.data ?? truth.data, opts.sources);
  const result = await parseDocument(await sample(file), {}, { createDecision: decisions.create, extractor: extraction.extractor });
  return { result, decisions, extraction, truth };
}

const field = (result: Awaited<ReturnType<typeof run>>["result"], path: string) => result.fields.find((f) => f.path === path)!;

describe("pipeline", () => {
  it("accepts a clean pay stub", async () => {
    const { result } = await run("pay-stub-standard.pdf", {
      decisions: { choices: { document_type: ["pay_stub", 0.98], pay_stub_variant: ["standard", 0.93] } },
    });
    expect(result.status).toBe("accepted");
    expect(result.reviewReasons).toEqual([]);
    expect(field(result, "grossPay").confidence).toBeGreaterThan(0.95);
    expect(result.score).toBeGreaterThan(0.9);
  });

  it("classifies from a page image, in one request with every variant question", async () => {
    const { decisions } = await run("pay-stub-standard.pdf", {
      decisions: { choices: { document_type: ["pay_stub", 0.98], pay_stub_variant: ["standard", 0.93] } },
    });
    const first = decisions.calls[0]!;
    expect(first.questions.map((q) => q.name)).toEqual(["document_type", "pay_stub_variant", "bank_statement_variant"]);
    const content = (first.input as any)[0].content;
    expect(content[1].type).toBe("input_image");
    expect(content[1].image_url).toMatch(/^data:image\/png;base64,/);
  });

  it("sends only the picked variant's rules to the extractor", async () => {
    const { extraction } = await run("pay-stub-peo.pdf", {
      decisions: { choices: { document_type: ["pay_stub", 0.99], pay_stub_variant: ["peo", 0.91] } },
    });
    expect(extraction.calls[0]!.prompt).toContain("PEO pay stub");
    expect(extraction.calls[0]!.prompt).not.toContain("off-cycle");
  });

  it("works on a photo with no text layer", async () => {
    const { result } = await run("pay-stub-peo-photo.png", {
      decisions: { choices: { document_type: ["pay_stub", 0.97], pay_stub_variant: ["peo", 0.9] } },
    });
    expect(result.status).toBe("accepted");
  });

  it("stops before extracting when the document isn't supported", async () => {
    const { result, extraction } = await run("other-utility-bill.pdf", {
      decisions: { choices: { document_type: ["other", 0.96] } },
    });
    expect(result.status).toBe("needs_review");
    expect(result.data).toBeNull();
    expect(extraction.calls).toHaveLength(0);
  });

  it("stops before extracting when unsure of the type, instead of defaulting", async () => {
    const { result, extraction } = await run("bank-statement-checking.pdf", {
      decisions: { choices: { document_type: ["bank_statement", 0.55] } },
    });
    expect(result.status).toBe("needs_review");
    expect(result.reviewReasons[0]).toContain("Unsure of the document type");
    expect(extraction.calls).toHaveLength(0);
  });

  it("extracts without variant rules when unsure of the variant, and flags it", async () => {
    const { result, extraction } = await run("pay-stub-peo.pdf", {
      decisions: { choices: { document_type: ["pay_stub", 0.98], pay_stub_variant: ["peo", 0.5] } },
    });
    expect(extraction.calls[0]!.prompt).not.toContain("PEO pay stub");
    expect(result.status).toBe("needs_review");
    expect(result.reviewReasons.join(" ")).toContain("Unsure of the pay stub variant");
  });

  it("flags the YTD gross read as current gross, and points at grossPay", async () => {
    const truth = await label("pay-stub-standard.json");
    const broken = { ...truth.data, grossPay: truth.data.grossPayYtd };
    const { result } = await run("pay-stub-standard.pdf", {
      data: broken,
      decisions: { choices: { document_type: ["pay_stub", 0.98], pay_stub_variant: ["standard", 0.93] }, predicates: { grossPay: 0.04 } },
    });
    expect(result.status).toBe("needs_review");
    expect(field(result, "grossPay").confidence).toBe(0.04);
    expect(result.weakestField).toBe("grossPay");
  });

  it("only asks the verifier about fields a passing check doesn't cover", async () => {
    const { decisions } = await run("pay-stub-standard.pdf", {
      decisions: { choices: { document_type: ["pay_stub", 0.98], pay_stub_variant: ["standard", 0.93] } },
    });
    const asked = decisions.calls[1]!.questions.map((q) => q.name);
    expect(asked).toContain("employerName");
    expect(asked).toContain("taxes[0].type");
    expect(asked).not.toContain("grossPay");
    expect(asked).not.toContain("netPay");
  });

  it("doesn't trust a value just because its quote is on the page", async () => {
    // The model put the PEO's name in employerName. "Crestline PEO" really is on
    // the page, so the quote checks out. It's still the wrong value for the label.
    const truth = await label("pay-stub-peo.json");
    const { result } = await run("pay-stub-peo.pdf", {
      data: { ...truth.data, employerName: "Crestline PEO" },
      sources: [{ field: "employerName", text: "Crestline PEO" }],
      decisions: { choices: { document_type: ["pay_stub", 0.98], pay_stub_variant: ["peo", 0.9] }, predicates: { employerName: 0.08 } },
    });
    expect(field(result, "employerName").confidence).toBe(0.08);
    expect(result.status).toBe("needs_review");
  });

  it("marks a value down when its quote isn't anywhere in the document", async () => {
    const { result } = await run("pay-stub-standard.pdf", {
      sources: [{ field: "employeeName", text: "Mia Okafor" }],
      decisions: { choices: { document_type: ["pay_stub", 0.98], pay_stub_variant: ["standard", 0.93] } },
    });
    const name = field(result, "employeeName");
    expect(name.confidence).toBe(0.3);
    expect(name.reasons.join(" ")).toContain("isn't in the document");
  });

  it("skips classification when the caller knows the type", async () => {
    const decisions = fakeDecisions({ choices: { bank_statement_variant: ["credit_card", 0.95] } });
    const { data } = await label("bank-statement-credit-card.json");
    const result = await parseDocument(
      await sample("bank-statement-credit-card.pdf"),
      { type: "bank_statement" },
      { createDecision: decisions.create, extractor: fakeExtractor(data).extractor },
    );
    expect(decisions.calls[0]!.questions.map((q) => q.name)).toEqual(["bank_statement_variant"]);
    expect(result.status).toBe("accepted");
  });
});
