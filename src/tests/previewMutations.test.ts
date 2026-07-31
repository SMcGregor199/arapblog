import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import reconcile from "../../netlify/functions/content-reconcile";
import notionImage from "../../netlify/functions/notion-image";
import backgroundSync from "../../netlify/functions/notion-content-sync";

beforeEach(() => {
  process.env.CONTEXT = "deploy-preview";
});

afterEach(() => {
  delete process.env.CONTEXT;
  vi.restoreAllMocks();
});

describe("preview mutation isolation", () => {
  it("rejects reconciliation before reading credentials or Notion", async () => {
    const response = await reconcile(
      new Request("https://preview.example/.netlify/functions/content-reconcile", {
        method: "POST",
        body: JSON.stringify({ dryRun: false, rebuild: true }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects image refresh before reading or writing Blob state", async () => {
    const response = await notionImage(
      new Request("https://preview.example/.netlify/functions/notion-image?imageId=example"),
    );
    expect(response.status).toBe(403);
  });

  it("stops the background synchronization handler outside production", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      backgroundSync(
        new Request("https://preview.example/.netlify/functions/notion-content-sync", {
          method: "POST",
          body: "{}",
        }),
      ),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      "Rejected non-production Notion synchronization request",
    );
  });
});
