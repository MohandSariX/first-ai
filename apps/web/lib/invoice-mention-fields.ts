import { invoiceBusinessDetailsSchema, sellerInvoiceTermsSchema } from "@first-ai/schemas";
import type { OperationalField } from "../components/operational-form";

const labels: Record<string, string> = {
  executionDate: "Date réelle d’exécution / livraison", periodStart: "Début de période de service", periodEnd: "Fin de période de service", executionLocation: "Lieu d’exécution confirmé",
  purchaseOrderIssued: "Bon de commande établi par l’acheteur", customerOrderReference: "Référence commande / acheteur",
  deliveryAddressDifferent: "Livraison distincte de la facturation", deliveryAddressLine1: "Adresse de livraison", deliveryAddressLine2: "Complément de livraison", deliveryPostalCode: "Code postal de livraison", deliveryCity: "Ville de livraison", deliveryCountry: "Pays de livraison (ISO)",
  dueRule: "Règle d’échéance", dueDays: "Délai (jours, sauf échéance explicite)", paymentTermsText: "Conditions de règlement communes",
  earlyDiscountMode: "Escompte B2B", earlyDiscountText: "Conditions d’escompte convenues",
  b2bPenaltyRule: "Règle de pénalités B2B", legalRateMultiplier: "Multiple du taux légal (minimum 3)", b2bRecoveryIndemnity: "Indemnité forfaitaire B2B de 40 €",
  publicPaymentTerms: "Conditions spécifiques clients publics", franchiseVatMention: "Mention de franchise validée (si applicable)",
};
const choices: Record<string, { value: string; label: string }[]> = {
  dueRule: [{ value: "explicit", label: "Échéance explicitement convenue" }, { value: "invoice_days", label: "Jours depuis émission" }, { value: "execution_days", label: "Jours depuis exécution / fin de période" }],
  earlyDiscountMode: [{ value: "none", label: "Néant" }, { value: "configured", label: "Conditions convenues ci-dessous" }],
  b2bPenaltyRule: [{ value: "ecb_plus_10", label: "Taux BCE applicable + 10 points" }, { value: "legal_rate_multiple", label: "Multiple du taux légal applicable" }],
};
export function invoiceMentionFields(kind: "terms" | "business", values: object | null, transaction?: string | null, category?: string | null): OperationalField[] {
  const record = (values ?? {}) as Record<string, unknown>;
  const keys = Object.keys(kind === "terms" ? sellerInvoiceTermsSchema.shape : invoiceBusinessDetailsSchema.shape);
  return keys.filter(k => kind === "terms" || (!k.startsWith("delivery") || category !== "services") && (!k.startsWith("period") || category !== "goods") && (k !== "executionLocation" || transaction === "B2C" && category !== "goods")).map(name => {
    const boolean = ["purchaseOrderIssued", "deliveryAddressDifferent", "b2bRecoveryIndemnity"].includes(name);
    return { name, label: labels[name] ?? name, value: typeof record[name] === "boolean" ? record[name] ? "yes" : "no" : String(record[name] ?? ""),
      ...(boolean || choices[name] ? { type: "select" as const, options: choices[name] ?? [{ value: "yes", label: "Oui" }, { value: "no", label: "Non" }] } : name.endsWith("Date") || name === "periodStart" || name === "periodEnd" ? { type: "date" as const } : {}),
    };
  });
}
