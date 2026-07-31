# A Rap Blog

An Astro publication for original rap criticism and carefully selected outside writing. Static
pages are prerendered; editorial routes are rendered on demand from an atomic version-two
Netlify Blob snapshot. Deploy Previews use a code-backed snapshot and cannot mutate Notion or
Blobs.

## Local development

The project uses Node 24.6.0 (see `.nvmrc`). With `nvm`, run:

```bash
nvm use
npm install
npm run dev
```

Run the production checks with:

```bash
npm run build
```

## Crawler protection

`site.prelaunch` in `src/data/site.ts` controls site-wide crawler protection. It is currently
disabled. Re-enable it only for an intentionally private staging publication.

## Publishing an article

Notion is the canonical editorial source. A signed Notion webhook promotes only revisions whose
`Sync State` is `Queued`; ordinary edits to a published page become `Changes pending` and leave
the current public snapshot untouched.

The runtime flow is:

```text
Notion → notion-to-md → Netlify Blobs → ReactMarkdown → server-rendered HTML
```

Publishing, updating, and unpublishing do not trigger a Netlify deployment. See
[`docs/notion-publishing.md`](docs/notion-publishing.md) for the database template, connection,
webhook, reconciliation, activation, and recovery procedures.

The version-two snapshot contains `originals`, `curatedLinks`, `collections`, and `contributors`.
`articles-json` remains backward-compatible by returning only originals; `editorial-json` returns
the complete snapshot with ETag support. Curated links always lead to their canonical publication
and remain out of RSS as individual items; originals and collections are included.

The three launch guides are preserved verbatim in the generated preview snapshot with their
existing slugs and publication dates. Production continues to read the atomic Blob snapshot.

## Brand configuration

The site name, pen name, contact email, support URL, and primary description live in
`src/data/site.ts`. The publication uses the pen name **vestige**.

## External services

Copy `.env.example` to `.env` for local testing. Configure the public value in Netlify:

- `PUBLIC_BOOKSHOP_STORE_URL` — the approved Bookshop.org affiliate storefront URL.

Configure the five server-only content values in Netlify:

- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`
- `NOTION_CONTRIBUTORS_DATABASE_ID`
- `NOTION_WEBHOOK_VERIFICATION_TOKEN`
- `CONTENT_RECONCILE_SECRET`

None of these values is exposed to browser code. Local development and every non-production
Netlify context use the immutable preview dataset and reject content mutation. Production page
loads never query Notion; they read the active Blob snapshot.

Umami Cloud analytics is configured directly in `src/layouts/BaseLayout.astro`. Its website ID is
public configuration, and tracking is restricted to the production domains.

The Kit newsletter form action is configured in `src/data/site.ts`. The public form endpoint powers
the site's custom-styled signup forms without importing Kit's visual embed.

## Netlify

`netlify.toml` builds the hybrid Astro output, redirects `www.arapblog.com` to the apex domain,
and applies baseline security and asset cache headers. Article-dependent responses add a
30-second Netlify CDN cache with stale-while-revalidate.

After creating the Netlify site:

1. Connect the GitHub repository.
2. Add `arapblog.com` as the primary domain and enable Netlify DNS.
3. Confirm HTTPS and the `www` redirect.
4. Keep Personal-plan auto recharge disabled unless intentionally approved.
5. Add the external-service environment values only as each service is introduced.

## Editorial and commercial rules

- Personal reactions are presented as opinion; factual claims should be sourced.
- Do not claim to have tested or owned a product when that is not true.
- Use original, owned, licensed, or explicitly permitted images.
- Set `hasAffiliateLinks: true` only for content prepared to carry monetized links.
- The article template displays a plain-language disclosure whenever an active Bookshop
  storefront URL is present.
