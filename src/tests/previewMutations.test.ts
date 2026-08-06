import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import reconcile from "../../netlify/functions/content-reconcile";
import notionImage from "../../netlify/functions/notion-image";
import backgroundSync from "../../netlify/functions/notion-content-sync";
import newsletterRecovery from "../../netlify/functions/newsletter-recover";
import newsletterWebhook from "../../netlify/functions/newsletter-webhook";
import roundupResearch from "../../netlify/functions/daily-roundup-research";

beforeEach(() => {
  process.env.ARAPBLOG_RUNTIME_CONTEXT = "deploy-preview";
});

afterEach(() => {
  delete process.env.ARAPBLOG_RUNTIME_CONTEXT;
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

  it("rejects newsletter recovery before reading credentials", async () => {
    const response = await newsletterRecovery(
      new Request("https://preview.example/.netlify/functions/newsletter-recover", {
        method: "POST",
        body: JSON.stringify({ pageId: "issue" }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects newsletter webhooks outside production", async () => {
    const response = await newsletterWebhook(
      new Request("https://preview.example/.netlify/functions/newsletter-webhook", {
        method: "POST",
        body: JSON.stringify({ verification_token: "token" }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("stops scheduled roundup research before reading credentials or writing Notion", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(roundupResearch()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("Rejected non-production roundup research run");
  });
});
