import { createHash } from "node:crypto";
import {
  ARTICLE_ACCENTS,
  PUBLICATION_TYPES,
  ContentError,
  type ArticleAccent,
  type LegacyArticle,
  type Publication,
  type PublicationMetadata,
  type PublicationType,
} from "./types";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugifyTitle(title: string): string {
  return title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 100).replace(/-+$/g, "");
}

export function assertValidSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!normalized || !SLUG_PATTERN.test(normalized)) {
    throw new ContentError("Slug must contain lowercase letters, numbers, and single hyphens only.", "VALIDATION");
  }
  return normalized;
}

export function calculateReadingTime(markdown: string): { readTimeMinutes: number; readTime: string } {
  const prose = markdown.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ").replace(/\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/<[^>]+>/g, " ").replace(/[#>*_~|[\]()-]/g, " ");
  const words = prose.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  const readTimeMinutes = Math.max(1, Math.ceil(words / 200));
  return { readTimeMinutes, readTime: `${readTimeMinutes} min` };
}

export function normalizePublication(value: Publication): Publication {
  const publicationType = normalizePublicationType(value.publicationType);
  const bodyMarkdown = requiredString(value.bodyMarkdown, "Publication body");
  const base = {
    notionPageId: requiredString(value.notionPageId, "Notion page ID"),
    publicationType,
    slug: assertValidSlug(value.slug),
    title: requiredString(value.title, "Name"),
    description: requiredString(value.description, "Description"),
    publishedAt: validDate(value.publishedAt, "Publication Date"),
    updatedAt: validDate(value.updatedAt, "Updated date"),
    contributor: optionalString(value.contributor) || "vestige",
    topics: normalizedStrings(value.topics),
    heroLabel: requiredString(value.heroLabel, "Hero Label"),
    heroAlt: requiredString(value.heroAlt, "Hero Alt"),
    accent: enumValue(value.accent, ARTICLE_ACCENTS, "Accent"),
    hasAffiliateLinks: Boolean(value.hasAffiliateLinks),
    featured: Boolean(value.featured),
    bodyMarkdown,
    ...(normalizeHeroImage(value.heroImage) ? { heroImage: normalizeHeroImage(value.heroImage) } : {}),
  };
  if (publicationType === "Essay" || publicationType === "Listening Guide") {
    return { ...base, publicationType, ...calculateReadingTime(bodyMarkdown) };
  }
  const selections = Array.isArray((value as { selections?: unknown }).selections)
    ? (value as { selections: Publication["publicationType"] extends never ? never : any[] }).selections.map(normalizeSelection)
    : [];
  return { ...base, publicationType, selections } as Publication;
}

export function publicationMetadata(publication: Publication): PublicationMetadata {
  const { bodyMarkdown: _bodyMarkdown, ...metadata } = publication;
  return metadata as PublicationMetadata;
}

export function sortPublications(values: Publication[]): Publication[] {
  return [...values].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.slug.localeCompare(b.slug));
}

export function assertUniquePublications(values: Publication[]): void {
  assertUnique(values.map((item) => item.slug), "publication slug");
  assertUnique(values.map((item) => item.notionPageId), "publication Notion page ID");
}

export function normalizePublicationType(value: unknown): PublicationType {
  if (typeof value !== "string") throw new ContentError("Publication Type is required.", "VALIDATION");
  const aliases: Record<string, PublicationType> = {
    essay: "Essay", roundup: "Roundup", collection: "Collection",
    "listening guide": "Listening Guide", guide: "Listening Guide",
    bridge: "Essay", books: "Essay", criticism: "Essay", interview: "Essay",
    "reported feature": "Essay", history: "Essay", "news analysis": "Essay",
  };
  const normalized = aliases[value.trim().toLowerCase()];
  if (!normalized || !PUBLICATION_TYPES.includes(normalized)) {
    throw new ContentError(`Publication Type must be one of: ${PUBLICATION_TYPES.join(", ")}.`, "VALIDATION");
  }
  return normalized;
}

export function legacyArticleToPublication(article: LegacyArticle): Publication {
  const type = normalizePublicationType(article.contentType);
  const publicationType = type === "Listening Guide" ? type : "Essay";
  return normalizePublication({
    ...article,
    publicationType,
    contributor: article.author,
    topics: article.tags,
  } as Publication);
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function normalizeSelection(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContentError("Selection is invalid.", "VALIDATION");
  }
  const selection = value as Record<string, unknown>;
  if (selection.kind !== "publication" && selection.kind !== "curatedPiece") {
    throw new ContentError("Selection kind must be publication or curatedPiece.", "VALIDATION");
  }
  return {
    notionPageId: requiredString(selection.notionPageId, "Selection Notion page ID"),
    kind: selection.kind,
    reference: assertValidSlug(requiredString(selection.reference, "Selection reference")),
  };
}

function normalizeHeroImage(value: unknown) {
  if (!value) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new ContentError("Hero image is invalid.", "VALIDATION");
  const image = value as Record<string, unknown>;
  return {
    src: requiredUrl(image.src, "Hero image URL"),
    alt: requiredString(image.alt, "Hero image alt text"),
    ...(optionalString(image.credit) ? { credit: optionalString(image.credit) } : {}),
    ...(optionalString(image.creditUrl) ? { creditUrl: requiredUrl(image.creditUrl, "Hero credit URL") } : {}),
  };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ContentError(`${label} is required.`, "VALIDATION");
  return value.trim();
}
function optionalString(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function validDate(value: unknown, label: string): string {
  const date = requiredString(value, label);
  if (!Number.isFinite(Date.parse(date))) throw new ContentError(`${label} must be a valid date.`, "VALIDATION");
  return new Date(date).toISOString();
}
function requiredUrl(value: unknown, label: string): string {
  const url = requiredString(value, label);
  try { const parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(); return parsed.toString(); }
  catch { throw new ContentError(`${label} must be an HTTP URL.`, "VALIDATION"); }
}
function normalizedStrings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new ContentError("Topics must be an array.", "VALIDATION");
  return [...new Set(value.map((item) => requiredString(item, "Topic")))];
}
function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (!allowed.includes(value as T)) throw new ContentError(`${label} must be one of: ${allowed.join(", ")}.`, "VALIDATION");
  return value as T;
}
function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new ContentError(`Editorial snapshot contains a duplicate ${label}.`, "VALIDATION");
}
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

// Compatibility exports for the v1/v2 synchronization code during rollback.
export const normalizeArticle = normalizePublication;
export const articleMetadata = publicationMetadata;
export const sortArticles = sortPublications;
export const assertUniqueArticles = assertUniquePublications;
export const normalizeContentType = normalizePublicationType;
export function isArticleAccent(value: unknown): value is ArticleAccent { return ARTICLE_ACCENTS.includes(value as ArticleAccent); }
