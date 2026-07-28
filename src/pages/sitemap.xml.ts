import { getCollection } from "astro:content";
import { site } from "../data/site";

export async function GET() {
  const articles = await getCollection("articles", ({ data }) => !data.draft);
  const routes = [
    "",
    "/articles",
    "/about",
    "/newsletter",
    "/affiliate-disclosure",
    "/privacy",
    ...articles.map((article) => `/articles/${article.id}`),
  ];
  const lastmod = new Date().toISOString();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (route) =>
      `  <url><loc>${site.url}${route}</loc><lastmod>${lastmod}</lastmod></url>`,
  )
  .join("\n")}
</urlset>`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
