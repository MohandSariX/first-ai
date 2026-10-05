// Node-only rendering entry point; no filesystem paths, HTML, network or AI input.
import PDFDocument from "pdfkit";
import { invoiceDocumentSnapshotSchema } from "@first-ai/schemas";
import { invoiceDocumentAvailability, type InvoiceDocumentView } from "./invoice-document.js";
import { OperationalConflictError } from "./operational-policies.js";

export function formatDocumentMoney(value: string): string {
  if (!/^\d+\.\d{2}$/.test(value)) throw new OperationalConflictError("Montant de document invalide.");
  const [whole = "0", fraction] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${fraction} €`;
}
function date(value: string) { const [year, month, day] = value.slice(0, 10).split("-"); return `${day}/${month}/${year}`; }
function displayDecimal(value: string) { return value.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1").replace(".", ","); }
const paymentLabels = { draft: "Brouillon", issued: "Non réglée", sent: "Non réglée", partially_paid: "Partiellement réglée", paid: "Réglée", overdue: "En retard", cancelled: "Annulée", written_off: "Passée en perte" };

export async function generateInvoicePdf(view: InvoiceDocumentView): Promise<Buffer> {
  const snapshot = invoiceDocumentSnapshotSchema.parse(view.snapshot);
  const available = invoiceDocumentAvailability(snapshot);
  if (!available.available) throw new OperationalConflictError(available.message ?? "Document indisponible.");
  if (BigInt(view.payment.amountPaid.replace(".", "")) + BigInt(view.payment.amountDue.replace(".", "")) !== BigInt(snapshot.totals.total.replace(".", ""))) throw new OperationalConflictError("Solde du document incohérent.");
  // Built-in WinAnsi fonts cover French. Reject unsupported glyphs instead of silently corrupting names.
  const safeText = (text: string) => {
    if (/[^\x20-\x7e\xa0-\xff\n\r\t€œŒŠšŸŽž•–—‘’‚“”„…†‡‰‹›™]/u.test(text)) throw new OperationalConflictError("Le PDF v1 ne prend pas encore en charge certains caractères. Aucun document altéré ne sera généré.");
    return text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  };
  const doc = new PDFDocument({ size: "A4", margin: 42, bufferPages: true, compress: true,
    info: { Title: `FACTURE ${snapshot.invoice.number}`, Author: snapshot.seller.legalName || snapshot.seller.name,
      CreationDate: new Date(snapshot.capturedAt), ModDate: new Date(view.payment.asOf) } });
  const chunks: Buffer[] = []; let size = 0;
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 20 * 1024 * 1024) doc.destroy(new Error("PDF size limit exceeded.")); else chunks.push(chunk); });
    doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject);
  });
  // Attach rejection immediately, including when synchronous layout validation fails.
  void finished.catch(() => undefined);
  let y = 42, pages = 1;
  const width = 511;
  const text = (value: string, x: number, top: number, fontSize = 10, w = width, bold = false) => {
    const clean = safeText(value);
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
    while (doc.widthOfString(clean) > w && fontSize > 6) doc.fontSize(--fontSize);
    doc.fillColor("#202020").text(clean, x, top, { width: w, lineBreak: false });
  };
  const newPage = () => {
    if (++pages > 200) throw new OperationalConflictError("Document trop volumineux.");
    doc.addPage(); y = 42; text(`FACTURE ${snapshot.invoice.number} - suite`, 42, y, 11, width, true); y += 28;
  };
  const ensure = (height: number) => { if (y + height > 780) newPage(); };
  // Wrap explicitly, including long words, so rows/notes never overflow page or column bounds.
  const wrap = (value: string, w: number, fontSize = 10): string[] => {
    doc.font("Helvetica").fontSize(fontSize);
    const lines: string[] = [];
    for (const paragraph of safeText(value).split("\n")) {
      let line = "";
      for (const character of paragraph) {
        if (doc.widthOfString(line + character) > w && line) {
          const space = line.lastIndexOf(" ");
          if (space > 0) { lines.push(line.slice(0, space)); line = line.slice(space + 1); }
          else { lines.push(line); line = ""; }
        }
        line += character;
      }
      lines.push(line);
    }
    return lines;
  };
  const paragraph = (value: string, bold = false) => { for (const line of wrap(value, width)) { ensure(15); text(line, 42, y, 10, width, bold); y += 15; } y += 7; };
  const heading = (value: string) => { ensure(34); text(value, 42, y, 12, width, true); y += 25; };
  try {
    text("FIRST AI", 42, y, 11); text("FACTURE", 365, y, 24, 188, true); y += 43;
    paragraph(snapshot.invoice.number, true);
    paragraph(`Émission : ${date(snapshot.invoice.issueDate)}   |   Échéance : ${date(snapshot.invoice.dueDate)}`);
    const identityTop = y;
    const identity = (person: typeof snapshot.seller, label: string, x: number) => {
      let top = identityTop;
      text(label, x, top, 12, 240, true); top += 25;
      const parts = [person.legalName || person.name, person.legalName && person.name !== person.legalName ? person.name : null,
        person.addressLine1, person.addressLine2, [person.postalCode, person.city].filter(Boolean).join(" "), person.country];
      for (const [key, value] of [["SIRET", person.siret], ["TVA", person.vatNumber], ["E-mail", person.email], ["Téléphone", person.phone]]) if (value) parts.push(`${key} : ${value}`);
      for (const part of parts) if (part) for (const line of wrap(part, 240)) { text(line, x, top, 10, 240); top += 14; }
      return top;
    };
    y = Math.max(identity(snapshot.seller, "Vendeur", 42), identity(snapshot.customer, "Client facturé", 310)) + 18;
    if (snapshot.version === 2) {
      const seller = snapshot.seller.fiscalIdentity, buyer = snapshot.customer.billingIdentity;
      if (seller.legalEntityType === "individual_entrepreneur") paragraph("Vendeur : Entrepreneur individuel (EI)");
      if (seller.legalForm) paragraph(`Forme juridique : ${seller.legalForm}`);
      if (seller.shareCapital !== null) paragraph(`Capital social : ${formatDocumentMoney(seller.shareCapital.includes(".") ? seller.shareCapital.padEnd(seller.shareCapital.indexOf(".") + 3, "0") : `${seller.shareCapital}.00`)}`);
      if (seller.registration) paragraph(`Immatriculation : ${seller.registration}`);
      if (seller.siren) paragraph(`SIREN vendeur : ${seller.siren}`);
      if (buyer.siren) paragraph(`SIREN client : ${buyer.siren}`);
      const categories = { services: "Services", goods: "Biens", mixed: "Biens et services" };
      const treatments = { normal: "TVA normale", franchise: "Franchise en base", exemption: "Exonération", reverse_charge: "Autoliquidation", other: "Autre cas fiscal" };
      paragraph(`Classification : ${snapshot.classification.transactionType} - ${categories[snapshot.classification.operationCategory]} - ${treatments[snapshot.classification.vatTreatment]}`);
    }
    if (!snapshot.customer.addressLine1) paragraph("Adresse de facturation client non renseignée. L’adresse d’intervention n’est pas utilisée.");
    paragraph("DOCUMENT TECHNIQUE - Conformité fiscale non validée. Vérifier les mentions obligatoires avant tout usage en production.");
    heading("Prestations");
    const columns = [42, 273, 318, 397, 456];
    const widths = [225, 40, 73, 54, 97];
    const tableHeader = () => { ensure(25); ["Description", "Qté", "PU HT", "TVA", "Total HT"].forEach((v, n) => text(v, columns[n]!, y, 9, widths[n]!, true)); y += 24; };
    tableHeader();
    for (const line of snapshot.lines) {
      const parts = wrap(line.description, widths[0]!, 9);
      for (let n = 0; n < parts.length; n++) {
        if (y + 15 > 780) { newPage(); tableHeader(); }
        text(parts[n]!, 42, y, 9, widths[0]!);
        if (n === 0) [displayDecimal(line.quantity), formatDocumentMoney(line.unitPrice), `${displayDecimal(line.taxRate)} %`, formatDocumentMoney(line.subtotal)].forEach((v, i) => text(v, columns[i + 1]!, y, 9, widths[i + 1]!));
        y += 15;
      }
      y += 10;
    }
    heading("Totaux à l’émission");
    paragraph(`Sous-total HT : ${formatDocumentMoney(snapshot.totals.subtotal)}`);
    for (const tax of snapshot.taxes) paragraph(`TVA ${displayDecimal(tax.rate)} % - Base HT : ${formatDocumentMoney(tax.base)} - TVA : ${formatDocumentMoney(tax.amount)}`);
    paragraph(`TVA totale : ${formatDocumentMoney(snapshot.totals.taxAmount)}`);
    paragraph(`TOTAL TTC : ${formatDocumentMoney(snapshot.totals.total)}`, true);
    if (snapshot.invoice.notes) { heading("Notes au client"); paragraph(snapshot.invoice.notes); }
    ensure(160); heading("Situation des encaissements - actualisée");
    paragraph(`État : ${paymentLabels[view.payment.status]}`);
    paragraph(`Encaissements enregistrés : ${formatDocumentMoney(view.payment.amountPaid)}`);
    paragraph(`RESTE À PAYER : ${formatDocumentMoney(view.payment.amountDue)}`, true);
    paragraph(`Situation enregistrée le ${date(view.payment.asOf)}. Saisies manuelles déclaratives, sans vérification bancaire. Cet encart peut évoluer ; les lignes et montants émis restent inchangés.`);
    const range = doc.bufferedPageRange();
    for (let n = 0; n < range.count; n++) { doc.switchToPage(n); text(`${snapshot.invoice.number}  |  ${n + 1} / ${range.count}`, 42, 790, 8); }
    doc.end();
    return await finished;
  } catch (error) { doc.destroy(); throw error; }
}
