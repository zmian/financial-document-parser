import { describe, expect, it } from "vitest";
import { bankStatementChecks } from "../src/documents/bank-statement/checks.js";
import type { BankStatement } from "../src/documents/bank-statement/schema.js";
import { payStubChecks } from "../src/documents/pay-stub/checks.js";
import type { PayStub } from "../src/documents/pay-stub/schema.js";
import { label } from "./fakes.js";

const status = (checks: ReturnType<typeof payStubChecks>, id: string) => checks.find((c) => c.id === id)?.status;
const failed = (checks: ReturnType<typeof payStubChecks>) => checks.filter((c) => c.status === "fail").map((c) => c.id);

describe("pay stub checks", () => {
  it("pass on every sample pay stub", async () => {
    for (const file of ["pay-stub-standard", "pay-stub-semimonthly", "pay-stub-peo", "pay-stub-bonus"]) {
      const { data, variant } = await label(`${file}.json`);
      expect(failed(payStubChecks(data, variant)), file).toEqual([]);
    }
  });

  it("catch the YTD gross read as current gross", async () => {
    const stub: PayStub = (await label("pay-stub-standard.json")).data;
    stub.grossPay = stub.grossPayYtd;
    const checks = payStubChecks(stub, "standard");
    expect(failed(checks)).toEqual(["net_pay_ties_out", "earnings_add_up"]);
    // Both failing checks point at the same field.
    expect(checks.filter((c) => c.status === "fail").every((c) => c.fields.includes("grossPay"))).toBe(true);
  });

  it("catch a missed deduction, off by exactly that line", async () => {
    const stub: PayStub = (await label("pay-stub-standard.json")).data;
    const medical = stub.deductions.find((d) => d.type === "medical")!;
    stub.deductions = stub.deductions.filter((d) => d !== medical);
    const check = payStubChecks(stub, "standard").find((c) => c.id === "net_pay_ties_out")!;
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("Off by 142.50");
  });

  it("catch a YTD amount smaller than current", async () => {
    const stub: PayStub = (await label("pay-stub-standard.json")).data;
    stub.taxes[0]!.ytd = 10;
    const check = payStubChecks(stub, "standard").find((c) => c.id === "ytd_at_least_current")!;
    expect(check.status).toBe("fail");
    expect(check.fields).toEqual(["taxes[0].currentPeriod", "taxes[0].ytd"]);
  });

  it("catch a misread pay frequency", async () => {
    const stub: PayStub = (await label("pay-stub-standard.json")).data;
    stub.payFrequency = "weekly";
    expect(status(payStubChecks(stub, "standard"), "period_fits_frequency")).toBe("fail");
  });

  it("skip the frequency check on off-cycle stubs", async () => {
    const { data } = await label("pay-stub-bonus.json");
    expect(status(payStubChecks(data, "off_cycle"), "period_fits_frequency")).toBe("skip");
  });

  it("skip, not pass, when numbers are missing", async () => {
    const stub: PayStub = (await label("pay-stub-standard.json")).data;
    stub.netPay = null;
    expect(status(payStubChecks(stub, "standard"), "net_pay_ties_out")).toBe("skip");
  });
});

describe("bank statement checks", () => {
  it("pass on every sample statement", async () => {
    for (const file of ["bank-statement-checking", "bank-statement-savings", "bank-statement-credit-card"]) {
      const { data, variant } = await label(`${file}.json`);
      expect(failed(bankStatementChecks(data, variant)), file).toEqual([]);
    }
  });

  it("catch a transaction read twice", async () => {
    const st: BankStatement = (await label("bank-statement-checking.json")).data;
    st.transactions.push({ ...st.transactions[3]! });
    const checks = bankStatementChecks(st, "checking");
    expect(failed(checks)).toEqual(["balance_ties_out", "debits_match_total"]);
    expect(checks[0]!.detail).toContain("Off by 74.19");
  });

  it("catch a payment read as a purchase on a credit card", async () => {
    const st: BankStatement = (await label("bank-statement-credit-card.json")).data;
    st.transactions[1]!.direction = "debit";
    expect(failed(bankStatementChecks(st, "credit_card"))).toContain("balance_ties_out");
  });

  it("use the credit card equation only for credit cards", async () => {
    const st: BankStatement = (await label("bank-statement-credit-card.json")).data;
    expect(status(bankStatementChecks(st, "checking"), "balance_ties_out")).toBe("fail");
  });

  it("catch a date outside the period", async () => {
    const st: BankStatement = (await label("bank-statement-savings.json")).data;
    st.transactions[0]!.date = "2026-09-14";
    const check = bankStatementChecks(st, "savings").find((c) => c.id === "dates_in_period")!;
    expect(check.status).toBe("fail");
    expect(check.fields).toContain("transactions[0].date");
  });
});
