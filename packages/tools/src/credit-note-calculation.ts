import type { CreditNoteLine, InvoiceDocumentSnapshot } from "@first-ai/schemas";
import { OperationalConflictError } from "./operational-policies.js";
import { financialCents as cents, financialMoney as money } from "./invoice-balance.js";
type Prior = { originalLineIndex: number; subtotal: string; taxAmount: string };
/** Cumulative allocation consumes the original rounded VAT exactly, even across tiny corrections. */
export function calculateCreditLines(original: InvoiceDocumentSnapshot, requested: readonly { originalLineIndex: number; subtotal: string }[], prior: readonly Prior[], full = false) {
  if (!requested.length || requested.length > 200 || new Set(requested.map(i => i.originalLineIndex)).size !== requested.length) throw new OperationalConflictError("Sélectionnez des lignes distinctes à corriger.");
  const lines: CreditNoteLine[] = requested.map(item => {
    const source = original.lines[item.originalLineIndex]; if (!source) throw new OperationalConflictError("Ligne originale introuvable.");
    const previous = prior.find(p => p.originalLineIndex === item.originalLineIndex), base = cents(source.subtotal), vat = cents(source.taxAmount);
    const before = cents(previous?.subtotal ?? "0"), beforeVat = cents(previous?.taxAmount ?? "0"), correction = cents(item.subtotal);
    if (base <= 0n || correction <= 0n || before + correction > base) throw new OperationalConflictError("L’avoir dépasse la base HT originale restant à corriger.");
    const afterVat = (vat * (before + correction) + base / 2n) / base;
    const tax = afterVat - beforeVat;
    if (tax < 0n || afterVat > vat) throw new OperationalConflictError("Historique de correction TVA incohérent.");
    return { originalLineIndex: item.originalLineIndex, description: source.description, originalQuantity: source.quantity, unit: "unit" in source ? source.unit : null, taxRate: source.taxRate, subtotal: money(correction), taxAmount: money(tax), total: money(correction + tax) };
  });
  if (full && original.lines.some((source, index) => cents(source.subtotal) !== cents(prior.find(p => p.originalLineIndex === index)?.subtotal ?? "0") + cents(lines.find(l => l.originalLineIndex === index)?.subtotal ?? "0"))) throw new OperationalConflictError("Le brouillon complet est périmé : il doit corriger toutes les bases restantes.");
  const taxes = new Map<string, { base: bigint; amount: bigint }>(); let ht = 0n, vat = 0n;
  for (const line of lines) { const base = cents(line.subtotal), tax = cents(line.taxAmount); ht += base; vat += tax; const g = taxes.get(line.taxRate) ?? { base: 0n, amount: 0n }; g.base += base; g.amount += tax; taxes.set(line.taxRate, g); }
  return { lines, totals: { subtotal: money(ht), taxAmount: money(vat), total: money(ht + vat) }, taxes: [...taxes].sort(([a], [b]) => a.localeCompare(b)).map(([rate, group]) => ({ rate, base: money(group.base), amount: money(group.amount) })) };
}
