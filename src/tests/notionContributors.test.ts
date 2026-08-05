import type { Client, PageObjectResponse } from "@notionhq/client";
import { describe, expect, it } from "vitest";
import { NotionContributorSource } from "../lib/content/notion-contributors";

function text(content: string) {
  return { type: "rich_text", rich_text: [{ type: "text", plain_text: content }] };
}

function page(linksJson = ""): PageObjectResponse {
  return {
    object: "page",
    id: "contributor-1",
    properties: {
      Name: { type: "title", title: [{ type: "text", plain_text: "vestige" }] },
      Slug: text("vestige"),
      Role: { type: "select", select: { name: "Editor" } },
      Bio: text("Founding editor."),
      "Links JSON": text(linksJson),
      Website: { type: "url", url: "https://arapblog.com" },
      Published: { type: "checkbox", checkbox: false },
      "Sync State": { type: "select", select: { name: "Draft" } },
    },
  } as unknown as PageObjectResponse;
}

function source() {
  return new NotionContributorSource({} as Client, "contributors-database");
}

describe("Notion contributor source", () => {
  it("uses Links JSON when the desk provides it", () => {
    expect(source().parseMetadata(page('[{"label":"Site","url":"https://arapblog.com"}]')).links)
      .toEqual([{ label: "Site", url: "https://arapblog.com" }]);
  });

  it("retains individual link fields for older contributor records", () => {
    expect(source().parseMetadata(page()).links)
      .toEqual([{ label: "Website", url: "https://arapblog.com" }]);
  });

  it("rejects malformed contributor link data", () => {
    expect(() => source().parseMetadata(page("not json")))
      .toThrow("Links JSON must be valid JSON.");
  });
});
