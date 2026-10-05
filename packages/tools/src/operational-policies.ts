import type { Job, Quote } from "@first-ai/database";

export class OperationalConflictError extends Error { readonly code = "CONFLICT"; }
const quoteTransitions: Record<Quote["status"], readonly Quote["status"][]> = { draft: ["ready", "cancelled"], ready: ["sent", "accepted", "rejected", "expired", "cancelled"], sent: ["viewed", "accepted", "rejected", "expired", "cancelled"], viewed: ["accepted", "rejected", "expired", "cancelled"], accepted: [], rejected: [], expired: [], cancelled: [] };
const jobTransitions: Record<Job["status"], readonly Job["status"][]> = { draft: ["scheduled", "cancelled"], scheduled: ["confirmed", "in_progress", "cancelled"], confirmed: ["en_route", "in_progress", "cancelled"], en_route: ["in_progress", "cancelled"], in_progress: ["completed", "follow_up_required", "failed", "cancelled"], completed: [], follow_up_required: [], cancelled: [], failed: [] };
export function assertQuoteTransition(from: Quote["status"], to: Quote["status"]): void { if (!quoteTransitions[from].includes(to)) throw new OperationalConflictError("Transition de devis non autorisée."); }
export function assertJobTransition(from: Job["status"], to: Job["status"]): void { if (!jobTransitions[from].includes(to)) throw new OperationalConflictError("Transition d’intervention non autorisée."); }

export function organizationDay(date: string, timezone: string): { from: Date; until: Date } {
  const midnight = (utc: number) => {
    let value = utc;
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    for (let i = 0; i < 3; i++) {
      const p = Object.fromEntries(formatter.formatToParts(new Date(value)).map(v => [v.type, v.value]));
      const represented = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
      value += utc - represented;
    }
    return new Date(value);
  };
  const base = Date.parse(`${date}T00:00:00Z`);
  return { from: midnight(base), until: midnight(base + 86400000) };
}
export function localCalendarDate(timezone: string, now = new Date()): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map(v => [v.type, v.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
