import type { PageObjectResponse } from "@notionhq/client";
import { describe, expect, it, vi } from "vitest";
import {
  ContributorSynchronizer,
  type ContributorSyncSource,
} from "../lib/content/contributor-sync";
import { readActiveEditorialSnapshot } from "../lib/content/snapshot";
import type { Contributor } from "../lib/content/types";
import { MemoryContentStorage } from "./helpers";

const page = { object: "page", id: "contributor-1" } as PageObjectResponse;
const contributor: Contributor = {
  notionPageId: "contributor-1",
  displayName: "vestige",
  slug: "vestige",
  bio: "Founding editor of A Rap Blog.",
  role: "Founding editor",
  links: [],
};

function sourceFixture(): ContributorSyncSource {
  return {
    queryPages: vi.fn(async () => [page]),
    retrievePage: vi.fn(async () => page),
    belongsToDatabase: vi.fn(async () => true),
    contributorFromPage: vi.fn(() => contributor),
    readSyncStatus: vi.fn(() => ({
      published: false,
      syncState: "Queued" as const,
    })),
    markPublished: vi.fn(async () => undefined),
    markUnpublished: vi.fn(async () => undefined),
    markChangesPending: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
  };
}

describe("contributor synchronization", () => {
  it("promotes a queued contributor through the same atomic snapshot lifecycle", async () => {
    const storage = new MemoryContentStorage();
    const source = sourceFixture();
    await new ContributorSynchronizer(storage, source).processWebhook({
      id: "event-contributor-1",
      type: "page.properties_updated",
      entity: { type: "page", id: page.id },
      authors: [{ type: "person", id: "editor" }],
    });

    const active = await readActiveEditorialSnapshot(storage);
    expect(active.editorial.contributors).toEqual([contributor]);
    expect(source.markPublished).toHaveBeenCalledWith(contributor);
    expect(storage.writes.at(-1)).toBe("manifest");
  });
});
