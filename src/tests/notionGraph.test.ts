import type { Client, PageObjectResponse } from "@notionhq/client";
import { describe, expect, it, vi } from "vitest";
import { NotionEditorialGraphSource } from "../lib/content/notion-graph";
import type { Publication, PublicationType } from "../lib/content/types";
import { articleFixture, MemoryContentStorage } from "./helpers";

process.env.NOTION_PUBLICATIONS_DATABASE_ID = "publications";
process.env.NOTION_CURATED_PIECES_DATABASE_ID = "curated";
process.env.NOTION_SELECTIONS_DATABASE_ID = "contents";

function title(content: string) { return { type: "title", title: [{ type: "text", plain_text: content }] }; }
function text(content: string) { return { type: "rich_text", rich_text: [{ type: "text", plain_text: content }] }; }
function relation(...ids: string[]) { return { type: "relation", relation: ids.map((id) => ({ id })) }; }

function publicationPage(id: string, type: PublicationType, syncState = "Queued"): PageObjectResponse {
  return {
    object: "page", id, url: `https://notion.so/${id}`, parent: { type: "data_source_id", data_source_id: "publications" }, created_time: "2026-08-01T00:00:00.000Z", last_edited_time: "2026-08-01T00:00:00.000Z",
    properties: {
      Name: title(id), Slug: text(id), Description: text("A useful description."), "Publication Type": { type: "select", select: { name: type } },
      "Contributor Slug": text("vestige"), Topics: { type: "multi_select", multi_select: [] }, "Hero Label": text("Label"), "Hero Alt": text("Alt"),
      Accent: { type: "select", select: { name: "clay" } }, "Has Affiliate Links": { type: "checkbox", checkbox: false }, Featured: { type: "checkbox", checkbox: false },
      Published: { type: "checkbox", checkbox: syncState === "Published" }, "Publication Date": { type: "date", date: { start: "2026-08-01" } }, "Sync State": { type: "select", select: { name: syncState } },
    },
  } as unknown as PageObjectResponse;
}

function curatedPage(id: string, roundup: string[] = [], order?: number): PageObjectResponse {
  return {
    object: "page", id, url: `https://notion.so/${id}`, parent: { type: "data_source_id", data_source_id: "curated" },
    properties: {
      Name: title(`Piece ${id}`), ID: text(`piece-${id}`), "Canonical URL": { type: "url", url: `https://example.com/${id}` }, Writer: text("Writer"),
      "Source Publication": text("Source"), "Original Date": { type: "date", date: { start: "2026-08-01" } }, Topics: { type: "multi_select", multi_select: [] }, Annotation: text("A factual note."),
      Roundup: relation(...roundup), "Roundup Order": { type: "number", number: order ?? null },
    },
  } as unknown as PageObjectResponse;
}

function contentsPage(id: string, parent: string, curated: string, order: number): PageObjectResponse {
  return { object: "page", id, url: `https://notion.so/${id}`, parent: { type: "data_source_id", data_source_id: "contents" }, properties: { "Appears In": relation(parent), "External Piece": relation(curated), "Internal Publication": relation(), "Display Order": { type: "number", number: order } } } as unknown as PageObjectResponse;
}

function source(publications: PageObjectResponse[], curated: PageObjectResponse[], contents: PageObjectResponse[]) {
  const pages = new Map([["publications", publications], ["curated", curated], ["contents", contents]]);
  const notion = {
    databases: { retrieve: vi.fn(async ({ database_id }: { database_id: string }) => ({ data_sources: [{ id: database_id }] })) },
    dataSources: { query: vi.fn(async ({ data_source_id }: { data_source_id: string }) => ({ results: pages.get(data_source_id) ?? [], has_more: false, next_cursor: null })) },
  } as unknown as Client;
  const graph = new NotionEditorialGraphSource(new MemoryContentStorage(), notion);
  vi.spyOn(graph.publications, "articleFromPage").mockImplementation(async (page) => publication(page.id, publicationType(page)));
  return graph;
}

function publication(id: string, type: PublicationType): Publication {
  const base = articleFixture({ notionPageId: id, slug: id }) as Publication;
  return type === "Roundup" || type === "Collection" ? { ...base, publicationType: type, selections: [] } as Publication : { ...base, publicationType: type } as Publication;
}

function publicationType(page: PageObjectResponse): PublicationType {
  return (page.properties["Publication Type"] as { select: { name: PublicationType } }).select.name;
}

describe("Notion editorial graph roundup assignments", () => {
  it("builds a Roundup from direct External Piece assignments while keeping that piece reusable in Collections", async () => {
    const graph = source(
      [publicationPage("roundup", "Roundup"), publicationPage("collection", "Collection")],
      [curatedPage("piece", ["roundup"], 1)],
      [contentsPage("collection-content", "collection", "piece", 1)],
    );

    const { editorial } = await graph.buildGraph();
    const roundup = editorial.publications.find((item) => item.notionPageId === "roundup")!;
    const collection = editorial.publications.find((item) => item.notionPageId === "collection")!;
    expect(roundup).toMatchObject({ publicationType: "Roundup", selections: [{ notionPageId: "piece", kind: "curatedPiece", reference: "piece-piece" }] });
    expect(collection).toMatchObject({ publicationType: "Collection", selections: [{ notionPageId: "collection-content", kind: "curatedPiece", reference: "piece-piece" }] });
  });

  it("rejects invalid direct assignments and legacy Roundup Contents rows", async () => {
    await expect(source([publicationPage("essay", "Essay")], [curatedPage("piece", ["essay"], 1)], []).buildGraph()).rejects.toThrow("must be assigned to a Roundup");
    await expect(source([publicationPage("roundup", "Roundup")], [curatedPage("piece", ["roundup", "another-roundup"], 1)], []).buildGraph()).rejects.toThrow("only one Roundup");
    await expect(source([publicationPage("roundup", "Roundup")], [curatedPage("piece", ["roundup"])], []).buildGraph()).rejects.toThrow("requires a positive Roundup Order");
    await expect(source([publicationPage("roundup", "Roundup")], [curatedPage("piece", ["roundup"], 1)], [contentsPage("legacy", "roundup", "piece", 1)]).buildGraph()).rejects.toThrow("must use the External Piece Roundup relation");
    await expect(source([publicationPage("roundup", "Roundup")], [curatedPage("one", ["roundup"], 1), curatedPage("two", ["roundup"], 1)], []).buildGraph()).rejects.toThrow("duplicate Roundup Order");
  });

  it("marks a directly assigned published Roundup pending when its External Piece changes", async () => {
    const graph = source([publicationPage("roundup", "Roundup", "Published")], [curatedPage("piece", ["roundup"], 1)], []);
    const pending = vi.spyOn(graph.publications, "markChangesPending").mockResolvedValue();
    await graph.markAffectedParentsPending("piece");
    expect(pending).toHaveBeenCalledWith("roundup");
  });
});
