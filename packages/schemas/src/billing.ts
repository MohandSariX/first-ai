import { z } from "zod";

export const LEGAL_ENTITY_TYPES = ["company", "individual_entrepreneur", "association", "public"] as const;
export const VAT_REGIMES = ["normal", "franchise", "exempt"] as const;
export const BILLING_CLASSIFICATIONS = ["professional", "individual", "public"] as const;
export const TRANSACTION_TYPES = ["B2B", "B2C", "B2G"] as const;
export const OPERATION_CATEGORIES = ["services", "goods", "mixed"] as const;
export const FISCAL_TERRITORIES = ["domestic", "eu", "international"] as const;
export const VAT_TREATMENTS = ["normal", "franchise", "exemption", "reverse_charge", "other"] as const;
const text = (length: number) => z.string().trim().min(1).max(length).nullable();
const country = z.string().regex(/^[A-Z]{2}$/).nullable();
const siren = z.string().regex(/^\d{9}$/, "SIREN : 9 chiffres attendus.").nullable();
const siret = z.string().regex(/^\d{14}$/, "SIRET : 14 chiffres attendus.").nullable();
const vatNumber = z.string().trim().regex(/^[A-Z]{2}[A-Z0-9]{2,30}$/, "Format de numéro TVA invalide (sans espaces).").nullable();
// Configuration may be incomplete; issue-time validation is stricter. No identifiers are inferred.
export const sellerBillingSchema = z.strictObject({
  legalName: text(255), legalEntityType: z.enum(LEGAL_ENTITY_TYPES).nullable(), legalForm: text(80),
  siren, siret, vatNumber, registration: text(255),
  shareCapital: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).nullable(),
  vatRegime: z.enum(VAT_REGIMES).nullable(), vatOnDebits: z.boolean().nullable(),
  companySize: z.enum(["micro", "sme", "eti", "large"]).nullable(),
  addressLine1: text(255), addressLine2: text(255), postalCode: text(20), city: text(120), country: z.string().regex(/^[A-Z]{2}$/),
}).refine(v => !v.siren || !v.siret || v.siret.startsWith(v.siren), { path: ["siret"], message: "Le SIRET doit correspondre au SIREN renseigné." });
export const customerBillingSchema = z.strictObject({
  billingClassification: z.enum(BILLING_CLASSIFICATIONS).nullable(),
  billingName: text(255), billingLegalName: text(255),
  billingAddressLine1: text(255), billingAddressLine2: text(255), billingPostalCode: text(20), billingCity: text(120), billingCountry: country,
  establishmentCountry: country, taxablePerson: z.boolean().nullable(),
  siren, siret, vatNumber,
}).refine(v => !v.siren || !v.siret || v.siret.startsWith(v.siren), { path: ["siret"], message: "Le SIRET doit correspondre au SIREN renseigné." });
export const invoiceClassificationSchema = z.strictObject({
  transactionType: z.enum(TRANSACTION_TYPES), operationCategory: z.enum(OPERATION_CATEGORIES),
  fiscalTerritory: z.enum(FISCAL_TERRITORIES), vatTreatment: z.enum(VAT_TREATMENTS), vatReason: text(500),
});
export type SellerBillingInput = z.infer<typeof sellerBillingSchema>;
export type CustomerBillingInput = z.infer<typeof customerBillingSchema>;
export type InvoiceClassification = z.infer<typeof invoiceClassificationSchema>;

/** M1 safety envelope, not a fiscal certificate or an international tax engine. */
export function validateBillingScenario(seller: SellerBillingInput, customer: CustomerBillingInput, invoice: InvoiceClassification, taxRates: readonly string[]) {
  const errors: string[] = [];
  if (![seller.legalName, seller.legalEntityType, seller.addressLine1, seller.postalCode, seller.city, seller.country, seller.vatRegime].every(Boolean) || seller.vatOnDebits === null) errors.push("Complétez l’identité juridique, l’adresse et le régime TVA du vendeur.");
  if (seller.country === "FR" && !seller.siren) errors.push("Renseignez le SIREN du vendeur français.");
  if (seller.legalEntityType === "company" && (!seller.legalForm || seller.shareCapital === null)) errors.push("Renseignez la forme juridique et le capital de la société.");
  if (seller.legalEntityType === "company" && !seller.registration) errors.push("Renseignez l’immatriculation applicable à la société (registre et lieu).");
  if (seller.vatRegime === "normal" && !seller.vatNumber) errors.push("Renseignez l’identifiant TVA du vendeur soumis à la TVA.");
  if (seller.country === "FR" && seller.vatNumber && (!/^FR[A-Z0-9]{2}\d{9}$/.test(seller.vatNumber) || (seller.siren && !seller.vatNumber.endsWith(seller.siren)))) errors.push("L’identifiant TVA français du vendeur doit correspondre à son SIREN.");
  if (seller.vatRegime !== "normal" && seller.vatOnDebits) errors.push("L’option TVA sur les débits nécessite un régime TVA normal.");
  if (![customer.billingClassification, customer.billingName, customer.billingAddressLine1, customer.billingPostalCode, customer.billingCity, customer.billingCountry, customer.establishmentCountry].every(Boolean) || customer.taxablePerson === null) errors.push("Complétez la classification, l’identité, l’adresse de facturation et la qualification TVA du client.");
  if (customer.billingClassification !== "individual" && !customer.billingLegalName) errors.push("Renseignez l’identité légale du client professionnel ou public.");
  if (customer.establishmentCountry === "FR" && customer.billingClassification !== "individual" && !customer.siren) errors.push("Renseignez le SIREN du client professionnel ou public français.");
  if (customer.establishmentCountry === "FR" && customer.vatNumber && (!/^FR[A-Z0-9]{2}\d{9}$/.test(customer.vatNumber) || (customer.siren && !customer.vatNumber.endsWith(customer.siren)))) errors.push("L’identifiant TVA français du client doit correspondre à son SIREN.");
  const expected = { professional: "B2B", individual: "B2C", public: "B2G" } as const;
  if (!customer.billingClassification || invoice.transactionType !== expected[customer.billingClassification]) errors.push("La transaction ne correspond pas à la classification explicite du client.");
  if (customer.billingClassification === "individual" && customer.taxablePerson) errors.push("Un particulier doit être qualifié non-assujetti dans ce flux.");
  if (invoice.fiscalTerritory !== "domestic" || seller.country !== "FR" || customer.establishmentCountry !== "FR" || customer.billingCountry !== "FR") errors.push("M1 permet uniquement l’émission des scénarios domestiques français ; faites qualifier les flux internationaux avant émission.");
  if (seller.vatRegime === "franchise" && invoice.vatTreatment !== "franchise") errors.push("Le traitement doit correspondre à la franchise du vendeur.");
  if (seller.vatRegime !== "franchise" && invoice.vatTreatment === "franchise") errors.push("La franchise nécessite un vendeur configuré en franchise.");
  if (seller.vatRegime === "exempt" && invoice.vatTreatment !== "exemption") errors.push("Le vendeur exonéré nécessite un traitement exonération.");
  if (["exemption", "reverse_charge", "other"].includes(invoice.vatTreatment) && !invoice.vatReason) errors.push("Renseignez la base ou le motif fiscal explicitement validé.");
  if (invoice.vatTreatment === "other") errors.push("Ce cas fiscal nécessite un cadrage dédié avant émission.");
  if (invoice.vatTreatment === "reverse_charge" && (seller.vatRegime !== "normal" || invoice.transactionType !== "B2B" || !customer.taxablePerson || !customer.vatNumber)) errors.push("L’autoliquidation nécessite un scénario B2B assujetti avec identifiant TVA client et vendeur au régime normal.");
  if (invoice.vatTreatment !== "normal" && taxRates.some(r => /[1-9]/.test(r))) errors.push("Ce traitement ne permet pas de TVA facturée sur les lignes.");
  if (invoice.vatTreatment === "normal" && taxRates.some(r => !/[1-9]/.test(r))) errors.push("Un taux nul nécessite une qualification fiscale distincte ; les traitements mixtes ne sont pas couverts par M1.");
  return errors;
}
