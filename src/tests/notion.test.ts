import type { Client, PageObjectResponse } from "@notionhq/client";
import { describe, expect, it, vi } from "vitest";
import { NotionArticleSource } from "../lib/content/notion";
import { NotionNewsletterIssueSource } from "../lib/content/notion-newsletter";
import { MemoryContentStorage } from "./helpers";

function richText(content: string) {
  return {
    type: "rich_text",
    rich_text: [{ type: "text", plain_text: content }],
  };
}

function pageFixture(id = "page-1"): PageObjectResponse {
  return {
    object: "page",
    id,
    url: `https://notion.so/${id}`,
    created_time: "2026-07-29T12:00:00.000Z",
    last_edited_time: "2026-07-30T12:00:00.000Z",
    properties: {
      Name: {
        type: "title",
        title: [{ type: "text", plain_text: "A Complete Guide" }],
      },
      Slug: richText("a-complete-guide"),
      Description: richText("A useful description."),
      "Publication Type": { type: "select", select: { name: "Listening Guide" } },
      Topics: {
        type: "multi_select",
        multi_select: [{ name: "Kendrick" }, { name: "listening path" }],
      },
      "Hero Label": richText("The route"),
      "Hero Alt": richText("An abstract route across a record"),
      Accent: { type: "select", select: { name: "lime" } },
      "Has Affiliate Links": { type: "checkbox", checkbox: false },
      Featured: { type: "checkbox", checkbox: true },
      Published: { type: "checkbox", checkbox: true },
      "Publication Date": {
        type: "date",
        date: { start: "2026-07-29" },
      },
      "Sync State": { type: "select", select: { name: "Published" } },
    },
  } as unknown as PageObjectResponse;
}

describe("Notion article source", () => {
  it("parses only the public article metadata contract", () => {
    const source = new NotionArticleSource({
      notion: {} as Client,
      storage: new MemoryContentStorage(),
      databaseId: "database-1",
      persistImages: false,
    });

    expect(source.parseMetadata(pageFixture())).toMatchObject({
      notionPageId: "page-1",
      title: "A Complete Guide",
      slug: "a-complete-guide",
      description: "A useful description.",
      publicationType: "Listening Guide",
      topics: ["Kendrick", "listening path"],
      heroLabel: "The route",
      heroAlt: "An abstract route across a record",
      accent: "lime",
      featured: true,
      published: true,
      syncState: "Published",
    });
  });

  it("paginates through every Notion data-source page", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        results: [pageFixture("page-1")],
        has_more: true,
        next_cursor: "cursor-2",
      })
      .mockResolvedValueOnce({
        results: [pageFixture("page-2")],
        has_more: false,
        next_cursor: null,
      });
    const notion = {
      databases: {
        retrieve: vi.fn(async () => ({
          data_sources: [{ id: "data-source-1" }],
        })),
      },
      dataSources: { query },
    } as unknown as Client;
    const source = new NotionArticleSource({
      notion,
      storage: new MemoryContentStorage(),
      databaseId: "database-1",
      persistImages: false,
    });

    await expect(source.queryPages()).resolves.toHaveLength(2);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ start_cursor: "cursor-2" }),
    );
  });
});

describe("Notion newsletter issue source", () => {
  it("identifies pages from the configured Newsletter Issues data source", async () => {
    const notion = {
      databases: {
        retrieve: vi.fn(async () => ({
          data_sources: [{ id: "newsletter-source" }],
        })),
      },
    } as unknown as Client;
    const source = new NotionNewsletterIssueSource(notion, "newsletter-database");
    const newsletterPage = {
      parent: { type: "data_source_id", data_source_id: "newsletter-source" },
    } as unknown as PageObjectResponse;
    const otherPage = {
      parent: { type: "data_source_id", data_source_id: "another-source" },
    } as unknown as PageObjectResponse;

    await expect(source.belongsToDatabase(newsletterPage)).resolves.toBe(true);
    await expect(source.belongsToDatabase(otherPage)).resolves.toBe(false);
  });
});
