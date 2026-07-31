import {
  articleMetadata,
  assertUniqueArticles,
  contentHash,
  normalizeArticle,
  sortArticles,
} from "./article";
import {
  ARTICLE_VERSION_PREFIX,
  type ContentStorage,
} from "./storage";
import {
  ContentError,
  type Article,
  type ArticleManifest,
  type ArticleSnapshot,
} from "./types";

const MAX_MANIFEST_WRITE_ATTEMPTS = 4;

export async function readActiveSnapshot(
  storage: ContentStorage,
  options: { allowMissing?: boolean } = {},
): Promise<{ manifest: ArticleManifest | null; articles: Article[] }> {
  let manifestRead;
  try {
    manifestRead = await storage.readManifest();
  } catch (error) {
    throw new ContentError("Published content is temporarily unavailable.", "UNAVAILABLE", {
      cause: error,
    });
  }

  if (!manifestRead.manifest) {
    if (options.allowMissing) return { manifest: null, articles: [] };
    throw new ContentError("Published content has not been initialized.", "UNAVAILABLE");
  }

  const manifest = validateManifest(manifestRead.manifest);
  let snapshot;
  try {
    snapshot = await storage.readVersion(manifest.activeVersion);
  } catch (error) {
    throw new ContentError("Published content is temporarily unavailable.", "UNAVAILABLE", {
      cause: error,
    });
  }

  if (!snapshot) {
    throw new ContentError("The active content version is unavailable.", "UNAVAILABLE");
  }

  return { manifest, articles: validateSnapshot(snapshot) };
}

export async function mutateSnapshot(
  storage: ContentStorage,
  mutate: (articles: Article[]) => Article[] | Promise<Article[]>,
  now: () => Date = () => new Date(),
): Promise<{ manifest: ArticleManifest; articles: Article[] }> {
  for (let attempt = 0; attempt < MAX_MANIFEST_WRITE_ATTEMPTS; attempt += 1) {
    const current = await storage.readManifest();
    const currentManifest = current.manifest ? validateManifest(current.manifest) : null;
    const currentSnapshot = currentManifest
      ? await storage.readVersion(currentManifest.activeVersion)
      : null;

    if (currentManifest && !currentSnapshot) {
      throw new ContentError("The active content version is unavailable.", "UNAVAILABLE");
    }

    const currentArticles = currentSnapshot ? validateSnapshot(currentSnapshot) : [];
    const articles = sortArticles(
      (await mutate([...currentArticles])).map((article) => normalizeArticle(article)),
    );
    assertUniqueArticles(articles);

    const versionBody: ArticleSnapshot = { schemaVersion: 1, articles };
    const versionHash = contentHash(versionBody);
    const versionKey = `${ARTICLE_VERSION_PREFIX}/${versionHash}.json`;
    const manifest: ArticleManifest = {
      schemaVersion: 1,
      activeVersion: versionKey,
      generatedAt: now().toISOString(),
      articles: articles.map(articleMetadata),
    };

    await storage.writeVersion(versionKey, versionBody, { onlyIfNew: true });
    const result = await storage.writeManifest(
      manifest,
      current.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true },
    );

    if (result.modified) {
      return { manifest, articles };
    }
  }

  throw new ContentError(
    "The content manifest changed repeatedly while this update was being promoted.",
    "CONFLICT",
  );
}

export function validateSnapshot(value: unknown): Article[] {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    !Array.isArray((value as { articles?: unknown }).articles)
  ) {
    throw new ContentError("The active content snapshot is invalid.", "UNAVAILABLE");
  }

  try {
    const articles = (value as ArticleSnapshot).articles.map(normalizeArticle);
    assertUniqueArticles(articles);
    return sortArticles(articles);
  } catch (error) {
    if (error instanceof ContentError && error.code === "VALIDATION") {
      throw new ContentError("The active content snapshot is invalid.", "UNAVAILABLE", {
        cause: error,
      });
    }
    throw error;
  }
}

export function validateManifest(value: unknown): ArticleManifest {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    typeof (value as { activeVersion?: unknown }).activeVersion !== "string" ||
    !Array.isArray((value as { articles?: unknown }).articles)
  ) {
    throw new ContentError("The content manifest is invalid.", "UNAVAILABLE");
  }
  return value as ArticleManifest;
}
