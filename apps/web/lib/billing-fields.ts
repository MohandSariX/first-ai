import type { OperationalField } from "../components/operational-form";
import { LEGAL_ENTITY_TYPES, VAT_REGIMES, BILLING_CLASSIFICATIONS, TRANSACTION_TYPES, OPERATION_CATEGORIES, FISCAL_TERRITORIES, VAT_TREATMENTS } from "@first-ai/schemas";
const labels: Record<string, string> = {
  legalName: "Identité légale du vendeur", legalEntityType: "Type juridique", legalForm: "Forme juridique (ex. SAS)", siren: "SIREN", siret: "SIRET", vatNumber: "Numéro de TVA", registration: "Immatriculation (RCS / RNE, si applicable)", shareCapital: "Capital social (€)", vatRegime: "Régime TVA", vatOnDebits: "Option TVA sur les débits", companySize: "Taille déclarée de l’entreprise",
  addressLine1: "Adresse du siège / entrepreneur", addressLine2: "Complément d’adresse", postalCode: "Code postal", city: "Ville", country: "Pays du vendeur (code ISO)",
  billingClassification: "Classification du client", billingName: "Nom de facturation", billingLegalName: "Identité légale de facturation", billingAddressLine1: "Adresse de facturation", billingAddressLine2: "Complément de facturation", billingPostalCode: "Code postal de facturation", billingCity: "Ville de facturation", billingCountry: "Pays de facturation (code ISO)", establishmentCountry: "Pays d’établissement (code ISO)", taxablePerson: "Client assujetti à la TVA",
  transactionType: "Type de transaction", operationCategory: "Nature des opérations", fiscalTerritory: "Territorialité fiscale", vatTreatment: "Traitement TVA de la facture", vatReason: "Base / motif fiscal validé",
};
const choices: Record<string, readonly string[]> = { legalEntityType: LEGAL_ENTITY_TYPES, vatRegime: VAT_REGIMES, billingClassification: BILLING_CLASSIFICATIONS, transactionType: TRANSACTION_TYPES, operationCategory: OPERATION_CATEGORIES, fiscalTerritory: FISCAL_TERRITORIES, vatTreatment: VAT_TREATMENTS, companySize: ["micro", "sme", "eti", "large"], vatOnDebits: ["yes", "no"], taxablePerson: ["yes", "no"] };
const choiceLabels: Record<string, string> = { company: "Société", individual_entrepreneur: "Entrepreneur individuel", association: "Association", public: "Organisme public", normal: "TVA normale", franchise: "Franchise en base", exempt: "Exonéré", professional: "Professionnel", individual: "Particulier", services: "Services", goods: "Biens", mixed: "Biens et services", domestic: "France domestique", eu: "Union européenne (émission non prise en charge)", international: "International (émission non prise en charge)", exemption: "Exonération", reverse_charge: "Autoliquidation", other: "Autre (cadrage requis)", micro: "Micro / TPE", sme: "PME", eti: "ETI", large: "Grande entreprise", yes: "Oui", no: "Non" };
export function billingFields(keys: readonly string[], values: object): OperationalField[] {
  const record = values as Record<string, unknown>;
  return keys.map(name => ({ name, label: labels[name] ?? name,
    value: typeof record[name] === "boolean" ? (record[name] ? "yes" : "no") : String(record[name] ?? ""),
    ...(choices[name] ? { type: "select" as const, options: choices[name].map(value => ({ value, label: choiceLabels[value] ?? value })) } : {}),
  }));
}
