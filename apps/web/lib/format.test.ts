import { describe, expect, it } from "vitest";
import { formatMoney } from "./format";

describe("money display", () => {
  it("formats decimal strings without floating-point arithmetic", () => {
    expect(formatMoney("1250.50")).toBe("1 250,50 €");
    expect(formatMoney("10")).toBe("10,00 €");
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney("-0.25")).toBe("−0,25 €");
    expect(formatMoney("-1250.50")).toBe("−1 250,50 €");
  });
});
