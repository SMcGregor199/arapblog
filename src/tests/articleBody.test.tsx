import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ArticleBody, { safeMarkdownUrl } from "../components/ArticleBody";

describe("server-rendered article Markdown", () => {
  it("renders GFM as complete server HTML without raw HTML", () => {
    const html = renderToStaticMarkup(
      createElement(ArticleBody, {
        bodyMarkdown: `## Route

| Stop | Album |
| --- | --- |
| 1 | One |

<script>alert("no")</script>`,
      }),
    );

    expect(html).toContain("<h2>Route</h2>");
    expect(html).toContain("<table>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("alert");
  });

  it("rejects unsafe links and non-cached media", () => {
    expect(safeMarkdownUrl("javascript:alert(1)", "href")).toBe("");
    expect(safeMarkdownUrl("//evil.example/path", "href")).toBe("");
    expect(safeMarkdownUrl("data:image/png;base64,abc", "src")).toBe("");
    expect(
      safeMarkdownUrl(
        "/.netlify/functions/notion-image?imageId=notion-safe",
        "src",
      ),
    ).toBe("/.netlify/functions/notion-image?imageId=notion-safe");
    expect(safeMarkdownUrl("https://example.com", "href")).toBe(
      "https://example.com",
    );
  });

  it("labels contextual Bookshop affiliate clicks when the publication is disclosed", () => {
    const html = renderToStaticMarkup(createElement(ArticleBody, {
      bodyMarkdown: "[Read the book](https://bookshop.org/a/example/123)",
      hasAffiliateLinks: true,
    }));
    expect(html).toContain('rel="external nofollow sponsored"');
    expect(html).toContain('data-umami-event="Bookshop affiliate click"');
  });
});
