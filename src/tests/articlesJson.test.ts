import { describe, expect, it } from "vitest";
import { serveArticlesJson } from "../../netlify/functions/articles-json";
import { mutateSnapshot } from "../lib/content/snapshot";
import { articleFixture, MemoryContentStorage } from "./helpers";

describe("articles JSON", () => {
  it("returns the active public array with cache headers and a conditional ETag", async () => {
    const storage = new MemoryContentStorage();
    await mutateSnapshot(storage, () => [articleFixture()]);

    const response = await serveArticlesJson(
      new Request("https://arapblog.com/.netlify/functions/articles-json"),
      storage,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject([{ slug: "first-path" }]);
    expect(response.headers.get("etag")).toMatch(/^"[a-f0-9]{64}"$/);
    expect(response.headers.get("deprecation")).toBe("true");
    expect(response.headers.get("netlify-cdn-cache-control")).toContain(
      "stale-while-revalidate=120",
    );

    const conditional = await serveArticlesJson(
      new Request("https://arapblog.com/.netlify/functions/articles-json", {
        headers: { "If-None-Match": `W/${response.headers.get("etag")}` },
      }),
      storage,
    );
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe("");
  });

  it("returns an unavailable response when no live manifest exists", async () => {
    const response = await serveArticlesJson(
      new Request("https://arapblog.com/.netlify/functions/articles-json"),
      new MemoryContentStorage(),
    );
    expect(response.status).toBe(503);
  });
});
