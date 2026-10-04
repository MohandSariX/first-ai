"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { signIn, signOut } from "../lib/auth";
import { withCrm } from "../lib/crm";

export interface ActionState {
  readonly success: boolean;
  readonly message?: string;
  readonly fieldErrors?: Readonly<Record<string, readonly string[] | undefined>>;
}

function text(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
function required(form: FormData, name: string): string { return text(form, name) ?? ""; }
function numberValue(form: FormData, name: string): number | undefined { const value = text(form, name); return value === undefined ? undefined : Number(value); }
function errorState(error: unknown): ActionState {
  if (error instanceof z.ZodError) return { success: false, message: "Vérifiez les champs indiqués.", fieldErrors: error.flatten().fieldErrors };
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === "FORBIDDEN") return { success: false, message: "Vous n’avez pas l’autorisation d’effectuer cette action." };
  if (code === "NOT_FOUND") return { success: false, message: "La ressource demandée est introuvable." };
  if (code === "23505") return { success: false, message: "Une entrée avec ces informations existe déjà." };
  return { success: false, message: "Une erreur est survenue. Réessayez." };
}

export async function loginAction(form: FormData): Promise<void> {
  const ok = await signIn(required(form, "email"), required(form, "password"));
  if (!ok) redirect("/login?error=invalid");
  redirect("/dashboard");
}
export async function logoutAction(): Promise<void> { await signOut(); redirect("/login"); }

export async function createCustomerAction(_state: ActionState, form: FormData): Promise<ActionState> {
  let customerId: string;
  try {
    customerId = await withCrm(async ({ context, customers }) => (await customers.createCustomer(context, {
      type: required(form, "type"), name: required(form, "name"), legalName: text(form, "legalName"), siret: text(form, "siret"), billingEmail: text(form, "billingEmail"), phone: text(form, "phone"), paymentTermsDays: numberValue(form, "paymentTermsDays"), notes: text(form, "notes"),
    })).id);
  } catch (error) { return errorState(error); }
  revalidatePath("/customers"); redirect(`/customers/${customerId}?created=1`);
}

export async function createContactAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const customerId = required(form, "customerId");
  try { await withCrm(({ context, contacts }) => contacts.createContact(context, { customerId, firstName: required(form, "firstName"), lastName: required(form, "lastName"), role: text(form, "role"), email: text(form, "email"), phone: text(form, "phone"), isPrimary: form.get("isPrimary") === "on", notes: text(form, "notes") })); }
  catch (error) { return errorState(error); }
  revalidatePath(`/customers/${customerId}`); return { success: true, message: "Contact ajouté." };
}

export async function createSiteAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const customerId = required(form, "customerId");
  try { await withCrm(({ context, sites }) => sites.createCustomerSite(context, { customerId, name: required(form, "name"), addressLine1: required(form, "addressLine1"), addressLine2: text(form, "addressLine2"), postalCode: required(form, "postalCode"), city: required(form, "city"), country: text(form, "country"), accessInstructions: text(form, "accessInstructions"), accessHours: text(form, "accessHours"), primaryContactId: text(form, "primaryContactId"), notes: text(form, "notes") })); }
  catch (error) { return errorState(error); }
  revalidatePath(`/customers/${customerId}`); return { success: true, message: "Site ajouté." };
}

export async function createLeadAction(_state: ActionState, form: FormData): Promise<ActionState> {
  try { await withCrm(({ context, leads }) => leads.createLead(context, { source: text(form, "source"), type: text(form, "type"), companyName: text(form, "companyName"), firstName: text(form, "firstName"), lastName: text(form, "lastName"), email: text(form, "email"), phone: text(form, "phone"), addressLine1: text(form, "addressLine1"), addressLine2: text(form, "addressLine2"), postalCode: text(form, "postalCode"), city: text(form, "city"), country: text(form, "country"), status: text(form, "status"), score: numberValue(form, "score"), estimatedValue: text(form, "estimatedValue"), notes: text(form, "notes") })); }
  catch (error) { return errorState(error); }
  revalidatePath("/leads"); return { success: true, message: "Prospect créé." };
}

export async function updateLeadStatusAction(_state: ActionState, form: FormData): Promise<ActionState> {
  try { await withCrm(({ context, leads }) => leads.updateLeadStatus(context, required(form, "leadId"), { status: required(form, "status") })); }
  catch (error) { return errorState(error); }
  revalidatePath("/leads"); return { success: true, message: "Statut mis à jour." };
}

export async function assignLeadAction(_state: ActionState, form: FormData): Promise<ActionState> {
  try { await withCrm(({ context, leads }) => leads.assignLead(context, required(form, "leadId"), { assignedUserId: text(form, "assignedUserId") ?? null })); }
  catch (error) { return errorState(error); }
  revalidatePath("/leads"); return { success: true, message: "Responsable mis à jour." };
}

export async function createServiceAction(_state: ActionState, form: FormData): Promise<ActionState> {
  try { await withCrm(({ context, catalog }) => catalog.createService(context, { code: required(form, "code"), name: required(form, "name"), category: text(form, "category"), description: text(form, "description"), pricingMode: required(form, "pricingMode"), basePrice: text(form, "basePrice"), estimatedDurationMinutes: numberValue(form, "estimatedDurationMinutes"), active: form.get("active") === "on" })); }
  catch (error) { return errorState(error); }
  revalidatePath("/services"); return { success: true, message: "Prestation créée." };
}

export async function updateServiceAction(_state: ActionState, form: FormData): Promise<ActionState> {
  try { await withCrm(({ context, catalog }) => catalog.updateService(context, required(form, "serviceId"), { code: required(form, "code"), name: required(form, "name"), category: text(form, "category"), description: text(form, "description"), pricingMode: required(form, "pricingMode"), basePrice: text(form, "basePrice") ?? null, estimatedDurationMinutes: numberValue(form, "estimatedDurationMinutes") ?? null, active: form.get("active") === "on" })); }
  catch (error) { return errorState(error); }
  revalidatePath("/services"); return { success: true, message: "Prestation mise à jour." };
}
