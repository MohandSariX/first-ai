// Exact cents; discount is acquired HT per entire line (not per unit).
// Charges are positive, explicit lines with their own VAT; no negative lines/credit notes.
import { calculateQuoteTotals } from "./quote-calculation.js";
export interface InvoiceCalculationItem { quantity: string; unitPrice: string; taxRate: string; discountAmount?: string; kind?: string }
function scaled(value: string, precision: number) {
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Invalid decimal.");
  const [whole = "0", fraction = ""] = value.split(".");
  if (fraction.length > precision) throw new Error("Unsupported precision.");
  return BigInt(whole) * 10n ** BigInt(precision) + BigInt(fraction.padEnd(precision, "0"));
}
function money(value: bigint) {
  if (value < 0n || value > 99999999999999n) throw new Error("Invoice monetary range exceeded.");
  const digits = value.toString().padStart(3, "0"); return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
export function calculateInvoiceLine(item: InvoiceCalculationItem) {
  if (item.kind === "charge" && scaled(item.quantity, 3) !== 1000n) throw new Error("Additional charges require quantity 1.");
  const grossSubtotal = calculateQuoteTotals([{ ...item, costEstimate: "0" }]).subtotal;
  const discount = scaled(item.discountAmount ?? "0", 2), base = scaled(grossSubtotal, 2) - discount;
  if (base < 0n) throw new Error("Discount exceeds line amount.");
  const tax = (base * scaled(item.taxRate, 3) + 50000n) / 100000n;
  return { grossSubtotal, discountAmount: money(discount), subtotal: money(base), taxAmount: money(tax), total: money(base + tax) };
}
export function calculateInvoiceAmounts(items: readonly InvoiceCalculationItem[]) {
  if (items.length > 200) throw new Error("Maximum 200 invoice lines.");
  let subtotal = 0n, tax = 0n;
  for (const item of items) { const line = calculateInvoiceLine(item); subtotal += scaled(line.subtotal, 2); tax += scaled(line.taxAmount, 2); }
  return { subtotal: money(subtotal), taxAmount: money(tax), total: money(subtotal + tax) };
}
