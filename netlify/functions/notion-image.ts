import { Client } from "@notionhq/client";
import { rejectNonProductionMutation } from "../../src/lib/content/editorial";
import {
  cacheImage,
  readCachedImage,
  readImageSource,
  refreshImageSource,
  type CachedImage,
} from "../../src/lib/content/images";
import { createBlobContentStorage } from "../../src/lib/content/storage";

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD" },
    });
  }

  const previewRejection = rejectNonProductionMutation();
  if (previewRejection) return previewRejection;

  const imageId = new URL(request.url).searchParams.get("imageId") ?? "";
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(imageId)) {
    return new Response("Invalid imageId", { status: 400 });
  }

  try {
    const storage = createBlobContentStorage();
    let source = await readImageSource(storage, imageId);
    if (!source) {
      const cached = await readCachedImage(imageId);
      return cached
        ? imageResponse(cached, request.method === "HEAD")
        : new Response("Image not found", { status: 404 });
    }

    const cached = await readCachedImage(imageId, source.sourceFingerprint);
    if (cached) return imageResponse(cached, request.method === "HEAD");

    try {
      return imageResponse(
        await cacheImage(imageId, source.sourceUrl, source.sourceFingerprint),
        request.method === "HEAD",
      );
    } catch (initialError) {
      const apiKey = process.env.NOTION_API_KEY?.trim();
      if (apiKey) {
        const notion = new Client({
          auth: apiKey,
          notionVersion: "2025-09-03",
        });
        const refreshed = await refreshImageSource(
          notion,
          storage,
          imageId,
          source.reference,
          source.sourceFingerprint,
        ).catch(() => null);
        if (refreshed) {
          source = refreshed;
          try {
            return imageResponse(
              await cacheImage(
                imageId,
                source.sourceUrl,
                source.sourceFingerprint,
              ),
              request.method === "HEAD",
            );
          } catch {
            // Fall through to the last-known-good image.
          }
        }
      }

      const stale = await readCachedImage(imageId, source.sourceFingerprint, {
        allowStale: true,
      });
      if (stale) return imageResponse(stale, request.method === "HEAD");
      throw initialError;
    }
  } catch (error) {
    console.error("Notion image request failed", {
      imageId,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response("Image is temporarily unavailable", { status: 503 });
  }
}

function imageResponse(image: CachedImage, headOnly: boolean): Response {
  return new Response(headOnly ? null : image.body, {
    status: 200,
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": image.stale
        ? "public, max-age=300"
        : "public, max-age=31536000, immutable",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
