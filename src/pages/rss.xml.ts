import rss from "@astrojs/rss";
import { getLiveCollection } from "astro:content";
import { site } from "../data/site";

export const prerender = false;

export async function GET(context: { site: URL }) {
  const result = await getLiveCollection("articles");
  if (result.error) {
    return new Response("Published content is temporarily unavailable.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const articles = (result.entries ?? []).map((entry) => entry.data);

  const response = await rss({
    title: site.name,
    description: site.description,
    site: context.site,
    items: articles.map((article) => ({
      title: article.title,
      description: article.description,
      pubDate: new Date(article.publishedAt),
      link: `/articles/${article.slug}`,
    })),
  });
  response.headers.set(
    "Netlify-CDN-Cache-Control",
    "public, s-maxage=30, stale-while-revalidate=120, durable",
  );
  return response;
}
