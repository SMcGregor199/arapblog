import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const articles = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/articles" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    author: z.string(),
    contentType: z.enum(["bridge", "guide", "books"]),
    tags: z.array(z.string()),
    heroLabel: z.string(),
    heroAlt: z.string(),
    accent: z.enum(["clay", "lime", "violet"]).default("clay"),
    readTime: z.string(),
    draft: z.boolean().default(false),
    hasAffiliateLinks: z.boolean().default(false),
    featured: z.boolean().default(false),
  }),
});

export const collections = { articles };
