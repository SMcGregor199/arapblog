# A Rap Blog

A static Astro publication for returning rap fans who want a clear path back into active
listening.

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

## Prelaunch protection

The site is intentionally in prelaunch mode. `site.prelaunch` in `src/data/site.ts` is set to
`true`, which adds `noindex`, `nofollow`, and `noarchive` directives to every HTML page and
blocks all crawlers in `robots.txt`.

When the articles are ready and the site should be discoverable, set `site.prelaunch` to
`false`, rebuild, and confirm that `dist/robots.txt` allows crawling before deploying.

## Publishing an article

1. Draft and edit the article in Notion.
2. Copy the approved version into `src/content/articles/` as Markdown.
3. Add frontmatter matching the schema in `src/content.config.ts`.
4. Set `draft: true` while reviewing the Netlify Deploy Preview.
5. Compare the preview with the approved Notion draft, then set `draft: false`.

The repository is the canonical source for published content. V1 intentionally has no Notion
API or Airtable dependency.

## Brand configuration

The site name, pen name, contact email, support URL, and primary description live in
`src/data/site.ts`. The publication uses the pen name **vestige**.

## External services

Copy `.env.example` to `.env` for local testing. Configure the same public values in Netlify:

- `PUBLIC_BOOKSHOP_STORE_URL` — the approved Bookshop.org affiliate storefront URL.

No credential or secret is required in the browser. Leave a value blank until that service is
ready; the site renders an honest pre-launch state instead of a broken form or invented link.

Umami Cloud analytics is configured directly in `src/layouts/BaseLayout.astro`. Its website ID is
public configuration, and tracking is restricted to the production domains.

The Kit newsletter form action is configured in `src/data/site.ts`. The public form endpoint powers
the site's custom-styled signup forms without importing Kit's visual embed.

## Netlify

`netlify.toml` builds the static `dist/` directory, redirects `www.arapblog.com` to the apex
domain, and applies baseline security and cache headers.

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
