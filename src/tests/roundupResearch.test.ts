import { describe, expect, it, vi } from "vitest";
import {
  RoundupResearchCollector,
  newYorkDate,
  parseRoundupResearchResult,
  sendRoundupResearchNotification,
  verifyExternalPieceUrl,
  type ExternalPieceRepository,
  type RoundupResearchCandidate,
} from "../lib/content/roundup-research";
import { MemoryContentStorage } from "./helpers";

function candidate(index: number): RoundupResearchCandidate {
  return {
    title: `Piece ${index}`,
    writer: `Writer ${index}`,
    sourcePublication: "Source",
    originalDate: "2026-08-05",
    canonicalUrl: `https://example.com/piece-${index}`,
    formatCategory: "Criticism",
    neutralDescription: `A factual description of piece ${index}.`,
    concern: "",
  };
}

class Pieces implements ExternalPieceRepository {
  urls: string[] = [];
  created: Array<{ id: string; title: string; canonicalUrl: string }> = [];

  async listCanonicalUrls(): Promise<string[]> { return this.urls; }
  async create(value: RoundupResearchCandidate, input: { id: string; canonicalUrl: string }) {
    this.urls.push(input.canonicalUrl);
    this.created.push({ id: input.id, title: value.title, canonicalUrl: input.canonicalUrl });
    return { ...this.created.at(-1)!, notionUrl: `https://www.notion.so/${input.id}` };
  }
}

describe("roundup research", () => {
  it("requires 3–8 complete, unique research candidates", () => {
    const valid = { candidates: [candidate(1), candidate(2), candidate(3)] };
    expect(parseRoundupResearchResult(valid)).toHaveLength(3);
    expect(() => parseRoundupResearchResult({ candidates: [candidate(1), candidate(2)] })).toThrow("3–8");
    expect(() => parseRoundupResearchResult({ candidates: [candidate(1), candidate(1), candidate(3)] })).toThrow("duplicate");
    expect(() => parseRoundupResearchResult({ candidates: [{ ...candidate(1), writer: "" }, candidate(2), candidate(3)] })).toThrow("writer");
  });

  it("imports verified novel pieces once and tracks notification delivery", async () => {
    const storage = new MemoryContentStorage();
    const source = { collect: vi.fn(async () => ({ candidates: [candidate(1), candidate(2), candidate(3)] })) };
    const repository = new Pieces();
    const collector = new RoundupResearchCollector(storage, source, repository, { verify: async (url) => url }, () => new Date("2026-08-05T12:00:00.000Z"));

    const first = await collector.run();
    expect(first.imported).toHaveLength(3);
    expect(first.notificationPending).toBe(true);
    expect(repository.created.map((item) => item.id)).toEqual(expect.arrayContaining(["auto-20260805-7fae66cf7c8c"]));

    await collector.markNotificationSent(first.date);
    const repeated = await collector.run();
    expect(source.collect).toHaveBeenCalledTimes(1);
    expect(repository.created).toHaveLength(3);
    expect(repeated.notificationPending).toBe(false);
  });

  it("skips existing and unreachable links without adding a duplicate", async () => {
    const storage = new MemoryContentStorage();
    const source = { collect: async () => ({ candidates: [candidate(1), candidate(2), candidate(3)] }) };
    const repository = new Pieces();
    repository.urls.push(candidate(1).canonicalUrl);
    const collector = new RoundupResearchCollector(storage, source, repository, { verify: async (url) => {
      if (url.endsWith("piece-2")) throw new Error("Candidate URL returned HTTP 404.");
      return url;
    } }, () => new Date("2026-08-05T12:00:00.000Z"));

    const result = await collector.run();
    expect(result.imported.map((item) => item.title)).toEqual(["Piece 3"]);
    expect(result.skipped.map((item) => item.reason)).toEqual(expect.arrayContaining(["Already recorded in External Pieces.", "Candidate URL returned HTTP 404."]));
  });

  it("rejects local URLs and uses the final verified canonical URL", async () => {
    const request = vi.fn(async () => new Response("ok", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(verifyExternalPieceUrl("http://127.0.0.1/private", request)).rejects.toThrow("safe public");
    await expect(verifyExternalPieceUrl("http://169.254.1.1/private", request)).rejects.toThrow("safe public");
    expect(request).not.toHaveBeenCalled();

    const redirected = vi.fn(async () => ({
      ok: true,
      status: 200,
      url: "https://Example.com/story/#notes",
      body: { cancel: async () => undefined },
    }) as unknown as Response);
    await expect(verifyExternalPieceUrl("https://example.com/start", redirected)).resolves.toBe("https://example.com/story");
  });

  it("sends a review email containing only the imported Notion records", async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ id: "email" }), { status: 200 }));
    await sendRoundupResearchNotification({
      apiKey: "resend-key", from: "A Rap Blog <updates@arapblog.com>", to: "vestige@arapblog.com",
      result: { date: "2026-08-05", skipped: [], notificationPending: true, imported: [{ id: "auto", title: "A < Piece", canonicalUrl: "https://example.com/piece", notionUrl: "https://www.notion.so/auto" }] },
    }, request as unknown as typeof fetch);
    const payload = JSON.parse(String((request.mock.calls[0]?.[1] as RequestInit | undefined)?.body));
    expect(payload.to).toEqual(["vestige@arapblog.com"]);
    expect(payload.html).toContain("A &lt; Piece");
  });

  it("uses New York calendar dates across the daylight-saving boundary", () => {
    expect(newYorkDate(new Date("2026-03-08T04:30:00.000Z"))).toBe("2026-03-07");
    expect(newYorkDate(new Date("2026-03-08T12:30:00.000Z"))).toBe("2026-03-08");
  });
});
