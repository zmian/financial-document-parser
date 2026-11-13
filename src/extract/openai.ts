import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { config } from "../config.js";
import { dataUrl } from "../input.js";
import type { Extractor } from "./index.js";
import { extractionSchema } from "./prompt.js";

export function openaiExtractor(client = new OpenAI({ maxRetries: 4 })): Extractor {
  return {
    async extract(doc, type, prompt) {
      const { input } = doc;
      // The PDF goes in as a file so the model sees both the text and the layout.
      const file =
        input.mimeType === "application/pdf"
          ? { type: "input_file" as const, filename: input.fileName ?? "document.pdf", file_data: dataUrl(input.bytes, input.mimeType) }
          : { type: "input_image" as const, image_url: dataUrl(input.bytes, input.mimeType), detail: "high" as const };

      const response = await client.responses.parse({
        model: config.openaiExtractionModel,
        store: false,
        instructions: prompt,
        input: [{ role: "user", content: [file] }],
        text: { format: zodTextFormat(extractionSchema(type), "extraction") },
      });

      if (!response.output_parsed) throw new Error("The model returned no structured output.");
      return { ...response.output_parsed, data: response.output_parsed.data as never, model: response.model };
    },
  };
}
