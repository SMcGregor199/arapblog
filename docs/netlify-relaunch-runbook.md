# Netlify relaunch runbook

## Credit guardrail

Keep Netlify auto-recharge disabled. Deploy Previews and branch deploys do not consume deployment
credits; preview visits can still consume requests, bandwidth, and Function compute. The relaunch
budget is approximately 15–18 credits: low single-digit review traffic plus exactly one 15-credit
production publication. See Netlify’s
[credit-based pricing reference](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/).

There must be no second production publication in the relaunch billing cycle without explicit
approval.

## Preview phase

1. Keep `main` and the currently published production deploy untouched.
2. Open three PRs from `relaunch/preview-v1`, `relaunch/preview-v2`, and
   `relaunch/preview-v3`. Each branch contains the complete editorial foundation; the branches
   differ only in their default visual variant.
3. Keep all PRs open so their stable Deploy Preview URLs remain available.
4. Confirm the preview context serves the code-backed version-two snapshot and returns `403` from
   the Notion webhook, content reconciliation, image refresh, and background sync paths.
5. Address feedback on the winning preview branch. Do not merge a separate foundation PR.
6. Close and delete the two losing branches only after the winner is approved.

## Pre-merge gate

- Configure the documented Notion original and contributor database fields.
- Configure production-only environment variables and leave new Notion records unqueued.
- Run `npm test` and `npm run build` on the exact reviewed commit.
- Verify HTML without JavaScript, mobile and desktop layout, keyboard order, focus, headings,
  contrast, outbound labeling, alt text, and reduced motion.
- Verify canonical and Open Graph tags, Article and Collection JSON-LD, RSS, sitemap,
  `articles-json`, `editorial-json`, ETags, `304`, and all three existing article URLs.
- Lock the currently published Netlify deploy or stop automatic publishing before merge.

## Single publication

1. Merge the complete winning branch once.
2. Let Netlify build the merged commit while the existing deploy remains published.
3. Inspect that successful production deploy by its deploy URL.
4. Publish that deploy exactly once.
5. Queue the prepared Notion original records afterward. Webhook snapshot promotion changes Blob
   content and does not create another site deployment.
6. Record the release batch and remaining monthly allowance.
