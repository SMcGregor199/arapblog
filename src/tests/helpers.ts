import type {
  ContentStorage,
  JsonWriteOptions,
  JsonWriteResult,
} from "../lib/content/storage";
import type {
  Article,
  ArticleManifest,
  StoredSnapshot,
  ManifestRead,
} from "../lib/content/types";

export class MemoryContentStorage implements ContentStorage {
  values = new Map<string, unknown>();
  manifest: ArticleManifest | null = null;
  manifestEtag: string | undefined;
  writes: string[] = [];
  failVersionWrite = false;
  failManifestWrite = false;
  private etagCounter = 0;

  async readManifest(): Promise<ManifestRead> {
    return { manifest: this.manifest, etag: this.manifestEtag };
  }

  async readVersion(key: string): Promise<StoredSnapshot | null> {
    return (this.values.get(key) as StoredSnapshot | undefined) ?? null;
  }

  async writeVersion(
    key: string,
    value: StoredSnapshot,
    options?: JsonWriteOptions,
  ): Promise<JsonWriteResult> {
    this.writes.push(`version:${key}`);
    if (this.failVersionWrite) throw new Error("version write failed");
    return this.writeValue(key, value, options);
  }

  async writeManifest(
    value: ArticleManifest,
    options?: JsonWriteOptions,
  ): Promise<JsonWriteResult> {
    this.writes.push("manifest");
    if (this.failManifestWrite) throw new Error("manifest write failed");
    if (options?.onlyIfNew && this.manifest) return { modified: false };
    if (
      options?.onlyIfMatch &&
      (!this.manifestEtag || options.onlyIfMatch !== this.manifestEtag)
    ) {
      return { modified: false };
    }
    this.manifest = structuredClone(value);
    this.manifestEtag = this.nextEtag();
    return { modified: true, etag: this.manifestEtag };
  }

  async readJSON<T>(key: string): Promise<T | null> {
    return (structuredClone(this.values.get(key)) as T | undefined) ?? null;
  }

  async writeJSON<T>(
    key: string,
    value: T,
    options?: JsonWriteOptions,
  ): Promise<JsonWriteResult> {
    return this.writeValue(key, value, options);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }

  private writeValue(
    key: string,
    value: unknown,
    options?: JsonWriteOptions,
  ): JsonWriteResult {
    if (options?.onlyIfNew && this.values.has(key)) return { modified: false };
    this.values.set(key, structuredClone(value));
    return { modified: true, etag: this.nextEtag() };
  }

  private nextEtag(): string {
    this.etagCounter += 1;
    return `etag-${this.etagCounter}`;
  }
}

export function articleFixture(overrides: Partial<Article> = {}): Article {
  return {
    notionPageId: "page-1",
    slug: "first-path",
    title: "First Path",
    description: "A useful listening path.",
    publishedAt: "2026-07-30T12:00:00.000Z",
    updatedAt: "2026-07-30T12:00:00.000Z",
    author: "vestige",
    contentType: "Guide",
    tags: ["rap"],
    heroLabel: "First path",
    heroAlt: "An abstract record",
    accent: "clay",
    hasAffiliateLinks: false,
    featured: false,
    readTimeMinutes: 1,
    readTime: "1 min",
    bodyMarkdown: "A complete article body.",
    ...overrides,
  };
}
