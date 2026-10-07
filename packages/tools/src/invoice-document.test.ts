import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { invoiceDocumentSnapshotSchema } from "@first-ai/schemas";
import { invoiceDocumentAvailability, type InvoiceDocumentView } from "./invoice-document.js";
import { generateInvoicePdf, formatDocumentMoney } from "./invoice-pdf.js";
import { captureInvoiceMentions } from "./invoice-mentions.js";
import { fictionalInvoiceTerms, fictionalBusinessDetails } from "./test-invoice-mentions.js";

function fixture(): InvoiceDocumentView {
  const identity = { name: "Société Fictive", legalName: "Société Fictive Test", addressLine1: "1 Rue Fictive", addressLine2: null, postalCode: "75001", city: "Paris", country: "FR", siret: null, vatNumber: null, email: "fictional@example.test", phone: null };
  return {
    snapshot: invoiceDocumentSnapshotSchema.parse({ version: 1, organizationId: "00000000-0000-4000-8000-000000000001", invoiceId: "00000000-0000-4000-8000-000000000002", capturedAt: "2026-10-05T12:00:00Z", currency: "EUR",
      seller: identity, customer: { ...identity, name: "Client Fictif", legalName: null, addressLine1: null, postalCode: null, city: null, country: null },
      invoice: { number: "FAC-2026-000001", issueDate: "2026-10-05", dueDate: "2026-11-05", status: "issued", notes: "Notes client\nMerci de votre confiance." },
      lines: [
        { description: "Prestation fictive A", quantity: "1.000", unitPrice: "100.00", taxRate: "20.000", subtotal: "100.00", taxAmount: "20.00", total: "120.00" },
        { description: "Prestation fictive B", quantity: "1.000", unitPrice: "100.00", taxRate: "5.500", subtotal: "100.00", taxAmount: "5.50", total: "105.50" },
      ], totals: { subtotal: "200.00", taxAmount: "25.50", total: "225.50" }, taxes: [{ rate: "5.500", base: "100.00", amount: "5.50" }, { rate: "20.000", base: "100.00", amount: "20.00" }],
    }), payment: { status: "partially_paid", amountPaid: "100.00", amountDue: "125.50", asOf: "2026-10-06T12:00:00Z" },
  };
}
// Extract plain text operands from PDFKit's actual compressed WinAnsi content streams.
// No pixel snapshots, external APIs or running database required.
function renderedText(pdf: Buffer): string {
  const raw = pdf.toString("latin1"); let result = "";
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const content = inflateSync(Buffer.from(match[1]!, "latin1")).toString("latin1");
    const winAnsi = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ";
    for (const operand of content.matchAll(/<([a-f\d]+)>/gi)) result += [...Buffer.from(operand[1]!, "hex")].map(b => b >= 128 && b <= 159 ? winAnsi[b - 128] : String.fromCharCode(b)).join("");
  }
  return result;
}
describe("invoice documents", () => {
  it("keeps exact money display without floating-point conversion", () => {
    expect(formatDocumentMoney("999999999999.99")).toBe("999 999 999 999,99 €");
    expect(() => formatDocumentMoney("0.001")).toThrow();
  });
  it("rejects missing snapshots and incomplete frozen seller identity", async () => {
    expect(invoiceDocumentAvailability(null).available).toBe(false);
    const view = fixture(); view.snapshot.seller.addressLine1 = null;
    expect(invoiceDocumentAvailability(view.snapshot).available).toBe(false);
    await expect(generateInvoicePdf(view)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(invoiceDocumentSnapshotSchema.safeParse({ ...fixture().snapshot, invoice: { ...fixture().snapshot.invoice, status: "draft" } }).success).toBe(false);
  });
  it("renders real deterministic PDF bytes, French identity, snapshot totals and mixed VAT", async () => {
    const view = fixture(), bytes = await generateInvoicePdf(view);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.toString("latin1")).toContain("FACTURE FAC-2026-000001");
    const text = renderedText(bytes);
    for (const expected of ["FAC-2026-000001", "Société Fictive Test", "Client Fictif", "200,00 €", "225,50 €", "TVA 5,5 %", "TVA 20 %", "125,50 €", "Partiellement réglée", "sans vérification bancaire", "Adresse de facturation client non renseignée", "Conformité fiscale non validée"]) expect(text).toContain(expected);
    expect(await generateInvoicePdf(view)).toEqual(bytes);
    if (process.env.FIRST_AI_PDF_QA === "true") await writeFile("/private/tmp/first-ai-invoice-qa.pdf", bytes);
  });
  it("updates only the separate payment section when fully paid", async () => {
    const view = fixture(), snapshot = structuredClone(view.snapshot);
    view.payment = { ...view.payment, status: "paid", amountPaid: "225.50", amountDue: "0.00" };
    const text = renderedText(await generateInvoicePdf(view));
    expect(text).toContain("État : Réglée"); expect(text).toContain("RESTE À PAYER : 0,00 €");
    expect(view.snapshot).toEqual(snapshot);
    await expect(generateInvoicePdf({ ...view, payment: { ...view.payment, amountDue: "1.00" } })).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("paginates long descriptions and notes without truncating records", async () => {
    const view = fixture(); view.snapshot.lines[0]!.description = "Description longue fictive. ".repeat(100) + "FIN-LIGNE";
    view.snapshot.invoice.notes = "Notes explicites. ".repeat(120) + "FIN-NOTES";
    const bytes = await generateInvoicePdf(view), text = renderedText(bytes);
    expect(text).toContain("FIN-LIGNE"); expect(text).toContain("FIN-NOTES");
    expect((bytes.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(2);
    if (process.env.FIRST_AI_PDF_QA === "true") await writeFile("/private/tmp/first-ai-invoice-long-qa.pdf", bytes);
  });
  it("M4 appends current credit/debt information without rewriting original amounts", async () => {
    const view = fixture(), snapshot = structuredClone(view.snapshot);
    view.payment = { ...view.payment, status: "partially_paid", amountPaid: "100.00", amountCredited: "20.00", amountDue: "105.50", customerCredit: "0.00" };
    const partialText = renderedText(await generateInvoicePdf(view));
    expect(partialText).toContain("Avoirs émis : 20,00 €"); expect(partialText).toContain("105,50 €"); expect(partialText).toContain("TOTAL TTC : 225,50 €");
    view.payment = { ...view.payment, status: "paid", amountPaid: "225.50", amountDue: "0.00", customerCredit: "20.00" };
    const paidText = renderedText(await generateInvoicePdf(view));
    expect(paidText).toContain("CRÉDIT CLIENT : 20,00 €"); expect(paidText).toContain("Aucun remboursement bancaire");
    expect(view.snapshot).toEqual(snapshot);
  });
  it("fails explicitly instead of silently replacing unsupported identity glyphs", async () => {
    const view = fixture(); view.snapshot.customer.name = "客户";
    await expect(generateInvoicePdf(view)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("renders v2/v3 identities and definitive issue number/date without altering legacy v1/v2", async () => {
    const view = fixture(), legacy = structuredClone(view.snapshot);
    view.snapshot = invoiceDocumentSnapshotSchema.parse({ ...view.snapshot, version: 2,
      seller: { ...view.snapshot.seller, fiscalIdentity: { legalName: "Société Fictive Test", legalEntityType: "company", legalForm: "SAS", siren: "123456789", siret: null, vatNumber: "FR00123456789", registration: "RCS Paris (fictif)", shareCapital: "1000.00", vatRegime: "normal", vatOnDebits: false, companySize: "sme", addressLine1: "1 Rue Fictive", addressLine2: null, postalCode: "75001", city: "Paris", country: "FR" } },
      customer: { ...view.snapshot.customer, name: "Client Facturé", addressLine1: "2 Rue Facturation", postalCode: "75002", city: "Paris", country: "FR", billingIdentity: { billingClassification: "professional", billingName: "Client Facturé", billingLegalName: null, billingAddressLine1: "2 Rue Facturation", billingAddressLine2: null, billingPostalCode: "75002", billingCity: "Paris", billingCountry: "FR", establishmentCountry: "FR", taxablePerson: true, siren: "987654321", siret: null, vatNumber: null } },
      classification: { transactionType: "B2B", operationCategory: "services", fiscalTerritory: "domestic", vatTreatment: "normal", vatReason: null },
    });
    const bytes = await generateInvoicePdf(view), text = renderedText(bytes);
    for (const expected of ["2 Rue Facturation", "SIREN vendeur : 123456789", "SIREN client : 987654321", "Forme juridique : SAS", "Capital social : 1 000,00 €", "B2B - Services - TVA normale", "Conformité fiscale non validée"]) expect(text).toContain(expected);
    expect(text).not.toContain("Adresse de facturation client non renseignée");
    expect(invoiceDocumentSnapshotSchema.parse(legacy)).toEqual(legacy);
    expect(await generateInvoicePdf(view)).toEqual(bytes);
    if (process.env.FIRST_AI_PDF_QA === "true") await writeFile("/private/tmp/first-ai-invoice-m1-qa.pdf", bytes);
    const v2 = structuredClone(view.snapshot);
    const capturedAt = "2026-12-31T23:00:00Z";
    view.snapshot = invoiceDocumentSnapshotSchema.parse({ ...v2, version: 3, capturedAt,
      issuance: { issuedAt: capturedAt, timeZone: "Europe/Paris", fiscalYear: 2027 },
      invoice: { ...v2.invoice, number: "FAC-2027-000001", issueDate: "2027-01-01", dueDate: "2027-02-01" },
    });
    view.payment.asOf = "2027-01-02T12:00:00Z";
    const v3Bytes = await generateInvoicePdf(view), v3Text = renderedText(v3Bytes);
    for (const expected of ["FAC-2027-000001", "Émission : 01/01/2027", "2 Rue Facturation", "B2B - Services - TVA normale", "225,50 €"]) expect(v3Text).toContain(expected);
    expect(invoiceDocumentSnapshotSchema.parse(v2)).toEqual(v2);
    expect(invoiceDocumentSnapshotSchema.safeParse({ ...view.snapshot, invoice: { ...view.snapshot.invoice, issueDate: "2026-12-31" } }).success).toBe(false);
    expect(invoiceDocumentSnapshotSchema.safeParse({ ...view.snapshot, issuance: { issuedAt: capturedAt, timeZone: "Europe/Paris", fiscalYear: 2026 } }).success).toBe(false);
    expect(await generateInvoicePdf(view)).toEqual(v3Bytes);
    if (process.env.FIRST_AI_PDF_QA === "true") await writeFile("/private/tmp/first-ai-invoice-m2-qa.pdf", v3Bytes);
    const v3 = structuredClone(view.snapshot);
    if (v3.version !== 3) throw new Error("Expected v3 fixture");
    const mentions = captureInvoiceMentions({ businessDetails: { ...fictionalBusinessDetails, executionDate: "2026-12-31", purchaseOrderIssued: true, customerOrderReference: "BC-FICTIF-123" }, terms: fictionalInvoiceTerms, classification: v3.classification, issueDate: v3.invoice.issueDate, dueDate: v3.invoice.dueDate });
    view.snapshot = invoiceDocumentSnapshotSchema.parse({ ...v3, version: 4, ...mentions, lines: v3.lines.map(line => ({ ...line, unit: "heure", kind: "item", grossSubtotal: line.subtotal, discountAmount: "0.00" })) });
    const v4Bytes = await generateInvoicePdf(view), v4Text = renderedText(v4Bytes);
    for (const expected of ["FAC-2027-000001", "Émission : 01/01/2027", "31/12/2026", "BC-FICTIF-123", "heure", "Escompte pour paiement anticipé : néant", "BCE", "40,00 €", "225,50 €"]) expect(v4Text).toContain(expected);
    expect(v4Text).not.toContain("BROUILLON");
    if (process.env.FIRST_AI_PDF_QA === "true") await writeFile("/private/tmp/first-ai-invoice-m3-qa.pdf", v4Bytes);
    for (const transactionType of ["B2C", "B2G"] as const) {
      const classification = { ...v3.classification, transactionType };
      const conditional = captureInvoiceMentions({ businessDetails: mentions.businessDetails, terms: fictionalInvoiceTerms, classification, issueDate: v3.invoice.issueDate, dueDate: v3.invoice.dueDate });
      const copy = invoiceDocumentSnapshotSchema.parse({ ...view.snapshot, classification, ...conditional });
      const text = renderedText(await generateInvoicePdf({ ...view, snapshot: copy }));
      expect(text).not.toContain("40,00 €"); expect(text).not.toContain("Pénalités de retard"); expect(text).not.toContain("Escompte");
    }
    const classification = { ...v3.classification, vatTreatment: "franchise" as const };
    const franchise = captureInvoiceMentions({ businessDetails: mentions.businessDetails, terms: fictionalInvoiceTerms, classification, issueDate: v3.invoice.issueDate, dueDate: v3.invoice.dueDate });
    const discounted = invoiceDocumentSnapshotSchema.parse({ ...view.snapshot, classification, ...franchise,
      lines: [{ description: "Frais fictifs explicites", unit: "forfait", kind: "charge", quantity: "1.000", unitPrice: "100.00", taxRate: "0.000", grossSubtotal: "100.00", discountAmount: "10.00", subtotal: "90.00", taxAmount: "0.00", total: "90.00" }],
      totals: { subtotal: "90.00", taxAmount: "0.00", total: "90.00" }, taxes: [{ rate: "0.000", base: "90.00", amount: "0.00" }],
    });
    const franchiseText = renderedText(await generateInvoicePdf({ snapshot: discounted, payment: { ...view.payment, status: "issued", amountPaid: "0.00", amountDue: "90.00" } }));
    for (const expected of ["293 B", "Frais supplémentaires", "Remise HT : 10,00 €", "TOTAL TTC : 90,00 €"]) expect(franchiseText).toContain(expected);
  });
});
