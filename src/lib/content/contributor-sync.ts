import type { PageObjectResponse } from "@notionhq/client";
import type { NotionWebhookEvent } from "./sync";
import { mutateEditorialSnapshot, readActiveEditorialSnapshot } from "./snapshot";
import { CONTRIBUTOR_EVENT_PREFIX, type ContentStorage } from "./storage";
import type { Contributor, SyncState } from "./types";

const EVENT_LOCK_MAX_AGE_MS = 15 * 60 * 1000;

interface EventMarker { state: "processing" | "complete"; updatedAt: string }

export interface ContributorSyncSource {
  queryPages(): Promise<PageObjectResponse[]>;
  retrievePage(pageId: string): Promise<PageObjectResponse>;
  belongsToDatabase(page: PageObjectResponse): Promise<boolean>;
  contributorFromPage(page: PageObjectResponse, stableSlug?: string): Contributor;
  readSyncStatus(page: PageObjectResponse): { published: boolean; syncState: SyncState };
  markPublished(contributor: Contributor): Promise<void>;
  markUnpublished(pageId: string): Promise<void>;
  markChangesPending(pageId: string): Promise<void>;
  markFailed(pageId: string, error: unknown): Promise<void>;
}

export class ContributorSynchronizer {
  constructor(
    private readonly storage: ContentStorage,
    private readonly notion: ContributorSyncSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async processWebhook(event: NotionWebhookEvent): Promise<void> {
    if (!event.id || !event.type) return;
    const key = `${CONTRIBUTOR_EVENT_PREFIX}/${safeKey(event.id)}.json`;
    if (!(await this.claimEvent(key))) return;
    try {
      await this.processClaimed(event);
      await this.storage.writeJSON<EventMarker>(key, {
        state: "complete",
        updatedAt: this.now().toISOString(),
      });
    } catch (error) {
      await this.storage.delete(key).catch(() => undefined);
      throw error;
    }
  }

  async reconcile(options: { dryRun: boolean; rebuild: boolean }): Promise<Contributor[]> {
    const pages = await this.notion.queryPages();
    const active = await readActiveEditorialSnapshot(this.storage, { allowMissing: true });
    const byPage = new Map(active.editorial.contributors.map((item) => [item.notionPageId, item]));

    if (!options.rebuild) {
      let desired = [...active.editorial.contributors];
      for (const page of pages) {
        const status = this.notion.readSyncStatus(page);
        if (status.syncState === "Queued") {
          const current = byPage.get(page.id);
          const contributor = options.dryRun
            ? this.notion.contributorFromPage(page, current?.slug)
            : await this.publish(page);
          desired = [
            ...desired.filter((item) => item.notionPageId !== page.id),
            contributor,
          ];
        } else if (status.syncState === "Unpublish queued") {
          desired = desired.filter((item) => item.notionPageId !== page.id);
          if (!options.dryRun) await this.unpublish(page.id, false);
        }
      }
      return desired;
    }

    const desired: Contributor[] = [];
    for (const page of pages) {
      const status = this.notion.readSyncStatus(page);
      const current = byPage.get(page.id);
      if (status.syncState === "Changes pending" || status.syncState === "Failed") {
        if (current) desired.push(current);
        continue;
      }
      if (
        status.syncState === "Queued" ||
        (status.published && status.syncState === "Published") ||
        (options.dryRun && options.rebuild && status.syncState === "Draft")
      ) {
        desired.push(this.notion.contributorFromPage(page, current?.slug));
      }
    }
    if (!options.dryRun && options.rebuild) {
      await mutateEditorialSnapshot(this.storage, (editorial) => ({
        ...editorial,
        contributors: desired,
      }), this.now);
      await Promise.all(pages.map(async (page) => {
        const contributor = desired.find((item) => item.notionPageId === page.id);
        const status = this.notion.readSyncStatus(page);
        if (contributor && (status.syncState === "Queued" || status.syncState === "Published")) {
          await this.notion.markPublished(contributor);
        } else if (status.syncState === "Unpublish queued") {
          await this.notion.markUnpublished(page.id);
        }
      }));
    }
    return desired;
  }

  private async processClaimed(event: NotionWebhookEvent): Promise<void> {
    const pageId = event.entity?.type === "page" ? event.entity.id ?? "" : "";
    if (!pageId) return;
    if (event.type === "page.deleted") {
      await this.unpublish(pageId, true);
      return;
    }
    if (!["page.created", "page.undeleted", "page.content_updated", "page.properties_updated"].includes(event.type)) return;
    const page = await this.notion.retrievePage(pageId);
    if (!(await this.notion.belongsToDatabase(page))) return;
    const status = this.notion.readSyncStatus(page);
    if (status.syncState === "Queued") {
      await this.publish(page);
    } else if (status.syncState === "Unpublish queued") {
      await this.unpublish(page.id, false);
    } else if (
      status.published &&
      (!event.authors?.length || event.authors.some((author) => author.type === "person")) &&
      ["page.content_updated", "page.properties_updated"].includes(event.type)
    ) {
      await this.notion.markChangesPending(page.id);
    }
  }

  private async publish(page: PageObjectResponse): Promise<Contributor> {
    const active = await readActiveEditorialSnapshot(this.storage, { allowMissing: true });
    const current = active.editorial.contributors.find((item) => item.notionPageId === page.id);
    try {
      const contributor = this.notion.contributorFromPage(page, current?.slug);
      await mutateEditorialSnapshot(this.storage, (editorial) => ({
        ...editorial,
        contributors: [
          ...editorial.contributors.filter((item) => item.notionPageId !== page.id),
          contributor,
        ],
      }), this.now);
      await this.notion.markPublished(contributor);
      return contributor;
    } catch (error) {
      await this.notion.markFailed(page.id, error).catch(() => undefined);
      throw error;
    }
  }

  private async unpublish(pageId: string, deleted: boolean): Promise<void> {
    const active = await readActiveEditorialSnapshot(this.storage, { allowMissing: true });
    if (active.editorial.contributors.some((item) => item.notionPageId === pageId)) {
      await mutateEditorialSnapshot(this.storage, (editorial) => ({
        ...editorial,
        contributors: editorial.contributors.filter((item) => item.notionPageId !== pageId),
      }), this.now);
    }
    if (!deleted) await this.notion.markUnpublished(pageId);
  }

  private async claimEvent(key: string): Promise<boolean> {
    const existing = await this.storage.readJSON<EventMarker>(key);
    if (existing?.state === "complete") return false;
    if (existing?.state === "processing" && this.now().valueOf() - Date.parse(existing.updatedAt) < EVENT_LOCK_MAX_AGE_MS) return false;
    const marker: EventMarker = { state: "processing", updatedAt: this.now().toISOString() };
    if (existing) {
      await this.storage.writeJSON(key, marker);
      return true;
    }
    return (await this.storage.writeJSON(key, marker, { onlyIfNew: true })).modified;
  }
}

function safeKey(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 160);
}
