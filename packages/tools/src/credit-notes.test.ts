import { describe, expect, it } from "vitest";
import { renderedPdfText as text } from "./test-pdf-text.js";
import { writeFile } from "node:fs/promises";
import { hasPermission } from "@first-ai/auth";
import { creditNoteNumber } from "@first-ai/database";
import { createCreditNoteSchema, creditNoteItemInputSchema, creditNoteSnapshotSchema, invoiceDocumentSnapshotSchema } from "@first-ai/schemas";
import { calculateCreditLines } from "./credit-note-calculation.js";
import { deriveCorrectedBalance } from "./invoice-balance.js";
import { generateCreditNotePdf } from "./credit-note-pdf.js";
const org = "00000000-0000-4000-8000-000000000001", invoice = "00000000-0000-4000-8000-000000000002", note = "00000000-0000-4000-8000-000000000003";
function original() {
  const identity = { name: "Société Fictive", legalName: "Société Fictive Test", addressLine1: "1 Rue Fictive", addressLine2: null, postalCode: "75001", city: "Paris", country: "FR", siret: null, vatNumber: null, email: null, phone: null };
  return invoiceDocumentSnapshotSchema.parse({ version: 1, organizationId: org, invoiceId: invoice, capturedAt: "2026-10-01T12:00:00Z", currency: "EUR", seller: identity, customer: { ...identity, name: "Client Fictif", legalName: null }, invoice: { number: "FAC-2026-000001", issueDate: "2026-10-01", dueDate: "2026-11-05", status: "issued", notes: null },
    lines: [{ description: "Service fictif A", quantity: "1.000", unitPrice: "100.00", taxRate: "20.000", subtotal: "100.00", taxAmount: "20.00", total: "120.00" }, { description: "Service fictif B", quantity: "1.000", unitPrice: "100.00", taxRate: "5.500", subtotal: "100.00", taxAmount: "5.50", total: "105.50" }], totals: { subtotal: "200.00", taxAmount: "25.50", total: "225.50" }, taxes: [{ rate: "20.000", base: "100.00", amount: "20.00" }, { rate: "5.500", base: "100.00", amount: "5.50" }] });
}
describe("M4 deterministic credit notes", () => {
  it("allocates mixed-rate corrections from original immutable VAT bases", () => {
    const before = original(), frozen = structuredClone(before);
    const result = calculateCreditLines(before, [{ originalLineIndex: 0, subtotal: "20" }, { originalLineIndex: 1, subtotal: "10" }], []);
    expect(result.totals).toEqual({ subtotal: "30.00", taxAmount: "4.55", total: "34.55" });
    expect(result.taxes).toEqual([{ rate: "20.000", base: "20.00", amount: "4.00" }, { rate: "5.500", base: "10.00", amount: "0.55" }]);
    expect(before).toEqual(frozen);
    expect(calculateCreditLines(before, [{ originalLineIndex: 0, subtotal: "80" }, { originalLineIndex: 1, subtotal: "90" }], result.lines, true).totals).toEqual({ subtotal: "170.00", taxAmount: "20.95", total: "190.95" });
  });
  it("cumulatively rounds VAT pennies without exceeding original VAT", () => {
    const source = original(); source.lines = [{ ...source.lines[0]!, subtotal: "0.03", taxAmount: "0.01", total: "0.04" }];
    let prior = { originalLineIndex: 0, subtotal: "0.00", taxAmount: "0.00" };
    const values = [];
    for (const subtotal of ["0.01", "0.02", "0.03"]) {
      const line = calculateCreditLines(source, [{ originalLineIndex: 0, subtotal: "0.01" }], [prior]).lines[0]!;
      values.push(line.taxAmount);
      prior = { originalLineIndex: 0, subtotal, taxAmount: values.includes("0.01") ? "0.01" : "0.00" };
    }
    expect(values).toEqual(["0.00", "0.01", "0.00"]);
    expect(() => calculateCreditLines(source, [{ originalLineIndex: 0, subtotal: "0.01" }], [prior])).toThrow();
  });
  it("rejects empty, duplicate, unknown, stale-full and excessive corrections", () => {
    const s = original();
    for (const request of [[], [{ originalLineIndex: 0, subtotal: "101" }], [{ originalLineIndex: 2, subtotal: "1" }], [{ originalLineIndex: 0, subtotal: "0" }], [{ originalLineIndex: 0, subtotal: "1" }, { originalLineIndex: 0, subtotal: "2" }]]) expect(() => calculateCreditLines(s, request, [])).toThrow();
    expect(() => calculateCreditLines(s, [{ originalLineIndex: 0, subtotal: "100" }], [], true)).toThrow();
    expect(() => calculateCreditLines(s, [{ originalLineIndex: 0, subtotal: "90" }], [{ originalLineIndex: 0, subtotal: "20", taxAmount: "4" }])).toThrow();
  });
  it.each([["100", "0", "20", "80.00", "0.00"], ["100", "50", "20", "30.00", "0.00"], ["100", "100", "20", "0.00", "20.00"], ["100", "0", "100", "0.00", "0.00"]])("derives debt/credit for invoice %s, payment %s, correction %s", (total, paid, credits, due, customerCredit) => {
    expect(deriveCorrectedBalance(total, paid, credits, "issued")).toMatchObject({ amountDue: due, customerCredit });
  });
  it("does not report a credit-only correction as a received payment", () => {
    expect(deriveCorrectedBalance("100", "0", "100", "issued").status).toBe("issued");
    expect(() => deriveCorrectedBalance("100", "0", "101", "issued")).toThrow();
  });
  it("validates bounded proposals, permissions and annual AV format without AI writes", () => {
    const input = { originalInvoiceId: invoice, reason: "Correction fictive", correctionType: "partial", idempotencyKey: note };
    expect(createCreditNoteSchema.parse(input)).toEqual(input);
    expect(createCreditNoteSchema.safeParse({ ...input, organizationId: org }).success).toBe(false);
    for (const subtotal of ["oops", "-1", "0", "1.001"]) expect(creditNoteItemInputSchema.safeParse({ originalLineIndex: 0, subtotal }).success).toBe(false);
    for (const role of ["OWNER", "ADMIN", "MANAGER", "ACCOUNTANT"] as const) for (const permission of ["creditNotes.read", "creditNotes.write", "creditNotes.issue"] as const) expect(hasPermission(role, permission)).toBe(true);
    expect(hasPermission("READ_ONLY", "creditNotes.read")).toBe(true); expect(hasPermission("READ_ONLY", "creditNotes.issue")).toBe(false); expect(hasPermission("TECHNICIAN", "creditNotes.read")).toBe(false);
    expect(creditNoteNumber(2026, 1)).toBe("AV-2026-000001"); expect(creditNoteNumber(2027, 1)).toBe("AV-2027-000001"); expect(() => creditNoteNumber(2026, 1000000)).toThrow();
  });
  it("renders an AVOIR PDF from frozen identity/amounts and original FAC/date", async () => {
    const s = original(), calculation = calculateCreditLines(s, [{ originalLineIndex: 0, subtotal: "20" }, { originalLineIndex: 1, subtotal: "10" }], []);
    const snapshot = creditNoteSnapshotSchema.parse({ version: 1, organizationId: org, creditNoteId: note, number: "AV-2026-000001", issueDate: "2026-10-06", issuedAt: "2026-10-06T12:00:00Z", timeZone: "Europe/Paris", fiscalYear: 2026, reason: "Correction fictive de prix", correctionType: "partial", originalInvoice: s, ...calculation });
    const frozen = structuredClone(snapshot), bytes = await generateCreditNotePdf(snapshot), rendered = text(bytes);
    expect(bytes.subarray(0,5).toString()).toBe("%PDF-");
    for (const value of ["AVOIR", "AV-2026-000001", "FAC-2026-000001 du 01/10/2026", "06/10/2026", "Correction fictive de prix", "Société Fictive Test", "Client Fictif", "TVA 20.000 %", "TVA 5.500 %", "34,55 €", "Conformité fiscale non validée", "Aucun remboursement bancaire"]) expect(rendered).toContain(value);
    expect(await generateCreditNotePdf(snapshot)).toEqual(bytes); expect(snapshot).toEqual(frozen);
    if (process.env.FIRST_AI_PDF_QA === "true") await writeFile("/private/tmp/first-ai-credit-note-qa.pdf", bytes);
    expect(creditNoteSnapshotSchema.safeParse({ ...snapshot, organizationId: invoice }).success).toBe(false);
    expect(creditNoteSnapshotSchema.safeParse({ ...snapshot, taxes: [{ rate: "20.000", base: "30.00", amount: "4.55" }] }).success).toBe(false);
  });
  it("M6 renders Unicode identity/reason and paginates without losing corrected lines", async () => {
    const source = original();
    source.seller.legalName = "Société fictive Élodie — Œuvre";
    source.customer.name = "Client fictif Łukasz Žák-Ștefan";
    const reason = "Révision fictive : É, è, ê, à, ç, œ – « Łódź » €";
    const calculation = calculateCreditLines(source, [{ originalLineIndex: 0, subtotal: "20" }], []);
    const snapshot = creditNoteSnapshotSchema.parse({ version: 1, organizationId: org, creditNoteId: note, number: "AV-2026-000001", issueDate: "2026-10-06", issuedAt: "2026-10-06T12:00:00Z", timeZone: "Europe/Paris", fiscalYear: 2026, reason, correctionType: "partial", originalInvoice: source, ...calculation });
    const bytes = await generateCreditNotePdf(snapshot), rendered = text(bytes);
    for (const value of [reason, source.seller.legalName, source.customer.name, "FAC-2026-000001", "24,00 €"]) expect(rendered).toContain(value);
    expect(rendered).not.toContain("\uFFFD"); expect(bytes.toString("latin1")).toContain("/FontFile2");
    expect(await generateCreditNotePdf(snapshot)).toEqual(bytes);
    if (process.env.FIRST_AI_PDF_QA === "true") await writeFile("/private/tmp/first-ai-credit-note-unicode-m6-qa.pdf", bytes);
    snapshot.lines[0]!.description = "Description fictive étendue Łódź. ".repeat(60) + "FIN-CORRECTION";
    snapshot.originalInvoice.lines[0]!.description = snapshot.lines[0]!.description;
    const long = await generateCreditNotePdf(snapshot);
    expect(text(long)).toContain("FIN-CORRECTION"); expect(text(long)).toContain("TOTAL TTC À DÉDUIRE : 24,00 €");
    expect((long.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
    if (process.env.FIRST_AI_PDF_QA === "true") await writeFile("/private/tmp/first-ai-credit-note-long-m6-qa.pdf", long);
    snapshot.reason = "Correction fictive 客户";
    await expect(generateCreditNotePdf(snapshot)).rejects.toThrow("U+5BA2");
  });
});
