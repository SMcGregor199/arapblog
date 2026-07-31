import { describe, expect, it } from "vitest";
import { isLiveEntryNotFoundError } from "../lib/content/repository";

describe("live article route errors", () => {
  it("distinguishes a missing live entry from a content outage", () => {
    const notFound = new Error("Entry was not found.");
    notFound.name = "LiveEntryNotFoundError";

    expect(isLiveEntryNotFoundError(notFound)).toBe(true);
    expect(isLiveEntryNotFoundError(new Error("Blob store unavailable"))).toBe(false);
    expect(isLiveEntryNotFoundError(null)).toBe(false);
  });
});
