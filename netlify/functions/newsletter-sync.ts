import type { Config } from "@netlify/functions";
import { isProductionContext } from "../../src/lib/content/editorial";
import { NewsletterSynchronizer } from "../../src/lib/content/newsletter";
import { kitDraftClientIfConfigured, NotionNewsletterIssueSource } from "../../src/lib/content/notion-newsletter";
import { createBlobContentStorage } from "../../src/lib/content/storage";
import { verifyNotionSignature } from "./notion-content-webhook";
export default async function handler(request:Request):Promise<void>{
  if(request.method!=="POST"||!isProductionContext())return;
  const raw=await request.text();const token=process.env.NOTION_NEWSLETTER_WEBHOOK_TOKEN?.trim()??"";const signature=request.headers.get("x-notion-signature")??"";
  if(!token||!verifyNotionSignature(raw,signature,token))throw new Error("Rejected invalid newsletter synchronization request.");
  const payload=JSON.parse(raw);const pageId=payload?.entity?.type==="page"?payload.entity.id:"";if(!pageId)return;
  await new NewsletterSynchronizer(createBlobContentStorage(),new NotionNewsletterIssueSource(),kitDraftClientIfConfigured()).process(pageId);
}
export const config:Config={background:true};
