import { describe, expect, it } from "vitest";
import {
  assertUniqueArticles,
  calculateReadingTime,
  normalizeArticle,
  slugifyTitle,
} from "../lib/content/article";
import { ContentError } from "../lib/content/types";
import { articleFixture } from "./helpers";

describe("article normalization", () => {
  it("generates stable URL-safe slugs", () => {
    expect(slugifyTitle("  Can’t Stop: A Rap Guide!  ")).toBe(
      "cant-stop-a-rap-guide",
    );
  });

  it("calculates 200 words per minute with a one-minute minimum", () => {
    expect(calculateReadingTime("short body")).toEqual({
      readTimeMinutes: 1,
      readTime: "1 min",
    });
    expect(calculateReadingTime(Array.from({ length: 201 }, () => "word").join(" ")))
      .toEqual({ readTimeMinutes: 2, readTime: "2 min" });
  });

  it("rejects empty bodies and unsupported enum values", () => {
    expect(() => normalizeArticle(articleFixture({ bodyMarkdown: " " }))).toThrow(
      ContentError,
    );
    expect(() =>
      normalizeArticle({
        ...articleFixture(),
        accent: "orange" as never,
      }),
    ).toThrow(/Accent must be one of/);
  });

  it("rejects duplicate slugs belonging to different Notion pages", () => {
    expect(() =>
      assertUniqueArticles([
        articleFixture(),
        articleFixture({ notionPageId: "page-2" }),
      ]),
    ).toThrow(/duplicate publication slug/);
  });
});
