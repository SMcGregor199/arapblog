# Notion publishing operations

## Isolation

Create a separate internal Notion connection for A Rap Blog. Give it access only to two new
databases named **A Rap Blog Originals** and **A Rap Blog Contributors**. Do not reuse the
personal-site connection or share other pages with it.

Configure the following database properties exactly. Property names are part of the integration
contract.

| Property | Notion type | Configuration |
| --- | --- | --- |
| `Name` | Title | Required |
| `Slug` | Text | Leave blank on first publication to generate it from `Name`; immutable afterward |
| `Description` | Text | Required |
| `Content Type` | Select | `Criticism`, `Essay`, `Interview`, `Reported Feature`, `History`, `Guide`, `News Analysis` |
| `Contributor Slug` | Text | Required; must match a published contributor profile |
| `Tags` | Multi-select | Zero or more public tags |
| `Hero Label` | Text | Required |
| `Hero Alt` | Text | Required, descriptive alternative text |
| `Accent` | Select | `clay`, `lime`, `violet` |
| `Has Affiliate Links` | Checkbox | Enables the article disclosure when the storefront is configured |
| `Featured` | Checkbox | Used by the homepage; the newest article is the fallback |
| `Hero Image Source` | URL | Optional; owned, commissioned, licensed, or original artwork only |
| `Hero Image Alt` | Text | Required whenever `Hero Image Source` is present |
| `Hero Image Credit` | Text | Optional visible credit |
| `Hero Image Credit URL` | URL | Optional creator or license URL |
| `Published` | Checkbox | Managed by the sync service |
| `Publication Date` | Date | Managed by the sync service and set once |
| `Sync State` | Select | `Draft`, `Changes pending`, `Queued`, `Published`, `Unpublish queued`, `Failed` |
| `Sync Error` | Text | Managed by the sync service |
| `Last Synced At` | Date | Managed by the sync service |
| `Publish / Update` | Button | Edit `Sync State` to `Queued` |
| `Unpublish` | Button | Edit `Sync State` to `Unpublish queued` |

Use a database template that initializes `Sync State` to `Draft`, leaves `Published` unchecked,
and includes a short reminder that raw HTML is not rendered. Standard Notion blocks, nested
blocks, lists, tables, task lists, and images are supported. Image captions become alt text;
uncaptioned images receive the generic `Article image` fallback and should be corrected before
publication.

Configure **A Rap Blog Contributors** with these properties. It uses the same Draft → Changes
pending → Queued → Published lifecycle and failure behavior as originals.

| Property | Notion type | Configuration |
| --- | --- | --- |
| `Name` | Title | Public display name; required |
| `Slug` | Text | Generated from `Name` on first publication; immutable afterward |
| `Bio` | Text | Required public biography |
| `Role` | Select | Required, for example `Founding editor` or `Contributor` |
| `Website` | URL | Optional |
| `Bluesky` | URL | Optional |
| `Instagram` | URL | Optional |
| `Published` | Checkbox | Managed by the sync service |
| `Sync State` | Select | `Draft`, `Changes pending`, `Queued`, `Published`, `Unpublish queued`, `Failed` |
| `Sync Error` | Text | Managed by the sync service |
| `Last Synced At` | Date | Managed by the sync service |
| `Publish / Update` | Button | Edit `Sync State` to `Queued` |
| `Unpublish` | Button | Edit `Sync State` to `Unpublish queued` |

## Netlify values

Add these values as private environment variables for Functions and Runtime:

- `NOTION_API_KEY`: token for the isolated connection.
- `NOTION_DATABASE_ID`: ID of **A Rap Blog Originals**. The code resolves its first data source.
- `NOTION_CONTRIBUTORS_DATABASE_ID`: ID of **A Rap Blog Contributors**.
- `NOTION_WEBHOOK_VERIFICATION_TOKEN`: token created while verifying the webhook subscription.
- `CONTENT_RECONCILE_SECRET`: a long random recovery secret.

`PUBLIC_BOOKSHOP_STORE_URL` remains the only public external-service value. Never add `PUBLIC_`
to a Notion or reconciliation secret.

## Webhook

Create the subscription against:

```text
https://arapblog.com/.netlify/functions/notion-content-webhook
```

Subscribe to:

- `page.created`
- `page.undeleted`
- `page.content_updated`
- `page.properties_updated`
- `page.deleted`

The initial Notion verification delivery is acknowledged without changing content. Subsequent
deliveries must have a valid `X-Notion-Signature` HMAC-SHA256 signature. The public handler
verifies the raw request before invoking the protected `notion-content-sync` Background
Function, then responds with `202`.

The verification branch acknowledges the one-time `verification_token` without logging or
persisting it. No verification delivery enters the content synchronization branch.

Events are claimed by event ID. A repeated delivery is ignored after completion. Distinct
concurrent events use conditional manifest writes and retry against the latest active version.

## Publication behavior

1. Complete the body and all required properties.
2. Click **Publish / Update**.
3. The next properties webhook converts the entire page, validates metadata and its body,
   calculates reading time at 200 words per minute, caches every image as WebP, writes an
   immutable content version, and updates the manifest last.
4. After promotion, the service sets `Published`, `Publication Date`, `Last Synced At`, and
   `Sync State`.

After first publication, `Slug` is immutable. Changing it makes the queued revision fail while
the old version remains live. Duplicate slugs, unsupported select values, missing required text,
empty bodies, image failures, or Blob failures behave the same way. `Sync State` becomes `Failed`
and `Sync Error` explains the failure.

Ordinary edits to a published page set `Changes pending`; they do not alter the public version.
Click **Publish / Update** when the revision is approved. Click **Unpublish** to atomically remove
the article. Deleting a published page removes it by Notion page ID.

## Reconciliation and recovery

The reconciliation endpoint accepts only `POST` with the secret as a bearer token. It defaults
to a dry run:

```bash
curl --fail-with-body \
  -X POST \
  -H "Authorization: Bearer $CONTENT_RECONCILE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true,"rebuild":true}' \
  https://arapblog.com/.netlify/functions/content-reconcile
```

A dry run queries and converts candidate pages but writes neither Notion nor Blobs. Review the
returned actions and normalized public metadata. To replace the active snapshot after review:

```bash
curl --fail-with-body \
  -X POST \
  -H "Authorization: Bearer $CONTENT_RECONCILE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":false,"rebuild":true}' \
  https://arapblog.com/.netlify/functions/content-reconcile
```

Use `{"dryRun":false,"rebuild":false}` to recover only queued publish/unpublish actions after a
missed webhook. A full dry-run rebuild also validates `Draft` pages so an initial migration can
be reviewed before anything is queued. A live full rebuild includes only `Published` and `Queued`
pages, excludes unpublish-queued pages, and removes live page IDs no longer returned by the
database.

## Activation checklist

1. Keep the currently published Netlify deploy locked while the new production deploy builds.
2. Create the isolated connection and both databases, then add the private Netlify values.
3. Configure and verify the webhook.
4. Copy the three migration articles into Notion as `Guide` originals with matching slugs and
   dates, set `Contributor Slug` to `vestige`, and create the vestige contributor record.
5. Run a full reconciliation dry run and compare its normalized output with the current site.
6. Queue all three pages and verify article HTML with JavaScript disabled, metadata, images, the
   homepage, `/articles`, `/reading`, `/rss.xml`, `/sitemap.xml`, `articles-json`, and
   `editorial-json`.
7. Compare the three published pages with the verbatim preview snapshot before promotion.
8. Test a revision and an unpublish/republish cycle.
9. Inspect the successful production deploy before publishing it exactly once.

Keep Netlify auto-recharge disabled unless intentionally approved, and review Function and web
request usage after the first month.

## Dependency audit exception

As of July 30, 2026, `npm audit --omit=dev` reports 16 high-severity advisories through the
`@astrojs/netlify` adapter's transitive packaging and image dependencies. The reported paths run
through `@netlify/zip-it-and-ship-it` (`brace-expansion` and `minimatch`) and `@netlify/images`
(`ipx` and its nested `sharp`). The project's direct `sharp` dependency is already `0.35.3`.

npm currently proposes resolving these advisories by forcing `@astrojs/netlify` from 8.x down to
6.4.1, which is a breaking downgrade. Do not run `npm audit fix --force`; retain this as an
upstream adapter exception and reassess when Netlify publishes a compatible dependency update.

## Public and storage endpoints

- `GET /.netlify/functions/articles-json` returns the active public article array, supports
  `ETag` and `If-None-Match`, and never refreshes Notion.
- `GET /.netlify/functions/editorial-json` returns the complete version-two snapshot, supports
  `ETag` and `If-None-Match`, and never refreshes Notion.
- `GET /.netlify/functions/notion-image?imageId=…` serves stable, cached WebP images with
  immutable caching and a last-known-good fallback.
- `content/articles/manifest.json` in the `content` Blob store identifies the active version.
- `content/articles/versions/<sha256>.json` contains immutable full article records.
- Source URL registrations live under `content/articles/image-sources/`; image bytes live in the
  separate `images` store.
