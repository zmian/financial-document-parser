/**
 * Writes made-up sample documents to samples/ and the right answers to
 * samples/labels/. Every number ties out by construction, so the labels are
 * also a test of the checks.
 *
 *   npm run samples
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pdf } from "pdf-to-img";
import { renderMeridian, renderRiverbend, renderSummit, renderUtilityBill, statement, txn } from "./samples/bank-statements.js";
import { bonusStub, regularStub, renderCrestline, renderLedgerly, renderPinecrest } from "./samples/pay-stubs.js";

const OUT = join(import.meta.dirname, "..", "samples");

export interface Label {
  file: string;
  type: string; // "pay_stub" | "bank_statement" | "other"
  variant: string | null;
  data: unknown; // null for "other"
}

const labels: Label[] = [];

async function save(file: string, bytes: Uint8Array, label: Omit<Label, "file">) {
  await writeFile(join(OUT, file), bytes);
  labels.push({ file, ...label });
  console.log(`  ${file}`);
}

await mkdir(join(OUT, "labels"), { recursive: true });
console.log("Writing samples:");

// --- Pay stubs -------------------------------------------------------------

const northwind = regularStub({
  employeeName: "Maya Okafor",
  employerName: "Northwind Labs, Inc.",
  payFrequency: "biweekly",
  periodNumber: 22,
  payDate: "2026-10-30",
  payPeriodStart: "2026-10-12",
  payPeriodEnd: "2026-10-25",
  earnings: [
    { name: "Regular", type: "regular", rate: 52.5, hours: 80, amount: 4200 },
    { name: "Overtime", type: "overtime", rate: 78.75, hours: 4, amount: 315 },
  ],
  taxes: {
    federal: ["Federal Income Tax", 0.14],
    ss: "Social Security",
    medicare: "Medicare",
    state: [
      ["NY State Income Tax", "state_income", 0.052],
      ["NY SDI", "state_disability", 0.0005],
      ["NY Paid Family Leave", "state_family_leave", 0.00388],
    ],
  },
  deductions: [
    { name: "401(k)", type: "traditional_401k", amount: 270.9 },
    { name: "Medical", type: "medical", amount: 142.5 },
    { name: "Dental", type: "dental", amount: 18.25 },
    { name: "Roth 401(k)", type: "roth_401k", amount: 90 },
  ],
});
await save("pay-stub-standard.pdf", await renderLedgerly(northwind, { address: "1200 Pier St, Brooklyn, NY 11201" }), {
  type: "pay_stub",
  variant: "standard",
  data: northwind,
});

const tidewater = regularStub({
  employeeName: "Daniel Reyes",
  employerName: "Tidewater Logistics LLC",
  payFrequency: "semimonthly",
  periodNumber: 20,
  payDate: "2026-10-31",
  payPeriodStart: "2026-10-16",
  payPeriodEnd: "2026-10-31",
  earnings: [{ name: "Salary", type: "salary", rate: null, hours: null, amount: 5208.33 }],
  taxes: {
    federal: ["Fed Withholdng", 0.15],
    ss: "OASDI",
    medicare: "Fed MED/EE",
    state: [
      ["CA State Tax", "state_income", 0.06],
      ["CA SDI", "state_disability", 0.012],
    ],
  },
  deductions: [
    { name: "401K Pretax", type: "traditional_401k", amount: 312.5 },
    { name: "Med Pre-Tax", type: "medical", amount: 96 },
    { name: "Vision", type: "vision", amount: 6.4 },
    { name: "HSA EE", type: "hsa", amount: 100 },
  ],
});
await save("pay-stub-semimonthly.pdf", await renderPinecrest(tidewater), { type: "pay_stub", variant: "standard", data: tidewater });

const harbor = regularStub({
  employeeName: "Priya Natarajan",
  employerName: "Harbor Coffee Co.",
  payFrequency: "biweekly",
  periodNumber: 21,
  payDate: "2026-10-23",
  payPeriodStart: "2026-10-05",
  payPeriodEnd: "2026-10-18",
  earnings: [{ name: "Regular", type: "regular", rate: 31, hours: 80, amount: 2480 }],
  taxes: {
    federal: ["Federal Income Tax", 0.1],
    ss: "Social Security",
    medicare: "Medicare",
    state: [["California Income Tax", "state_income", 0.035], ["California SDI", "state_disability", 0.012]],
  },
  deductions: [
    { name: "Medical (pre-tax)", type: "medical", amount: 88 },
    { name: "Commuter (pre-tax)", type: "commuter", amount: 60 },
  ],
});
const peoPdf = await renderCrestline(harbor, "Harbor Coffee Co.");
await save("pay-stub-peo.pdf", peoPdf, { type: "pay_stub", variant: "peo", data: harbor });

// The same PEO stub as a photo-like PNG, so there's no text layer to lean on.
{
  const doc = await pdf(peoPdf, { scale: 1.5 });
  const png = await doc.getPage(1);
  await doc.destroy();
  await save("pay-stub-peo-photo.png", png, { type: "pay_stub", variant: "peo", data: harbor });
}

const bonus = bonusStub(northwind, 6000, { payDate: "2026-11-06", stateRate: 0.0685, k401Rate: 0.06 });
await save(
  "pay-stub-bonus.pdf",
  await renderLedgerly(bonus, { title: "Supplemental Earnings Statement", address: "1200 Pier St, Brooklyn, NY 11201" }),
  { type: "pay_stub", variant: "off_cycle", data: bonus },
);

// --- Bank statements -------------------------------------------------------

const checking = statement({
  institutionName: "Riverbend Community Bank",
  accountName: "Everyday Checking",
  accountNumberLast4: "4821",
  holderName: "Maya Okafor",
  statementStart: "2026-10-01",
  statementEnd: "2026-10-31",
  openingBalance: 3184.27,
  transactions: [
    txn("2026-10-01", "RENT PAYMENT - ONLINE TRANSFER", 2150, "debit"),
    txn("2026-10-02", "NORTHWIND LABS PAYROLL", 2858.37, "credit"),
    txn("2026-10-03", "GREENLEAF MARKET #114", 86.42, "debit"),
    txn("2026-10-06", "CITY UTILITIES AUTOPAY", 74.19, "debit"),
    txn("2026-10-08", "ATM WITHDRAWAL 0412", 100, "debit"),
    txn("2026-10-10", "STREAMFLIX SUBSCRIPTION", 15.99, "debit"),
    txn("2026-10-14", "TRANSFER TO SAVINGS 0193", 500, "debit"),
    txn("2026-10-16", "NORTHWIND LABS PAYROLL", 2858.37, "credit"),
    txn("2026-10-17", "GREENLEAF MARKET #114", 112.08, "debit"),
    txn("2026-10-20", "MERIDIAN CARD PAYMENT", 1240.56, "debit"),
    txn("2026-10-22", "VENMO CASHOUT", 45, "credit"),
    txn("2026-10-24", "CORNER PHARMACY", 23.67, "debit"),
    txn("2026-10-28", "GYMWORKS MEMBERSHIP", 49, "debit"),
    txn("2026-10-30", "NORTHWIND LABS PAYROLL", 2858.37, "credit"),
    txn("2026-10-31", "MONTHLY SERVICE FEE", 6, "debit"),
  ],
});
await save("bank-statement-checking.pdf", await renderRiverbend(checking), { type: "bank_statement", variant: "checking", data: checking });

const savings = statement(
  {
    institutionName: "Summit Savings & Loan",
    accountName: "High Yield Savings",
    accountNumberLast4: "0193",
    holderName: "Maya Okafor & Sam Okafor",
    statementStart: "2026-10-01",
    statementEnd: "2026-10-31",
    openingBalance: 18450.12,
    transactions: [
      txn("2026-10-14", "Transfer from checking ...4821", 500, "credit"),
      txn("2026-10-21", "Withdrawal - online transfer", 1200, "debit"),
      txn("2026-10-31", "Interest paid", 57.43, "credit"),
    ],
  },
  { printTotals: false },
);
await save("bank-statement-savings.pdf", await renderSummit(savings), { type: "bank_statement", variant: "savings", data: savings });

const card = statement(
  {
    institutionName: "Meridian Card Services",
    accountName: "Meridian Rewards Visa",
    accountNumberLast4: "7730",
    holderName: "Maya Okafor",
    statementStart: "2026-10-23",
    statementEnd: "2026-11-22",
    openingBalance: 1240.56,
    transactions: [
      txn("2026-10-25", "BLUE DOOR BISTRO", 64.3, "debit"),
      txn("2026-10-27", "PAYMENT - THANK YOU", 1240.56, "credit"),
      txn("2026-10-29", "SKYWAY AIRLINES", 412.8, "debit"),
      txn("2026-11-02", "HOMEGOODS DEPOT", 138.47, "debit"),
      txn("2026-11-05", "SKYWAY AIRLINES - REFUND", 89, "credit"),
      txn("2026-11-09", "FUELSTOP 2231", 52.11, "debit"),
      txn("2026-11-14", "BOOKNOOK ONLINE", 27.99, "debit"),
      txn("2026-11-18", "FOREIGN TRANSACTION FEE", 3.12, "debit"),
    ],
  },
  { isCard: true },
);
await save("bank-statement-credit-card.pdf", await renderMeridian(card), { type: "bank_statement", variant: "credit_card", data: card });

// --- Not supported ---------------------------------------------------------

await save("other-utility-bill.pdf", await renderUtilityBill(), { type: "other", variant: null, data: null });

for (const label of labels) {
  await writeFile(join(OUT, "labels", `${label.file.replace(/\.\w+$/, "")}.json`), JSON.stringify(label, null, 2) + "\n");
}
console.log(`\nWrote ${labels.length} documents and labels to samples/.`);
