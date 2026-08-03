# Relaunch runbook

## Safety gates

- Keep `main` and the current production deploy untouched while PR #29 is reviewed.
- Lock the current published deploy before the release.
- Keep Netlify auto-recharge disabled.
- Never configure `CONTEXT=production` locally or in a Deploy Preview.
- Preview mutation endpoints must return `403` and previews must use the empty code-backed snapshot unless a reviewed human-authored launch export is committed.

## Production environment

Server-only: `NOTION_API_KEY`, `NOTION_PUBLICATIONS_DATABASE_ID`, `NOTION_CURATED_PIECES_DATABASE_ID`, `NOTION_SELECTIONS_DATABASE_ID`, `NOTION_CONTRIBUTORS_DATABASE_ID`, `NOTION_NEWSLETTER_ISSUES_DATABASE_ID`, `NOTION_WEBHOOK_VERIFICATION_TOKEN`, `NOTION_NEWSLETTER_WEBHOOK_TOKEN`, `CONTENT_RECONCILE_SECRET`, `NEWSLETTER_RECOVERY_SECRET`, optional `KIT_API_KEY`, and optional `KIT_TEMPLATE_ID`.

Public: `PUBLIC_KIT_TIP_URL` and optional `PUBLIC_BOOKSHOP_STORE_URL`. Verify the Kit Tip page before setting the Tip URL and removing the Buy Me a Coffee fallback.

## Legacy status

The former Articles database and its three legacy pages were retired. The relaunch code returns `410 Gone` for those three paths; ordinary unknown `/articles/*` paths return `404`.

## One-deploy release

1. Configure the new databases and production-only environment values while all records remain Draft.
2. Review the exact `dev` commit and its approved test deployment; run tests, build, no-JavaScript route checks, accessibility checks, metadata checks, endpoint ETag/304 checks, and newsletter dry runs.
3. Confirm the launch inventory is exactly two Essays, two Listening Guides, four Roundups, and one Collection, all written or selected by the user.
4. Build and publish the approved commit exactly once.
5. Queue the reviewed Notion records afterward; publishing content requires no second site deployment.
6. Test signup, the verified Kit Tip page, one unscheduled Kit draft or Notion fallback, and the manual `Sent` archive flow without sending an unintended email.
7. Keep the legacy database retired; do not reintroduce `NOTION_DATABASE_ID`.

Do not publish, merge, send a broadcast, delete a database, or change production environment values without explicit operator approval.
