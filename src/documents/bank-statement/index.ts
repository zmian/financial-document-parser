import { get } from "../../fields.js";
import type { DocumentType } from "../types.js";
import { bankStatementChecks } from "./checks.js";
import { BankStatement } from "./schema.js";

const FIELD_NAMES: Record<string, string> = {
  institutionName: "bank name",
  accountName: "account name",
  accountNumberLast4: "last four digits of the account number",
  holderName: "account holder's name",
  statementStart: "statement period start date",
  statementEnd: "statement period end date",
  openingBalance: "opening balance",
  closingBalance: "closing balance",
  totalCredits: "printed total of deposits and credits",
  totalDebits: "printed total of withdrawals and debits",
};

export const bankStatement: DocumentType<BankStatement> = {
  id: "bank_statement",
  label: "bank statement",
  description:
    "A periodic statement for a checking, savings or credit card account, showing balances and a list of transactions.",
  variantQuestion: "If this is a bank statement, what kind of account is it for?",
  variants: [
    {
      id: "checking",
      description: "A checking account statement.",
      instructions: [],
    },
    {
      id: "savings",
      description: "A savings or money market account statement.",
      instructions: ["Interest paid is a credit."],
    },
    {
      id: "credit_card",
      description: "A credit card statement.",
      instructions: [
        "This is a credit card statement. openingBalance is the previous balance and closingBalance is the new balance, both as amounts owed. Purchases, fees and interest charged are debits. Payments and refunds are credits.",
      ],
    },
  ],
  schema: BankStatement,
  context: [
    "A bank statement starts at an opening balance, lists every transaction in the period, and ends at a closing balance.",
    "Amounts are always positive. Use direction to say which way the money moved. Statements show this as a minus sign, a separate column, or 'CR'/'DR'.",
    "Include every transaction row, even small ones like fees and interest. Skip running balance columns and summary rows.",
  ],
  keyFields: ["institutionName", "statementStart", "statementEnd", "openingBalance", "closingBalance"],
  checks: bankStatementChecks,
  describeField(path, data) {
    const row = path.match(/^transactions\[(\d+)\]\.(\w+)$/);
    if (row) {
      const [, index, key] = row;
      const description = get(data, `transactions[${index}].description`);
      const label = typeof description === "string" && description ? `"${description}"` : `row ${Number(index) + 1}`;
      return `the ${key} of the ${label} transaction`;
    }
    return `the ${FIELD_NAMES[path] ?? path}`;
  },
};
