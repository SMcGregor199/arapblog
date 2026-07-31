import { site } from "../data/site";
import { getEditorialSnapshot } from "../lib/content/editorial";
import { editorialSlug } from "../lib/editorial-routing";

export const prerender = false;

const FIXED_ROUTES = [
  "",
  "/articles",
  "/reading",
  "/topics",
  "/about",
  "/newsletter",
  "/affiliate-disclosure",
  "/privacy",
];

export async function GET() {
  let editorial;
  try {
    editorial = await getEditorialSnapshot();
  } catch {
    return new Response("Published content is temporarily unavailable.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const fixedEntries = FIXED_ROUTES.map(
    (route) => `  <url><loc>${escapeXml(`${site.url}${route}`)}</loc></url>`,
  );
  const articleEntries = editorial.originals.map((article) => {
    const location = escapeXml(`${site.url}/articles/${article.slug}`);
    const lastModified = escapeXml(article.updatedAt);
    return `  <url><loc>${location}</loc><lastmod>${lastModified}</lastmod></url>`;
  });
  const collectionEntries = editorial.collections.map((collection) =>
    `  <url><loc>${escapeXml(`${site.url}/collections/${collection.slug}`)}</loc><lastmod>${escapeXml(collection.updatedAt)}</lastmod></url>`,
  );
  const contributorEntries = editorial.contributors.map((contributor) =>
    `  <url><loc>${escapeXml(`${site.url}/contributors/${contributor.slug}`)}</loc></url>`,
  );
  const topics = [...new Set([
    ...editorial.originals.flatMap((article) => article.tags),
    ...editorial.curatedLinks.flatMap((item) => item.topics),
  ].map(editorialSlug))];
  const topicEntries = topics.map((topic) =>
    `  <url><loc>${escapeXml(`${site.url}/topics/${topic}`)}</loc></url>`,
  );
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...fixedEntries,
    ...articleEntries,
    ...collectionEntries,
    ...contributorEntries,
    ...topicEntries,
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
