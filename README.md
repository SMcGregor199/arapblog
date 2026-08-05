# A Rap Blog

An Astro publication built around Essays, Roundups, Collections, and Listening Guides. Editorial
routes are rendered on demand from an atomic version-three
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

## Publishing

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

The version-three snapshot contains `publications`, `curatedPieces`, `contributors`, and sent
`newsletterIssues`. `articles-json` is a deprecated compatibility view containing Essays and
Listening Guides; `publications-json` exposes all four publication types; `editorial-json` returns
the complete snapshot. All support ETags. External Pieces never become standalone RSS items.

The Deploy Preview snapshot intentionally contains no editorial fixtures. Launch content is added
only through a reviewed, human-authored export or the production Notion graph.

## Brand configuration

The site name, pen name, contact email, support URL, and primary description live in
`src/data/site.ts`. The publication uses the pen name **vestige**.

## External services

Copy `.env.example` to `.env` for local testing. Configure the public value in Netlify:

- `PUBLIC_KIT_TIP_URL` — the verified `Support A Rap Blog` Kit Tip page.
- `PUBLIC_BOOKSHOP_STORE_URL` — an optional approved Bookshop.org affiliate storefront URL.

Configure the server-only values listed in `.env.example`, including the five Notion database IDs,
webhook secrets, reconciliation secret, and optional Kit v4 credentials.

- `NOTION_API_KEY`
- `NOTION_PUBLICATIONS_DATABASE_ID`
- `NOTION_CURATED_PIECES_DATABASE_ID`
- `NOTION_SELECTIONS_DATABASE_ID`
- `NOTION_CONTRIBUTORS_DATABASE_ID`
- `NOTION_NEWSLETTER_ISSUES_DATABASE_ID`
- `NOTION_WEBHOOK_VERIFICATION_TOKEN`
- `CONTENT_RECONCILE_SECRET`
- `OPENAI_API_KEY` — production-only key for the optional daily Roundup research collector.
- `ROUNDUP_RESEARCH_ENABLED` — set to `true` only when the seven-day production pilot is approved.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` — optional; send an import-review notice to `vestige@arapblog.com` after a non-empty successful batch.

The daily research function is scheduled for 8:00 AM America/New_York and only runs from a
production deploy when `ROUNDUP_RESEARCH_ENABLED=true`. It writes private External Pieces only;
review its neutral AI summaries before creating Roundup selections. To enable email notices,
verify `arapblog.com` in Resend, use a sending-only API key, and set `RESEND_FROM_EMAIL` to a
sender at that domain.

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
