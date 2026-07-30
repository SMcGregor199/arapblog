import { contentCacheHeaders } from "../../src/lib/content/cache";
import { contentHash } from "../../src/lib/content/article";
import { readActiveSnapshot } from "../../src/lib/content/snapshot";
import {
  createBlobContentStorage,
  type ContentStorage,
} from "../../src/lib/content/storage";

export default async function handler(request: Request): Promise<Response> {
  return serveArticlesJson(request, createBlobContentStorage());
}

export async function serveArticlesJson(
  request: Request,
  storage: ContentStorage,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  try {
    const { manifest, articles } = await readActiveSnapshot(storage);
    const etag = `"${contentHash(manifest?.activeVersion ?? "")}"`;
    const headers = {
      ...contentCacheHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      ETag: etag,
    };
    const conditionalEtags =
      request.headers
        .get("if-none-match")
        ?.split(",")
        .map((value) => value.trim().replace(/^W\//, "")) ?? [];
    if (conditionalEtags.includes(etag) || conditionalEtags.includes("*")) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(
      request.method === "HEAD" ? null : JSON.stringify(articles),
      { status: 200, headers },
    );
  } catch (error) {
    console.error("Articles JSON failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response("Published content is temporarily unavailable.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
