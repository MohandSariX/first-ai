// Server-only Node renderer; trusted immutable DTO, no HTML, caller-provided path, remote service or AI.
import PDFDocument from "pdfkit";
import { creditNoteSnapshotSchema, type CreditNoteSnapshot } from "@first-ai/schemas";
import { formatDocumentMoney } from "./invoice-pdf.js";
import { invoiceDocumentAvailability } from "./invoice-document.js";
import { OperationalConflictError } from "./operational-policies.js";
import { PDF_FONT_REGULAR, PDF_FONT_BOLD, registerPdfFonts, safePdfText } from "./pdf-fonts.js";
const date = (v: string) => v.split("-").reverse().join("/");
export async function generateCreditNotePdf(input: CreditNoteSnapshot): Promise<Buffer> {
  const s = creditNoteSnapshotSchema.parse(input), original = s.originalInvoice;
  if (!invoiceDocumentAvailability(original).available) throw new OperationalConflictError("Identité originale insuffisante pour le PDF.");
  const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, compress: true, info: { Title: `AVOIR ${s.number}`, Author: original.seller.legalName || original.seller.name, CreationDate: new Date(s.issuedAt), ModDate: new Date(s.issuedAt) } });
  const chunks: Buffer[] = []; let bytes = 0, y = 42, page = 1;
  const done = new Promise<Buffer>((resolve,reject) => { doc.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 20 * 1024 * 1024) doc.destroy(new Error("PDF size limit exceeded")); else chunks.push(chunk); }); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); }); void done.catch(() => undefined);
  const paragraph = (text: string, bold = false, size = 10) => {
    const clean = safePdfText(doc, text, bold);
    doc.fontSize(size);
    const draw = (line: string) => { if (y > 765) { if (++page > 200) throw new OperationalConflictError("Document trop volumineux."); doc.addPage(); y = 42; doc.font(PDF_FONT_BOLD).fontSize(10).text(`AVOIR ${s.number} - suite`, 42,y); y += 28; doc.font(bold ? PDF_FONT_BOLD : PDF_FONT_REGULAR).fontSize(size); } doc.text(line,42,y,{ width: 511,lineBreak: false }); y += size + 5; };
    for (const block of clean.split("\n")) { let line = ""; for (const char of block) { if (doc.widthOfString(line + char) > 511 && line) { draw(line); line = ""; } line += char; } draw(line); } y += 6;
  };
  try {
    registerPdfFonts(doc);
    paragraph("FIRST AI", false, 11); paragraph("AVOIR", true, 24); paragraph(s.number,true,14);
    paragraph(`Émission : ${date(s.issueDate)}`);
    paragraph(`Facture originale : ${original.invoice.number} du ${date(original.invoice.issueDate)}`,true);
    paragraph(`Motif : ${s.reason}`);
    paragraph(s.correctionType === "full" ? "Correction de toutes les bases restantes de la facture." : "Correction partielle de la facture.");
    for (const [label, person] of [["Vendeur", original.seller], ["Client facturé", original.customer]] as const) {
      paragraph(label,true,12); paragraph([person.legalName || person.name, person.addressLine1,person.addressLine2,[person.postalCode,person.city].filter(Boolean).join(" "),person.country].filter(Boolean).join("\n"));
      if (person.siret) paragraph(`SIRET : ${person.siret}`); if (person.vatNumber) paragraph(`TVA : ${person.vatNumber}`);
    }
    if (original.version !== 1) {
      const f = original.seller.fiscalIdentity, b = original.customer.billingIdentity;
      for (const value of [f.legalEntityType === "individual_entrepreneur" ? "Entrepreneur individuel (EI)" : null, f.legalForm, f.registration, f.siren ? `SIREN vendeur : ${f.siren}` : null, b.siren ? `SIREN client : ${b.siren}` : null, f.shareCapital ? `Capital social : ${formatDocumentMoney(f.shareCapital.includes(".") ? f.shareCapital.padEnd(f.shareCapital.indexOf(".") + 3,"0") : `${f.shareCapital}.00`)}` : null]) if (value) paragraph(value);
      paragraph(`Classification originale : ${original.classification.transactionType} / ${original.classification.operationCategory} / ${original.classification.vatTreatment}`);
    }
    if (original.version === 4) {
      const d = original.businessDetails;
      paragraph(d.executionDate ? `Exécution originale : ${date(d.executionDate)}` : `Période originale : ${date(d.periodStart!)} au ${date(d.periodEnd!)}`);
      if (d.customerOrderReference) paragraph(`Commande : ${d.customerOrderReference}`);
      if (d.executionLocation) paragraph(`Lieu d’exécution : ${d.executionLocation}`);
      if (d.deliveryAddressDifferent) paragraph(`Livraison originale : ${[d.deliveryAddressLine1,d.deliveryAddressLine2,d.deliveryPostalCode,d.deliveryCity,d.deliveryCountry].filter(Boolean).join(", ")}`);
      if (original.vatMention) paragraph(original.vatMention);
      if (original.seller.fiscalIdentity.vatOnDebits) paragraph("Option pour le paiement de la taxe d’après les débits.");
    }
    paragraph("DOCUMENT TECHNIQUE - Conformité fiscale non validée. Aucun remboursement bancaire n’est exécuté.");
    paragraph("Bases corrigées (montants à déduire)",true,12);
    for (const line of s.lines) {
      paragraph(`Ligne originale ${line.originalLineIndex + 1} : ${line.description}`,true);
      paragraph(`Quantité originale : ${line.originalQuantity}${line.unit ? ` ${line.unit}` : ""}. Correction par montant HT, non par quantité.`);
      paragraph(`HT corrigé : ${formatDocumentMoney(line.subtotal)} | TVA ${line.taxRate.replace(/\.0+$/, "")} % : ${formatDocumentMoney(line.taxAmount)} | TTC : ${formatDocumentMoney(line.total)}`);
    }
    for (const tax of s.taxes) paragraph(`TVA ${tax.rate} % - Base corrigée : ${formatDocumentMoney(tax.base)} - TVA corrigée : ${formatDocumentMoney(tax.amount)}`);
    paragraph(`TOTAL HT À DÉDUIRE : ${formatDocumentMoney(s.totals.subtotal)}`,true);
    paragraph(`TVA À DÉDUIRE : ${formatDocumentMoney(s.totals.taxAmount)}`,true);
    paragraph(`TOTAL TTC À DÉDUIRE : ${formatDocumentMoney(s.totals.total)}`,true);
    const pages = doc.bufferedPageRange(); for (let n = 0; n < pages.count; n++) { doc.switchToPage(n); doc.font(PDF_FONT_REGULAR).fontSize(8).text(`${s.number} | ${n+1} / ${pages.count}`,42,790,{ lineBreak: false }); }
    doc.end(); return await done;
  } catch (error) { doc.destroy(); throw error; }
}
