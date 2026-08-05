import { timingSafeEqual } from "node:crypto";
import { rejectNonProductionMutation } from "../../src/lib/content/editorial";
import { ContributorSynchronizer } from "../../src/lib/content/contributor-sync";
import { NotionContributorSource } from "../../src/lib/content/notion-contributors";
import { createNotionArticleSource } from "../../src/lib/content/notion";
import { NotionEditorialGraphSource } from "../../src/lib/content/notion-graph";
import { assertLaunchInventory } from "../../src/lib/content/launch";
import { createBlobContentStorage } from "../../src/lib/content/storage";

interface ReconcileRequest {
  dryRun?: boolean;
  rebuild?: boolean;
  validateLaunchInventory?: boolean;
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const previewRejection = rejectNonProductionMutation();
  if (previewRejection) return previewRejection;

  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: ReconcileRequest;
  try {
    body = (await request.json()) as ReconcileRequest;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (
    (body.dryRun !== undefined && typeof body.dryRun !== "boolean") ||
    (body.rebuild !== undefined && typeof body.rebuild !== "boolean")
    || (body.validateLaunchInventory !== undefined && typeof body.validateLaunchInventory !== "boolean")
  ) {
    return new Response("dryRun, rebuild, and validateLaunchInventory must be booleans", { status: 400 });
  }

  const dryRun = body.dryRun ?? true;
  try {
    const storage = createBlobContentStorage();
    const notion = createNotionArticleSource(storage, {
      persistImages: !dryRun,
      prewarmImages: !dryRun,
    });
    const reconcileOptions = { dryRun, rebuild: body.rebuild ?? false };
    const graph = new NotionEditorialGraphSource(storage, notion.notion);
    const preview = await graph.buildGraph();
    if (body.validateLaunchInventory) assertLaunchInventory(preview.editorial.publications);
    const result = dryRun
      ? { dryRun: true, rebuild: reconcileOptions.rebuild, publications: preview.editorial.publications.map((item) => ({ slug: item.slug, publicationType: item.publicationType })) }
      : { dryRun: false, rebuild: reconcileOptions.rebuild, publications: (await graph.promote(preview)).publications.map((item) => ({ slug: item.slug, publicationType: item.publicationType })) };
    const contributors = await new ContributorSynchronizer(
      storage,
      new NotionContributorSource(notion.notion),
    ).reconcile(reconcileOptions);
    return Response.json({ ...result, contributors }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Content reconciliation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Reconciliation failed.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.CONTENT_RECONCILE_SECRET?.trim() ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const supplied =
    authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : request.headers.get("x-content-reconcile-secret")?.trim() ?? "";
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    Boolean(expected) &&
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}
