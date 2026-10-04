export function formatMoney(value: string | null): string {
  if (value === null) return "—";
  const normalized = /^\d+(\.\d{1,2})?$/.test(value) ? value : "0";
  const [whole = "0", decimals = ""] = normalized.split(".");
  return `${new Intl.NumberFormat("fr-FR").format(BigInt(whole))},${decimals.padEnd(2, "0")} €`;
}

export function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(value);
}
