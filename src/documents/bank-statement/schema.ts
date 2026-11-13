import { z } from "zod";

const money = z.number().nullable();
const text = z.string().nullable();
const date = z.string().nullable();

const Transaction = z.object({
  date: date.describe("Date the transaction posted, YYYY-MM-DD."),
  description: text.describe("The transaction description as printed."),
  amount: money.describe("The amount as a positive number. Direction says which way the money moved."),
  direction: z
    .enum(["credit", "debit"])
    .describe(
      "For checking and savings: credit = money in (deposits, interest), debit = money out. For credit cards: debit = a purchase or fee that adds to what's owed, credit = a payment or refund that reduces it.",
    ),
});

export const BankStatement = z.object({
  institutionName: text.describe("The bank or card issuer that sent the statement."),
  accountName: text.describe("The product name of the account, e.g. 'Everyday Checking', 'High Yield Savings', 'Rewards Visa'."),
  accountNumberLast4: text.describe("The last four digits of the account number. Never the full number."),
  holderName: text.describe("The account holder's name. Join multiple holders with ' & '."),
  statementStart: date.describe("First day of the statement period, YYYY-MM-DD."),
  statementEnd: date.describe("Last day of the statement period, YYYY-MM-DD."),
  openingBalance: money.describe(
    "Balance at the start of the period. For credit cards, the amount owed at the start (previous balance), as a positive number.",
  ),
  closingBalance: money.describe(
    "Balance at the end of the period. For credit cards, the amount owed at the end (new balance), as a positive number.",
  ),
  totalCredits: money.describe("Total deposits and other credits for the period, if the statement prints a total. Null if it doesn't."),
  totalDebits: money.describe("Total withdrawals and other debits for the period, if the statement prints a total. Null if it doesn't."),
  transactions: z.array(Transaction).describe("Every transaction in the period, in the order printed."),
});

export type BankStatement = z.infer<typeof BankStatement>;
