import type { Config } from "@netlify/functions";
import { createNotionArticleSource } from "../../src/lib/content/notion";
import { createBlobContentStorage } from "../../src/lib/content/storage";
import {
  ContentSynchronizer,
  parseWebhookEvent,
} from "../../src/lib/content/sync";
import { verifyNotionSignature } from "./notion-content-webhook";

export default async function handler(request: Request): Promise<void> {
  if (request.method !== "POST") return;
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
    await new ContentSynchronizer(storage, notion).processWebhook(event);
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
