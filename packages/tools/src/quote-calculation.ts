// Fixed-point integer arithmetic: quantities /1000, amounts /100, tax percentages /1000.
// Each line's HT, cost and VAT is rounded half up to a cent; costEstimate is per unit.
export interface CalculationItem { quantity: string; unitPrice: string; taxRate: string; costEstimate: string }
function scaled(value: string, scale: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Invalid non-negative decimal.");
  const [whole = "0", fraction = ""] = value.split(".");
  if (fraction.length > scale) throw new Error("Unsupported decimal precision.");
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0"));
}
function round(n: bigint, d: bigint): bigint { const sign = n < 0n ? -1n : 1n; const abs = n * sign; return sign * ((abs + d / 2n) / d); }
function decimal(v: bigint, scale: number): string { const sign = v < 0n ? "-" : ""; const digits = (v < 0n ? -v : v).toString().padStart(scale + 1, "0"); return `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`; }
function money(v: bigint): string { if (v > 99999999999999n || v < -99999999999999n) throw new Error("Quote exceeds supported monetary range."); return decimal(v, 2); }
export function subtractMoney(revenue: string, cost: string): string { return money(scaled(revenue, 2) - scaled(cost, 2)); }
export function calculateQuoteTotals(items: readonly CalculationItem[]) {
  let subtotal = 0n, taxAmount = 0n, estimatedCost = 0n;
  for (const item of items) {
    const quantity = scaled(item.quantity, 3), rate = scaled(item.taxRate, 3);
    if (quantity <= 0n || rate > 100000n) throw new Error("Invalid quantity or tax rate.");
    const line = round(quantity * scaled(item.unitPrice, 2), 1000n);
    subtotal += line; taxAmount += round(line * rate, 100000n);
    estimatedCost += round(quantity * scaled(item.costEstimate, 2), 1000n);
  }
  const margin = subtotal - estimatedCost;
  return { subtotal: money(subtotal), taxAmount: money(taxAmount), total: money(subtotal + taxAmount), estimatedCost: money(estimatedCost), estimatedMargin: money(margin), estimatedMarginRate: subtotal === 0n ? null : decimal(round(margin * 100000n, subtotal), 3) };
}
