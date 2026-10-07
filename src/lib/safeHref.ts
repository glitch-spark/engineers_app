/**
 * Return `url` only when it is an absolute http(s) URL, else undefined.
 * Use for every user- or DB-supplied URL that ends up in an href or
 * window.open, so `javascript:` / `data:` URLs can never run in our origin.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : undefined;
  } catch {
    return undefined;
  }
}
