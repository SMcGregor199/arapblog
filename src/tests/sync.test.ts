import type { PageObjectResponse } from "@notionhq/client";
import { describe, expect, it, vi } from "vitest";
import { mutateSnapshot, readActiveSnapshot } from "../lib/content/snapshot";
import {
  ContentSynchronizer,
  type NotionSyncSource,
} from "../lib/content/sync";
import type { NotionArticleMetadata } from "../lib/content/notion";
import { articleFixture, MemoryContentStorage } from "./helpers";

function pageFixture(id = "page-1"): PageObjectResponse {
  return { object: "page", id } as PageObjectResponse;
}

function metadataFixture(
  overrides: Partial<NotionArticleMetadata> = {},
): NotionArticleMetadata {
  return {
    notionPageId: "page-1",
    title: "First Path",
    slug: "first-path",
    description: "A useful listening path.",
    contentType: "Guide",
    contributor: "vestige",
    tags: ["rap"],
    heroLabel: "First path",
    heroAlt: "An abstract record",
    accent: "clay",
    hasAffiliateLinks: false,
    featured: false,
    heroImageSource: "",
    heroImageAlt: "",
    heroImageCredit: "",
    heroImageCreditUrl: "",
    published: false,
    publicationDate: "",
    syncState: "Queued",
    createdAt: "2026-07-30T12:00:00.000Z",
    lastEditedAt: "2026-07-30T12:00:00.000Z",
    ...overrides,
  };
}

function sourceFixture(options: {
  metadata?: NotionArticleMetadata;
  articleError?: Error;
} = {}): NotionSyncSource & {
  markPublished: ReturnType<typeof vi.fn>;
  markUnpublished: ReturnType<typeof vi.fn>;
  markFailed: ReturnType<typeof vi.fn>;
  markChangesPending: ReturnType<typeof vi.fn>;
} {
  const page = pageFixture(options.metadata?.notionPageId);
  const metadata = options.metadata ?? metadataFixture();
  return {
    queryPages: vi.fn(async () => [page]),
    retrievePage: vi.fn(async () => page),
    belongsToArticleDatabase: vi.fn(async () => true),
    parseMetadata: vi.fn(() => metadata),
    readSyncStatus: vi.fn(() => ({
      published: metadata.published,
      syncState: metadata.syncState,
    })),
    articleFromPage: vi.fn(async () => {
      if (options.articleError) throw options.articleError;
      return articleFixture({ notionPageId: page.id });
    }),
    markPublished: vi.fn(async () => undefined),
    markUnpublished: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    markChangesPending: vi.fn(async () => undefined),
  };
}

describe("content synchronization", () => {
  it("promotes a queued revision and handles a retried event idempotently", async () => {
    const storage = new MemoryContentStorage();
    const source = sourceFixture();
    const synchronizer = new ContentSynchronizer(storage, source);
    const event = {
      id: "event-1",
      type: "page.properties_updated",
      entity: { type: "page", id: "page-1" },
      authors: [{ type: "person" }],
    };

    await synchronizer.processWebhook(event);
    await synchronizer.processWebhook(event);

    expect((await readActiveSnapshot(storage)).articles).toHaveLength(1);
    expect(source.markPublished).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous live article when conversion fails", async () => {
    const storage = new MemoryContentStorage();
    await mutateSnapshot(storage, () => [articleFixture()]);
    const liveVersion = storage.manifest?.activeVersion;
    const source = sourceFixture({ articleError: new Error("conversion failed") });

    await expect(
      new ContentSynchronizer(storage, source).publishPage(pageFixture()),
    ).rejects.toThrow("conversion failed");

    expect(storage.manifest?.activeVersion).toBe(liveVersion);
    expect(source.markFailed).toHaveBeenCalledOnce();
  });

  it("removes a deleted published page by Notion page ID", async () => {
    const storage = new MemoryContentStorage();
    await mutateSnapshot(storage, () => [articleFixture()]);
    const source = sourceFixture();

    await new ContentSynchronizer(storage, source).processWebhook({
      id: "event-delete",
      type: "page.deleted",
      entity: { type: "page", id: "page-1" },
    });

    expect((await readActiveSnapshot(storage)).articles).toEqual([]);
    expect(source.markUnpublished).not.toHaveBeenCalled();
  });

  it("marks ordinary human edits pending without changing the live snapshot", async () => {
    const storage = new MemoryContentStorage();
    await mutateSnapshot(storage, () => [articleFixture()]);
    const liveVersion = storage.manifest?.activeVersion;
    const source = sourceFixture({
      metadata: metadataFixture({
        published: true,
        syncState: "Published",
      }),
    });

    await new ContentSynchronizer(storage, source).processWebhook({
      id: "event-edit",
      type: "page.content_updated",
      entity: { type: "page", id: "page-1" },
      authors: [{ type: "person" }],
    });

    expect(storage.manifest?.activeVersion).toBe(liveVersion);
    expect(source.markChangesPending).toHaveBeenCalledWith("page-1");
  });

  it("preserves the live body during a full rebuild when Notion has pending changes", async () => {
    const storage = new MemoryContentStorage();
    await mutateSnapshot(storage, () => [articleFixture()]);
    const writesBefore = storage.writes.length;
    const source = sourceFixture({
      metadata: metadataFixture({
        published: true,
        syncState: "Changes pending",
      }),
    });

    const result = await new ContentSynchronizer(storage, source).reconcile({
      dryRun: true,
      rebuild: true,
    });

    expect(result.articles).toMatchObject([{ slug: "first-path" }]);
    expect(source.articleFromPage).not.toHaveBeenCalled();
    expect(storage.writes).toHaveLength(writesBefore);
  });

  it("validates draft pages during a full dry run without publishing them", async () => {
    const storage = new MemoryContentStorage();
    const source = sourceFixture({
      metadata: metadataFixture({
        published: false,
        syncState: "Draft",
      }),
    });

    const result = await new ContentSynchronizer(storage, source).reconcile({
      dryRun: true,
      rebuild: true,
    });

    expect(result.actions).toEqual([
      { pageId: "page-1", action: "publish", slug: "first-path" },
    ]);
    expect(result.articles).toMatchObject([{ slug: "first-path" }]);
    expect(storage.writes).toEqual([]);
    expect(source.markPublished).not.toHaveBeenCalled();
  });
});
