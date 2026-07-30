export const CONTENT_CACHE_CONTROL = "public, max-age=0, must-revalidate";
export const CONTENT_CDN_CACHE_CONTROL =
  "public, s-maxage=30, stale-while-revalidate=120, durable";

export function contentCacheHeaders(): Record<string, string> {
  return {
    "Cache-Control": CONTENT_CACHE_CONTROL,
    "Netlify-CDN-Cache-Control": CONTENT_CDN_CACHE_CONTROL,
  };
}
