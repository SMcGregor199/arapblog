import type { Config } from "@netlify/functions";
import { isProductionContext } from "../../src/lib/content/editorial";
import { ContributorSynchronizer } from "../../src/lib/content/contributor-sync";
import { NotionContributorSource } from "../../src/lib/content/notion-contributors";
import { createNotionArticleSource } from "../../src/lib/content/notion";
import { NotionEditorialGraphSource } from "../../src/lib/content/notion-graph";
import { createBlobContentStorage } from "../../src/lib/content/storage";
import { parseWebhookEvent } from "../../src/lib/content/sync";
import { verifyNotionSignature } from "./notion-content-webhook";

export default async function handler(request: Request): Promise<void> {
  if (request.method !== "POST") return;
  if (!isProductionContext()) {
    console.error("Rejected non-production Notion synchronization request");
    return;
  }
  const rawBody = await request.text();
  const token = process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN?.trim() ?? "";
  const signature = request.headers.get("x-notion-signature") ?? "";
  if (!token || !verifyNotionSignature(rawBody, signature, token)) {
    console.error("Rejected invalid background Notion synchronization request");
    return;
  }

  try {
    const event = parseWebhookEvent(JSON.parse(rawBody));
    const storage = createBlobContentStorage();
    const notion = createNotionArticleSource(storage);
    const contributors = new NotionContributorSource(notion.notion);
    const graph = new NotionEditorialGraphSource(storage, notion.notion);
    const pageId = event.entity?.type === "page" ? event.entity.id : undefined;
    if (pageId && event.type !== "page.deleted") {
      const page = await notion.retrievePage(pageId);
      if (await notion.belongsToArticleDatabase(page)) {
        const status = notion.readSyncStatus(page);
        const humanEdit = !event.authors?.length || event.authors.some((author) => author.type === "person");
        if (status.published && status.syncState === "Published" && humanEdit) {
          await notion.markChangesPending(pageId);
        } else if (status.syncState === "Queued" || status.syncState === "Unpublish queued") {
          await graph.promote();
        }
      } else {
        await graph.markAffectedParentsPending(pageId);
      }
    } else if (event.type === "page.deleted") {
      await graph.promote();
    }
    await new ContributorSynchronizer(storage, contributors).processWebhook(event);
  } catch (error) {
    console.error("Background Notion content synchronization failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export const config: Config = {
  background: true,
};
