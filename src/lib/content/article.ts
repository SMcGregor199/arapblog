import { createHash } from "node:crypto";
import {
  ARTICLE_ACCENTS,
  CONTENT_TYPES,
  ContentError,
  type Article,
  type ArticleAccent,
  type ArticleMetadata,
  type ContentType,
} from "./types";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifyTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
}

export function assertValidSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!normalized || !SLUG_PATTERN.test(normalized)) {
    throw new ContentError(
      "Slug must contain lowercase letters, numbers, and single hyphens only.",
      "VALIDATION",
    );
  }
  return normalized;
}

export function calculateReadingTime(markdown: string): {
  readTimeMinutes: number;
  readTime: string;
} {
  const prose = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_~|[\]()-]/g, " ");
  const words = prose.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  const readTimeMinutes = Math.max(1, Math.ceil(words / 200));
  return { readTimeMinutes, readTime: `${readTimeMinutes} min` };
}

export function normalizeArticle(value: Article): Article {
  const article: Article = {
    notionPageId: requiredString(value.notionPageId, "Notion page ID"),
    slug: assertValidSlug(value.slug),
    title: requiredString(value.title, "Name"),
    description: requiredString(value.description, "Description"),
    publishedAt: validDate(value.publishedAt, "Publication Date"),
    updatedAt: validDate(value.updatedAt, "Updated date"),
    author: "vestige",
    contentType: enumValue(value.contentType, CONTENT_TYPES, "Content Type"),
    tags: [...new Set(value.tags.map((tag) => tag.trim()).filter(Boolean))],
    heroLabel: requiredString(value.heroLabel, "Hero Label"),
    heroAlt: requiredString(value.heroAlt, "Hero Alt"),
    accent: enumValue(value.accent, ARTICLE_ACCENTS, "Accent"),
    hasAffiliateLinks: Boolean(value.hasAffiliateLinks),
    featured: Boolean(value.featured),
    readTimeMinutes: value.readTimeMinutes,
    readTime: value.readTime,
    bodyMarkdown: value.bodyMarkdown.trim(),
  };

  if (!article.bodyMarkdown) {
    throw new ContentError("Article body cannot be empty.", "VALIDATION");
  }

  const readingTime = calculateReadingTime(article.bodyMarkdown);
  article.readTimeMinutes = readingTime.readTimeMinutes;
  article.readTime = readingTime.readTime;
  return article;
}

export function articleMetadata(article: Article): ArticleMetadata {
  const { bodyMarkdown: _bodyMarkdown, ...metadata } = article;
  return metadata;
}

export function sortArticles(articles: Article[]): Article[] {
  return [...articles].sort((left, right) => {
    const dateOrder = Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
    return dateOrder || left.slug.localeCompare(right.slug);
  });
}

export function assertUniqueArticles(articles: Article[]): void {
  const slugs = new Map<string, string>();
  const pageIds = new Set<string>();

  for (const article of articles) {
    const duplicatePage = pageIds.has(article.notionPageId);
    if (duplicatePage) {
      throw new ContentError(
        `Notion page ${article.notionPageId} appears more than once in the snapshot.`,
        "VALIDATION",
      );
    }
    pageIds.add(article.notionPageId);

    const priorPage = slugs.get(article.slug);
    if (priorPage && priorPage !== article.notionPageId) {
      throw new ContentError(
        `Slug "${article.slug}" is already used by another article.`,
        "VALIDATION",
      );
    }
    slugs.set(article.slug, article.notionPageId);
  }
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ContentError(`${label} is required.`, "VALIDATION");
  }
  return value.trim();
}

function validDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new ContentError(`${label} must be a valid date.`, "VALIDATION");
  }
  return new Date(value).toISOString();
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  supported: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !supported.includes(value)) {
    throw new ContentError(
      `${label} must be one of: ${supported.join(", ")}.`,
      "VALIDATION",
    );
  }
  return value as T[number];
}

export function isContentType(value: string): value is ContentType {
  return CONTENT_TYPES.includes(value as ContentType);
}

export function isArticleAccent(value: string): value is ArticleAccent {
  return ARTICLE_ACCENTS.includes(value as ArticleAccent);
}
