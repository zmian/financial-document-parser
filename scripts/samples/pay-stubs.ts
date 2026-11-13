import type { PayStub } from "../../src/documents/pay-stub/schema.js";
import { Sheet, fmt, longDate, usDate } from "./pdf.js";

// All arithmetic happens in cents so every sample ties out exactly.
const c = (dollars: number) => Math.round(dollars * 100);
const d = (cents: number) => cents / 100;

type Earning = PayStub["earnings"][number];
type Tax = PayStub["taxes"][number];
type Deduction = PayStub["deductions"][number];

interface RegularStubInput {
  employeeName: string;
  employerName: string;
  payFrequency: NonNullable<PayStub["payFrequency"]>;
  periodNumber: number; // which pay period of the year, for YTD
  payDate: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  earnings: Array<{ name: string; type: Earning["type"]; rate: number | null; hours: number | null; amount: number }>;
  taxes: { federal: [string, number]; ss: string; medicare: string; state: Array<[string, Tax["type"], number]> };
  deductions: Array<{ name: string; type: Deduction["type"]; amount: number }>;
}

const SECTION_125: Deduction["type"][] = ["medical", "dental", "vision", "hsa", "fsa"];
const PRE_TAX: Deduction["type"][] = [...SECTION_125, "traditional_401k"];

/** Builds a pay stub whose taxes, deductions and YTD columns all tie out. */
export function regularStub(input: RegularStubInput): PayStub {
  const n = input.periodNumber;
  const grossCents = input.earnings.reduce((t, e) => t + c(e.amount), 0);
  const section125 = input.deductions.filter((x) => SECTION_125.includes(x.type)).reduce((t, x) => t + c(x.amount), 0);
  const preTax = input.deductions.filter((x) => PRE_TAX.includes(x.type)).reduce((t, x) => t + c(x.amount), 0);
  const ficaWages = grossCents - section125;
  const taxableWages = grossCents - preTax;

  const taxCents: Array<[string, Tax["type"], number]> = [
    [input.taxes.federal[0], "federal_income", Math.round(taxableWages * input.taxes.federal[1])],
    [input.taxes.ss, "social_security", Math.round(ficaWages * 0.062)],
    [input.taxes.medicare, "medicare", Math.round(ficaWages * 0.0145)],
    ...input.taxes.state.map(([name, type, rate]): [string, Tax["type"], number] => [name, type, Math.round(taxableWages * rate)]),
  ];

  const taxTotal = taxCents.reduce((t, [, , v]) => t + v, 0);
  const dedTotal = input.deductions.reduce((t, x) => t + c(x.amount), 0);
  const netCents = grossCents - taxTotal - dedTotal;

  return {
    employeeName: input.employeeName,
    employerName: input.employerName,
    payDate: input.payDate,
    payPeriodStart: input.payPeriodStart,
    payPeriodEnd: input.payPeriodEnd,
    payFrequency: input.payFrequency,
    grossPay: d(grossCents),
    grossPayYtd: d(grossCents * n),
    netPay: d(netCents),
    netPayYtd: d(netCents * n),
    earnings: input.earnings.map((e) => ({
      name: e.name,
      type: e.type,
      rate: e.rate,
      hours: e.hours,
      currentPeriod: e.amount,
      ytd: d(c(e.amount) * n),
    })),
    taxes: taxCents.map(([name, type, cents]) => ({ name, type, currentPeriod: d(cents), ytd: d(cents * n) })),
    deductions: input.deductions.map((x) => ({ name: x.name, type: x.type, currentPeriod: x.amount, ytd: d(c(x.amount) * n) })),
  };
}

/** A bonus paid on its own stub, on top of a regular stub's YTD. */
export function bonusStub(prior: PayStub, bonus: number, opts: { payDate: string; stateRate: number; k401Rate: number }): PayStub {
  const b = c(bonus);
  const k401 = Math.round(b * opts.k401Rate);
  const taxable = b - k401;
  const current: Record<string, number> = {
    federal_income: Math.round(taxable * 0.22), // flat supplemental rate
    social_security: Math.round(b * 0.062),
    medicare: Math.round(b * 0.0145),
    state_income: Math.round(taxable * opts.stateRate),
  };

  const taxes = prior.taxes.map((t) => {
    const now = current[t.type];
    return {
      ...t,
      currentPeriod: now === undefined ? null : d(now),
      ytd: d(c(t.ytd!) + (now ?? 0)),
    };
  });
  const deductions = prior.deductions.map((x) => {
    const now = x.type === "traditional_401k" ? k401 : undefined;
    return { ...x, currentPeriod: now === undefined ? null : d(now), ytd: d(c(x.ytd!) + (now ?? 0)) };
  });

  const taxNow = Object.values(current).reduce((t, v) => t + v, 0);
  const netCents = b - taxNow - k401;

  return {
    ...prior,
    payDate: opts.payDate,
    payPeriodStart: opts.payDate,
    payPeriodEnd: opts.payDate,
    grossPay: d(b),
    grossPayYtd: d(c(prior.grossPayYtd!) + b),
    netPay: d(netCents),
    netPayYtd: d(c(prior.netPayYtd!) + netCents),
    earnings: [
      ...prior.earnings.map((e) => ({ ...e, rate: null, hours: null, currentPeriod: null })),
      { name: "Annual Bonus", type: "bonus" as const, rate: null, hours: null, currentPeriod: d(b), ytd: d(b) },
    ],
    taxes,
    deductions,
  };
}

// ---------------------------------------------------------------------------
// Layouts. Same data, different looks, which is the whole problem.
// ---------------------------------------------------------------------------

/** Clean table layout: positive amounts, "This Period" and "Year to Date" columns. */
export async function renderLedgerly(stub: PayStub, opts: { title?: string; address: string } ): Promise<Uint8Array> {
  const s = await Sheet.create();
  s.text(stub.employerName!, 40, 50, { size: 15, bold: true });
  s.text(opts.address, 40, 66, { gray: true });
  s.text(opts.title ?? "Earnings Statement", 572, 50, { size: 13, bold: true, right: true });
  s.text("Payroll by Ledgerly", 572, 66, { gray: true, right: true });

  s.box(40, 85, 260, 62);
  s.text("EMPLOYEE", 50, 100, { size: 7, bold: true, gray: true });
  s.text(stub.employeeName!, 50, 115, { size: 11, bold: true });
  s.text("Employee ID 004417", 50, 130, { gray: true });

  s.box(312, 85, 260, 62);
  s.text("Pay date", 322, 102);
  s.text(usDate(stub.payDate!), 562, 102, { right: true, bold: true });
  s.text("Period beginning", 322, 117);
  s.text(usDate(stub.payPeriodStart!), 562, 117, { right: true });
  s.text("Period ending", 322, 132);
  s.text(usDate(stub.payPeriodEnd!), 562, 132, { right: true });
  if (stub.payFrequency) s.text(`Pay frequency: ${{ weekly: "Weekly", biweekly: "Biweekly", semimonthly: "Semi-monthly", monthly: "Monthly" }[stub.payFrequency]}`, 322, 158, { gray: true });

  let y = 180;
  const table = (title: string, rows: Array<{ name: string | null; rate?: number | null; hours?: number | null; current: number | null; ytd: number | null }>, showRate: boolean) => {
    s.text(title, 40, y, { bold: true, size: 10 });
    if (showRate) {
      s.text("Rate", 300, y, { right: true, gray: true });
      s.text("Hours", 360, y, { right: true, gray: true });
    }
    s.text("This Period", 470, y, { right: true, gray: true });
    s.text("Year to Date", 572, y, { right: true, gray: true });
    y += 5;
    s.line(40, y, 572);
    for (const r of rows) {
      y += 14;
      s.text(r.name ?? "", 40, y);
      if (showRate && r.rate != null) s.text(fmt(r.rate), 300, y, { right: true });
      if (showRate && r.hours != null) s.text(r.hours.toFixed(2), 360, y, { right: true });
      if (r.current !== null) s.text(fmt(r.current), 470, y, { right: true });
      if (r.ytd !== null) s.text(fmt(r.ytd), 572, y, { right: true });
    }
    y += 28;
  };

  table("Earnings", stub.earnings.map((e) => ({ name: e.name, rate: e.rate, hours: e.hours, current: e.currentPeriod, ytd: e.ytd })), true);
  table("Taxes", stub.taxes.map((t) => ({ name: t.name, current: t.currentPeriod, ytd: t.ytd })), false);
  table("Deductions", stub.deductions.map((x) => ({ name: x.name, current: x.currentPeriod, ytd: x.ytd })), false);

  // Summary
  const taxNow = stub.taxes.reduce((t, x) => t + c(x.currentPeriod ?? 0), 0);
  const taxYtd = stub.taxes.reduce((t, x) => t + c(x.ytd ?? 0), 0);
  const dedNow = stub.deductions.reduce((t, x) => t + c(x.currentPeriod ?? 0), 0);
  const dedYtd = stub.deductions.reduce((t, x) => t + c(x.ytd ?? 0), 0);
  s.box(40, y - 10, 532, 78, { fill: true });
  s.text("Summary", 50, y + 4, { bold: true, size: 10 });
  s.text("This Period", 470, y + 4, { right: true, gray: true });
  s.text("Year to Date", 562, y + 4, { right: true, gray: true });
  const rows: Array<[string, number, number, boolean]> = [
    ["Gross Pay", c(stub.grossPay!), c(stub.grossPayYtd!), false],
    ["Total Taxes", taxNow, taxYtd, false],
    ["Total Deductions", dedNow, dedYtd, false],
    ["Net Pay", c(stub.netPay!), c(stub.netPayYtd!), true],
  ];
  rows.forEach(([label, now, ytd, bold], i) => {
    const ry = y + 20 + i * 13;
    s.text(label, 50, ry, { bold });
    s.text(fmt(d(now)), 470, ry, { right: true, bold });
    s.text(fmt(d(ytd)), 562, ry, { right: true, bold });
  });
  y += 95;

  s.text(`Net pay of $${fmt(stub.netPay!)} was deposited to checking account ending in 2290.`, 40, y, { gray: true });
  s.text("This is a sample document with made-up numbers.", 40, 760, { size: 7, gray: true });
  return s.save();
}

/** Denser layout: negative amounts, payroll-system labels, net pay up top. */
export async function renderPinecrest(stub: PayStub): Promise<Uint8Array> {
  const s = await Sheet.create();
  s.text("PINECREST PAYROLL SERVICES", 40, 44, { size: 8, bold: true, gray: true });
  s.text(stub.employerName!.toUpperCase(), 40, 62, { size: 13, bold: true });
  s.text("STATEMENT OF EARNINGS AND DEDUCTIONS", 40, 76, { size: 8 });

  s.box(390, 36, 182, 54, { fill: true });
  s.text("NET PAY", 400, 52, { size: 8, bold: true });
  s.text(`$${fmt(stub.netPay!)}`, 562, 76, { size: 16, bold: true, right: true });

  s.text(`Employee: ${stub.employeeName}`, 40, 110);
  s.text(`Check Date: ${longDate(stub.payDate!)}`, 40, 124);
  s.text(`Pay Period: ${usDate(stub.payPeriodStart!)} - ${usDate(stub.payPeriodEnd!)}`, 300, 110);
  s.text("Pay Group: SEMI-MONTHLY SALARIED", 300, 124);
  s.line(40, 136, 572, { thick: true });

  // Two blocks side by side: earnings on the left, withholdings and deductions on the right.
  let y = 154;
  s.text("EARNINGS", 40, y, { bold: true, size: 8 });
  s.text("CURRENT", 200, y, { right: true, bold: true, size: 8 });
  s.text("YTD", 280, y, { right: true, bold: true, size: 8 });
  for (const e of stub.earnings) {
    y += 13;
    s.text(e.name!.toUpperCase(), 40, y, { size: 8 });
    s.text(e.currentPeriod === null ? "" : fmt(e.currentPeriod), 200, y, { right: true, size: 8 });
    s.text(fmt(e.ytd!), 280, y, { right: true, size: 8 });
  }
  y += 16;
  s.text("GROSS", 40, y, { bold: true, size: 8 });
  s.text(fmt(stub.grossPay!), 200, y, { right: true, bold: true, size: 8 });
  s.text(fmt(stub.grossPayYtd!), 280, y, { right: true, bold: true, size: 8 });

  let ry = 154;
  s.text("WITHHOLDINGS", 312, ry, { bold: true, size: 8 });
  s.text("CURRENT", 492, ry, { right: true, bold: true, size: 8 });
  s.text("YTD", 572, ry, { right: true, bold: true, size: 8 });
  for (const t of stub.taxes) {
    ry += 13;
    s.text(t.name!.toUpperCase(), 312, ry, { size: 8 });
    s.text(fmt(-t.currentPeriod!, { negative: true }), 492, ry, { right: true, size: 8 });
    s.text(fmt(-t.ytd!, { negative: true }), 572, ry, { right: true, size: 8 });
  }
  ry += 22;
  s.text("DEDUCTIONS", 312, ry, { bold: true, size: 8 });
  for (const x of stub.deductions) {
    ry += 13;
    s.text(x.name!.toUpperCase(), 312, ry, { size: 8 });
    s.text(fmt(-x.currentPeriod!, { negative: true }), 492, ry, { right: true, size: 8 });
    s.text(fmt(-x.ytd!, { negative: true }), 572, ry, { right: true, size: 8 });
  }

  y = Math.max(y, ry) + 30;
  s.line(40, y, 572, { thick: true });
  y += 16;
  s.text("NET PAY", 312, y, { bold: true, size: 8 });
  s.text(fmt(stub.netPay!), 492, y, { right: true, bold: true, size: 8 });
  s.text(fmt(stub.netPayYtd!), 572, y, { right: true, bold: true, size: 8 });

  y += 30;
  s.text("EMPLOYER BENEFITS (NOT DEDUCTED FROM PAY)", 40, y, { bold: true, size: 8 });
  s.text("401K MATCH", 40, y + 13, { size: 8 });
  s.text("150.00", 200, y + 13, { right: true, size: 8 });
  s.text("ER MEDICAL", 40, y + 26, { size: 8 });
  s.text("612.00", 200, y + 26, { right: true, size: 8 });

  s.text("This is a sample document with made-up numbers.", 40, 760, { size: 7, gray: true });
  return s.save();
}

/** PEO layout: the PEO's name is the biggest thing on the page. */
export async function renderCrestline(stub: PayStub, clientBusiness: string): Promise<Uint8Array> {
  const s = await Sheet.create();
  s.text("Crestline PEO", 40, 52, { size: 20, bold: true });
  s.text("Crestline PEO, Inc. · 300 Harbor Way, Oakland, CA 94607", 40, 68, { gray: true });
  s.text(`Crestline PEO for ${clientBusiness}`, 40, 92, { size: 11, bold: true });

  s.text("Pay Statement", 572, 52, { size: 12, bold: true, right: true });
  s.text(`Pay date ${longDate(stub.payDate!)}`, 572, 68, { right: true });
  s.text(`${longDate(stub.payPeriodStart!)} to ${longDate(stub.payPeriodEnd!)}`, 572, 82, { right: true, gray: true });

  s.text(stub.employeeName!, 40, 118, { size: 10 });
  s.text("Paid every other week", 40, 132, { gray: true });

  let y = 160;
  const block = (title: string, rows: Array<[string, number | null, number | null]>) => {
    s.box(40, y - 12, 532, 16, { fill: true });
    s.text(title, 48, y, { bold: true });
    s.text("Current", 470, y, { right: true, bold: true });
    s.text("YTD", 564, y, { right: true, bold: true });
    for (const [name, now, ytd] of rows) {
      y += 14;
      s.text(name, 48, y);
      if (now !== null) s.text(`$${fmt(now)}`, 470, y, { right: true });
      if (ytd !== null) s.text(`$${fmt(ytd)}`, 564, y, { right: true });
    }
    y += 26;
  };

  block("Earnings", stub.earnings.map((e) => [`${e.name} (${e.hours?.toFixed(2)} hrs @ $${fmt(e.rate!)})`, e.currentPeriod, e.ytd]));
  block("Employee taxes", stub.taxes.map((t) => [t.name!, t.currentPeriod, t.ytd]));
  block("Benefits and deductions", stub.deductions.map((x) => [x.name!, x.currentPeriod, x.ytd]));
  block("Totals", [
    ["Gross earnings", stub.grossPay, stub.grossPayYtd],
    ["Take-home pay", stub.netPay, stub.netPayYtd],
  ]);

  s.text("This is a sample document with made-up numbers.", 40, 760, { size: 7, gray: true });
  return s.save();
}
