import { afterEach, describe, expect, it } from "vitest";
import { serveEditorialJson } from "../../netlify/functions/editorial-json";
import { previewEditorialSnapshot } from "../data/preview-editorial";
import {
  mutateEditorialSnapshot,
  validateEditorialSnapshot,
} from "../lib/content/snapshot";
import { MemoryContentStorage } from "./helpers";

afterEach(() => {
  delete process.env.CONTEXT;
});

describe("editorial version two", () => {
  it("validates the shared preview snapshot and its collection references", () => {
    const editorial = validateEditorialSnapshot(previewEditorialSnapshot);
    expect(editorial.originals).toHaveLength(3);
    expect(editorial.curatedLinks).toHaveLength(8);
    expect(editorial.collections[0].selections).toHaveLength(5);
    expect(new Set(editorial.curatedLinks.map((item) => item.publication)).size).toBeGreaterThanOrEqual(3);
  });

  it("rejects an invalid revision without mutating the last-known-good value", () => {
    const live = structuredClone(previewEditorialSnapshot);
    const invalid = structuredClone(live);
    invalid.collections[0].selections[0].slug = "missing-selection";

    expect(() => validateEditorialSnapshot(invalid)).toThrow(
      "The active content snapshot is invalid.",
    );
    expect(validateEditorialSnapshot(live).collections[0].selections[0].slug).toBe(
      "atlanta-center-rap-universe",
    );
  });

  it("never promotes an invalid editorial revision over the live manifest", async () => {
    const storage = new MemoryContentStorage();
    await mutateEditorialSnapshot(storage, () => previewEditorialSnapshot);
    const liveVersion = storage.manifest?.activeVersion;
    await expect(
      mutateEditorialSnapshot(storage, (editorial) => {
        editorial.collections[0].selections[0].slug = "missing-selection";
        return editorial;
      }),
    ).rejects.toThrow("The active content snapshot is invalid.");
    expect(storage.manifest?.activeVersion).toBe(liveVersion);
  });

  it("serves the complete preview snapshot with ETag and 304 support", async () => {
    process.env.CONTEXT = "deploy-preview";
    const response = await serveEditorialJson(
      new Request("https://deploy-preview-1--arapblog.netlify.app/.netlify/functions/editorial-json"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.schemaVersion).toBe(2);
    expect(body.originals).toHaveLength(3);
    expect(body.originals[0]).toMatchObject({ contentType: "Guide" });
    expect(body.curatedLinks).toEqual(
      expect.arrayContaining([expect.objectContaining({ publication: "NPR" })]),
    );
    const conditional = await serveEditorialJson(
      new Request("https://deploy-preview-1--arapblog.netlify.app/.netlify/functions/editorial-json", {
        headers: { "If-None-Match": `W/${response.headers.get("etag")}` },
      }),
    );
    expect(conditional.status).toBe(304);
  });
});
