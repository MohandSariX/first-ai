// Next can reconstruct request.url with its bind hostname (localhost) rather
// than the browser hostname. Validate the actual HTTP host and protocol instead.
export function hasSameOrigin(request: Request): boolean {
  try {
    const origin = request.headers.get("origin");
    return origin !== null && new URL(origin).host === request.headers.get("host") && new URL(origin).protocol === new URL(request.url).protocol;
  } catch { return false; }
}
