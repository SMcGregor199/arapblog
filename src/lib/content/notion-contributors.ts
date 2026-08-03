import {
  Client,
  isFullPage,
  type PageObjectResponse,
  type UpdatePageParameters,
} from "@notionhq/client";
import { serverEnvironment } from "./environment";
import { ContentError, SYNC_STATES, type Contributor, type SyncState } from "./types";

export const CONTRIBUTOR_PROPERTIES = {
  displayName: "Name",
  slug: "Slug",
  bio: "Bio",
  role: "Role",
  linksJson: "Links JSON",
  website: "Website",
  bluesky: "Bluesky",
  instagram: "Instagram",
  published: "Published",
  syncState: "Sync State",
  syncError: "Sync Error",
  lastSyncedAt: "Last Synced At",
} as const;

export interface NotionContributorMetadata {
  notionPageId: string;
  displayName: string;
  slug: string;
  bio: string;
  role: string;
  links: Contributor["links"];
  published: boolean;
  syncState: SyncState;
}

export class NotionContributorSource {
  readonly notion: Client;
  private dataSourceId?: string;

  constructor(
    notion?: Client,
    private readonly databaseId = requiredEnvironment(
      "NOTION_CONTRIBUTORS_DATABASE_ID",
    ),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.notion = notion ?? new Client({
      auth: requiredEnvironment("NOTION_API_KEY"),
      notionVersion: "2025-09-03",
    });
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
      cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (cursor);
    return pages;
  }

  async retrievePage(pageId: string): Promise<PageObjectResponse> {
    const page = await this.notion.pages.retrieve({ page_id: pageId });
    if (!isFullPage(page)) {
      throw new ContentError(`Contributor ${pageId} could not be retrieved.`, "NOT_FOUND");
    }
    return page;
  }

  async belongsToDatabase(page: PageObjectResponse): Promise<boolean> {
    const expected = normalizeNotionId(await this.resolveDataSourceId());
    const parent = record(page.parent);
    const actual = text(parent.data_source_id) || text(parent.database_id) || text(parent.id);
    return normalizeNotionId(actual) === expected;
  }

  parseMetadata(page: PageObjectResponse): NotionContributorMetadata {
    const properties = page.properties;
    const displayName = title(properties[CONTRIBUTOR_PROPERTIES.displayName]);
    const bio = richText(properties[CONTRIBUTOR_PROPERTIES.bio]);
    const role = select(properties[CONTRIBUTOR_PROPERTIES.role]);
    const syncState = select(properties[CONTRIBUTOR_PROPERTIES.syncState]) || "Draft";
    if (!displayName || !bio || !role) {
      throw new ContentError("Contributor Name, Bio, and Role are required.", "VALIDATION");
    }
    if (!SYNC_STATES.includes(syncState as SyncState)) {
      throw new ContentError(`Unsupported Sync State "${syncState}".`, "VALIDATION");
    }
    const links = linksFromProperties(properties);
    return {
      notionPageId: page.id,
      displayName,
      slug: richText(properties[CONTRIBUTOR_PROPERTIES.slug]),
      bio,
      role,
      links,
      published: record(properties[CONTRIBUTOR_PROPERTIES.published]).checkbox === true,
      syncState: syncState as SyncState,
    };
  }

  contributorFromPage(
    page: PageObjectResponse,
    stableSlug?: string,
  ): Contributor {
    const metadata = this.parseMetadata(page);
    const requested = metadata.slug || slugify(metadata.displayName);
    if (stableSlug && metadata.slug && metadata.slug !== stableSlug) {
      throw new ContentError(
        `Contributor slug is immutable after publication. Restore "${stableSlug}" before publishing.`,
        "VALIDATION",
      );
    }
    const slug = stableSlug || requested;
    if (!slug) throw new ContentError("Contributor Slug is required.", "VALIDATION");
    return {
      notionPageId: page.id,
      displayName: metadata.displayName,
      slug,
      bio: metadata.bio,
      role: metadata.role,
      links: metadata.links,
    };
  }

  readSyncStatus(page: PageObjectResponse): { published: boolean; syncState: SyncState } {
    const metadata = this.parseMetadata(page);
    return { published: metadata.published, syncState: metadata.syncState };
  }

  async markPublished(contributor: Contributor): Promise<void> {
    await this.update(contributor.notionPageId, {
      [CONTRIBUTOR_PROPERTIES.slug]: richTextProperty(contributor.slug),
      [CONTRIBUTOR_PROPERTIES.published]: { checkbox: true },
      [CONTRIBUTOR_PROPERTIES.syncState]: selectProperty("Published"),
      [CONTRIBUTOR_PROPERTIES.syncError]: richTextProperty(""),
      [CONTRIBUTOR_PROPERTIES.lastSyncedAt]: dateProperty(this.now().toISOString()),
    });
  }

  async markUnpublished(pageId: string): Promise<void> {
    await this.update(pageId, {
      [CONTRIBUTOR_PROPERTIES.published]: { checkbox: false },
      [CONTRIBUTOR_PROPERTIES.syncState]: selectProperty("Draft"),
      [CONTRIBUTOR_PROPERTIES.syncError]: richTextProperty(""),
      [CONTRIBUTOR_PROPERTIES.lastSyncedAt]: dateProperty(this.now().toISOString()),
    });
  }

  async markChangesPending(pageId: string): Promise<void> {
    await this.update(pageId, {
      [CONTRIBUTOR_PROPERTIES.syncState]: selectProperty("Changes pending"),
    });
  }

  async markFailed(pageId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.update(pageId, {
      [CONTRIBUTOR_PROPERTIES.syncState]: selectProperty("Failed"),
      [CONTRIBUTOR_PROPERTIES.syncError]: richTextProperty(message.slice(0, 1900)),
    });
  }

  private async resolveDataSourceId(): Promise<string> {
    if (this.dataSourceId) return this.dataSourceId;
    const databaseId = this.databaseId.replace(/^collection:\/\//, "");
    try {
      const database = await this.notion.databases.retrieve({ database_id: databaseId });
      this.dataSourceId = (database as unknown as { data_sources?: { id: string }[] })
        .data_sources?.[0]?.id || databaseId;
    } catch {
      this.dataSourceId = databaseId;
    }
    return this.dataSourceId;
  }

  private async update(pageId: string, properties: Record<string, unknown>): Promise<void> {
    await this.notion.pages.update({
      page_id: pageId,
      properties: properties as UpdatePageParameters["properties"],
    });
  }
}

function requiredEnvironment(name: string): string {
  const value = serverEnvironment(name);
  if (!value) throw new ContentError(`${name} is not configured.`, "CONFIGURATION");
  return value;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function plainText(value: unknown): string {
  return Array.isArray(value)
    ? value.map((item) => text(record(item).plain_text)).join("").trim()
    : "";
}

function title(value: unknown): string { return plainText(record(value).title); }
function richText(value: unknown): string { return plainText(record(value).rich_text); }
function url(value: unknown): string { return text(record(value).url); }
function select(value: unknown): string {
  const property = record(value);
  return text(record(property.type === "status" ? property.status : property.select).name);
}
function normalizeNotionId(value: string): string { return value.replaceAll("-", "").toLowerCase(); }
function slugify(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function linksFromProperties(properties: Record<string, unknown>): Contributor["links"] {
  const serialized = richText(properties[CONTRIBUTOR_PROPERTIES.linksJson]);
  if (serialized) {
    let value: unknown;
    try {
      value = JSON.parse(serialized);
    } catch {
      throw new ContentError("Links JSON must be valid JSON.", "VALIDATION");
    }
    if (!Array.isArray(value) || value.some((entry) => {
      const item = record(entry);
      return !text(item.label) || !isHttpUrl(text(item.url));
    })) {
      throw new ContentError(
        "Links JSON must be an array of links with a label and an HTTP URL.",
        "VALIDATION",
      );
    }
    return value.map((entry) => {
      const item = record(entry);
      return { label: text(item.label), url: text(item.url) };
    });
  }
  return [
    ["Website", url(properties[CONTRIBUTOR_PROPERTIES.website])],
    ["Bluesky", url(properties[CONTRIBUTOR_PROPERTIES.bluesky])],
    ["Instagram", url(properties[CONTRIBUTOR_PROPERTIES.instagram])],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, linkUrl]) => ({ label, url: linkUrl }));
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function richTextProperty(value: string) {
  return { rich_text: value ? [{ type: "text" as const, text: { content: value } }] : [] };
}
function selectProperty(value: SyncState) { return { select: { name: value } }; }
function dateProperty(value: string) { return { date: { start: value } }; }
