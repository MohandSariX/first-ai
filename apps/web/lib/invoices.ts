import type { OperationalField } from "../components/operational-form";
export const invoiceLabels = { draft: "Brouillon", issued: "Émise", sent: "Envoyée", partially_paid: "Partiellement payée", paid: "Payée", overdue: "En retard", cancelled: "Annulée", written_off: "Passée en perte" };
export function invoiceItemFields(item?: { description: string; quantity: string; unitPrice: string; taxRate: string; sortOrder: number; unit?: string | null; kind?: string; discountAmount?: string }): OperationalField[] {
  return [
    { name: "description", label: "Description", required: true, value: item?.description },
    { name: "quantity", label: "Quantité", required: true, value: item?.quantity ?? "1" },
    { name: "unit", label: "Unité (unité, heure, m², forfait…)", required: true, value: item?.unit ?? "unité" },
    { name: "kind", label: "Nature de ligne", type: "select", value: item?.kind ?? "item", options: [{ value: "item", label: "Prestation / bien" }, { value: "charge", label: "Frais supplémentaires (quantité 1)" }] },
    { name: "unitPrice", label: "Prix unitaire HT (€)", required: true, value: item?.unitPrice },
    { name: "taxRate", label: "TVA (%)", required: true, value: item?.taxRate },
    { name: "discountAmount", label: "Remise acquise HT sur toute la ligne (€)", value: item?.discountAmount ?? "0" },
    { name: "sortOrder", label: "Ordre", value: String(item?.sortOrder ?? 0) },
  ];
}
