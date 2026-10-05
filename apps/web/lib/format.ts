export function formatMoney(value: string | null): string {
  if (value === null) return "—";
  const normalized = /^-?\d+(\.\d{1,2})?$/.test(value) ? value : "0";
  const sign = normalized.startsWith("-") ? "−" : "";
  const [whole = "0", decimals = ""] = normalized.replace(/^-/, "").split(".");
  return `${sign}${new Intl.NumberFormat("fr-FR").format(BigInt(whole))},${decimals.padEnd(2, "0")} €`;
}

export function formatDateTime(value: Date, timezone = "Europe/Paris"): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(value);
}

export function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(value);
}
