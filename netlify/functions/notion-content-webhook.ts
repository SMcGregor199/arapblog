import { createHmac, timingSafeEqual } from "node:crypto";
import { rejectNonProductionMutation } from "../../src/lib/content/editorial";

export default async function handler(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }


  const previewRejection = rejectNonProductionMutation();
  if (previewRejection) return previewRejection;

  const rawBody = await request.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (isVerificationDelivery(payload)) {
    console.info("Notion webhook verification token received. Set NOTION_WEBHOOK_VERIFICATION_TOKEN from this one-time delivery before verifying the subscription.", {
      verificationToken: payload.verification_token,
    });
    return new Response(null, { status: 200 });
  }

  const token = process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN?.trim();
  const signature = request.headers.get("x-notion-signature") ?? "";
  if (!token || !verifyNotionSignature(rawBody, signature, token)) {
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    const queueUrl = new URL(
      "/.netlify/functions/notion-content-sync",
      request.url,
    );
    const queued = await fetch(queueUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Notion-Signature": signature,
      },
      body: rawBody,
    });
    if (!queued.ok) {
      throw new Error(`Background invocation returned ${queued.status}.`);
    }
  } catch {
    return new Response("Unable to queue synchronization", { status: 503 });
  }

  return Response.json({ queued: true }, { status: 202 });
}

export function verifyNotionSignature(
  rawBody: string,
  signature: string,
  verificationToken: string,
): boolean {
  const calculated = `sha256=${createHmac("sha256", verificationToken)
    .update(rawBody)
    .digest("hex")}`;
  const calculatedBuffer = Buffer.from(calculated);
  const signatureBuffer = Buffer.from(signature);
  return (
    calculatedBuffer.length === signatureBuffer.length &&
    timingSafeEqual(calculatedBuffer, signatureBuffer)
  );
}

function isVerificationDelivery(
  value: unknown,
): value is { verification_token: string } {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { verification_token?: unknown }).verification_token ===
      "string"
  );
}
