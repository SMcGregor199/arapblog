# Notion editorial desk

Notion is the private drafting system. The public site reads only an atomically promoted schema-v3 Netlify Blob snapshot; it never renders a Notion draft directly.

## Databases

Create these five full-page databases and connect the production integration to each one.

### A Rap Blog Publications

Required properties:

| Property | Type | Notes |
| --- | --- | --- |
| Name | Title | Required |
| Publication Type | Select | Exactly `Essay`, `Roundup`, `Collection`, `Listening Guide` |
| Slug | Rich text | Generated on first publication; immutable afterward |
| Description | Rich text | Required public dek |
| Contributor Slug | Rich text | Initially `vestige`; must resolve in Contributors |
| Topics | Multi-select | Public topic metadata |
| Hero Label / Hero Alt | Rich text | Both required |
| Accent | Select | `clay`, `lime`, or `violet` |
| Hero Image Source / Alt / Credit / Credit URL | URL or rich text | Optional source; alt required when used |
| Has Affiliate Links / Featured / Published | Checkbox | Metadata flags |
| Publication Date / Last Synced At | Date | Original date is frozen after first publish |
| Sync State | Select | `Draft`, `Changes pending`, `Queued`, `Published`, `Unpublish queued`, `Failed` |
| Sync Error | Rich text | Actionable validation or service error |

Create filtered views and page templates named **Essays**, **Roundups**, **Collections**, and **Listening Guides**. Each view filters its matching Publication Type. Each template preselects its type and Draft state. The Listening Guides template begins with the archive philosophy: provide an opinionated route into an artist, scene, album, or idea; say where to start and what to listen for; leave room for the reader’s own relationship with the music.

### A Rap Blog External Pieces

Properties: `Name` (title), `ID` (rich text slug), `Canonical URL` (URL), `Writer` (rich text), `Source Publication` (rich text), `Original Date` (date), `Topics` (multi-select), `Annotation` (rich text), and `Roundup` (one relation to Publications). Canonical URLs are unique after host/trailing-slash normalization.

The daily research collector may create private rows with an `auto-YYYYMMDD-…` ID and a neutral AI-generated factual summary in `Annotation`. These rows are research drafts only: the editor must review and, where needed, edit the annotation before assigning them to a Roundup or creating a Collection Contents row. The collector never creates assignments, selections, publications, or public content.

After a non-empty batch, the collector adds one Notion comment to the first imported row and @mentions **Shayne** with links to the batch. The A Rap Blog connection needs **Read user information** and **Insert comments** enabled. Set `NOTION_RESEARCH_NOTIFICATION_USER_ID` only if the connection cannot resolve Shayne from the Notion display name.

Use the **Available for Roundups** view to work from the unused queue. Set an External Piece’s `Roundup` relation to exactly one Roundup; it then leaves that view. Roundups are automatically ordered by Original Date, oldest first, with title as the alphabetical tie breaker. Clearing the relation makes a piece available again. An External Piece may still be reused in Collections.

### A Rap Blog Publication Contents

Properties: `Name` (title), `Appears In` (relation to Publications), `Display Order` (number), `External Piece` (relation), and `Internal Publication` (relation). Exactly one target relation is required for Collections.

- Roundups are composed only from External Pieces’ direct `Roundup` assignments, ordered by Original Date and then title; do not create Publication Contents rows for a Roundup.
- A Collection may select Essays, Listening Guides, and External Pieces, including pieces already assigned to a Roundup.
- A Collection may not select a Roundup or Collection.
- Order values must be positive and unique within the parent.

Editing an External Piece or Publication Contents row moves every affected published parent to `Changes pending`. All affected parents must be `Queued` before a shared dependency can be promoted. The complete valid graph is written as a new immutable Blob object before the manifest pointer changes.

### A Rap Blog Contributors

Retain the existing contributor model and begin with only `vestige`. Required fields are `Name`, `Slug`, `Role`, `Bio`, `Links JSON`, `Published`, `Sync State`, `Sync Error`, and `Last Synced At`.

### A Rap Blog Monthly Newsletter Issues

Properties: `Name`, unique `Coverage Month` (`YYYY-MM`), `Subject`, `Preview Text`, `Workflow State` (`Draft`, `Ready`, `Processing`, `Sent`, `Failed`), `Generated Content Hash`, `Kit Broadcast ID`, `Fallback Page ID`, and `Error`. Write the editor’s note in the page body.

Create one issue for the previous calendar month in `America/New_York`. `Ready` creates or updates an unscheduled Kit draft; with no Kit API key it creates or updates a `Copy-ready email` child page. It never sends. After the editor sends manually, set `Sent`; the exact generated issue is frozen into the public snapshot.

## Publish lifecycle

1. Keep every launch record Draft while databases and environment values are configured.
2. Review two Essays, two Listening Guides, four Roundups, and one Collection. All publication prose and selections must be supplied by the editor; an imported External Piece’s AI research summary must be reviewed and edited where needed before selection.
3. Run the production reconciliation endpoint with `{"dryRun":true,"rebuild":true,"validateLaunchInventory":true}`.
4. Set the complete intended graph to `Queued`. A webhook validates and atomically promotes it.
5. Edits to live records become `Changes pending`; they do not replace the live version.
6. Set `Unpublish queued` to remove a publication from the next snapshot.

Preview contexts return `403` before reading credentials or mutating Notion/Blobs. The code-backed preview contains no editorial fixtures until an approved launch export is intentionally added.

One Notion connection receives every editorial event. Give it access to all five databases, then subscribe it to `/.netlify/functions/notion-content-webhook`; that handler routes Newsletter Issue pages internally. During Notion's one-time verification delivery, copy the token from the production function log into `NOTION_WEBHOOK_VERIFICATION_TOKEN`, then verify the subscription in Notion.

To retry a failed or missed issue event in production, POST `{"pageId":"…"}` to `/.netlify/functions/newsletter-recover` with `Authorization: Bearer $NEWSLETTER_RECOVERY_SECRET`. The same content hash and stored draft/fallback IDs preserve idempotency.

The legacy Articles database has been retired. The manifest still promotes immutable version objects, but the active editorial system uses only the five databases above.
