import { getLiveCollection } from "astro:content";
import { site } from "../data/site";

export const prerender = false;

const FIXED_ROUTES = [
  "",
  "/articles",
  "/about",
  "/newsletter",
  "/affiliate-disclosure",
  "/privacy",
];

export async function GET() {
  const result = await getLiveCollection("articles");
  if (result.error) {
    return new Response("Published content is temporarily unavailable.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const fixedEntries = FIXED_ROUTES.map(
    (route) => `  <url><loc>${escapeXml(`${site.url}${route}`)}</loc></url>`,
  );
  const articleEntries = (result.entries ?? []).map(({ data: article }) => {
    const location = escapeXml(`${site.url}/articles/${article.slug}`);
    const lastModified = escapeXml(article.updatedAt);
    return `  <url><loc>${location}</loc><lastmod>${lastModified}</lastmod></url>`;
  });
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...fixedEntries,
    ...articleEntries,
    "</urlset>",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Netlify-CDN-Cache-Control":
        "public, s-maxage=30, stale-while-revalidate=120, durable",
    },
  });
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
