import { z } from "zod";

const money = z.number().nullable();
const text = z.string().nullable();
const date = z.string().nullable();

export const EARNING_TYPES = [
  "regular",
  "overtime",
  "salary",
  "bonus",
  "commission",
  "paid_time_off",
  "holiday",
  "other",
] as const;

export const TAX_TYPES = [
  "federal_income",
  "social_security",
  "medicare",
  "state_income",
  "state_disability",
  "state_family_leave",
  "local_income",
  "other",
] as const;

export const DEDUCTION_TYPES = [
  "traditional_401k",
  "roth_401k",
  "after_tax_401k",
  "medical",
  "dental",
  "vision",
  "hsa",
  "fsa",
  "dependent_care",
  "life_insurance",
  "disability_insurance",
  "commuter",
  "other",
] as const;

export const PAY_FREQUENCIES = ["weekly", "biweekly", "semimonthly", "monthly"] as const;

const Earning = z.object({
  name: text.describe("The earning line exactly as labeled, e.g. 'Regular', 'Overtime 1.5x', 'Bonus'."),
  type: z.enum(EARNING_TYPES).describe("The category that best fits this earning line."),
  rate: z.number().nullable().describe("Pay rate for this line if printed (hourly rate or salary per period). Null if not printed."),
  hours: z.number().nullable().describe("Hours or units for this line in the current period. Null for salaried lines or if not printed."),
  currentPeriod: money.describe("Amount earned on this line in this pay period."),
  ytd: money.describe("Year-to-date amount for this line."),
});

const Tax = z.object({
  name: text.describe("The tax line exactly as labeled, e.g. 'Fed Income Tax', 'OASDI', 'NY State'."),
  type: z
    .enum(TAX_TYPES)
    .describe("The category of tax. OASDI and FICA-SS are social_security. FICA-Med is medicare. SDI is state_disability. PFL is state_family_leave."),
  currentPeriod: money.describe("Amount withheld this pay period, as a positive number."),
  ytd: money.describe("Year-to-date amount withheld, as a positive number."),
});

const Deduction = z.object({
  name: text.describe("The deduction line exactly as labeled, e.g. '401K', 'Med Pre-Tax', 'Dental'."),
  type: z.enum(DEDUCTION_TYPES).describe("The category of deduction."),
  currentPeriod: money.describe("Amount deducted this pay period, as a positive number."),
  ytd: money.describe("Year-to-date amount deducted, as a positive number."),
});

export const PayStub = z.object({
  employeeName: text.describe("Full name of the employee."),
  employerName: text.describe(
    "Legal name of the business the person works for. On PEO pay stubs ('Justworks PEO for Acme Inc.'), this is the client business (Acme Inc.), not the PEO.",
  ),
  payDate: date.describe("Date the money was paid, YYYY-MM-DD. Also called check date or pay date."),
  payPeriodStart: date.describe("First day of the work period this stub covers, YYYY-MM-DD."),
  payPeriodEnd: date.describe("Last day of the work period this stub covers, YYYY-MM-DD."),
  payFrequency: z
    .enum(PAY_FREQUENCIES)
    .nullable()
    .describe("How often this person is paid. Null if it isn't printed and can't be read from the pay period."),
  grossPay: money.describe("Total earnings this pay period before any taxes or deductions. From the current column, never YTD."),
  grossPayYtd: money.describe("Total earnings so far this year before any taxes or deductions."),
  netPay: money.describe("Take-home pay this period after all taxes and deductions. From the current column, never YTD."),
  netPayYtd: money.describe("Take-home pay so far this year."),
  earnings: z.array(Earning).describe("Every earning line on the stub."),
  taxes: z.array(Tax).describe("Every tax withheld. Employee taxes only, not employer-paid taxes."),
  deductions: z.array(Deduction).describe("Every deduction, pre-tax and after-tax. Not employer contributions or employer-paid benefits."),
});

export type PayStub = z.infer<typeof PayStub>;
