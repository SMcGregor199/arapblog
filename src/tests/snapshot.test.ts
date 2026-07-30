import { describe, expect, it } from "vitest";
import { mutateSnapshot, readActiveSnapshot } from "../lib/content/snapshot";
import { articleFixture, MemoryContentStorage } from "./helpers";

describe("content snapshots", () => {
  it("writes the immutable version before promoting the manifest", async () => {
    const storage = new MemoryContentStorage();
    const result = await mutateSnapshot(storage, () => [articleFixture()]);

    expect(storage.writes[0]).toMatch(/^version:/);
    expect(storage.writes.at(-1)).toBe("manifest");
    expect(result.manifest.activeVersion).toMatch(
      /^content\/articles\/versions\/[a-f0-9]{64}\.json$/,
    );
    expect((await readActiveSnapshot(storage)).articles[0].slug).toBe("first-path");
  });

  it("does not replace the live manifest when a version write fails", async () => {
    const storage = new MemoryContentStorage();
    await mutateSnapshot(storage, () => [articleFixture()]);
    const liveVersion = storage.manifest?.activeVersion;
    storage.failVersionWrite = true;

    await expect(
      mutateSnapshot(storage, (articles) => [
        { ...articles[0], title: "Changed title" },
      ]),
    ).rejects.toThrow("version write failed");
    expect(storage.manifest?.activeVersion).toBe(liveVersion);
  });

  it("reports unavailable storage separately from an empty result", async () => {
    const storage = new MemoryContentStorage();
    await expect(readActiveSnapshot(storage)).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    await expect(readActiveSnapshot(storage, { allowMissing: true })).resolves.toEqual(
      { manifest: null, articles: [] },
    );
  });
});
