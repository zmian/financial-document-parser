import type { BankStatement } from "../../src/documents/bank-statement/schema.js";
import { Sheet, fmt, longDate, usDate } from "./pdf.js";

type Txn = BankStatement["transactions"][number];
const c = (dollars: number) => Math.round(dollars * 100);
const d = (cents: number) => cents / 100;

/** Fills in the closing balance and totals from the opening balance and transactions. */
export function statement(
  base: Omit<BankStatement, "closingBalance" | "totalCredits" | "totalDebits">,
  opts: { isCard?: boolean; printTotals?: boolean } = {},
): BankStatement {
  const credits = base.transactions.filter((t) => t.direction === "credit").reduce((s, t) => s + c(t.amount!), 0);
  const debits = base.transactions.filter((t) => t.direction === "debit").reduce((s, t) => s + c(t.amount!), 0);
  const change = opts.isCard ? debits - credits : credits - debits;
  return {
    ...base,
    closingBalance: d(c(base.openingBalance!) + change),
    totalCredits: opts.printTotals === false ? null : d(credits),
    totalDebits: opts.printTotals === false ? null : d(debits),
  };
}

export function txn(date: string, description: string, amount: number, direction: Txn["direction"]): Txn {
  return { date, description, amount, direction };
}

/** Checking: summary box, separate Withdrawals and Deposits columns, running balance. */
export async function renderRiverbend(st: BankStatement): Promise<Uint8Array> {
  const s = await Sheet.create();
  s.text("Riverbend Community Bank", 40, 50, { size: 16, bold: true });
  s.text("PO Box 1200, Madison, WI 53701 · riverbend.example", 40, 64, { gray: true });
  s.text(st.accountName!, 572, 50, { size: 11, bold: true, right: true });
  s.text(`Account ending in ${st.accountNumberLast4}`, 572, 64, { right: true });
  s.text(`${longDate(st.statementStart!)} through ${longDate(st.statementEnd!)}`, 572, 78, { right: true, gray: true });

  s.text(st.holderName!, 40, 96, { size: 10 });
  s.text("418 Lakeview Ave, Madison, WI 53703", 40, 109, { gray: true });

  s.box(40, 126, 532, 70, { fill: true });
  s.text("Account summary", 50, 142, { bold: true, size: 10 });
  const summary: Array<[string, string]> = [
    ["Beginning balance", `$${fmt(st.openingBalance!)}`],
    ["Deposits and other credits", `+ $${fmt(st.totalCredits!)}`],
    ["Withdrawals and other debits", `- $${fmt(st.totalDebits!)}`],
    ["Ending balance", `$${fmt(st.closingBalance!)}`],
  ];
  summary.forEach(([label, value], i) => {
    const x = i < 2 ? 50 : 320;
    const y = 160 + (i % 2) * 16;
    s.text(label, x, y, { bold: i === 3 });
    s.text(value, x + 240, y, { right: true, bold: i === 3 });
  });

  let y = 222;
  s.text("Transaction history", 40, y, { bold: true, size: 10 });
  y += 16;
  s.text("Date", 40, y, { gray: true });
  s.text("Description", 90, y, { gray: true });
  s.text("Withdrawals", 400, y, { gray: true, right: true });
  s.text("Deposits", 480, y, { gray: true, right: true });
  s.text("Balance", 572, y, { gray: true, right: true });
  y += 5;
  s.line(40, y, 572);

  let balance = c(st.openingBalance!);
  for (const t of st.transactions) {
    y += 14;
    balance += t.direction === "credit" ? c(t.amount!) : -c(t.amount!);
    s.text(usDate(t.date!).slice(0, 5), 40, y);
    s.text(t.description!, 90, y);
    s.text(t.direction === "debit" ? fmt(t.amount!) : "", 400, y, { right: true });
    s.text(t.direction === "credit" ? fmt(t.amount!) : "", 480, y, { right: true });
    s.text(fmt(d(balance)), 572, y, { right: true, gray: true });
  }
  y += 8;
  s.line(40, y, 572);
  y += 14;
  s.text("Ending balance", 90, y, { bold: true });
  s.text(fmt(st.closingBalance!), 572, y, { right: true, bold: true });

  s.text("This is a sample document with made-up numbers.", 40, 760, { size: 7, gray: true });
  return s.save();
}

/** Savings: one signed Amount column, no printed totals. */
export async function renderSummit(st: BankStatement): Promise<Uint8Array> {
  const s = await Sheet.create();
  s.text("SUMMIT SAVINGS & LOAN", 40, 50, { size: 13, bold: true });
  s.text(`${st.accountName} · Statement period ${usDate(st.statementStart!)} - ${usDate(st.statementEnd!)}`, 40, 66);
  s.text(`Account holder(s): ${st.holderName}`, 40, 82);
  s.text(`Account no. ****${st.accountNumberLast4}`, 40, 96);

  s.text(`Previous balance on ${usDate(st.statementStart!)}`, 40, 126);
  s.text(fmt(st.openingBalance!, { dollar: true }), 572, 126, { right: true });

  let y = 156;
  s.text("Date", 40, y, { bold: true });
  s.text("Activity", 110, y, { bold: true });
  s.text("Amount", 572, y, { bold: true, right: true });
  y += 4;
  s.line(40, y, 572);
  for (const t of st.transactions) {
    y += 14;
    s.text(usDate(t.date!), 40, y);
    s.text(t.description!, 110, y);
    s.text(fmt(t.direction === "credit" ? t.amount! : -t.amount!, { negative: t.direction === "debit" }), 572, y, { right: true });
  }
  y += 24;
  s.text(`Balance on ${usDate(st.statementEnd!)}`, 40, y, { bold: true });
  s.text(fmt(st.closingBalance!, { dollar: true }), 572, y, { right: true, bold: true });
  s.text("Annual percentage yield earned this period: 3.85%", 40, y + 22, { gray: true });

  s.text("This is a sample document with made-up numbers.", 40, 760, { size: 7, gray: true });
  return s.save();
}

/** Credit card: previous balance, payments as negatives, charges as positives. */
export async function renderMeridian(st: BankStatement): Promise<Uint8Array> {
  const s = await Sheet.create();
  s.text("Meridian Rewards Visa", 40, 50, { size: 16, bold: true });
  s.text("Meridian Card Services", 40, 64, { gray: true });
  s.text(`Account ending ${st.accountNumberLast4}`, 572, 50, { right: true });
  s.text(`Statement closing date ${usDate(st.statementEnd!)}`, 572, 64, { right: true });
  s.text(st.holderName!, 40, 90, { size: 10 });

  s.box(40, 108, 260, 92, { fill: true });
  s.text("Account summary", 50, 124, { bold: true });
  const rows: Array<[string, string]> = [
    ["Previous balance", `$${fmt(st.openingBalance!)}`],
    ["Payments and credits", `-$${fmt(st.totalCredits!)}`],
    ["Purchases, fees and interest", `+$${fmt(st.totalDebits!)}`],
    ["New balance", `$${fmt(st.closingBalance!)}`],
  ];
  rows.forEach(([label, value], i) => {
    s.text(label, 50, 142 + i * 14, { bold: i === 3 });
    s.text(value, 290, 142 + i * 14, { right: true, bold: i === 3 });
  });

  s.box(312, 108, 260, 92);
  s.text("Payment information", 322, 124, { bold: true });
  s.text("Minimum payment due", 322, 142);
  s.text("$40.00", 562, 142, { right: true });
  s.text("Payment due date", 322, 156);
  s.text("12/22/2026", 562, 156, { right: true });
  s.text(`Billing cycle ${usDate(st.statementStart!)} - ${usDate(st.statementEnd!)}`, 322, 184, { gray: true });

  let y = 226;
  s.text("Transactions", 40, y, { bold: true, size: 10 });
  y += 16;
  s.text("Post date", 40, y, { gray: true });
  s.text("Description", 110, y, { gray: true });
  s.text("Amount", 572, y, { gray: true, right: true });
  y += 4;
  s.line(40, y, 572);
  for (const t of st.transactions) {
    y += 14;
    s.text(usDate(t.date!), 40, y);
    s.text(t.description!, 110, y);
    s.text(fmt(t.direction === "credit" ? -t.amount! : t.amount!, { negative: t.direction === "credit" }), 572, y, { right: true });
  }

  s.text("This is a sample document with made-up numbers.", 40, 760, { size: 7, gray: true });
  return s.save();
}

/** Not a supported type. The classifier should say "other". */
export async function renderUtilityBill(): Promise<Uint8Array> {
  const s = await Sheet.create();
  s.text("Lakeshore Electric", 40, 50, { size: 16, bold: true });
  s.text("Residential service statement", 40, 66, { gray: true });
  s.text("Service address: 418 Lakeview Ave, Madison, WI 53703", 40, 96);
  s.text("Billing period: 10/05/2026 - 11/04/2026", 40, 110);
  s.box(40, 130, 532, 60, { fill: true });
  s.text("Amount due", 50, 150, { bold: true });
  s.text("$128.44", 562, 150, { right: true, bold: true, size: 14 });
  s.text("Due by 11/25/2026", 50, 172, { gray: true });
  const rows: Array<[string, string]> = [
    ["Previous balance", "$116.10"],
    ["Payment received 10/18 - thank you", "-$116.10"],
    ["Electric delivery, 612 kWh", "$71.38"],
    ["Electric supply, 612 kWh", "$49.57"],
    ["Customer charge", "$7.49"],
  ];
  rows.forEach(([label, value], i) => {
    s.text(label, 40, 220 + i * 16);
    s.text(value, 572, 220 + i * 16, { right: true });
  });
  s.text("This is a sample document with made-up numbers.", 40, 760, { size: 7, gray: true });
  return s.save();
}
