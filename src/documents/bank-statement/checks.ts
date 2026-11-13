import { money, sameMoney, sum, toCents } from "../../fields.js";
import type { CheckResult } from "../types.js";
import type { BankStatement } from "./schema.js";

function totals(statement: BankStatement) {
  const credits: number[] = [];
  const debits: number[] = [];
  for (const t of statement.transactions) {
    if (t.amount === null) return null;
    (t.direction === "credit" ? credits : debits).push(t.amount);
  }
  return { credits: sum(credits), debits: sum(debits) };
}

const amountPaths = (statement: BankStatement) =>
  statement.transactions.flatMap((_, i) => [`transactions[${i}].amount`, `transactions[${i}].direction`]);

/**
 * Opening + credits − debits = closing. On a credit card the balance is what's
 * owed, so purchases (debits) push it up and payments (credits) bring it down.
 */
function balanceTiesOut(statement: BankStatement, variantId: string | null): CheckResult {
  const id = "balance_ties_out";
  const isCard = variantId === "credit_card";
  const description = isCard ? "Previous balance + charges − payments = new balance" : "Opening + credits − debits = closing";
  const fields = ["openingBalance", "closingBalance", ...amountPaths(statement)];

  const t = totals(statement);
  const { openingBalance: opening, closingBalance: closing } = statement;
  if (opening === null || closing === null || t === null) {
    return { id, description, status: "skip", fields, detail: "A balance or a transaction amount is missing." };
  }

  const change = isCard ? toCents(t.debits) - toCents(t.credits) : toCents(t.credits) - toCents(t.debits);
  const expected = (toCents(opening) + change) / 100;
  if (sameMoney(expected, closing)) {
    return { id, description, status: "pass", fields, detail: `${statement.transactions.length} transactions take ${money(opening)} to ${money(closing)}.` };
  }
  return {
    id,
    description,
    status: "fail",
    fields,
    detail: `Transactions take ${money(opening)} to ${money(expected)}, the statement says ${money(closing)}. Off by ${money(Math.abs(expected - closing))}: look for a transaction of that size that was missed, doubled or flipped.`,
  };
}

/** If the statement prints totals, the transactions have to add up to them. */
function totalsMatch(statement: BankStatement, direction: "credit" | "debit"): CheckResult {
  const field = direction === "credit" ? "totalCredits" : "totalDebits";
  const id = direction === "credit" ? "credits_match_total" : "debits_match_total";
  const description = `${direction === "credit" ? "Credits" : "Debits"} add up to the printed total`;
  const fields = [field, ...amountPaths(statement)];

  const printed = statement[field];
  const t = totals(statement);
  if (printed === null || t === null) {
    return { id, description, status: "skip", fields, detail: "No printed total, or an amount is missing." };
  }

  const actual = direction === "credit" ? t.credits : t.debits;
  return sameMoney(actual, printed)
    ? { id, description, status: "pass", fields, detail: `${money(actual)} matches.` }
    : { id, description, status: "fail", fields, detail: `Transactions add up to ${money(actual)}, the statement says ${money(printed)}.` };
}

/** Every transaction date has to fall inside the statement period. */
function datesInPeriod(statement: BankStatement): CheckResult {
  const id = "dates_in_period";
  const description = "Transaction dates fall inside the statement period";
  const { statementStart, statementEnd } = statement;
  if (!statementStart || !statementEnd) {
    return { id, description, status: "skip", fields: ["statementStart", "statementEnd"], detail: "Period dates are missing." };
  }

  const outside = statement.transactions
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.date !== null && (t.date < statementStart || t.date > statementEnd));

  if (outside.length === 0) {
    return {
      id,
      description,
      status: "pass",
      fields: ["statementStart", "statementEnd", ...statement.transactions.map((_, i) => `transactions[${i}].date`)],
      detail: `All dates fall between ${statementStart} and ${statementEnd}.`,
    };
  }
  return {
    id,
    description,
    status: "fail",
    fields: ["statementStart", "statementEnd", ...outside.map(({ i }) => `transactions[${i}].date`)],
    detail: outside.map(({ t, i }) => `transactions[${i}] is dated ${t.date}`).join("; "),
  };
}

export function bankStatementChecks(statement: BankStatement, variantId: string | null): CheckResult[] {
  return [
    balanceTiesOut(statement, variantId),
    totalsMatch(statement, "credit"),
    totalsMatch(statement, "debit"),
    datesInPeriod(statement),
  ];
}
