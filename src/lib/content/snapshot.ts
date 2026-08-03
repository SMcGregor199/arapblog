import {
  assertUniquePublications,
  contentHash,
  legacyArticleToPublication,
  normalizePublication,
  publicationMetadata,
  sortPublications,
} from "./article";
import { ARTICLE_VERSION_PREFIX, type ContentStorage } from "./storage";
import {
  ContentError,
  type Contributor,
  type CuratedPiece,
  type EditorialSnapshot,
  type LegacyEditorialSnapshot,
  type NewsletterIssue,
  type Publication,
  type PublicationManifest,
  type StoredSnapshot,
} from "./types";

const MAX_MANIFEST_WRITE_ATTEMPTS = 4;

export async function readActiveEditorialSnapshot(
  storage: ContentStorage,
  options: { allowMissing?: boolean } = {},
): Promise<{ manifest: PublicationManifest | null; editorial: EditorialSnapshot }> {
  let manifestRead;
  try { manifestRead = await storage.readManifest(); }
  catch (error) { throw new ContentError("Published content is temporarily unavailable.", "UNAVAILABLE", { cause: error }); }
  if (!manifestRead.manifest) {
    if (options.allowMissing) return { manifest: null, editorial: emptyEditorialSnapshot() };
    throw new ContentError("Published content has not been initialized.", "UNAVAILABLE");
  }
  const manifest = validateManifest(manifestRead.manifest);
  let snapshot: StoredSnapshot | null;
  try { snapshot = await storage.readVersion(manifest.activeVersion); }
  catch (error) { throw new ContentError("Published content is temporarily unavailable.", "UNAVAILABLE", { cause: error }); }
  if (!snapshot) throw new ContentError("The active content version is unavailable.", "UNAVAILABLE");
  return { manifest, editorial: validateEditorialSnapshot(snapshot) };
}

export async function readActiveSnapshot(storage: ContentStorage, options: { allowMissing?: boolean } = {}) {
  const result = await readActiveEditorialSnapshot(storage, options);
  return {
    manifest: result.manifest,
    publications: result.editorial.publications,
    articles: result.editorial.publications.filter((item) => item.publicationType === "Essay" || item.publicationType === "Listening Guide"),
  };
}

export async function mutateEditorialSnapshot(
  storage: ContentStorage,
  mutate: (editorial: EditorialSnapshot) => EditorialSnapshot | Promise<EditorialSnapshot>,
  now: () => Date = () => new Date(),
): Promise<{ manifest: PublicationManifest; editorial: EditorialSnapshot }> {
  for (let attempt = 0; attempt < MAX_MANIFEST_WRITE_ATTEMPTS; attempt += 1) {
    const current = await storage.readManifest();
    const currentManifest = current.manifest ? validateManifest(current.manifest) : null;
    const stored = currentManifest ? await storage.readVersion(currentManifest.activeVersion) : null;
    if (currentManifest && !stored) throw new ContentError("The active content version is unavailable.", "UNAVAILABLE");
    const currentEditorial = stored ? validateEditorialSnapshot(stored) : emptyEditorialSnapshot();
    const next = validateEditorialSnapshot(await mutate(structuredClone(currentEditorial)));
    const versionKey = `${ARTICLE_VERSION_PREFIX}/${contentHash(next)}.json`;
    const manifest: PublicationManifest = {
      schemaVersion: 3,
      activeVersion: versionKey,
      generatedAt: now().toISOString(),
      publications: next.publications.map(publicationMetadata),
    };
    await storage.writeVersion(versionKey, next, { onlyIfNew: true });
    const result = await storage.writeManifest(manifest, current.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
    if (result.modified) return { manifest, editorial: next };
  }
  throw new ContentError("The content manifest changed repeatedly while this update was being promoted.", "CONFLICT");
}

export async function mutateSnapshot(
  storage: ContentStorage,
  mutate: (publications: Publication[]) => Publication[] | Promise<Publication[]>,
  now: () => Date = () => new Date(),
) {
  const result = await mutateEditorialSnapshot(storage, async (editorial) => ({
    ...editorial,
    ...await (async () => {
      const publications = await mutate([...editorial.publications]);
      const known = new Set(editorial.contributors.map((item) => item.slug));
      const missing = publications.filter((item) => !known.has(item.contributor));
      return {
        publications,
        contributors: [...editorial.contributors, ...inferContributors(missing).filter((item) => !known.has(item.slug))],
      };
    })(),
  }), now);
  return { manifest: result.manifest, publications: result.editorial.publications, articles: result.editorial.publications.filter((item) => item.publicationType === "Essay" || item.publicationType === "Listening Guide") };
}

export function validateSnapshot(value: unknown): Publication[] { return validateEditorialSnapshot(value).publications; }

export function validateEditorialSnapshot(value: unknown): EditorialSnapshot {
  try {
    const normalized = normalizeSnapshotVersion(value);
    const publications = sortPublications(normalized.publications.map(normalizePublication));
    const curatedPieces = normalized.curatedPieces.map(normalizeCuratedPiece);
    const contributors = normalized.contributors.map(normalizeContributor);
    const newsletterIssues = normalized.newsletterIssues.map(normalizeNewsletterIssue);
    assertUniquePublications(publications);
    assertUnique(curatedPieces.map((item) => item.id), "curated-piece ID");
    assertUnique(curatedPieces.map((item) => canonicalKey(item.canonicalUrl)), "curated-piece canonical URL");
    assertUnique(contributors.map((item) => item.slug), "contributor slug");
    assertUnique(contributors.map((item) => item.notionPageId), "contributor Notion page ID");
    assertUnique(newsletterIssues.map((item) => item.coverageMonth), "newsletter coverage month");
    assertPublicationGraph(publications, curatedPieces, contributors);
    return { schemaVersion: 3, publications, curatedPieces, contributors, newsletterIssues };
  } catch (error) {
    if (error instanceof ContentError && error.code === "VALIDATION") {
      throw new ContentError("The active content snapshot is invalid.", "UNAVAILABLE", { cause: error });
    }
    throw error;
  }
}

export function emptyEditorialSnapshot(): EditorialSnapshot {
  return { schemaVersion: 3, publications: [], curatedPieces: [], contributors: [], newsletterIssues: [] };
}

function normalizeSnapshotVersion(value: unknown): EditorialSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ContentError("Snapshot must be an object.", "VALIDATION");
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion === 3 && Array.isArray(candidate.publications) && Array.isArray(candidate.curatedPieces) && Array.isArray(candidate.contributors) && Array.isArray(candidate.newsletterIssues)) {
    return candidate as unknown as EditorialSnapshot;
  }
  if (candidate.schemaVersion === 1 && Array.isArray(candidate.articles)) {
    const publications = (candidate.articles as any[]).map(legacyArticleToPublication);
    return { schemaVersion: 3, publications, curatedPieces: [], contributors: inferContributors(publications), newsletterIssues: [] };
  }
  if (candidate.schemaVersion === 2 && Array.isArray(candidate.originals) && Array.isArray(candidate.curatedLinks) && Array.isArray(candidate.collections) && Array.isArray(candidate.contributors)) {
    return normalizeV2(candidate as unknown as LegacyEditorialSnapshot);
  }
  throw new ContentError("Unsupported snapshot schema.", "VALIDATION");
}

function normalizeV2(value: LegacyEditorialSnapshot): EditorialSnapshot {
  const originals = value.originals.map(legacyArticleToPublication);
  const curatedPieces: CuratedPiece[] = value.curatedLinks.map((item) => ({
    notionPageId: `legacy-curated-${item.id}`, id: item.id, title: item.title,
    canonicalUrl: item.canonicalUrl, writer: item.writer, sourcePublication: item.publication,
    originalDate: item.publishedAt, topics: item.topics, annotation: item.editorialNote,
  }));
  const publications: Publication[] = [
    ...originals,
    ...value.collections.map((collection) => ({
      notionPageId: `legacy-collection-${collection.slug}`, publicationType: "Collection" as const,
      slug: collection.slug, title: collection.title, description: collection.description,
      publishedAt: collection.publishedAt, updatedAt: collection.updatedAt, contributor: "vestige",
      topics: collection.topics, heroLabel: collection.title, heroAlt: "Abstract editorial collection artwork",
      accent: "violet" as const, hasAffiliateLinks: false, featured: false,
      bodyMarkdown: collection.introduction,
      selections: collection.selections.map((selection, index) => ({
        notionPageId: `legacy-selection-${collection.slug}-${index + 1}`,
        kind: selection.kind === "original" ? "publication" as const : "curatedPiece" as const,
        reference: selection.slug,
      })),
    })),
  ];
  return { schemaVersion: 3, publications, curatedPieces, contributors: value.contributors, newsletterIssues: [] };
}

function normalizeCuratedPiece(value: CuratedPiece): CuratedPiece {
  return {
    notionPageId: requiredText(value.notionPageId, "External Piece Notion page ID"),
    id: requiredSlug(value.id, "External Piece ID"), title: requiredText(value.title, "External Piece title"),
    canonicalUrl: requiredUrl(value.canonicalUrl, "Canonical URL"), writer: requiredText(value.writer, "Writer"),
    sourcePublication: requiredText(value.sourcePublication, "Source publication"),
    originalDate: validDate(value.originalDate, "Original date"), topics: normalizedStrings(value.topics),
    annotation: requiredText(value.annotation, "A Rap Blog annotation"),
  };
}

function normalizeContributor(value: Contributor): Contributor {
  return {
    notionPageId: requiredText(value.notionPageId, "Contributor Notion page ID"),
    displayName: requiredText(value.displayName, "Contributor display name"), slug: requiredSlug(value.slug, "Contributor slug"),
    bio: requiredText(value.bio, "Contributor bio"), role: requiredText(value.role, "Contributor role"),
    links: value.links.map((link) => ({ label: requiredText(link.label, "Contributor link label"), url: requiredUrl(link.url, "Contributor link URL") })),
  };
}

function normalizeNewsletterIssue(value: NewsletterIssue): NewsletterIssue {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.coverageMonth)) throw new ContentError("Newsletter coverage month must use YYYY-MM.", "VALIDATION");
  if (value.archiveState !== "Sent") throw new ContentError("Only Sent newsletter issues may enter the public snapshot.", "VALIDATION");
  return {
    notionPageId: requiredText(value.notionPageId, "Newsletter Notion page ID"), coverageMonth: value.coverageMonth,
    subject: requiredText(value.subject, "Newsletter subject"), previewText: requiredText(value.previewText, "Newsletter preview text"),
    editorNoteMarkdown: requiredText(value.editorNoteMarkdown, "Editor note"), sentAt: validDate(value.sentAt, "Sent date"),
    contentHash: requiredText(value.contentHash, "Newsletter content hash"), archiveState: "Sent",
    publications: value.publications.map((item) => requiredSlug(item, "Newsletter publication slug")),
    html: requiredText(value.html, "Newsletter HTML"),
  };
}

function assertPublicationGraph(publications: Publication[], curatedPieces: CuratedPiece[], contributors: Contributor[]): void {
  const bySlug = new Map(publications.map((item) => [item.slug, item]));
  const curatedIds = new Set(curatedPieces.map((item) => item.id));
  const contributorSlugs = new Set(contributors.map((item) => item.slug));
  const selectionIds: string[] = [];
  for (const publication of publications) {
    if (!contributorSlugs.has(publication.contributor)) throw new ContentError(`Publication "${publication.slug}" references missing contributor "${publication.contributor}".`, "VALIDATION");
    if (publication.publicationType !== "Roundup" && publication.publicationType !== "Collection") continue;
    for (const selection of publication.selections) {
      selectionIds.push(selection.notionPageId);
      if (publication.publicationType === "Roundup" && selection.kind !== "curatedPiece") throw new ContentError(`Roundup "${publication.slug}" may contain only External Pieces.`, "VALIDATION");
      if (selection.kind === "curatedPiece" && !curatedIds.has(selection.reference)) throw new ContentError(`Publication "${publication.slug}" references missing External Piece "${selection.reference}".`, "VALIDATION");
      if (selection.kind === "publication") {
        const target = bySlug.get(selection.reference);
        if (!target) throw new ContentError(`Collection "${publication.slug}" references missing publication "${selection.reference}".`, "VALIDATION");
        if (target.publicationType === "Roundup" || target.publicationType === "Collection") throw new ContentError(`Collection "${publication.slug}" may contain only Essays, Listening Guides, and External Pieces.`, "VALIDATION");
      }
    }
  }
  assertUnique(selectionIds, "selection Notion page ID");
}

function inferContributors(publications: Publication[]): Contributor[] {
  return [...new Set(publications.map((item) => item.contributor))].map((slug) => ({ notionPageId: `legacy-contributor-${slug}`, displayName: slug, slug, bio: `${slug} contributes to A Rap Blog.`, role: "Contributor", links: [] }));
}
function canonicalKey(value: string): string { const url = new URL(value); url.hash = ""; url.hostname = url.hostname.toLowerCase(); if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, ""); return url.toString(); }
function assertUnique(values: string[], label: string): void { if (new Set(values).size !== values.length) throw new ContentError(`Editorial snapshot contains a duplicate ${label}.`, "VALIDATION"); }
function requiredText(value: unknown, label: string): string { if (typeof value !== "string" || !value.trim()) throw new ContentError(`${label} is required.`, "VALIDATION"); return value.trim(); }
function requiredSlug(value: unknown, label: string): string { const slug = requiredText(value, label); if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ContentError(`${label} is invalid.`, "VALIDATION"); return slug; }
function requiredUrl(value: unknown, label: string): string { const url = requiredText(value, label); try { const parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(); return parsed.toString(); } catch { throw new ContentError(`${label} must be an HTTP URL.`, "VALIDATION"); } }
function validDate(value: unknown, label: string): string { const date = requiredText(value, label); if (!Number.isFinite(Date.parse(date))) throw new ContentError(`${label} must be a valid date.`, "VALIDATION"); return new Date(date).toISOString(); }
function normalizedStrings(value: unknown): string[] { if (!Array.isArray(value)) throw new ContentError("Topics must be an array.", "VALIDATION"); return [...new Set(value.map((item) => requiredText(item, "Topic")))]; }

export function validateManifest(value: unknown): PublicationManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ContentError("The content manifest is invalid.", "UNAVAILABLE");
  const manifest = value as Record<string, unknown>;
  if (![1, 2, 3].includes(Number(manifest.schemaVersion)) || typeof manifest.activeVersion !== "string") throw new ContentError("The content manifest is invalid.", "UNAVAILABLE");
  if (manifest.schemaVersion === 3 && !Array.isArray(manifest.publications)) throw new ContentError("The content manifest is invalid.", "UNAVAILABLE");
  if ((manifest.schemaVersion === 1 || manifest.schemaVersion === 2) && !Array.isArray(manifest.articles)) throw new ContentError("The content manifest is invalid.", "UNAVAILABLE");
  return manifest as unknown as PublicationManifest;
}
