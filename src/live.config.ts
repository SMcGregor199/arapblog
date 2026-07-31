import { defineLiveCollection } from "astro:content";
import { z } from "astro/zod";
import { articleLiveLoader } from "./lib/content/repository";

const articles = defineLiveCollection({
  loader: articleLiveLoader(),
  schema: z.object({
    notionPageId: z.string(),
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    publishedAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    author: z.string(),
    contentType: z.enum([
      "Criticism",
      "Essay",
      "Interview",
      "Reported Feature",
      "History",
      "Guide",
      "News Analysis",
    ]),
    tags: z.array(z.string()),
    heroLabel: z.string(),
    heroAlt: z.string(),
    accent: z.enum(["clay", "lime", "violet"]),
    hasAffiliateLinks: z.boolean(),
    featured: z.boolean(),
    readTimeMinutes: z.number().int().min(1),
    readTime: z.string(),
    bodyMarkdown: z.string().min(1),
    heroImage: z.object({
      src: z.string(),
      alt: z.string(),
      credit: z.string().optional(),
      creditUrl: z.string().optional(),
    }).optional(),
  }),
});

export const collections = { articles };
