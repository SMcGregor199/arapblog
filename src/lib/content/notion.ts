import {
  Client,
  isFullPage,
  type PageObjectResponse,
  type UpdatePageParameters,
} from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import { serverEnvironment } from "./environment";
import {
  calculateReadingTime,
  isArticleAccent,
  normalizeContentType,
  normalizeArticle,
  slugifyTitle,
} from "./article";
import {
  notionImageAlt,
  notionImageUrl,
  prewarmImage,
  publicImageUrl,
  registerImageSource,
  stableImageId,
} from "./images";
import type { ContentStorage } from "./storage";
import {
  ContentError,
  SYNC_STATES,
  type Article,
  type ArticleAccent,
  type ContentType,
  type SyncState,
} from "./types";

export const NOTION_PROPERTIES = {
  title: "Name",
  slug: "Slug",
  description: "Description",
  contentType: "Content Type",
  contributor: "Contributor Slug",
  tags: "Tags",
  heroLabel: "Hero Label",
  heroAlt: "Hero Alt",
  accent: "Accent",
  hasAffiliateLinks: "Has Affiliate Links",
  featured: "Featured",
  heroImageSource: "Hero Image Source",
  heroImageAlt: "Hero Image Alt",
  heroImageCredit: "Hero Image Credit",
  heroImageCreditUrl: "Hero Image Credit URL",
  published: "Published",
  publicationDate: "Publication Date",
  syncState: "Sync State",
  syncError: "Sync Error",
  lastSyncedAt: "Last Synced At",
} as const;

export interface NotionArticleMetadata {
  notionPageId: string;
  title: string;
  slug: string;
  description: string;
  contentType: ContentType;
  contributor: string;
  tags: string[];
  heroLabel: string;
  heroAlt: string;
  accent: ArticleAccent;
  hasAffiliateLinks: boolean;
  featured: boolean;
  heroImageSource: string;
  heroImageAlt: string;
  heroImageCredit: string;
  heroImageCreditUrl: string;
  published: boolean;
  publicationDate: string;
  syncState: SyncState;
  createdAt: string;
  lastEditedAt: string;
}

export interface NotionSyncStatus {
  published: boolean;
  syncState: SyncState;
}

export interface NotionArticleSourceOptions {
  notion?: Client;
  storage: ContentStorage;
  databaseId?: string;
  now?: () => Date;
  prewarmImages?: boolean;
  persistImages?: boolean;
}

export class NotionArticleSource {
  readonly notion: Client;
  private readonly storage: ContentStorage;
  private readonly databaseId: string;
  private readonly now: () => Date;
  private readonly prewarmImages: boolean;
  private readonly persistImages: boolean;
  private dataSourceId?: string;

  constructor(options: NotionArticleSourceOptions) {
    this.notion =
      options.notion ??
      new Client({
        auth: requiredEnvironment("NOTION_API_KEY"),
        notionVersion: "2025-09-03",
      });
    this.storage = options.storage;
    this.databaseId =
      options.databaseId ?? requiredEnvironment("NOTION_DATABASE_ID");
    this.now = options.now ?? (() => new Date());
    this.prewarmImages = options.prewarmImages ?? true;
    this.persistImages = options.persistImages ?? true;
  }

  async queryPages(): Promise<PageObjectResponse[]> {
    const dataSourceId = await this.resolveDataSourceId();
    const pages: PageObjectResponse[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.notion.dataSources.query({
        data_source_id: dataSourceId,
        page_size: 100,
        start_cursor: cursor,
      });
      pages.push(...response.results.filter(isFullPage));
      cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
    } while (cursor);

    return pages;
  }

  async retrievePage(pageId: string): Promise<PageObjectResponse> {
    const page = await this.notion.pages.retrieve({ page_id: pageId });
    if (!isFullPage(page)) {
      throw new ContentError(`Notion page ${pageId} could not be retrieved.`, "NOT_FOUND");
    }
    return page;
  }

  async belongsToArticleDatabase(page: PageObjectResponse): Promise<boolean> {
    const expected = normalizeNotionId(await this.resolveDataSourceId());
    const parent = page.parent as unknown as Record<string, unknown>;
    const actual =
      stringValue(parent.data_source_id) ||
      stringValue(parent.database_id) ||
      stringValue(parent.id);
    return normalizeNotionId(actual) === expected;
  }

  parseMetadata(page: PageObjectResponse): NotionArticleMetadata {
    const properties = page.properties;
    const title = titleValue(properties[NOTION_PROPERTIES.title]);
    const contentTypeValue = selectValue(properties[NOTION_PROPERTIES.contentType]);
    const accentValue = selectValue(properties[NOTION_PROPERTIES.accent]);
    const syncStateValue =
      selectValue(properties[NOTION_PROPERTIES.syncState]) || "Draft";

    if (!title) {
      throw new ContentError("Name is required.", "VALIDATION");
    }
    const contentType = normalizeContentType(contentTypeValue);
    if (!isArticleAccent(accentValue)) {
      throw new ContentError(
        `Accent must be one of: clay, lime, violet.`,
        "VALIDATION",
      );
    }
    if (!SYNC_STATES.includes(syncStateValue as SyncState)) {
      throw new ContentError(`Unsupported Sync State "${syncStateValue}".`, "VALIDATION");
    }

    const description = richTextValue(properties[NOTION_PROPERTIES.description]);
    const heroLabel = richTextValue(properties[NOTION_PROPERTIES.heroLabel]);
    const heroAlt = richTextValue(properties[NOTION_PROPERTIES.heroAlt]);
    if (!description) {
      throw new ContentError("Description is required.", "VALIDATION");
    }
    if (!heroLabel) {
      throw new ContentError("Hero Label is required.", "VALIDATION");
    }
    if (!heroAlt) {
      throw new ContentError("Hero Alt is required.", "VALIDATION");
    }

    return {
      notionPageId: page.id,
      title,
      slug: richTextValue(properties[NOTION_PROPERTIES.slug]),
      description,
      contentType,
      contributor:
        richTextValue(properties[NOTION_PROPERTIES.contributor]) || "vestige",
      tags: multiSelectValue(properties[NOTION_PROPERTIES.tags]),
      heroLabel,
      heroAlt,
      accent: accentValue,
      hasAffiliateLinks: checkboxValue(
        properties[NOTION_PROPERTIES.hasAffiliateLinks],
      ),
      featured: checkboxValue(properties[NOTION_PROPERTIES.featured]),
      heroImageSource: urlValue(properties[NOTION_PROPERTIES.heroImageSource]),
      heroImageAlt: richTextValue(properties[NOTION_PROPERTIES.heroImageAlt]),
      heroImageCredit: richTextValue(properties[NOTION_PROPERTIES.heroImageCredit]),
      heroImageCreditUrl: urlValue(
        properties[NOTION_PROPERTIES.heroImageCreditUrl],
      ),
      published: checkboxValue(properties[NOTION_PROPERTIES.published]),
      publicationDate: dateValue(properties[NOTION_PROPERTIES.publicationDate]),
      syncState: syncStateValue as SyncState,
      createdAt: page.created_time,
      lastEditedAt: page.last_edited_time,
    };
  }

  readSyncStatus(page: PageObjectResponse): NotionSyncStatus {
    const syncStateValue =
      selectValue(page.properties[NOTION_PROPERTIES.syncState]) || "Draft";
    if (!SYNC_STATES.includes(syncStateValue as SyncState)) {
      throw new ContentError(`Unsupported Sync State "${syncStateValue}".`, "VALIDATION");
    }
    return {
      published: checkboxValue(page.properties[NOTION_PROPERTIES.published]),
      syncState: syncStateValue as SyncState,
    };
  }

  async articleFromPage(
    page: PageObjectResponse,
    options: { stableSlug?: string; publishedAt?: string } = {},
  ): Promise<Article> {
    const metadata = this.parseMetadata(page);
    const requestedSlug = metadata.slug || slugifyTitle(metadata.title);
    const slug = options.stableSlug || requestedSlug;
    if (options.stableSlug && metadata.slug && metadata.slug !== options.stableSlug) {
      throw new ContentError(
        `Slug is immutable after publication. Restore "${options.stableSlug}" before publishing.`,
        "VALIDATION",
      );
    }
    if (!slug) {
      throw new ContentError("A slug could not be generated from Name.", "VALIDATION");
    }

    const bodyMarkdown = await this.pageMarkdown(page.id);
    const readingTime = calculateReadingTime(bodyMarkdown);
    const publishedAt =
      options.publishedAt ||
      metadata.publicationDate ||
      this.now().toISOString();

    return normalizeArticle({
      notionPageId: page.id,
      slug,
      title: metadata.title,
      description: metadata.description,
      publishedAt,
      updatedAt: this.now().toISOString(),
      author: metadata.contributor,
      contentType: metadata.contentType,
      tags: metadata.tags,
      heroLabel: metadata.heroLabel,
      heroAlt: metadata.heroAlt,
      accent: metadata.accent,
      hasAffiliateLinks: metadata.hasAffiliateLinks,
      featured: metadata.featured,
      ...(metadata.heroImageSource
        ? {
            heroImage: {
              src: metadata.heroImageSource,
              alt: metadata.heroImageAlt,
              ...(metadata.heroImageCredit
                ? { credit: metadata.heroImageCredit }
                : {}),
              ...(metadata.heroImageCreditUrl
                ? { creditUrl: metadata.heroImageCreditUrl }
                : {}),
            },
          }
        : {}),
      ...readingTime,
      bodyMarkdown,
    });
  }

  async previewArticles(includeDrafts = true): Promise<Article[]> {
    const pages = await this.queryPages();
    const selected = includeDrafts
      ? pages
      : pages.filter((page) => this.parseMetadata(page).published);
    return Promise.all(
      selected.map((page) =>
        this.articleFromPage(page, {
          publishedAt:
            dateValue(page.properties[NOTION_PROPERTIES.publicationDate]) ||
            page.created_time,
        }),
      ),
    );
  }

  async markChangesPending(pageId: string): Promise<void> {
    await this.updateProperties(pageId, {
      [NOTION_PROPERTIES.syncState]: selectProperty("Changes pending"),
    });
  }

  async markPublished(article: Article): Promise<void> {
    await this.updateProperties(article.notionPageId, {
      [NOTION_PROPERTIES.slug]: richTextProperty(article.slug),
      [NOTION_PROPERTIES.published]: { checkbox: true },
      [NOTION_PROPERTIES.publicationDate]: dateProperty(article.publishedAt),
      [NOTION_PROPERTIES.syncState]: selectProperty("Published"),
      [NOTION_PROPERTIES.syncError]: richTextProperty(""),
      [NOTION_PROPERTIES.lastSyncedAt]: dateProperty(this.now().toISOString()),
    });
  }

  async markUnpublished(pageId: string): Promise<void> {
    await this.updateProperties(pageId, {
      [NOTION_PROPERTIES.published]: { checkbox: false },
      [NOTION_PROPERTIES.syncState]: selectProperty("Draft"),
      [NOTION_PROPERTIES.syncError]: richTextProperty(""),
      [NOTION_PROPERTIES.lastSyncedAt]: dateProperty(this.now().toISOString()),
    });
  }

  async markFailed(pageId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.updateProperties(pageId, {
      [NOTION_PROPERTIES.syncState]: selectProperty("Failed"),
      [NOTION_PROPERTIES.syncError]: richTextProperty(message.slice(0, 1900)),
    });
  }

  private async pageMarkdown(pageId: string): Promise<string> {
    const converter = new NotionToMarkdown({
      notionClient: this.notion,
      config: { parseChildPages: false },
    });
    converter.setCustomTransformer("image", async (block) => {
      const sourceUrl = notionImageUrl(block);
      if (!sourceUrl) {
        throw new ContentError(
          `Image block ${block.id} has no usable source URL.`,
          "VALIDATION",
        );
      }
      const imageId = stableImageId(block.id, sourceUrl);
      if (this.persistImages) {
        const source = await registerImageSource(
          this.storage,
          imageId,
          sourceUrl,
          { kind: "block-image", blockId: block.id },
        );
        if (this.prewarmImages) {
          await prewarmImage(imageId, sourceUrl, source.sourceFingerprint);
        }
      }
      return `![${escapeMarkdownText(notionImageAlt(block))}](${publicImageUrl(imageId)})`;
    });

    const blocks = await converter.pageToMarkdown(pageId);
    return (converter.toMarkdownString(blocks).parent ?? "").trim();
  }

  private async resolveDataSourceId(): Promise<string> {
    if (this.dataSourceId) return this.dataSourceId;
    const normalizedDatabaseId = this.databaseId.replace(/^collection:\/\//, "");
    try {
      const database = await this.notion.databases.retrieve({
        database_id: normalizedDatabaseId,
      });
      const dataSources = (database as unknown as { data_sources?: { id: string }[] })
        .data_sources;
      this.dataSourceId = dataSources?.[0]?.id || normalizedDatabaseId;
    } catch {
      this.dataSourceId = normalizedDatabaseId;
    }
    return this.dataSourceId;
  }

  private async updateProperties(
    pageId: string,
    properties: Record<string, unknown>,
  ): Promise<void> {
    await this.notion.pages.update({
      page_id: pageId,
      properties: properties as UpdatePageParameters["properties"],
    });
  }
}

export function createNotionArticleSource(
  storage: ContentStorage,
  options: Omit<NotionArticleSourceOptions, "storage"> = {},
): NotionArticleSource {
  return new NotionArticleSource({ ...options, storage });
}

function requiredEnvironment(name: string): string {
  const value = serverEnvironment(name);
  if (!value) {
    throw new ContentError(`${name} is not configured.`, "CONFIGURATION");
  }
  return value;
}

function propertyRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function titleValue(value: unknown): string {
  return plainText(propertyRecord(value).title);
}

function richTextValue(value: unknown): string {
  return plainText(propertyRecord(value).rich_text);
}

function plainText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => stringValue(propertyRecord(item).plain_text))
    .join("")
    .trim();
}

function selectValue(value: unknown): string {
  const property = propertyRecord(value);
  const selected =
    property.type === "status"
      ? propertyRecord(property.status)
      : propertyRecord(property.select);
  return stringValue(selected.name);
}

function multiSelectValue(value: unknown): string[] {
  const values = propertyRecord(value).multi_select;
  if (!Array.isArray(values)) return [];
  return values.map((item) => stringValue(propertyRecord(item).name)).filter(Boolean);
}

function checkboxValue(value: unknown): boolean {
  return propertyRecord(value).checkbox === true;
}

function dateValue(value: unknown): string {
  return stringValue(propertyRecord(propertyRecord(value).date).start);
}

function urlValue(value: unknown): string {
  return stringValue(propertyRecord(value).url);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNotionId(value: string): string {
  return value.replaceAll("-", "").toLowerCase();
}

function richTextProperty(value: string): {
  rich_text: Array<{ type: "text"; text: { content: string } }>;
} {
  return {
    rich_text: value
      ? [{ type: "text", text: { content: value } }]
      : [],
  };
}

function selectProperty(value: SyncState): { select: { name: SyncState } } {
  return { select: { name: value } };
}

function dateProperty(value: string): { date: { start: string } } {
  return { date: { start: value } };
}

function escapeMarkdownText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}
