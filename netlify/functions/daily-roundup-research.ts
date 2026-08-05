import type { Config } from "@netlify/functions";
import { Client } from "@notionhq/client";
import { isProductionContext } from "../../src/lib/content/editorial";
import { serverEnvironment } from "../../src/lib/content/environment";
import {
  NotionExternalPieceRepository,
  OpenAiRoundupResearchSource,
  RoundupResearchCollector,
  sendRoundupResearchNotification,
  verifyExternalPieceUrl,
} from "../../src/lib/content/roundup-research";
import { createBlobContentStorage } from "../../src/lib/content/storage";

export default async function handler(): Promise<void> {
  if (!isProductionContext()) {
    console.error("Rejected non-production roundup research run");
    return;
  }
  if (serverEnvironment("ROUNDUP_RESEARCH_ENABLED") !== "true") {
    console.info("Roundup research is disabled. Set ROUNDUP_RESEARCH_ENABLED=true to begin the pilot.");
    return;
  }
  if (newYorkHour(new Date()) !== 8) return;

  const apiKey = required("OPENAI_API_KEY");
  const notionKey = required("NOTION_API_KEY");
  const databaseId = required("NOTION_CURATED_PIECES_DATABASE_ID");
  const collector = new RoundupResearchCollector(
    createBlobContentStorage(),
    new OpenAiRoundupResearchSource(apiKey, serverEnvironment("ROUNDUP_RESEARCH_MODEL") ?? "gpt-5.6-terra"),
    new NotionExternalPieceRepository(new Client({ auth: notionKey, notionVersion: "2025-09-03" }), databaseId),
    { verify: verifyExternalPieceUrl },
  );
  const result = await collector.run();
  console.info("Roundup research completed", { date: result.date, imported: result.imported.length, skipped: result.skipped.length });

  const resendKey = serverEnvironment("RESEND_API_KEY");
  if (!result.notificationPending) return;
  if (!resendKey) {
    console.info("Roundup research email notification is disabled because RESEND_API_KEY is not configured.");
    return;
  }
  await sendRoundupResearchNotification({
    apiKey: resendKey,
    from: required("RESEND_FROM_EMAIL"),
    to: serverEnvironment("ROUNDUP_RESEARCH_NOTIFICATION_EMAIL") ?? "vestige@arapblog.com",
    result,
  });
  await collector.markNotificationSent(result.date);
}

export const config: Config = {
  // Netlify cron is UTC. The handler checks America/New_York and runs once at 8 AM through DST.
  schedule: "0 12,13 * * *",
};

function required(name: string): string {
  const value = serverEnvironment(name);
  if (!value) throw new Error(`${name} is required for roundup research.`);
  return value;
}

function newYorkHour(value: Date): number {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" }).format(value);
  return Number(hour);
}
