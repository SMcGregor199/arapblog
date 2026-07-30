import type { PageObjectResponse } from "@notionhq/client";
import {
  articleMetadata,
  assertUniqueArticles,
  contentHash,
  sortArticles,
} from "./article";
import type {
  NotionArticleMetadata,
  NotionSyncStatus,
} from "./notion";
import { ARTICLE_EVENT_PREFIX, type ContentStorage } from "./storage";
import { mutateSnapshot, readActiveSnapshot } from "./snapshot";
import { ContentError, type Article, type ArticleMetadata } from "./types";

const EVENT_LOCK_MAX_AGE_MS = 15 * 60 * 1000;

export interface NotionWebhookEvent {
  id: string;
  timestamp?: string;
  type: string;
  entity?: { id?: string; type?: string };
  authors?: Array<{ id?: string; type?: string }>;
  data?: Record<string, unknown>;
}

export interface ReconcileResult {
  dryRun: boolean;
  rebuild: boolean;
  actions: Array<{
    pageId: string;
    action: "publish" | "unpublish";
    slug?: string;
  }>;
  articles?: ArticleMetadata[];
}

interface EventMarker {
  state: "processing" | "complete";
  updatedAt: string;
}

export interface NotionSyncSource {
  queryPages(): Promise<PageObjectResponse[]>;
  retrievePage(pageId: string): Promise<PageObjectResponse>;
  belongsToArticleDatabase(page: PageObjectResponse): Promise<boolean>;
  parseMetadata(page: PageObjectResponse): NotionArticleMetadata;
  readSyncStatus(page: PageObjectResponse): NotionSyncStatus;
  articleFromPage(
    page: PageObjectResponse,
    options?: { stableSlug?: string; publishedAt?: string },
  ): Promise<Article>;
  markChangesPending(pageId: string): Promise<void>;
  markPublished(article: Article): Promise<void>;
  markUnpublished(pageId: string): Promise<void>;
  markFailed(pageId: string, error: unknown): Promise<void>;
}

export class ContentSynchronizer {
  constructor(
    private readonly storage: ContentStorage,
    private readonly notion: NotionSyncSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async processWebhook(event: NotionWebhookEvent): Promise<void> {
    if (!event.id || !event.type) return;
    const markerKey = `${ARTICLE_EVENT_PREFIX}/${safeKey(event.id)}.json`;
    if (!(await this.claimEvent(markerKey))) return;

    try {
      await this.processClaimedWebhook(event);
      await this.storage.writeJSON<EventMarker>(markerKey, {
        state: "complete",
        updatedAt: this.now().toISOString(),
      });
    } catch (error) {
      await this.storage.delete(markerKey).catch(() => undefined);
      throw error;
    }
  }

  async publishPage(page: PageObjectResponse): Promise<Article> {
    const active = await readActiveSnapshot(this.storage, { allowMissing: true });
    const current = active.articles.find(
      (article) => article.notionPageId === page.id,
    );

    try {
      const article = await this.notion.articleFromPage(page, {
        stableSlug: current?.slug,
        publishedAt: current?.publishedAt,
      });
      await mutateSnapshot(
        this.storage,
        (articles) => [
          ...articles.filter((entry) => entry.notionPageId !== article.notionPageId),
          article,
        ],
        this.now,
      );
      await this.notion.markPublished(article);
      return article;
    } catch (error) {
      await this.notion.markFailed(page.id, error).catch(() => undefined);
      throw error;
    }
  }

  async unpublishPage(
    pageId: string,
    options: { deleted?: boolean } = {},
  ): Promise<void> {
    const active = await readActiveSnapshot(this.storage, { allowMissing: true });
    if (active.articles.some((article) => article.notionPageId === pageId)) {
      await mutateSnapshot(
        this.storage,
        (articles) =>
          articles.filter((article) => article.notionPageId !== pageId),
        this.now,
      );
    }
    if (!options.deleted) {
      await this.notion.markUnpublished(pageId);
    }
  }

  async reconcile(options: {
    dryRun?: boolean;
    rebuild?: boolean;
  }): Promise<ReconcileResult> {
    const dryRun = options.dryRun ?? true;
    const rebuild = options.rebuild ?? false;
    const pages = await this.notion.queryPages();
    const active = await readActiveSnapshot(this.storage, { allowMissing: true });
    const activeByPage = new Map(
      active.articles.map((article) => [article.notionPageId, article]),
    );
    const actions: ReconcileResult["actions"] = [];

    if (rebuild) {
      const desired: Article[] = [];
      const selectedPageIds = new Set<string>();

      for (const page of pages) {
        const status = this.notion.readSyncStatus(page);
        if (status.syncState === "Unpublish queued") {
          if (activeByPage.has(page.id)) {
            actions.push({ pageId: page.id, action: "unpublish" });
          }
          continue;
        }

        const current = activeByPage.get(page.id);
        if (
          status.syncState === "Changes pending" ||
          status.syncState === "Failed"
        ) {
          if (current) {
            desired.push(current);
            selectedPageIds.add(page.id);
          } else if (status.published) {
            throw new ContentError(
              `Cannot rebuild ${page.id} without publishing its pending revision.`,
              "VALIDATION",
            );
          }
          continue;
        }
        if (
          status.syncState !== "Queued" &&
          !(status.published && status.syncState === "Published")
        ) {
          continue;
        }

        let article = await this.notion.articleFromPage(page, {
          stableSlug: current?.slug,
          publishedAt: current?.publishedAt,
        });
        if (
          current &&
          status.syncState === "Published" &&
          unchangedExceptUpdatedAt(current, article)
        ) {
          article = { ...article, updatedAt: current.updatedAt };
        }
        desired.push(article);
        selectedPageIds.add(page.id);
        actions.push({ pageId: page.id, action: "publish", slug: article.slug });
      }

      for (const article of active.articles) {
        if (!selectedPageIds.has(article.notionPageId)) {
          actions.push({ pageId: article.notionPageId, action: "unpublish" });
        }
      }

      const normalized = sortArticles(desired);
      assertUniqueArticles(normalized);
      if (!dryRun) {
        await mutateSnapshot(this.storage, () => normalized, this.now);
        await this.applyRebuildStates(pages, normalized);
      }
      return {
        dryRun,
        rebuild,
        actions,
        articles: normalized.map(articleMetadata),
      };
    }

    for (const page of pages) {
      const status = this.notion.readSyncStatus(page);
      if (status.syncState === "Queued") {
        if (dryRun) {
          const current = activeByPage.get(page.id);
          const article = await this.notion.articleFromPage(page, {
            stableSlug: current?.slug,
            publishedAt: current?.publishedAt,
          });
          actions.push({ pageId: page.id, action: "publish", slug: article.slug });
        } else {
          const article = await this.publishPage(page);
          actions.push({ pageId: page.id, action: "publish", slug: article.slug });
        }
      } else if (status.syncState === "Unpublish queued") {
        actions.push({ pageId: page.id, action: "unpublish" });
        if (!dryRun) await this.unpublishPage(page.id);
      }
    }

    return { dryRun, rebuild, actions };
  }

  private async processClaimedWebhook(event: NotionWebhookEvent): Promise<void> {
    const pageId =
      event.entity?.type === "page" && typeof event.entity.id === "string"
        ? event.entity.id
        : "";
    if (!pageId) return;

    if (event.type === "page.deleted") {
      await this.unpublishPage(pageId, { deleted: true });
      return;
    }
    if (
      ![
        "page.created",
        "page.undeleted",
        "page.content_updated",
        "page.properties_updated",
      ].includes(event.type)
    ) {
      return;
    }

    const page = await this.notion.retrievePage(pageId);
    if (!(await this.notion.belongsToArticleDatabase(page))) return;
    const status = this.notion.readSyncStatus(page);

    if (status.syncState === "Queued") {
      await this.publishPage(page);
      return;
    }
    if (status.syncState === "Unpublish queued") {
      await this.unpublishPage(page.id);
      return;
    }

    const wasHumanEdit = !event.authors?.length
      ? true
      : event.authors.some((author) => author.type === "person");
    if (
      status.published &&
      wasHumanEdit &&
      ["page.content_updated", "page.properties_updated"].includes(event.type)
    ) {
      await this.notion.markChangesPending(page.id);
    }
  }

  private async claimEvent(markerKey: string): Promise<boolean> {
    const existing = await this.storage.readJSON<EventMarker>(markerKey);
    if (existing?.state === "complete") return false;
    if (
      existing?.state === "processing" &&
      this.now().valueOf() - Date.parse(existing.updatedAt) < EVENT_LOCK_MAX_AGE_MS
    ) {
      return false;
    }

    const marker: EventMarker = {
      state: "processing",
      updatedAt: this.now().toISOString(),
    };
    if (existing) {
      await this.storage.writeJSON(markerKey, marker);
      return true;
    }
    const result = await this.storage.writeJSON(markerKey, marker, {
      onlyIfNew: true,
    });
    return result.modified;
  }

  private async applyRebuildStates(
    pages: PageObjectResponse[],
    articles: Article[],
  ): Promise<void> {
    const byPage = new Map(articles.map((article) => [article.notionPageId, article]));
    await Promise.all(
      pages.map(async (page) => {
        const status = this.notion.readSyncStatus(page);
        const article = byPage.get(page.id);
        if (
          article &&
          (status.syncState === "Queued" || status.syncState === "Published")
        ) {
          await this.notion.markPublished(article);
        } else if (status.syncState === "Unpublish queued") {
          await this.notion.markUnpublished(page.id);
        }
      }),
    );
  }
}

export function parseWebhookEvent(value: unknown): NotionWebhookEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContentError("Webhook payload must be a JSON object.", "VALIDATION");
  }
  const event = value as NotionWebhookEvent;
  if (typeof event.id !== "string" || typeof event.type !== "string") {
    throw new ContentError("Webhook payload is missing id or type.", "VALIDATION");
  }
  return event;
}

function safeKey(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 160);
}

function unchangedExceptUpdatedAt(left: Article, right: Article): boolean {
  const { updatedAt: _leftUpdatedAt, ...leftComparable } = left;
  const { updatedAt: _rightUpdatedAt, ...rightComparable } = right;
  return contentHash(leftComparable) === contentHash(rightComparable);
}
