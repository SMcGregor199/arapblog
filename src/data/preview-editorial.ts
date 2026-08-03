import type { EditorialSnapshot } from "../lib/content/types";

// Deploy Previews intentionally contain no editorial work. A launch export may be
// added here only after the human-authored inventory has been reviewed.
export const previewEditorialSnapshot: EditorialSnapshot = {
  schemaVersion: 3,
  publications: [],
  curatedPieces: [],
  newsletterIssues: [],
  contributors: [
    {
      notionPageId: "preview-contributor-vestige",
      displayName: "vestige",
      slug: "vestige",
      role: "Founding editor",
      bio: "vestige is the founding editor of A Rap Blog.",
      links: [],
    },
  ],
};
