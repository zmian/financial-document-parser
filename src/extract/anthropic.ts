import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "../config.js";
import type { Extractor } from "./index.js";
import { extractionSchema } from "./prompt.js";

export function anthropicExtractor(client = new Anthropic({ maxRetries: 4 })): Extractor {
  return {
    async extract(doc, type, prompt) {
      const { input } = doc;
      const data = input.bytes.toString("base64");
      const file =
        input.mimeType === "application/pdf"
          ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
          : { type: "image" as const, source: { type: "base64" as const, media_type: input.mimeType, data } };

      const message = await client.messages.parse({
        model: config.anthropicExtractionModel,
        max_tokens: 16_000,
        system: prompt,
        messages: [{ role: "user", content: [file] }],
        output_config: { format: zodOutputFormat(extractionSchema(type)) },
      });

      if (!message.parsed_output) throw new Error("The model returned no structured output.");
      return { ...message.parsed_output, data: message.parsed_output.data as never, model: message.model };
    },
  };
}
