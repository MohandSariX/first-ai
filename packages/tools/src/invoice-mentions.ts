import { invoiceBusinessDetailsSchema, sellerInvoiceTermsSchema, invoicePaymentTermsSnapshotSchema, type InvoiceClassification } from "@first-ai/schemas";
import { OperationalConflictError } from "./operational-policies.js";

function addDays(date: string, days: number) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
/** Supported ordinary domestic invoices only; no advance/deferred/sector-specific fiscal engine. */
export function captureInvoiceMentions(input: { businessDetails: unknown; terms: unknown; classification: InvoiceClassification; issueDate: string; dueDate: string }) {
  const parsed = invoiceBusinessDetailsSchema.safeParse(input.businessDetails), configured = sellerInvoiceTermsSchema.safeParse(input.terms);
  if (!parsed.success || !configured.success) throw new OperationalConflictError("Complétez les dates métier et les conditions de règlement du vendeur avant émission.");
  const d = parsed.data, t = configured.data, c = input.classification;
  const fail = (message: string): never => { throw new OperationalConflictError(message); };
  const end = d.executionDate ?? d.periodEnd;
  if (!end || (d.executionDate && (d.periodStart || d.periodEnd)) || (!d.executionDate && (!d.periodStart || !d.periodEnd || d.periodStart > d.periodEnd))) fail("Confirmez une date d’exécution/livraison ou une période complète, sans les mélanger.");
  if (end! > input.issueDate || (d.periodStart && d.periodStart > input.issueDate)) fail("La prestation/livraison doit être réalisée avant émission ; acomptes et prestations futures ne sont pas couverts.");
  if (c.operationCategory !== "services" && !d.executionDate) fail("Confirmez la date de livraison des biens pour une opération biens/mixte.");
  if (c.transactionType === "B2C" && c.operationCategory !== "goods" && !d.executionLocation) fail("Renseignez le lieu explicite d’exécution de la prestation au particulier.");
  if (d.purchaseOrderIssued === null || (d.purchaseOrderIssued && !d.customerOrderReference)) fail("Confirmez si l’acheteur a établi un bon de commande et renseignez sa référence le cas échéant.");
  if (c.operationCategory !== "services" && (d.deliveryAddressDifferent === null || (d.deliveryAddressDifferent && ![d.deliveryAddressLine1, d.deliveryPostalCode, d.deliveryCity, d.deliveryCountry].every(Boolean)))) fail("Confirmez l’adresse de livraison des biens (distincte ou identique à la facturation).");
  if (c.operationCategory !== "services" && d.deliveryAddressDifferent && d.deliveryCountry !== "FR") fail("Seule une livraison domestique française est couverte.");
  if (!t.dueRule || !t.paymentTermsText) fail("Configurez une règle et un libellé de règlement explicites.");
  if (t.dueRule !== "explicit") {
    if (t.dueDays === null || input.dueDate !== addDays(t.dueRule === "invoice_days" ? input.issueDate : end!, t.dueDays)) fail("L’échéance ne correspond pas à la règle de règlement configurée.");
  }
  if (c.transactionType === "B2B" && input.dueDate > addDays(input.issueDate, 60)) fail("Le flux B2B ordinaire est limité à 60 jours depuis émission ; exceptions et fin de mois nécessitent un cadrage dédié.");
  let early: string | null = null, penalty: string | null = null, recovery: "40.00" | null = null;
  if (c.transactionType === "B2B") {
    if (!t.earlyDiscountMode || (t.earlyDiscountMode === "configured" && !t.earlyDiscountText)) fail("Configurez les conditions d’escompte B2B ou leur absence explicite.");
    early = t.earlyDiscountMode === "none" ? "Escompte pour paiement anticipé : néant." : t.earlyDiscountText;
    if (!t.b2bPenaltyRule || (t.b2bPenaltyRule === "legal_rate_multiple" && t.legalRateMultiplier === null) || t.b2bRecoveryIndemnity !== true) fail("Configurez la règle de pénalités et l’indemnité de recouvrement B2B.");
    penalty = t.b2bPenaltyRule === "ecb_plus_10" ? "Pénalités de retard : taux de refinancement de la BCE applicable majoré de 10 points, exigibles dès le lendemain de l’échéance, sans rappel." : `Pénalités de retard : ${t.legalRateMultiplier} fois le taux d’intérêt légal applicable, exigibles dès le lendemain de l’échéance, sans rappel.`;
    recovery = "40.00";
  }
  if (c.transactionType === "B2G" && !t.publicPaymentTerms) fail("Configurez les conditions propres au client public ; aucune règle privée B2B n’est appliquée automatiquement.");
  let vatMention: string | null = null;
  if (c.vatTreatment === "franchise") { if (!t.franchiseVatMention) fail("Configurez la mention de franchise en base validée par l’émetteur."); vatMention = t.franchiseVatMention; }
  if (c.vatTreatment === "exemption" || c.vatTreatment === "reverse_charge") { if (!c.vatReason) fail("Renseignez le motif/base fiscale validé."); vatMention = `${c.vatTreatment === "reverse_charge" ? "Autoliquidation" : "Exonération de TVA"} : ${c.vatReason}`; }
  return { businessDetails: d, vatMention, paymentTerms: invoicePaymentTermsSnapshotSchema.parse({ dueRule: t.dueRule, dueDays: t.dueRule === "explicit" ? null : t.dueDays, dueDate: input.dueDate, paymentTermsText: t.paymentTermsText, earlyDiscountText: early, latePenaltyText: penalty, recoveryIndemnityAmount: recovery, publicPaymentTerms: c.transactionType === "B2G" ? t.publicPaymentTerms : null }) };
}
