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

## Immediate takedown (operator action)

This requires production credentials and is deliberately not run from a preview branch.

1. With production `NOTION_API_KEY` and `NOTION_DATABASE_ID` in the operator environment, run `npm run content:retire-legacy -- --confirm=retire-three-legacy-publications`. The guarded script selects exactly the three known slugs and makes no changes if any is missing.
2. Verify the webhook promotes a snapshot with zero articles.
3. Confirm the homepage and archives are `200`; confirm all three article URLs are unavailable and absent from JSON, RSS, and sitemap.
4. The script trashes the three Notion pages only after every public check passes. If verification times out, it leaves them unarchived for recovery. Keep the now-empty legacy database.

The relaunch code returns `410 Gone` for those three paths. Ordinary unknown `/articles/*` paths return `404`.

## One-deploy release

1. Configure the new databases and production-only environment values while all records remain Draft.
2. Review the exact PR #29 commit and its Deploy Preview; run tests, build, no-JavaScript route checks, accessibility checks, metadata checks, endpoint ETag/304 checks, and newsletter dry runs.
3. Confirm the launch inventory is exactly two Essays, two Listening Guides, four Roundups, and one Collection, all written or selected by the user.
4. Build and publish the approved commit exactly once.
5. Queue the reviewed Notion records afterward; publishing content requires no second site deployment.
6. Test signup, the verified Kit Tip page, one unscheduled Kit draft or Notion fallback, and the manual `Sent` archive flow without sending an unintended email.
7. Only after v3 reconciliation and rollback checks pass: remove `NOTION_DATABASE_ID` and trash the empty legacy database.
8. After approval, fast-forward local `dev` to the exact reviewed PR commit.

Do not publish, merge, push, send a broadcast, delete a database, or change production environment values without explicit operator approval.
