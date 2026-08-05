import { createHash } from "node:crypto";
import { Client, isFullPage, type CreatePageParameters, type PageObjectResponse } from "@notionhq/client";
import { canonicalUrlKey, isSafeExternalHttpUrl } from "./canonical-url";
import { ContentError } from "./types";
import type { ContentStorage } from "./storage";

const NEW_YORK_TIME_ZONE = "America/New_York";
const RUN_PREFIX = "content/roundup-research/runs";
const MAX_CANDIDATES = 8;
const MIN_CANDIDATES = 3;
const EXTERNAL_PIECE_PROPERTIES = {
  title: "Name",
  id: "ID",
  url: "Canonical URL",
  writer: "Writer",
  source: "Source Publication",
  date: "Original Date",
  annotation: "Annotation",
} as const;

export interface RoundupResearchCandidate {
  title: string;
  writer: string;
  sourcePublication: string;
  originalDate: string;
  canonicalUrl: string;
  formatCategory: string;
  neutralDescription: string;
  concern: string;
}

export interface ImportedExternalPiece {
  id: string;
  title: string;
  canonicalUrl: string;
  notionPageId: string;
  notionUrl: string;
}

export interface RoundupResearchSource {
  collect(input: { prompt: string }): Promise<unknown>;
}

export interface ExternalPieceRepository {
  listCanonicalUrls(): Promise<string[]>;
  create(candidate: RoundupResearchCandidate, input: { id: string; canonicalUrl: string }): Promise<ImportedExternalPiece>;
}

export interface CandidateUrlVerifier {
  verify(url: string): Promise<string>;
}

interface RunRecord {
  date: string;
  status: "prepared" | "completed";
  candidates: RoundupResearchCandidate[];
  imported: ImportedExternalPiece[];
  skipped: Array<{ canonicalUrl: string; reason: string }>;
  notificationSentAt?: string;
}

export interface RoundupResearchResult {
  date: string;
  imported: ImportedExternalPiece[];
  skipped: Array<{ canonicalUrl: string; reason: string }>;
  notificationPending: boolean;
}

export class RoundupResearchCollector {
  constructor(
    private readonly storage: ContentStorage,
    private readonly source: RoundupResearchSource,
    private readonly repository: ExternalPieceRepository,
    private readonly verifier: CandidateUrlVerifier,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(): Promise<RoundupResearchResult> {
    const date = newYorkDate(this.now());
    const key = runKey(date);
    let record = await this.storage.readJSON<RunRecord>(key);

    if (!record) {
      const candidates = parseRoundupResearchResult(await this.source.collect({ prompt: buildResearchPrompt(this.now()) }));
      const prepared: RunRecord = { date, status: "prepared", candidates, imported: [], skipped: [] };
      const claimed = await this.storage.writeJSON(key, prepared, { onlyIfNew: true });
      record = claimed.modified ? prepared : await this.storage.readJSON<RunRecord>(key);
      if (!record) throw new ContentError("Unable to claim the daily roundup research run.", "CONFLICT");
    }

    if (record.status === "completed") return resultFrom(record);

    const existing = new Set((await this.repository.listCanonicalUrls()).map(canonicalUrlKey));
    const imported = [...record.imported];
    const skipped = [...record.skipped];

    for (const candidate of record.candidates) {
      const requestedKey = canonicalUrlKey(candidate.canonicalUrl);
      if (existing.has(requestedKey)) {
        skipped.push({ canonicalUrl: candidate.canonicalUrl, reason: "Already recorded in External Pieces." });
        continue;
      }

      let verifiedUrl: string;
      try {
        verifiedUrl = await this.verifier.verify(candidate.canonicalUrl);
      } catch (error) {
        skipped.push({ canonicalUrl: candidate.canonicalUrl, reason: errorMessage(error) });
        continue;
      }
      const verifiedKey = canonicalUrlKey(verifiedUrl);
      if (existing.has(verifiedKey)) {
        skipped.push({ canonicalUrl: candidate.canonicalUrl, reason: "The verified canonical URL is already recorded." });
        continue;
      }

      const id = automaticExternalPieceId(date, verifiedUrl);
      const created = await this.repository.create(candidate, { id, canonicalUrl: verifiedUrl });
      imported.push(created);
      existing.add(verifiedKey);
    }

    const completed: RunRecord = { ...record, status: "completed", imported, skipped };
    await this.storage.writeJSON(key, completed);
    return resultFrom(completed);
  }

  async markNotificationSent(date: string): Promise<void> {
    const key = runKey(date);
    const record = await this.storage.readJSON<RunRecord>(key);
    if (!record || record.status !== "completed" || !record.imported.length || record.notificationSentAt) return;
    await this.storage.writeJSON(key, { ...record, notificationSentAt: this.now().toISOString() });
  }
}

export class OpenAiRoundupResearchSource implements RoundupResearchSource {
  constructor(private readonly apiKey: string, private readonly model = "gpt-5.6-terra", private readonly request = fetch) {}

  async collect(input: { prompt: string }): Promise<unknown> {
    const response = await this.request("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        reasoning: { effort: "medium" },
        tools: [{ type: "web_search" }],
        input: input.prompt,
        text: {
          format: {
            type: "json_schema",
            name: "roundup_research",
            strict: true,
            schema: researchResponseSchema,
          },
        },
      }),
    });
    if (!response.ok) throw new ContentError(`OpenAI research request failed (${response.status}).`, "UNAVAILABLE");
    const payload = await response.json() as { output_text?: unknown };
    if (typeof payload.output_text !== "string") throw new ContentError("OpenAI research response did not include structured output.", "VALIDATION");
    try {
      return JSON.parse(payload.output_text);
    } catch {
      throw new ContentError("OpenAI research response was not valid JSON.", "VALIDATION");
    }
  }
}

export async function sendNotionRoundupResearchNotification(
  notion: Client,
  input: { result: RoundupResearchResult; userId?: string; name?: string },
): Promise<void> {
  if (!input.result.imported.length) return;
  const userId = input.userId ?? await findNotionUserId(notion, input.name ?? "Shayne");
  const titleLinks = input.result.imported.map((item) => `[${escapeMarkdown(item.title)}](${item.notionUrl})`).join(" · ");
  await notion.comments.create({
    parent: { type: "page_id", page_id: input.result.imported[0].notionPageId },
    markdown: `<mention-user url="${userId}">${escapeMarkdown(input.name ?? "Shayne")}</mention-user> — ${input.result.imported.length} new External ${input.result.imported.length === 1 ? "Piece is" : "Pieces are"} ready to review for ${input.result.date}. Review and edit the neutral AI summaries before selecting anything for a Roundup: ${titleLinks}`,
  });
}

export class NotionExternalPieceRepository implements ExternalPieceRepository {
  private dataSourceId?: string;

  constructor(private readonly notion: Client, private readonly databaseId: string) {}

  async listCanonicalUrls(): Promise<string[]> {
    const dataSourceId = await this.resolveDataSourceId();
    const pages: PageObjectResponse[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.notion.dataSources.query({ data_source_id: dataSourceId, page_size: 100, start_cursor: cursor });
      pages.push(...response.results.filter(isFullPage));
      cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (cursor);
    return pages.map((page) => urlValue(page.properties[EXTERNAL_PIECE_PROPERTIES.url])).filter(Boolean);
  }

  async create(candidate: RoundupResearchCandidate, input: { id: string; canonicalUrl: string }): Promise<ImportedExternalPiece> {
    const created = await this.notion.pages.create({
      parent: { type: "data_source_id", data_source_id: await this.resolveDataSourceId() },
      properties: {
        [EXTERNAL_PIECE_PROPERTIES.title]: titleProperty(candidate.title),
        [EXTERNAL_PIECE_PROPERTIES.id]: richTextProperty(input.id),
        [EXTERNAL_PIECE_PROPERTIES.url]: { url: input.canonicalUrl },
        [EXTERNAL_PIECE_PROPERTIES.writer]: richTextProperty(candidate.writer),
        [EXTERNAL_PIECE_PROPERTIES.source]: richTextProperty(candidate.sourcePublication),
        [EXTERNAL_PIECE_PROPERTIES.date]: { date: { start: candidate.originalDate } },
        [EXTERNAL_PIECE_PROPERTIES.annotation]: richTextProperty(candidate.neutralDescription),
      } as CreatePageParameters["properties"],
    });
    const page = created as { id: string; url?: string };
    return {
      id: input.id,
      title: candidate.title,
      canonicalUrl: input.canonicalUrl,
      notionPageId: page.id,
      notionUrl: page.url ?? `https://www.notion.so/${page.id.replaceAll("-", "")}`,
    };
  }

  private async resolveDataSourceId(): Promise<string> {
    if (this.dataSourceId) return this.dataSourceId;
    const databaseId = this.databaseId.replace(/^collection:\/\//, "");
    try {
      const database = await this.notion.databases.retrieve({ database_id: databaseId }) as unknown as { data_sources?: Array<{ id: string }> };
      this.dataSourceId = database.data_sources?.[0]?.id ?? databaseId;
    } catch {
      this.dataSourceId = databaseId;
    }
    return this.dataSourceId;
  }
}

export async function verifyExternalPieceUrl(url: string, request = fetch): Promise<string> {
  if (!isSafeExternalHttpUrl(url)) throw new ContentError("Candidate URL is not a safe public HTTP URL.", "VALIDATION");
  let response: Response;
  try {
    response = await request(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "A-Rap-Blog-Roundup-Research/1.0" },
      signal: AbortSignal.timeout(7_500),
    });
  } catch {
    throw new ContentError("Candidate URL could not be reached.", "UNAVAILABLE");
  }
  try {
    if (!response.ok) throw new ContentError(`Candidate URL returned HTTP ${response.status}.`, "UNAVAILABLE");
    if (!isSafeExternalHttpUrl(response.url)) throw new ContentError("Candidate URL redirected to an unsafe URL.", "VALIDATION");
    return canonicalUrlKey(response.url);
  } finally {
    await response.body?.cancel().catch(() => undefined);
  }
}

export function parseRoundupResearchResult(value: unknown): RoundupResearchCandidate[] {
  const record = object(value);
  const candidates = record.candidates;
  if (!Array.isArray(candidates) || candidates.length < MIN_CANDIDATES || candidates.length > MAX_CANDIDATES) {
    throw new ContentError(`Roundup research must return ${MIN_CANDIDATES}–${MAX_CANDIDATES} candidates.`, "VALIDATION");
  }
  const seen = new Set<string>();
  return candidates.map((entry) => {
    const item = object(entry);
    const candidate: RoundupResearchCandidate = {
      title: requiredText(item.title, "Candidate title"),
      writer: requiredText(item.writer, "Candidate writer"),
      sourcePublication: requiredText(item.sourcePublication, "Candidate source publication"),
      originalDate: originalDate(item.originalDate),
      canonicalUrl: requiredUrl(item.canonicalUrl),
      formatCategory: requiredText(item.formatCategory, "Candidate format/category"),
      neutralDescription: requiredText(item.neutralDescription, "Candidate neutral description"),
      concern: optionalText(item.concern),
    };
    const key = canonicalUrlKey(candidate.canonicalUrl);
    if (seen.has(key)) throw new ContentError("Roundup research returned duplicate canonical URLs.", "VALIDATION");
    seen.add(key);
    return candidate;
  });
}

export function buildResearchPrompt(now: Date): string {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString();
  return `Search the web for newly published writing about rap and hip-hop from ${since} through ${now.toISOString()} for A Rap Blog’s Friday Roundup research. Find 3–8 strong candidate links. Do not write a Roundup, select final links, rank pieces, or generate editorial annotations. Prioritize original criticism and cultural essays; reporting on artists, scenes, labels, radio, platforms, labor, and music economics; substantive interviews; historical or archival writing; profiles, obituaries, and scene reports; and writing about albums, songs, videos, production, DJing, dance, fashion, and regional movements. Favor independent criticism, reporting, distinctive voices, and variety across outlets, writers, regions, and perspectives. Exclude press releases, release calendars, promotional posts, generic listicles, social-media posts, unverified claims, AI-generated material, and syndicated or reposted items when the original publisher is available. Verify that each URL works and goes to the original publisher. Do not invent information; omit items whose author, date, or original source cannot be verified. Avoid repeating links included in earlier daily reports from the current Monday–Friday roundup week. For each candidate, return title, writer, source publication, original publication date, canonical URL, format/category, a neutral 1–2 sentence factual description, and any obvious concern such as paywall, missing byline, duplicate/syndication, or promotional framing. The neutral description must contain only verifiable source details and no recommendation. Return only JSON matching the requested schema.`;
}

export function automaticExternalPieceId(date: string, canonicalUrl: string): string {
  return `auto-${date.replaceAll("-", "")}-${createHash("sha256").update(canonicalUrlKey(canonicalUrl)).digest("hex").slice(0, 12)}`;
}

export function newYorkDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: NEW_YORK_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

const researchResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      minItems: MIN_CANDIDATES,
      maxItems: MAX_CANDIDATES,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" }, writer: { type: "string" }, sourcePublication: { type: "string" }, originalDate: { type: "string" }, canonicalUrl: { type: "string" }, formatCategory: { type: "string" }, neutralDescription: { type: "string" }, concern: { type: "string" },
        },
        required: ["title", "writer", "sourcePublication", "originalDate", "canonicalUrl", "formatCategory", "neutralDescription", "concern"],
      },
    },
  },
  required: ["candidates"],
} as const;

function runKey(date: string): string { return `${RUN_PREFIX}/${date}.json`; }
function resultFrom(record: RunRecord): RoundupResearchResult { return { date: record.date, imported: record.imported, skipped: record.skipped, notificationPending: Boolean(record.imported.length && !record.notificationSentAt) }; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function optionalText(value: unknown): string { return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""; }
function requiredText(value: unknown, label: string): string { const text = optionalText(value); if (!text || text.length > 1_800) throw new ContentError(`${label} is required and must be at most 1,800 characters.`, "VALIDATION"); return text; }
function requiredUrl(value: unknown): string { const text = requiredText(value, "Candidate canonical URL"); if (!isSafeExternalHttpUrl(text)) throw new ContentError("Candidate canonical URL must be a safe public HTTP URL.", "VALIDATION"); return canonicalUrlKey(text); }
function originalDate(value: unknown): string { const text = requiredText(value, "Candidate original date"); if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(`${text}T00:00:00.000Z`))) throw new ContentError("Candidate original date must use YYYY-MM-DD.", "VALIDATION"); return text; }
function titleProperty(value: string) { return { title: [{ type: "text" as const, text: { content: value } }] }; }
function richTextProperty(value: string) { return { rich_text: value ? [{ type: "text" as const, text: { content: value } }] : [] }; }
function urlValue(value: unknown): string { const record = object(value); return typeof record.url === "string" ? record.url.trim() : ""; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : "Candidate URL verification failed."; }
function escapeMarkdown(value: string): string { return value.replace(/([\\\[\]()])/g, "\\$1"); }

async function findNotionUserId(notion: Client, name?: string): Promise<string> {
  const normalizedName = name?.trim().toLowerCase();
  let cursor: string | undefined;
  do {
    const response = await notion.users.list({ page_size: 100, start_cursor: cursor });
    const users = response.results.filter((user) => user.type === "person");
    const match = users.find((user) => normalizedName && (user.name?.toLowerCase() === normalizedName || user.name?.toLowerCase().startsWith(`${normalizedName} `)));
    if (match) return match.id;
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);
  throw new ContentError("Could not find the Notion user to mention. Enable Read user information for the A Rap Blog connection and confirm the configured notification user.", "NOT_FOUND");
}
