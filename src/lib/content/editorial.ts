import {
  editorialFoundationCollections,
  editorialFoundationCuratedLinks,
  previewEditorialSnapshot,
} from "../../data/preview-editorial";
import { serverEnvironment } from "./environment";
import { readActiveEditorialSnapshot } from "./snapshot";
import { createBlobContentStorage, type ContentStorage } from "./storage";
import type { EditorialSnapshot } from "./types";

export function isProductionContext(): boolean {
  return serverEnvironment("CONTEXT") === "production";
}

export function previewContentEnabled(): boolean {
  return !isProductionContext();
}

export async function getEditorialSnapshot(
  storage?: ContentStorage,
): Promise<EditorialSnapshot> {
  if (previewContentEnabled() && !storage) {
    return structuredClone(previewEditorialSnapshot);
  }
  const editorial = (
    await readActiveEditorialSnapshot(storage ?? createBlobContentStorage())
  ).editorial;
  if (
    editorial.curatedLinks.length === 0 &&
    editorialFoundationCollections.every((collection) =>
      collection.selections.every(
        (selection) =>
          selection.kind === "curated" ||
          editorial.originals.some((original) => original.slug === selection.slug),
      ),
    )
  ) {
    editorial.curatedLinks = structuredClone(editorialFoundationCuratedLinks);
    editorial.collections = structuredClone(editorialFoundationCollections);
  }
  const vestigeIndex = editorial.contributors.findIndex(
    (contributor) => contributor.slug === "vestige",
  );
  if (vestigeIndex === -1) {
    editorial.contributors.push(
      structuredClone(previewEditorialSnapshot.contributors[0]),
    );
  } else if (editorial.contributors[vestigeIndex].notionPageId.startsWith("legacy-")) {
    editorial.contributors[vestigeIndex] = structuredClone(
      previewEditorialSnapshot.contributors[0],
    );
  }
  return editorial;
}

export function rejectNonProductionMutation(): Response | undefined {
  if (isProductionContext()) return undefined;
  return new Response("Content mutation is disabled outside production.", {
    status: 403,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
