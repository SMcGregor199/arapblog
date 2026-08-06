import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import webhookHandler, {
  verifyNotionSignature,
} from "../../netlify/functions/notion-content-webhook";

beforeEach(() => {
  process.env.ARAPBLOG_RUNTIME_CONTEXT = "production";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN;
  delete process.env.ARAPBLOG_RUNTIME_CONTEXT;
});

describe("Notion webhook signatures", () => {
  it("accepts the exact HMAC-SHA256 body signature", () => {
    const body = JSON.stringify({ id: "event-1", type: "page.content_updated" });
    const token = "verification-secret";
    const signature = `sha256=${createHmac("sha256", token)
      .update(body)
      .digest("hex")}`;

    expect(verifyNotionSignature(body, signature, token)).toBe(true);
    expect(verifyNotionSignature(`${body} `, signature, token)).toBe(false);
    expect(verifyNotionSignature(body, "sha256=bad", token)).toBe(false);
  });

  it("queues a verified payload in the protected background function", async () => {
    const body = JSON.stringify({
      id: "event-1",
      type: "page.properties_updated",
      entity: { type: "page", id: "page-1" },
    });
    const token = "verification-secret";
    const signature = `sha256=${createHmac("sha256", token)
      .update(body)
      .digest("hex")}`;
    process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN = token;
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await webhookHandler(
      new Request(
        "https://arapblog.com/.netlify/functions/notion-content-webhook",
        {
          method: "POST",
          headers: { "X-Notion-Signature": signature },
          body,
        },
      ),
    );

    expect(response.status).toBe(202);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://arapblog.com/.netlify/functions/notion-content-sync"),
      expect.objectContaining({
        method: "POST",
        body,
      }),
    );
  });

  it("acknowledges the one-time verification delivery, logs its token, and does not queue", async () => {
    const fetchMock = vi.fn();
    const infoMock = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);
    const response = await webhookHandler(
      new Request(
        "https://arapblog.com/.netlify/functions/notion-content-webhook",
        {
          method: "POST",
          body: JSON.stringify({ verification_token: "one-time-token" }),
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(infoMock).toHaveBeenCalledWith(
      expect.stringContaining("verification token received"),
      { verificationToken: "one-time-token" },
    );
    infoMock.mockRestore();
  });

  it("does not log the verification token path for signed content events", async () => {
    const body = JSON.stringify({
      id: "event-2",
      type: "page.content_updated",
      entity: { type: "page", id: "page-1" },
    });
    const token = "verification-secret";
    process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN = token;
    const signature = `sha256=${createHmac("sha256", token)
      .update(body)
      .digest("hex")}`;
    const infoMock = vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 202 })));

    const response = await webhookHandler(
      new Request(
        "https://arapblog.com/.netlify/functions/notion-content-webhook",
        {
          method: "POST",
          headers: { "X-Notion-Signature": signature },
          body,
        },
      ),
    );

    expect(response.status).toBe(202);
    expect(infoMock).not.toHaveBeenCalled();
    infoMock.mockRestore();
  });

  it("rejects every webhook delivery outside production", async () => {
    process.env.ARAPBLOG_RUNTIME_CONTEXT = "deploy-preview";
    const response = await webhookHandler(
      new Request(
        "https://deploy-preview-1--arapblog.netlify.app/.netlify/functions/notion-content-webhook",
        { method: "POST", body: JSON.stringify({ verification_token: "token" }) },
      ),
    );
    expect(response.status).toBe(403);
  });
});
