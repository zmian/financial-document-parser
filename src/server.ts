import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { documentTypes } from "./documents/index.js";
import { type MimeType, mimeTypeFromName } from "./input.js";
import { type Dependencies, defaultDependencies, parseDocument } from "./pipeline.js";

const ACCEPTED: MimeType[] = ["application/pdf", "image/png", "image/jpeg"];
const MAX_BYTES = 20 * 1024 * 1024;

export function createApp(deps: Dependencies = defaultDependencies()) {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/v1/document-types", (c) =>
    c.json(documentTypes.map((t) => ({ id: t.id, label: t.label, variants: t.variants.map((v) => v.id) }))),
  );

  /**
   * Send a file as multipart form data under "file". Add ?type=pay_stub to skip
   * classification when you already know what it is.
   */
  app.post("/v1/documents/parse", bodyLimit({
    maxSize: MAX_BYTES + 64 * 1024,
    onError: (c) => c.json({ error: "Upload exceeds the request size limit." }, 413),
  }), async (c) => {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) return c.json({ error: 'Send the document as multipart form data in a field named "file".' }, 400);
    if (file.size > MAX_BYTES) return c.json({ error: "Files are limited to 20 MB." }, 413);

    let mimeType: MimeType;
    try {
      mimeType = ACCEPTED.includes(file.type as MimeType) ? (file.type as MimeType) : mimeTypeFromName(file.name);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 415);
    }

    const type = c.req.query("type");
    if (type && !documentTypes.some((t) => t.id === type)) {
      return c.json({ error: `Unknown type "${type}". See GET /v1/document-types.` }, 400);
    }

    const result = await parseDocument(
      { bytes: Buffer.from(await file.arrayBuffer()), mimeType, fileName: file.name },
      { type },
      deps,
    );
    return c.json(result);
  });

  app.onError((error, c) => {
    console.error(`Parsing failed (${error.name}).`);
    return c.json({ error: "Parsing failed. Check the server logs." }, 500);
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  const hostname = "127.0.0.1";
  serve({ fetch: createApp().fetch, hostname, port });
  console.log(`Listening on http://${hostname}:${port}`);
}
