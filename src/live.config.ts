import { defineLiveCollection } from "astro:content";
import { z } from "astro/zod";
import { articleLiveLoader } from "./lib/content/repository";

const publications=defineLiveCollection({loader:articleLiveLoader(),schema:z.object({
  notionPageId:z.string(),publicationType:z.enum(["Essay","Roundup","Collection","Listening Guide"]),slug:z.string(),title:z.string(),description:z.string(),publishedAt:z.iso.datetime(),updatedAt:z.iso.datetime(),contributor:z.string(),topics:z.array(z.string()),heroLabel:z.string(),heroAlt:z.string(),accent:z.enum(["clay","lime","violet"]),hasAffiliateLinks:z.boolean(),featured:z.boolean(),bodyMarkdown:z.string(),readTimeMinutes:z.number().optional(),readTime:z.string().optional(),selections:z.array(z.object({notionPageId:z.string(),kind:z.enum(["publication","curatedPiece"]),reference:z.string()})).optional(),heroImage:z.object({src:z.string(),alt:z.string(),credit:z.string().optional(),creditUrl:z.string().optional()}).optional(),
})});
export const collections={publications};
