import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
import type { Client } from "@notionhq/client";
import sharp from "sharp";
import {
  IMAGE_SOURCE_PREFIX,
  IMAGE_STORE_NAME,
  type ContentStorage,
} from "./storage";
import { ContentError } from "./types";

const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;

export interface ImageSourceReference {
  kind: "block-image";
  blockId: string;
}

export interface ImageSourceRecord {
  sourceUrl: string;
  sourceFingerprint: string;
  reference: ImageSourceReference;
  updatedAt: string;
}

export interface CachedImage {
  body: ArrayBuffer;
  contentType: string;
  stale: boolean;
}

export function stableImageId(blockId: string, sourceUrl: string): string {
  const stableBlockId = blockId.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 100);
  return `notion-${stableBlockId}-${sourceFingerprint(sourceUrl)}`;
}

export function publicImageUrl(imageId: string): string {
  return `/.netlify/functions/notion-image?imageId=${encodeURIComponent(imageId)}`;
}

export function sourceFingerprint(sourceUrl: string): string {
  let stableSource = sourceUrl;
  try {
    const parsed = new URL(sourceUrl);
    const isSigned = [...parsed.searchParams.keys()].some((key) =>
      key.toLowerCase().startsWith("x-amz-"),
    );
    stableSource = isSigned ? `${parsed.origin}${parsed.pathname}` : parsed.toString();
  } catch {
    // Hash the original value when a source cannot be represented as a URL.
  }
  return createHash("sha256").update(stableSource).digest("hex").slice(0, 20);
}

export function imageSourceKey(imageId: string): string {
  return `${IMAGE_SOURCE_PREFIX}/${imageId}.json`;
}

export async function registerImageSource(
  storage: ContentStorage,
  imageId: string,
  sourceUrl: string,
  reference: ImageSourceReference,
): Promise<ImageSourceRecord> {
  const record: ImageSourceRecord = {
    sourceUrl,
    sourceFingerprint: sourceFingerprint(sourceUrl),
    reference,
    updatedAt: new Date().toISOString(),
  };
  await storage.writeJSON(imageSourceKey(imageId), record);
  return record;
}

export async function readImageSource(
  storage: ContentStorage,
  imageId: string,
): Promise<ImageSourceRecord | null> {
  const record = await storage.readJSON<ImageSourceRecord>(imageSourceKey(imageId));
  if (
    !record ||
    typeof record.sourceUrl !== "string" ||
    !record.reference?.blockId
  ) {
    return null;
  }
  return record;
}

export async function readCachedImage(
  imageId: string,
  fingerprint = "",
  options: { allowStale?: boolean } = {},
): Promise<CachedImage | null> {
  const store = getStore(IMAGE_STORE_NAME, { consistency: "strong" });
  const body = await store.get(imageId, { type: "arrayBuffer" });
  if (!body) return null;

  const blobMetadata = await store.getMetadata(imageId);
  const metadata = blobMetadata?.metadata as
    | { contentType?: string; sourceFingerprint?: string }
    | undefined;
  const fingerprintChanged =
    fingerprint &&
    metadata?.sourceFingerprint &&
    fingerprint !== metadata.sourceFingerprint;

  if (fingerprintChanged && !options.allowStale) return null;
  return {
    body,
    contentType: metadata?.contentType ?? "image/webp",
    stale: Boolean(fingerprintChanged),
  };
}

export async function cacheImage(
  imageId: string,
  sourceUrl: string,
  fingerprint: string,
): Promise<CachedImage> {
  const response = await fetchImageWithRetry(sourceUrl);
  if (!response.ok) {
    throw new ContentError(
      `Notion image download failed with status ${response.status}.`,
      "UNAVAILABLE",
    );
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_SOURCE_IMAGE_BYTES) {
    throw new ContentError("Notion image exceeds the 20 MB limit.", "VALIDATION");
  }

  const source = Buffer.from(await response.arrayBuffer());
  if (source.byteLength > MAX_SOURCE_IMAGE_BYTES) {
    throw new ContentError("Notion image exceeds the 20 MB limit.", "VALIDATION");
  }

  const body = await sharp(source)
    .rotate()
    .resize({ width: 1800, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const store = getStore(IMAGE_STORE_NAME, { consistency: "strong" });
  const imageBody = Uint8Array.from(body).buffer;
  await store.set(imageId, imageBody, {
    metadata: {
      contentType: "image/webp",
      sourceFingerprint: fingerprint,
    },
  });
  return { body: imageBody, contentType: "image/webp", stale: false };
}

export async function prewarmImage(
  imageId: string,
  sourceUrl: string,
  fingerprint: string,
): Promise<CachedImage> {
  return (
    (await readCachedImage(imageId, fingerprint)) ??
    (await cacheImage(imageId, sourceUrl, fingerprint))
  );
}

export async function refreshImageSource(
  notion: Client,
  storage: ContentStorage,
  imageId: string,
  reference: ImageSourceReference,
  expectedFingerprint: string,
): Promise<ImageSourceRecord | null> {
  const block = await notion.blocks.retrieve({ block_id: reference.blockId });
  const sourceUrl = notionImageUrl(block);
  if (!sourceUrl) return null;
  if (sourceFingerprint(sourceUrl) !== expectedFingerprint) return null;
  return registerImageSource(storage, imageId, sourceUrl, reference);
}

export function notionImageUrl(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const block = value as Record<string, unknown>;
  if (block.type !== "image" || !block.image || typeof block.image !== "object") {
    return "";
  }
  const image = block.image as Record<string, unknown>;
  if (image.type === "file" && isRecord(image.file)) {
    return stringValue(image.file.url);
  }
  if (image.type === "external" && isRecord(image.external)) {
    return stringValue(image.external.url);
  }
  return "";
}

export function notionImageAlt(value: unknown): string {
  if (!value || typeof value !== "object") return "Article image";
  const block = value as Record<string, unknown>;
  if (!block.image || typeof block.image !== "object") return "Article image";
  const caption = (block.image as Record<string, unknown>).caption;
  if (!Array.isArray(caption)) return "Article image";
  const alt = caption
    .map((item) => (isRecord(item) ? stringValue(item.plain_text) : ""))
    .join("")
    .trim();
  return alt || "Article image";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function fetchImageWithRetry(sourceUrl: string): Promise<Response> {
  let response: Response | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetch(sourceUrl, { signal: AbortSignal.timeout(12_000) });
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (response) return response;
  throw new ContentError("Notion image download failed.", "UNAVAILABLE", {
    cause: lastError,
  });
}
