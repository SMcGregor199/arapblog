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
  type Contributor,
  type CuratedLink,
  type EditorialCollection,
  type EditorialSnapshot,
} from "./types";

const MAX_MANIFEST_WRITE_ATTEMPTS = 4;

export async function readActiveSnapshot(
  storage: ContentStorage,
  options: { allowMissing?: boolean } = {},
): Promise<{ manifest: ArticleManifest | null; articles: Article[] }> {
  const { manifest, editorial } = await readActiveEditorialSnapshot(storage, options);
  return { manifest, articles: editorial.originals };
}

export async function readActiveEditorialSnapshot(
  storage: ContentStorage,
  options: { allowMissing?: boolean } = {},
): Promise<{ manifest: ArticleManifest | null; editorial: EditorialSnapshot }> {
  let manifestRead;
  try {
    manifestRead = await storage.readManifest();
  } catch (error) {
    throw new ContentError("Published content is temporarily unavailable.", "UNAVAILABLE", {
      cause: error,
    });
  }

  if (!manifestRead.manifest) {
    if (options.allowMissing) {
      return { manifest: null, editorial: emptyEditorialSnapshot() };
    }
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

  return { manifest, editorial: validateEditorialSnapshot(snapshot) };
}

export async function mutateSnapshot(
  storage: ContentStorage,
  mutate: (articles: Article[]) => Article[] | Promise<Article[]>,
  now: () => Date = () => new Date(),
): Promise<{ manifest: ArticleManifest; articles: Article[] }> {
  const result = await mutateEditorialSnapshot(
    storage,
    async (editorial) => {
      const originals = sortArticles(
        (await mutate([...editorial.originals])).map((article) =>
          normalizeArticle(article),
        ),
      );
      const contributors =
        originals.some((article) => article.author === "vestige") &&
        !editorial.contributors.some((contributor) => contributor.slug === "vestige")
          ? [...editorial.contributors, ...inferContributors(
              originals.filter((article) => article.author === "vestige"),
            )]
          : editorial.contributors;
      return { ...editorial, originals, contributors };
    },
    now,
  );
  return { manifest: result.manifest, articles: result.editorial.originals };
}

export async function mutateEditorialSnapshot(
  storage: ContentStorage,
  mutate: (
    editorial: EditorialSnapshot,
  ) => EditorialSnapshot | Promise<EditorialSnapshot>,
  now: () => Date = () => new Date(),
): Promise<{ manifest: ArticleManifest; editorial: EditorialSnapshot }> {
  for (let attempt = 0; attempt < MAX_MANIFEST_WRITE_ATTEMPTS; attempt += 1) {
    const current = await storage.readManifest();
    const currentManifest = current.manifest ? validateManifest(current.manifest) : null;
    const currentSnapshot = currentManifest
      ? await storage.readVersion(currentManifest.activeVersion)
      : null;

    if (currentManifest && !currentSnapshot) {
      throw new ContentError("The active content version is unavailable.", "UNAVAILABLE");
    }

    const currentEditorial = currentSnapshot
      ? validateEditorialSnapshot(currentSnapshot)
      : emptyEditorialSnapshot();
    const versionBody = validateEditorialSnapshot(
      await mutate(structuredClone(currentEditorial)),
    );
    const versionHash = contentHash(versionBody);
    const versionKey = `${ARTICLE_VERSION_PREFIX}/${versionHash}.json`;
    const manifest: ArticleManifest = {
      schemaVersion: 2,
      activeVersion: versionKey,
      generatedAt: now().toISOString(),
      articles: versionBody.originals.map(articleMetadata),
    };

    await storage.writeVersion(versionKey, versionBody, { onlyIfNew: true });
    const result = await storage.writeManifest(
      manifest,
      current.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true },
    );

    if (result.modified) {
      return { manifest, editorial: versionBody };
    }
  }

  throw new ContentError(
    "The content manifest changed repeatedly while this update was being promoted.",
    "CONFLICT",
  );
}

export function validateSnapshot(value: unknown): Article[] {
  return validateEditorialSnapshot(value).originals;
}

export function validateEditorialSnapshot(value: unknown): EditorialSnapshot {
  if (isEditorialSnapshot(value)) {
    try {
      const originals = (value as EditorialSnapshot).originals.map(normalizeArticle);
      assertUniqueArticles(originals);
      const curatedLinks = (value as EditorialSnapshot).curatedLinks.map(normalizeCuratedLink);
      const collections = (value as EditorialSnapshot).collections.map(
        normalizeCollection,
      );
      const contributors = (value as EditorialSnapshot).contributors.map(
        normalizeContributor,
      );
      assertUniqueEditorialRecords(curatedLinks, collections, contributors);
      assertCollectionReferences(collections, originals, curatedLinks);
      assertOriginalContributors(originals, contributors);
      return {
        schemaVersion: 2,
        originals: sortArticles(originals),
        curatedLinks,
        collections,
        contributors,
      };
    } catch (error) {
      if (error instanceof ContentError && error.code === "VALIDATION") {
        throw unavailableSnapshot(error);
      }
      throw error;
    }
  }

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
    return {
      schemaVersion: 2,
      originals: sortArticles(articles),
      curatedLinks: [],
      collections: [],
      contributors: inferContributors(articles),
    };
  } catch (error) {
    if (error instanceof ContentError && error.code === "VALIDATION") {
      throw unavailableSnapshot(error);
    }
    throw error;
  }
}

function isEditorialSnapshot(value: unknown): value is EditorialSnapshot {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as { schemaVersion?: unknown }).schemaVersion === 2 &&
      Array.isArray((value as { originals?: unknown }).originals) &&
      Array.isArray((value as { curatedLinks?: unknown }).curatedLinks) &&
      Array.isArray((value as { collections?: unknown }).collections) &&
      Array.isArray((value as { contributors?: unknown }).contributors),
  );
}

function emptyEditorialSnapshot(): EditorialSnapshot {
  return {
    schemaVersion: 2,
    originals: [],
    curatedLinks: [],
    collections: [],
    contributors: [],
  };
}

function normalizeCuratedLink(value: CuratedLink): CuratedLink {
  const canonicalUrl = requiredUrl(value.canonicalUrl, "Curated canonical URL");
  return {
    id: requiredSlug(value.id, "Curated ID"),
    title: requiredText(value.title, "Curated title"),
    canonicalUrl,
    writer: requiredText(value.writer, "Curated writer"),
    publication: requiredText(value.publication, "Curated publication"),
    publishedAt: validDate(value.publishedAt, "Curated publication date"),
    editorialNote: requiredText(value.editorialNote, "Editorial note"),
    topics: normalizedStrings(value.topics),
  };
}

function normalizeCollection(value: EditorialCollection): EditorialCollection {
  return {
    slug: requiredSlug(value.slug, "Collection slug"),
    title: requiredText(value.title, "Collection title"),
    description: requiredText(value.description, "Collection description"),
    introduction: requiredText(value.introduction, "Collection introduction"),
    publishedAt: validDate(value.publishedAt, "Collection publication date"),
    updatedAt: validDate(value.updatedAt, "Collection updated date"),
    topics: normalizedStrings(value.topics),
    selections: value.selections.map((selection) => {
      if (selection.kind !== "original" && selection.kind !== "curated") {
        throw new ContentError("Collection selection kind is invalid.", "VALIDATION");
      }
      return { kind: selection.kind, slug: requiredSlug(selection.slug, "Selection slug") };
    }),
  };
}

function normalizeContributor(value: Contributor): Contributor {
  return {
    notionPageId: requiredText(value.notionPageId, "Contributor Notion page ID"),
    displayName: requiredText(value.displayName, "Contributor display name"),
    slug: requiredSlug(value.slug, "Contributor slug"),
    bio: requiredText(value.bio, "Contributor bio"),
    role: requiredText(value.role, "Contributor role"),
    links: value.links.map((link) => ({
      label: requiredText(link.label, "Contributor link label"),
      url: requiredUrl(link.url, "Contributor link URL"),
    })),
  };
}

function assertUniqueEditorialRecords(
  curated: CuratedLink[],
  collections: EditorialCollection[],
  contributors: Contributor[],
): void {
  assertUnique(curated.map((item) => item.id), "curated ID");
  assertUnique(curated.map((item) => item.canonicalUrl), "curated canonical URL");
  assertUnique(collections.map((item) => item.slug), "collection slug");
  assertUnique(contributors.map((item) => item.slug), "contributor slug");
  assertUnique(contributors.map((item) => item.notionPageId), "contributor Notion page ID");
}

function assertCollectionReferences(
  collections: EditorialCollection[],
  originals: Article[],
  curated: CuratedLink[],
): void {
  const originalSlugs = new Set(originals.map((item) => item.slug));
  const curatedIds = new Set(curated.map((item) => item.id));
  for (const collection of collections) {
    if (collection.selections.length < 4 || collection.selections.length > 6) {
      throw new ContentError(
        `Collection "${collection.slug}" must contain four to six selections.`,
        "VALIDATION",
      );
    }
    for (const selection of collection.selections) {
      const exists = selection.kind === "original"
        ? originalSlugs.has(selection.slug)
        : curatedIds.has(selection.slug);
      if (!exists) {
        throw new ContentError(
          `Collection "${collection.slug}" references missing ${selection.kind} "${selection.slug}".`,
          "VALIDATION",
        );
      }
    }
  }
}

function assertOriginalContributors(
  originals: Article[],
  contributors: Contributor[],
): void {
  const contributorSlugs = new Set(contributors.map((item) => item.slug));
  for (const original of originals) {
    if (!contributorSlugs.has(original.author)) {
      throw new ContentError(
        `Original "${original.slug}" references missing contributor "${original.author}".`,
        "VALIDATION",
      );
    }
  }
}

function inferContributors(articles: Article[]): Contributor[] {
  return [...new Set(articles.map((article) => article.author))].map((author) => ({
    notionPageId: `legacy-contributor-${author}`,
    displayName: author,
    slug: author,
    bio: `${author} contributes to A Rap Blog.`,
    role: "Contributor",
    links: [],
  }));
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new ContentError(`Editorial snapshot contains a duplicate ${label}.`, "VALIDATION");
  }
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ContentError(`${label} is required.`, "VALIDATION");
  }
  return value.trim();
}

function requiredSlug(value: unknown, label: string): string {
  const slug = requiredText(value, label);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new ContentError(`${label} is invalid.`, "VALIDATION");
  }
  return slug;
}

function requiredUrl(value: unknown, label: string): string {
  const url = requiredText(value, label);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    return parsed.toString();
  } catch {
    throw new ContentError(`${label} must be an HTTP URL.`, "VALIDATION");
  }
}

function validDate(value: unknown, label: string): string {
  const date = requiredText(value, label);
  if (!Number.isFinite(Date.parse(date))) {
    throw new ContentError(`${label} must be a valid date.`, "VALIDATION");
  }
  return new Date(date).toISOString();
}

function normalizedStrings(values: unknown): string[] {
  if (!Array.isArray(values)) {
    throw new ContentError("Topics must be an array.", "VALIDATION");
  }
  return [...new Set(values.map((value) => requiredText(value, "Topic")))];
}

function unavailableSnapshot(cause: unknown): ContentError {
  return new ContentError("The active content snapshot is invalid.", "UNAVAILABLE", {
    cause,
  });
}

export function validateManifest(value: unknown): ArticleManifest {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![1, 2].includes((value as { schemaVersion?: number }).schemaVersion ?? 0) ||
    typeof (value as { activeVersion?: unknown }).activeVersion !== "string" ||
    !Array.isArray((value as { articles?: unknown }).articles)
  ) {
    throw new ContentError("The content manifest is invalid.", "UNAVAILABLE");
  }
  return value as ArticleManifest;
}
