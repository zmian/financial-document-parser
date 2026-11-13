import { describe, expect, it } from "vitest";
import { createApp } from "../src/server.js";
import { fakeDecisions, fakeExtractor, label, sample } from "./fakes.js";

async function post(app: ReturnType<typeof createApp>, file: string, query = "") {
  const doc = await sample(file);
  const form = new FormData();
  form.append("file", new File([new Uint8Array(doc.bytes)], file, { type: doc.mimeType }));
  return app.request(`/v1/documents/parse${query}`, { method: "POST", body: form });
}

describe("HTTP API", () => {
  it("parses an uploaded document", async () => {
    const { data } = await label("bank-statement-savings.json");
    const app = createApp({
      createDecision: fakeDecisions({ choices: { document_type: ["bank_statement", 0.97], bank_statement_variant: ["savings", 0.9] } }).create,
      extractor: fakeExtractor(data).extractor,
    });
    const res = await post(app, "bank-statement-savings.pdf");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("accepted");
    expect(body.data.closingBalance).toBe(data.closingBalance);
  });

  it("rejects an unknown type hint", async () => {
    const app = createApp({ createDecision: fakeDecisions().create, extractor: fakeExtractor({}).extractor });
    const res = await post(app, "pay-stub-standard.pdf", "?type=w2");
    expect(res.status).toBe(400);
  });

  it("needs a file", async () => {
    const app = createApp({ createDecision: fakeDecisions().create, extractor: fakeExtractor({}).extractor });
    const res = await app.request("/v1/documents/parse", { method: "POST", body: new FormData() });
    expect(res.status).toBe(400);
  });
});
