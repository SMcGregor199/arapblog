/**
 * Produces the URL identity used for deduplicating external editorial sources.
 * Query parameters are retained because some publishers use them as part of a
 * stable canonical URL; fragments and cosmetic trailing slashes are not.
 */
export function canonicalUrlKey(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

/** Reject obvious local and private targets before server-side URL checks. */
export function isSafeExternalHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return false;
  if (host.startsWith("127.") || host === "0.0.0.0") return false;
  if (host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("169.254.")) return false;
  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
  const shared100 = host.match(/^100\.(\d{1,3})\./);
  if (shared100 && Number(shared100[1]) >= 64 && Number(shared100[1]) <= 127) return false;
  return host !== "::" && !host.startsWith("fe80:") && !host.startsWith("fc") && !host.startsWith("fd") && !host.startsWith("::ffff:");
}
