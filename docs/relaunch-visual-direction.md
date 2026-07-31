# Relaunch visual direction

## Project constraints and audience

A Rap Blog is a small, independent publication for readers who want criticism, context, and
discovery without the pace or hierarchy of a news portal. The same editorial snapshot, routes,
copy, outbound-credit treatment, and accessibility behavior must appear in every preview. The
variants may change presentation only. Launch artwork remains typographic and code-generated;
captured inspiration is never a product asset.

## Direction

Build a calm editorial room around one strong idea at a time: tactile enough to feel made by a
person, spacious enough for criticism to carry more weight than the interface.

## Reference translation

The Reviewed library contained 23 items. Six roles carried the implementation:

| Reference role | Why it belongs | A Rap Blog decision |
| --- | --- | --- |
| User-marked ensemble illustration | Muted teal field, warm figures, useful negative space | Version 3 uses teal as a field color and groups information around one focal form rather than a dense card wall. |
| User-marked long-form texture study | Tactile surface and irregular rhythm | Grain stays subtle and structural edges may feel hand-set; text contrast and legibility stay exact. |
| User-marked coral/teal shape composition | Small palette with confident abstract forms | Deep ink, paper cream, muted teal, and coral form the core Version 3 palette. |
| Space-suit figure | Music, technology, and cosmic atmosphere held in one image | Code-drawn orbital forms and asymmetry suggest a space-age reading room without using the captured image. |
| Scratchy robot figure | Expressive imperfection and a single memorable subject | Abstract feature forms may be irregular, but never compete with the headline. |
| Stripe motion capture | Continuous spatial movement with a stable reading surface | Hover and focus transitions use 180–240 ms movement while the text itself remains stable. |

The Pigeons & Planes and WorldStar captures are explicit anti-references. Their portal density,
advertising interruptions, sensational scale shifts, and crowded grids do not transfer.

## System guidance

- **Layout:** Version 1 evolves the paper-and-record identity with a dominant feature, tactile
  borders, and compact reading rows. Version 2 stays closest to the current component language and
  circular record motif. Version 3 uses larger negative space, asymmetric splits, and one focal
  shape per section.
- **Type:** System serif headlines carry personality; the sans face handles decks and navigation;
  mono text is limited to metadata, numbering, and labels. Reading measure remains roughly 65–75
  characters.
- **Color:** Version 1 and 2 retain ink, paper, clay, lime, and violet. Version 3 uses deep ink
  `#101b1b`, paper `#f4eddf`, muted teal `#1f6862`, and coral `#ec745f`, with restrained warm gray.
- **Spacing:** Major sections use fluid 64–144 px vertical space on desktop and 48–80 px on mobile.
  Lists remain compact enough to compare credits without becoming a portal grid.
- **Imagery:** Hero-image metadata is supported, but no image publishes without owned,
  commissioned, licensed, or original provenance and descriptive alt text. Code-drawn abstract
  forms are the launch fallback.
- **Interaction:** Outbound links use visible source context and an arrow indicator. Motion is
  spatial and quiet, never required to reveal content.
- **Motion:** The measured reference is 12.898 seconds at 60 fps. Its pacing is source evidence;
  applying it as 180–240 ms interface transitions is an editorial interpretation. Reduced-motion
  mode removes transitions and smooth scrolling completely.

## Accessibility, responsive behavior, and performance

- Server-render every route so navigation and reading work with JavaScript disabled.
- Preserve a visible skip link, three-pixel focus ring, semantic headings, and text alternatives.
- Keep touch targets at least 44 px where controls are compact; allow the five-item navigation to
  wrap without clipping.
- Collapse asymmetric grids to one column below 800 px and remove sticky positioning on mobile.
- Ship no reference media, webfont payload, or decorative JavaScript. CSS-generated texture and
  shapes keep the launch lightweight.

## Originality guardrails and non-goals

- Combine relationships from multiple references; do not reproduce a captured composition.
- Do not use Eagle files, screenshots, or thumbnails in the site.
- Do not add a breaking-news rail, infinite feed, trending score, open submission form, or search
  UI at launch.
- Do not let visual novelty obscure writer, publication, date, canonical link, or annotation.

## Hypotheses and acceptance

Each preview is scored from one to five for clarity, coherence, distinctiveness, accessibility,
feasibility, and “feels like me.” A viable winner must score at least four for clarity,
accessibility, and feasibility; preserve all content and routes with JavaScript disabled; expose no
mutation path outside production; and pass the repository test and build commands.
