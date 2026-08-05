import { previewEditorialSnapshot } from "../../data/preview-editorial";
import { serverEnvironment } from "./environment";
import { readActiveEditorialSnapshot } from "./snapshot";
import { createBlobContentStorage, type ContentStorage } from "./storage";
import type { EditorialSnapshot, Publication, PublicationType } from "./types";

export function isProductionContext(): boolean {
  return serverEnvironment("CONTEXT") === "production";
}

export function previewContentEnabled(): boolean {
  return !isProductionContext();
}

export async function getEditorialSnapshot(storage?: ContentStorage): Promise<EditorialSnapshot> {
  if (previewContentEnabled() && !storage) return structuredClone(previewEditorialSnapshot);
  return (await readActiveEditorialSnapshot(storage ?? createBlobContentStorage())).editorial;
}

export function publicationsOfType(editorial: EditorialSnapshot, type: PublicationType): Publication[] {
  return editorial.publications.filter((publication) => publication.publicationType === type);
}

export function publicationPath(publication: Pick<Publication, "publicationType" | "slug">): string {
  const roots: Record<PublicationType, string> = {
    Essay: "essays", Roundup: "roundups", Collection: "collections", "Listening Guide": "listening-guides",
  };
  return `/${roots[publication.publicationType]}/${publication.slug}`;
}

export function rejectNonProductionMutation(): Response | undefined {
  if (isProductionContext()) return undefined;
  return new Response("Content mutation is disabled outside production.", {
    status: 403,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}
