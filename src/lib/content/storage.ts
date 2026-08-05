import { getStore } from "@netlify/blobs";
import type { ArticleManifest, ManifestRead, StoredSnapshot } from "./types";

export const CONTENT_STORE_NAME = "content";
export const IMAGE_STORE_NAME = "images";
export const ARTICLE_MANIFEST_KEY = "content/articles/manifest.json";
export const ARTICLE_VERSION_PREFIX = "content/articles/versions";
export const NEWSLETTER_EVENT_PREFIX = "content/newsletter";
export const ARTICLE_EVENT_PREFIX = "content/articles/events";
export const CONTRIBUTOR_EVENT_PREFIX = "content/contributors/events";
export const IMAGE_SOURCE_PREFIX = "content/articles/image-sources";

export interface JsonWriteOptions {
  metadata?: Record<string, unknown>;
  onlyIfMatch?: string;
  onlyIfNew?: boolean;
}

export interface JsonWriteResult {
  modified: boolean;
  etag?: string;
}

export interface ContentStorage {
  readManifest(): Promise<ManifestRead>;
  readVersion(key: string): Promise<StoredSnapshot | null>;
  writeVersion(
    key: string,
    value: StoredSnapshot,
    options?: JsonWriteOptions,
  ): Promise<JsonWriteResult>;
  writeManifest(
    value: ArticleManifest,
    options?: JsonWriteOptions,
  ): Promise<JsonWriteResult>;
  readJSON<T>(key: string): Promise<T | null>;
  writeJSON<T>(
    key: string,
    value: T,
    options?: JsonWriteOptions,
  ): Promise<JsonWriteResult>;
  delete(key: string): Promise<void>;
}

export function createBlobContentStorage(): ContentStorage {
  const store = getStore(CONTENT_STORE_NAME, { consistency: "strong" });

  return {
    async readManifest() {
      const result = await store.getWithMetadata(ARTICLE_MANIFEST_KEY, {
        type: "json",
      });
      return {
        manifest: (result?.data as ArticleManifest | null) ?? null,
        etag: result?.etag,
      };
    },
    async readVersion(key) {
      return (await store.get(key, { type: "json" })) as StoredSnapshot | null;
    },
    async writeVersion(key, value, options) {
      return setJSON(store, key, value, options);
    },
    async writeManifest(value, options) {
      return setJSON(store, ARTICLE_MANIFEST_KEY, value, options);
    },
    async readJSON<T>(key: string) {
      return (await store.get(key, { type: "json" })) as T | null;
    },
    async writeJSON<T>(key: string, value: T, options?: JsonWriteOptions) {
      return setJSON(store, key, value, options);
    },
    async delete(key) {
      await store.delete(key);
    },
  };
}

function setJSON<T>(
  store: ReturnType<typeof getStore>,
  key: string,
  value: T,
  options?: JsonWriteOptions,
): Promise<JsonWriteResult> {
  if (options?.onlyIfNew) {
    return store.setJSON(key, value, {
      metadata: options.metadata,
      onlyIfNew: true,
    });
  }
  if (options?.onlyIfMatch) {
    return store.setJSON(key, value, {
      metadata: options.metadata,
      onlyIfMatch: options.onlyIfMatch,
    });
  }
  return store.setJSON(key, value, { metadata: options?.metadata });
}
