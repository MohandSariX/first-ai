// Deliberately small redaction boundary, not a general secret detector.
export function redactText(value: string, maximum = 12000): string {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/(password|mot de passe|api[_ -]?key|secret|token|authorization)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/(postgres(?:ql)?:\/\/)[^\s]+/gi, "$1[REDACTED]")
    .slice(0, maximum);
}
export function sanitizeData(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof value === "string") return redactText(value, 1000);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeData(item, depth + 1));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [
      key, /password|secret|token|api.?key|authorization/i.test(key) ? "[REDACTED]" : sanitizeData(item, depth + 1),
    ]));
  }
  return value;
}
