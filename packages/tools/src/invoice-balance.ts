import type { Invoice } from "@first-ai/database";
import { OperationalConflictError } from "./operational-policies.js";
export function financialCents(value: string): bigint {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) throw new OperationalConflictError("Montant décimal invalide.");
  const [whole = "0", fraction = ""] = value.split("."); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function financialMoney(n: bigint) {
  if (n < 0n || n > 99999999999999n) throw new OperationalConflictError("Montant hors limites.");
  return `${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
}
export function deriveCorrectedBalance(total: string, received: string, credited: string, previous: Invoice["status"]) {
  const original = financialCents(total), paid = financialCents(received), credits = financialCents(credited);
  if (credits > original || paid > original) throw new OperationalConflictError("Solde économique incohérent.");
  const net = original - credits - paid;
  const status: Invoice["status"] = paid > 0n ? net <= 0n ? "paid" : "partially_paid" : ["paid", "partially_paid"].includes(previous) ? "issued" : previous;
  return { amountPaid: financialMoney(paid), amountCredited: financialMoney(credits), amountDue: financialMoney(net > 0n ? net : 0n), customerCredit: financialMoney(net < 0n ? -net : 0n), status };
}
