export const CONTENT_TYPES = ["bridge", "guide", "books"] as const;
export const ARTICLE_ACCENTS = ["clay", "lime", "violet"] as const;
export const SYNC_STATES = [
  "Draft",
  "Changes pending",
  "Queued",
  "Published",
  "Unpublish queued",
  "Failed",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];
export type ArticleAccent = (typeof ARTICLE_ACCENTS)[number];
export type SyncState = (typeof SYNC_STATES)[number];

export interface Article {
  notionPageId: string;
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  author: "vestige";
  contentType: ContentType;
  tags: string[];
  heroLabel: string;
  heroAlt: string;
  accent: ArticleAccent;
  hasAffiliateLinks: boolean;
  featured: boolean;
  readTimeMinutes: number;
  readTime: string;
  bodyMarkdown: string;
}

export type ArticleMetadata = Omit<Article, "bodyMarkdown">;

export interface ArticleSnapshot {
  schemaVersion: 1;
  articles: Article[];
}

export interface ArticleManifest {
  schemaVersion: 1;
  activeVersion: string;
  generatedAt: string;
  articles: ArticleMetadata[];
}

export interface ManifestRead {
  manifest: ArticleManifest | null;
  etag?: string;
}

export type ContentErrorCode =
  | "CONFIGURATION"
  | "CONFLICT"
  | "NOT_FOUND"
  | "UNAVAILABLE"
  | "VALIDATION";

export class ContentError extends Error {
  constructor(
    message: string,
    public readonly code: ContentErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ContentError";
  }
}

export interface ArticleRepository {
  listArticles(options?: { includeDrafts?: boolean }): Promise<Article[]>;
  getArticleBySlug(
    slug: string,
    options?: { includeDrafts?: boolean },
  ): Promise<Article | undefined>;
}
