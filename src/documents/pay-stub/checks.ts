import { money, sameMoney, sum, toCents } from "../../fields.js";
import type { CheckResult } from "../types.js";
import type { PayStub } from "./schema.js";

type Line = { currentPeriod: number | null; ytd: number | null };
type Column = "currentPeriod" | "ytd";

function paths(prefix: string, lines: Line[], column: Column): string[] {
  return lines.map((_, i) => `${prefix}[${i}].${column}`);
}

/**
 * A line with only a YTD amount (say, medical on a bonus stub) had nothing taken
 * out this period, so its current amount counts as zero. A line with neither is
 * incomplete and we can't check the column.
 */
function amounts(lines: Line[], column: Column): number[] | null {
  const values = lines.map((line) => {
    if (line[column] !== null) return line[column];
    return column === "currentPeriod" && line.ytd !== null ? 0 : null;
  });
  return values.every((v): v is number => v !== null) ? values : null;
}

/** Gross minus taxes minus deductions has to equal net, for one column. */
function netPayTiesOut(stub: PayStub, column: Column): CheckResult {
  const isCurrent = column === "currentPeriod";
  const grossField = isCurrent ? "grossPay" : "grossPayYtd";
  const netField = isCurrent ? "netPay" : "netPayYtd";
  const id = isCurrent ? "net_pay_ties_out" : "net_pay_ytd_ties_out";
  const description = `Gross − taxes − deductions = net (${isCurrent ? "current" : "YTD"})`;
  const fields = [grossField, netField, ...paths("taxes", stub.taxes, column), ...paths("deductions", stub.deductions, column)];

  const gross = stub[grossField];
  const net = stub[netField];
  const taxes = amounts(stub.taxes, column);
  const deductions = amounts(stub.deductions, column);
  if (gross === null || net === null || taxes === null || deductions === null) {
    return { id, description, status: "skip", fields, detail: "Some of the numbers are missing." };
  }

  const expected = (toCents(gross) - toCents(sum(taxes)) - toCents(sum(deductions))) / 100;
  if (sameMoney(expected, net)) {
    return { id, description, status: "pass", fields, detail: `${money(gross)} − ${money(sum(taxes))} − ${money(sum(deductions))} = ${money(net)}` };
  }
  const off = Math.abs(expected - net);
  return {
    id,
    description,
    status: "fail",
    fields,
    detail: `Expected ${money(expected)}, the stub says ${money(net)}. Off by ${money(off)}, which is often the size of a missed or doubled line.`,
  };
}

/** The earning lines have to add up to gross, for one column. */
function earningsAddUp(stub: PayStub, column: Column): CheckResult {
  const isCurrent = column === "currentPeriod";
  const grossField = isCurrent ? "grossPay" : "grossPayYtd";
  const id = isCurrent ? "earnings_add_up" : "earnings_ytd_add_up";
  const description = `Earning lines add up to gross (${isCurrent ? "current" : "YTD"})`;
  const fields = [grossField, ...paths("earnings", stub.earnings, column)];

  const gross = stub[grossField];
  // A line with no current amount (say, last quarter's bonus) still shows YTD.
  const lines = stub.earnings.map((e) => e[column]).filter((v): v is number => v !== null);
  if (gross === null || lines.length === 0) {
    return { id, description, status: "skip", fields, detail: "Gross or the earning lines are missing." };
  }

  const total = sum(lines);
  return sameMoney(total, gross)
    ? { id, description, status: "pass", fields, detail: `Lines add up to ${money(total)}.` }
    : { id, description, status: "fail", fields, detail: `Lines add up to ${money(total)}, gross is ${money(gross)}.` };
}

/** No year-to-date amount can be smaller than the same line's current amount. */
function ytdAtLeastCurrent(stub: PayStub): CheckResult {
  const id = "ytd_at_least_current";
  const description = "Every YTD amount ≥ its current amount";
  const pairs: Array<[string, string, number | null, number | null]> = [
    ["grossPay", "grossPayYtd", stub.grossPay, stub.grossPayYtd],
    ["netPay", "netPayYtd", stub.netPay, stub.netPayYtd],
    ...(["earnings", "taxes", "deductions"] as const).flatMap((group) =>
      stub[group].map((line, i): [string, string, number | null, number | null] => [
        `${group}[${i}].currentPeriod`,
        `${group}[${i}].ytd`,
        line.currentPeriod,
        line.ytd,
      ]),
    ),
  ];

  const compared = pairs.filter(([, , current, ytd]) => current !== null && ytd !== null);
  if (compared.length === 0) {
    return { id, description, status: "skip", fields: [], detail: "No line has both a current and a YTD amount." };
  }

  const broken = compared.filter(([, , current, ytd]) => toCents(ytd!) < toCents(current!));
  if (broken.length === 0) {
    return { id, description, status: "pass", fields: compared.flatMap(([c, y]) => [c, y]), detail: `${compared.length} lines compared.` };
  }
  return {
    id,
    description,
    status: "fail",
    // Only the broken pairs are suspect, not every line on the stub.
    fields: broken.flatMap(([c, y]) => [c, y]),
    detail: broken.map(([c, , current, ytd]) => `${c} is ${money(current!)} but YTD is ${money(ytd!)}`).join("; "),
  };
}

const PERIOD_DAYS: Record<string, [number, number]> = {
  weekly: [7, 7],
  biweekly: [14, 14],
  semimonthly: [13, 16],
  monthly: [28, 31],
};

/** A biweekly stub should cover 14 days. A misread frequency skews every annual figure. */
function periodFitsFrequency(stub: PayStub, variantId: string | null): CheckResult {
  const id = "period_fits_frequency";
  const description = "Pay period length fits the pay frequency";
  const fields = ["payFrequency", "payPeriodStart", "payPeriodEnd"];

  if (variantId === "off_cycle") {
    return { id, description, status: "skip", fields, detail: "Off-cycle stubs don't follow the regular schedule." };
  }
  if (!stub.payFrequency || !stub.payPeriodStart || !stub.payPeriodEnd) {
    return { id, description, status: "skip", fields, detail: "Frequency or period dates are missing." };
  }

  const start = Date.parse(stub.payPeriodStart);
  const end = Date.parse(stub.payPeriodEnd);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { id, description, status: "fail", fields, detail: "Period dates aren't valid dates." };
  }

  const days = Math.round((end - start) / 86_400_000) + 1;
  const [min, max] = PERIOD_DAYS[stub.payFrequency]!;
  return days >= min && days <= max
    ? { id, description, status: "pass", fields, detail: `${days} days fits ${stub.payFrequency}.` }
    : { id, description, status: "fail", fields, detail: `${days} days doesn't fit ${stub.payFrequency}.` };
}

export function payStubChecks(stub: PayStub, variantId: string | null): CheckResult[] {
  return [
    netPayTiesOut(stub, "currentPeriod"),
    netPayTiesOut(stub, "ytd"),
    earningsAddUp(stub, "currentPeriod"),
    earningsAddUp(stub, "ytd"),
    ytdAtLeastCurrent(stub),
    periodFitsFrequency(stub, variantId),
  ];
}
