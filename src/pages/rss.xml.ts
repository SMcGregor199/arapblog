import rss from "@astrojs/rss";
import { site } from "../data/site";
import { getEditorialSnapshot } from "../lib/content/editorial";

export const prerender = false;

export async function GET(context: { site: URL }) {
  let editorial;
  try {
    editorial = await getEditorialSnapshot();
  } catch {
    return new Response("Published content is temporarily unavailable.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const response = await rss({
    title: site.name,
    description: site.description,
    site: context.site,
    items: [
      ...editorial.originals.map((article) => ({
        title: article.title,
        description: article.description,
        pubDate: new Date(article.publishedAt),
        link: `/articles/${article.slug}`,
      })),
      ...editorial.collections.map((collection) => ({
        title: collection.title,
        description: collection.description,
        pubDate: new Date(collection.publishedAt),
        link: `/collections/${collection.slug}`,
      })),
    ].sort((left, right) => right.pubDate.valueOf() - left.pubDate.valueOf()),
  });
  response.headers.set(
    "Netlify-CDN-Cache-Control",
    "public, s-maxage=30, stale-while-revalidate=120, durable",
  );
  return response;
}
