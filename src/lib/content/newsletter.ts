import { contentHash } from "./article";
import { publicationPath } from "./editorial";
import { mutateEditorialSnapshot, readActiveEditorialSnapshot } from "./snapshot";
import { NEWSLETTER_EVENT_PREFIX, type ContentStorage } from "./storage";
import { ContentError, type NewsletterIssue, type NewsletterState, type Publication, type PublicationType } from "./types";

export const NEWSLETTER_TIME_ZONE = "America/New_York";
export const NEWSLETTER_SECTION_ORDER: PublicationType[] = ["Essay", "Roundup", "Collection", "Listening Guide"];

export interface NewsletterIssueDraft {
  notionPageId: string;
  coverageMonth: string;
  subject: string;
  previewText: string;
  state: NewsletterState;
  editorNoteMarkdown: string;
  generatedContentHash?: string;
  kitBroadcastId?: string;
}

export interface NewsletterIssueSource {
  readIssue(pageId: string): Promise<NewsletterIssueDraft>;
  markPrepared(pageId: string, result: { contentHash: string; kitBroadcastId?: string; fallbackPageId?: string }): Promise<void>;
  markFailed(pageId: string, message: string): Promise<void>;
  createOrUpdateFallback(pageId: string, html: string, existingPageId?: string): Promise<string>;
}

export interface KitDraftClient {
  createOrUpdateDraft(input: { subject: string; previewText: string; html: string; broadcastId?: string }): Promise<string>;
}

export class KitAccessUnavailableError extends Error {
  constructor(message = "Kit broadcast drafts are unavailable on the current plan.") {
    super(message);
    this.name = "KitAccessUnavailableError";
  }
}

interface GenerationRecord {
  contentHash: string;
  html: string;
  publicationSlugs: string[];
  kitBroadcastId?: string;
  fallbackPageId?: string;
}

export function previousCoverageMonth(now = new Date()): string {
  const parts = monthParts(now);
  const monthIndex = parts.year * 12 + (parts.month - 1) - 1;
  return `${Math.floor(monthIndex / 12)}-${String((monthIndex % 12 + 12) % 12 + 1).padStart(2, "0")}`;
}

export function publicationsForMonth(publications: Publication[], month: string): Publication[] {
  assertCoverageMonth(month);
  return publications.filter((publication) => monthKey(new Date(publication.publishedAt)) === month);
}

export function buildNewsletterDigest(input: {
  coverageMonth: string;
  subject: string;
  previewText: string;
  editorNoteMarkdown: string;
  publications: Publication[];
  siteUrl?: string;
  supportUrl?: string;
}) {
  assertCoverageMonth(input.coverageMonth);
  if (!input.editorNoteMarkdown.trim()) throw new ContentError("Write the editor’s note in the issue page before marking it Ready.", "VALIDATION");
  const selected = publicationsForMonth(input.publications, input.coverageMonth);
  if (!selected.length) throw new ContentError(`No published A Rap Blog publications fall in ${input.coverageMonth}.`, "VALIDATION");
  const siteUrl = (input.siteUrl ?? "https://arapblog.com").replace(/\/$/, "");
  const sections = NEWSLETTER_SECTION_ORDER.map((type) => ({ type, items: selected.filter((item) => item.publicationType === type) })).filter((section) => section.items.length);
  const noteHtml = markdownParagraphs(input.editorNoteMarkdown);
  const sectionHtml = sections.map((section) => `<section><h2>${escapeHtml(pluralLabel(section.type))}</h2>${section.items.map((item) => `<article><h3><a href="${escapeAttribute(`${siteUrl}${publicationPath(item)}`)}">${escapeHtml(item.title)}</a></h3><p><time datetime="${escapeAttribute(item.publishedAt)}">${escapeHtml(formatPublicationDate(item.publishedAt))}</time></p><p>${escapeHtml(item.description)}</p></article>`).join("")}</section>`).join("");
  const support = `<footer><p>Tips help cover the domain and basic publishing costs.${input.supportUrl ? ` <a href="${escapeAttribute(input.supportUrl)}">Support A Rap Blog</a>.` : ""}</p></footer>`;
  const html = `<article data-coverage-month="${input.coverageMonth}"><header><h1>${escapeHtml(input.subject)}</h1><p>${escapeHtml(input.previewText)}</p></header><section aria-label="Editor’s note">${noteHtml}</section>${sectionHtml}${support}</article>`;
  return { html, publications: selected, contentHash: contentHash({ coverageMonth: input.coverageMonth, subject: input.subject, previewText: input.previewText, editorNoteMarkdown: input.editorNoteMarkdown, publicationSlugs: selected.map((item) => item.slug), html }) };
}

export class NewsletterSynchronizer {
  constructor(private storage: ContentStorage, private source: NewsletterIssueSource, private kit?: KitDraftClient, private now: () => Date = () => new Date()) {}

  async process(pageId: string): Promise<void> {
    const issue = await this.source.readIssue(pageId);
    try {
      if (issue.state === "Ready") await this.prepare(issue);
      else if (issue.state === "Sent") await this.archive(issue);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.source.markFailed(pageId, message).catch(() => undefined);
      throw error;
    }
  }

  private async prepare(issue: NewsletterIssueDraft): Promise<void> {
    const { editorial } = await readActiveEditorialSnapshot(this.storage);
    if (editorial.newsletterIssues.some((item) => item.coverageMonth === issue.coverageMonth)) throw new ContentError(`Newsletter ${issue.coverageMonth} is already archived and immutable.`, "VALIDATION");
    const digest = buildNewsletterDigest({ ...issue, publications: editorial.publications, supportUrl: process.env.PUBLIC_KIT_TIP_URL });
    const key = generationKey(issue.notionPageId);
    const existing = await this.storage.readJSON<GenerationRecord>(key);
    if (existing?.contentHash === digest.contentHash) {
      await this.source.markPrepared(issue.notionPageId, { contentHash: existing.contentHash, kitBroadcastId: existing.kitBroadcastId, fallbackPageId: existing.fallbackPageId });
      return;
    }
    let kitBroadcastId = issue.kitBroadcastId;
    let fallbackPageId: string | undefined;
    if (this.kit) {
      try {
        kitBroadcastId = await this.kit.createOrUpdateDraft({ subject: issue.subject, previewText: issue.previewText, html: digest.html, broadcastId: issue.kitBroadcastId });
      } catch (error) {
        if (!(error instanceof KitAccessUnavailableError)) throw error;
        kitBroadcastId = undefined;
        fallbackPageId = await this.source.createOrUpdateFallback(issue.notionPageId, digest.html, existing?.fallbackPageId);
      }
    } else {
      fallbackPageId = await this.source.createOrUpdateFallback(issue.notionPageId, digest.html, existing?.fallbackPageId);
    }
    const record: GenerationRecord = { contentHash: digest.contentHash, html: digest.html, publicationSlugs: digest.publications.map((item) => item.slug), ...(kitBroadcastId ? { kitBroadcastId } : {}), ...(fallbackPageId ? { fallbackPageId } : {}) };
    await this.storage.writeJSON(key, record);
    await this.source.markPrepared(issue.notionPageId, { contentHash: record.contentHash, kitBroadcastId, fallbackPageId });
  }

  private async archive(issue: NewsletterIssueDraft): Promise<void> {
    const record = await this.storage.readJSON<GenerationRecord>(generationKey(issue.notionPageId));
    if (!record) throw new ContentError("Generate the newsletter draft before marking it Sent.", "VALIDATION");
    if (issue.generatedContentHash && issue.generatedContentHash !== record.contentHash) throw new ContentError("The Sent issue does not match its frozen generated content.", "VALIDATION");
    const active = (await readActiveEditorialSnapshot(this.storage)).editorial;
    const alreadyArchived = active.newsletterIssues.find((item) => item.coverageMonth === issue.coverageMonth);
    if (alreadyArchived) {
      if (alreadyArchived.notionPageId === issue.notionPageId && alreadyArchived.contentHash === record.contentHash) return;
      throw new ContentError(`Newsletter ${issue.coverageMonth} is already archived and immutable.`, "VALIDATION");
    }
    await mutateEditorialSnapshot(this.storage, (editorial) => {
      const existing = editorial.newsletterIssues.find((item) => item.coverageMonth === issue.coverageMonth);
      if (existing) {
        if (existing.notionPageId === issue.notionPageId && existing.contentHash === record.contentHash) return editorial;
        throw new ContentError(`Newsletter ${issue.coverageMonth} is already archived and immutable.`, "VALIDATION");
      }
      const archived: NewsletterIssue = { notionPageId: issue.notionPageId, coverageMonth: issue.coverageMonth, subject: issue.subject, previewText: issue.previewText, editorNoteMarkdown: issue.editorNoteMarkdown, sentAt: this.now().toISOString(), contentHash: record.contentHash, archiveState: "Sent", publications: record.publicationSlugs, html: record.html };
      return { ...editorial, newsletterIssues: [archived, ...editorial.newsletterIssues] };
    }, this.now);
  }
}

function generationKey(pageId: string): string { return `${NEWSLETTER_EVENT_PREFIX}/issues/${pageId.replace(/[^A-Za-z0-9_-]/g, "-")}.json`; }
function assertCoverageMonth(value: string): void { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new ContentError("Coverage Month must use YYYY-MM.", "VALIDATION"); }
function monthParts(date: Date): { year: number; month: number } { const parts=new Intl.DateTimeFormat("en-US",{timeZone:NEWSLETTER_TIME_ZONE,year:"numeric",month:"numeric"}).formatToParts(date); return {year:Number(parts.find((part)=>part.type==="year")?.value),month:Number(parts.find((part)=>part.type==="month")?.value)}; }
function monthKey(date: Date): string { const parts=monthParts(date); return `${parts.year}-${String(parts.month).padStart(2,"0")}`; }
function pluralLabel(type: PublicationType): string { return type === "Essay" ? "Essays" : type === "Roundup" ? "Roundups" : type === "Collection" ? "Collections" : "Listening Guides"; }
function formatPublicationDate(value: string): string { return new Date(value).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric",timeZone:NEWSLETTER_TIME_ZONE}); }
function markdownParagraphs(value: string): string { return value.trim().split(/\n\s*\n/).map((paragraph)=>`<p>${escapeHtml(paragraph.replace(/\s*\n\s*/g," "))}</p>`).join(""); }
function escapeHtml(value: string): string { return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;"); }
function escapeAttribute(value: string): string { return escapeHtml(value); }
