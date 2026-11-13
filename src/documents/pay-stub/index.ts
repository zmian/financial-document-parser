import { get } from "../../fields.js";
import type { DocumentType } from "../types.js";
import { payStubChecks } from "./checks.js";
import { PayStub } from "./schema.js";

const FIELD_NAMES: Record<string, string> = {
  employeeName: "employee name",
  employerName: "employer name",
  payDate: "pay date",
  payPeriodStart: "pay period start date",
  payPeriodEnd: "pay period end date",
  payFrequency: "pay frequency",
  grossPay: "gross pay for this period",
  grossPayYtd: "year-to-date gross pay",
  netPay: "net pay for this period",
  netPayYtd: "year-to-date net pay",
};

const LINE_FIELDS: Record<string, string> = {
  currentPeriod: "current-period amount",
  ytd: "year-to-date amount",
  rate: "rate",
  hours: "hours",
  type: "category",
  name: "label",
};

export const payStub: DocumentType<PayStub> = {
  id: "pay_stub",
  label: "pay stub",
  description:
    "A pay stub, payslip or earnings statement from an employer or payroll provider, showing gross pay, taxes, deductions and net pay.",
  variantQuestion: "If this is a pay stub, what kind is it?",
  variants: [
    {
      id: "standard",
      description: "A regular pay stub issued directly by the employer or its payroll provider (ADP, Gusto, Paychex, Workday and so on).",
      instructions: [],
    },
    {
      id: "peo",
      description:
        "A pay stub from a PEO such as Justworks, TriNet or Insperity, where the PEO is the employer of record and the client business is named separately, often as 'PEO for Business Name'.",
      instructions: [
        "This is a PEO pay stub. The PEO (Justworks, TriNet, Insperity and so on) prints its own name prominently. The employer is the client business, usually written as 'PEO for Business Name'. Put the client business in employerName, never the PEO.",
      ],
    },
    {
      id: "off_cycle",
      description: "An off-cycle or supplemental stub for a bonus or commission only, outside the regular pay schedule.",
      instructions: [
        "This is an off-cycle stub, usually a bonus or commission. Most earning lines will only have YTD amounts. Leave currentPeriod null on lines with no current amount. payFrequency is the person's regular schedule if printed, otherwise null.",
      ],
    },
  ],
  schema: PayStub,
  context: [
    "A pay stub goes from gross pay, through taxes and deductions, to net pay. Gross minus taxes minus deductions equals net.",
    "Most stubs have two columns of numbers: this period (often 'Current' or 'This Period') and year to date ('YTD'). Never put a YTD number in a current field or the other way around.",
    "Employer contributions (employer 401(k) match, employer-paid health premiums) are not deductions from the employee's pay. Leave them out.",
  ],
  keyFields: ["employerName", "payDate", "payFrequency", "grossPay", "netPay"],
  checks: payStubChecks,
  describeField(path, data) {
    const line = path.match(/^(earnings|taxes|deductions)\[(\d+)\]\.(\w+)$/);
    if (line) {
      const [, group, index, key] = line;
      const name = get(data, `${group}[${index}].name`);
      const label = typeof name === "string" && name ? `"${name}"` : `${group} line ${Number(index) + 1}`;
      return `the ${LINE_FIELDS[key!] ?? key} for the ${label} line`;
    }
    return `the ${FIELD_NAMES[path] ?? path}`;
  },
};
