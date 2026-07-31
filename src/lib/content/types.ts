export const ORIGINAL_CATEGORIES = [
  "Criticism",
  "Essay",
  "Interview",
  "Reported Feature",
  "History",
  "Guide",
  "News Analysis",
] as const;
export const LEGACY_CONTENT_TYPES = ["bridge", "guide", "books"] as const;
export const CONTENT_TYPES = ORIGINAL_CATEGORIES;
export const ARTICLE_ACCENTS = ["clay", "lime", "violet"] as const;
export const SYNC_STATES = [
  "Draft",
  "Changes pending",
  "Queued",
  "Published",
  "Unpublish queued",
  "Failed",
] as const;

export type ContentType = (typeof ORIGINAL_CATEGORIES)[number];
export type LegacyContentType = (typeof LEGACY_CONTENT_TYPES)[number];
export type ArticleAccent = (typeof ARTICLE_ACCENTS)[number];
export type SyncState = (typeof SYNC_STATES)[number];

export interface Article {
  notionPageId: string;
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  author: string;
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
  heroImage?: {
    src: string;
    alt: string;
    credit?: string;
    creditUrl?: string;
  };
}

export type ArticleMetadata = Omit<Article, "bodyMarkdown">;

export interface ArticleSnapshot {
  schemaVersion: 1;
  articles: Article[];
}

export interface CuratedLink {
  id: string;
  title: string;
  canonicalUrl: string;
  writer: string;
  publication: string;
  publishedAt: string;
  editorialNote: string;
  topics: string[];
}

export interface CollectionSelection {
  kind: "original" | "curated";
  slug: string;
}

export interface EditorialCollection {
  slug: string;
  title: string;
  description: string;
  introduction: string;
  publishedAt: string;
  updatedAt: string;
  topics: string[];
  selections: CollectionSelection[];
}

export interface Contributor {
  notionPageId: string;
  displayName: string;
  slug: string;
  bio: string;
  role: string;
  links: Array<{ label: string; url: string }>;
}

export interface EditorialSnapshot {
  schemaVersion: 2;
  originals: Article[];
  curatedLinks: CuratedLink[];
  collections: EditorialCollection[];
  contributors: Contributor[];
}

export type StoredSnapshot = ArticleSnapshot | EditorialSnapshot;

export interface ArticleManifest {
  schemaVersion: 1 | 2;
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
