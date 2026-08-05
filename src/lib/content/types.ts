export const PUBLICATION_TYPES = [
  "Essay",
  "Roundup",
  "Collection",
  "Listening Guide",
] as const;
export const ARTICLE_ACCENTS = ["clay", "lime", "violet"] as const;
export const SYNC_STATES = [
  "Draft",
  "Changes pending",
  "Queued",
  "Published",
  "Unpublish queued",
  "Failed",
] as const;
export const NEWSLETTER_STATES = ["Draft", "Ready", "Processing", "Sent", "Failed"] as const;

export type PublicationType = (typeof PUBLICATION_TYPES)[number];
export type ArticleAccent = (typeof ARTICLE_ACCENTS)[number];
export type SyncState = (typeof SYNC_STATES)[number];
export type NewsletterState = (typeof NEWSLETTER_STATES)[number];

export interface HeroImage {
  src: string;
  alt: string;
  credit?: string;
  creditUrl?: string;
}

export interface PublicationBase {
  notionPageId: string;
  publicationType: PublicationType;
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  contributor: string;
  topics: string[];
  heroLabel: string;
  heroAlt: string;
  accent: ArticleAccent;
  hasAffiliateLinks: boolean;
  featured: boolean;
  bodyMarkdown: string;
  heroImage?: HeroImage;
}

export interface EssayPublication extends PublicationBase {
  publicationType: "Essay";
  readTimeMinutes: number;
  readTime: string;
}

export interface ListeningGuidePublication extends PublicationBase {
  publicationType: "Listening Guide";
  readTimeMinutes: number;
  readTime: string;
}

export interface CuratedPiece {
  notionPageId: string;
  id: string;
  title: string;
  canonicalUrl: string;
  writer: string;
  sourcePublication: string;
  originalDate: string;
  topics: string[];
  annotation: string;
}

export interface CuratedPieceSelection {
  notionPageId: string;
  kind: "curatedPiece";
  reference: string;
}

export interface PublicationSelection {
  notionPageId: string;
  kind: "publication";
  reference: string;
}

export type SelectionReference = CuratedPieceSelection | PublicationSelection;

export interface RoundupPublication extends PublicationBase {
  publicationType: "Roundup";
  selections: CuratedPieceSelection[];
}

export interface CollectionPublication extends PublicationBase {
  publicationType: "Collection";
  selections: SelectionReference[];
}

export type Publication =
  | EssayPublication
  | RoundupPublication
  | CollectionPublication
  | ListeningGuidePublication;

export type PublicationMetadata = Omit<Publication, "bodyMarkdown">;

export interface Contributor {
  notionPageId: string;
  displayName: string;
  slug: string;
  bio: string;
  role: string;
  links: Array<{ label: string; url: string }>;
}

export interface NewsletterIssue {
  notionPageId: string;
  coverageMonth: string;
  subject: string;
  previewText: string;
  editorNoteMarkdown: string;
  sentAt: string;
  contentHash: string;
  archiveState: "Sent";
  publications: string[];
  html: string;
}

export interface EditorialSnapshot {
  schemaVersion: 3;
  publications: Publication[];
  curatedPieces: CuratedPiece[];
  contributors: Contributor[];
  newsletterIssues: NewsletterIssue[];
}

// Read-only legacy contracts retained so a previous Blob version can be restored.
export interface LegacyArticle {
  notionPageId: string;
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  author: string;
  contentType: string;
  tags: string[];
  heroLabel: string;
  heroAlt: string;
  accent: ArticleAccent;
  hasAffiliateLinks: boolean;
  featured: boolean;
  readTimeMinutes: number;
  readTime: string;
  bodyMarkdown: string;
  heroImage?: HeroImage;
}

export interface ArticleSnapshot { schemaVersion: 1; articles: LegacyArticle[] }
export interface LegacyEditorialSnapshot {
  schemaVersion: 2;
  originals: LegacyArticle[];
  curatedLinks: Array<{
    id: string; title: string; canonicalUrl: string; writer: string;
    publication: string; publishedAt: string; editorialNote: string; topics: string[];
  }>;
  collections: Array<{
    slug: string; title: string; description: string; introduction: string;
    publishedAt: string; updatedAt: string; topics: string[];
    selections: Array<{ kind: "original" | "curated"; slug: string }>;
  }>;
  contributors: Contributor[];
}

export type StoredSnapshot = ArticleSnapshot | LegacyEditorialSnapshot | EditorialSnapshot;

export interface PublicationManifest {
  schemaVersion: 1 | 2 | 3;
  activeVersion: string;
  generatedAt: string;
  publications: PublicationMetadata[];
  /** @deprecated compatibility metadata for legacy consumers. */
  articles?: Array<Omit<LegacyArticle, "bodyMarkdown">>;
}
export type ArticleManifest = PublicationManifest;
export interface ManifestRead { manifest: PublicationManifest | null; etag?: string }

export type ContentErrorCode = "CONFIGURATION" | "CONFLICT" | "NOT_FOUND" | "UNAVAILABLE" | "VALIDATION";

export class ContentError extends Error {
  constructor(message: string, public readonly code: ContentErrorCode, options?: ErrorOptions) {
    super(message, options);
    this.name = "ContentError";
  }
}

export interface PublicationRepository {
  listPublications(): Promise<Publication[]>;
  getPublicationBySlug(slug: string): Promise<Publication | undefined>;
}

// Compatibility alias used by the v1/v2 synchronization tests and rollback path.
export type Article = Publication;
// Compatibility alias for legacy imports.
export type ContentType = PublicationType;
// Compatibility alias for legacy imports.
export type ArticleMetadata = PublicationMetadata;
// Compatibility alias for legacy imports.
export type CuratedLink = CuratedPiece;
// Compatibility alias for legacy imports.
export type EditorialCollection = CollectionPublication;
// Compatibility repository shape used by Astro's live loader.
export interface ArticleRepository {
  listArticles(options?: { includeDrafts?: boolean }): Promise<Publication[]>;
  getArticleBySlug(slug: string, options?: { includeDrafts?: boolean }): Promise<Publication | undefined>;
}
