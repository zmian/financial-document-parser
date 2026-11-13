import { bankStatement } from "./bank-statement/index.js";
import { payStub } from "./pay-stub/index.js";
import type { DocumentType } from "./types.js";

/**
 * Every document type the pipeline knows about. To add one, make a folder like
 * pay-stub/ with a schema, variants and checks, and list it here. The classifier
 * picks up the new type on its own.
 */
export const documentTypes: DocumentType<any>[] = [payStub, bankStatement];

export function findDocumentType(id: string): DocumentType<any> | undefined {
  return documentTypes.find((t) => t.id === id);
}

export type { DocumentType, CheckResult, Variant } from "./types.js";
