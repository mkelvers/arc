# Fix 12: reduce the Reviews payload

Priority: P2  
Risk: Medium  
Primary benefit: Initial HTML transfer, DOM size, and scanability

## Issue

The audited Reviews page took 1.20s and returned about 234KB of initial HTML. Every review body is rendered in full. One long review can dominate the viewport and response size before the user has chosen to read it.

HTTP compression from Fix 02 will produce a large immediate improvement because review text compresses well, but it will not reduce DOM size, layout work, or the visual wall of text.

## Goal

- Preserve access to full reviews.
- Render a compact, useful initial list.
- Fetch a full review body only when requested.
- Keep pagination/infinite loading intact.
- Preserve server-side HTML escaping and accessibility.

## Recommended design

Render every review card returned by the upstream page, but render only a bounded preview body initially.

Each card includes:

- Existing author/date/score/tags/reactions.
- Review preview, for example 900-1200 Unicode characters.
- “Read more” button only when truncated.
- Stable review ID and source page in the expansion request.

When expanded, HTMX requests a server-rendered full-body fragment and swaps only that card's body. The full body can include a “Collapse” action that restores the preview locally or requests the preview fragment.

Do not use a CSS line clamp alone: it improves appearance but still transfers and lays out the full text.

## Preview generation

Generate previews on the server using Unicode runes, not byte slicing. Prefer these rules:

1. Normalize only presentation-safe whitespace; preserve paragraph intent.
2. Stop near the configured limit at a word boundary.
3. Add an ellipsis only when truncated.
4. Keep the original full review unchanged in the domain/provider cache.
5. Return `IsTruncated` explicitly to the template.

Avoid summarization or rewriting. The preview must be a faithful prefix of the user's review.

## Full-review endpoint

One possible route:

```text
GET /anime/:animeID/reviews/:reviewID?source_page=N
```

The handler:

1. Validates anime ID, review ID, and source page.
2. Loads the relevant Jikan review page through the existing cache.
3. Finds the exact review ID.
4. Renders a full-review-body fragment.
5. Returns `404` if the review is absent instead of guessing another page.

The source page parameter prevents scanning every upstream page. Do not trust it without validating that the returned review ID matches.

An even simpler alternative is linking to the existing external review URL. Use that only if leaving the application is acceptable product behavior.

## Pagination behavior

Continue rendering every review metadata card from each upstream page, so no reviews are skipped. The existing intersection sentinel can continue loading subsequent pages. Those appended cards should also use previews.

Prevent repeated sentinel requests with the current `once` behavior and preserve an explicit failure state if the next page cannot load.

## Accessibility

- Use a real button for Read more/Collapse.
- Set `aria-expanded` and `aria-controls` against a stable review-body ID.
- After expansion, keep focus on the same control or move it only if necessary.
- Do not hide spoiler labels when truncating.
- Expanded text remains ordinary readable HTML text, not a modal.

## Caching

- Initial and expansion handlers should use the existing Jikan cache.
- Do not add shared caching of user-specific page chrome.
- Compression applies to both full pages and fragments.
- A small server-side preview computation needs no separate cache unless profiling proves otherwise.

## Affected files

- `internal/anime/reviews_handler.go`
- `internal/anime/service.go` or a presentation mapper
- Review display/domain types
- `templates/reviews.gohtml`
- Anime handler registration
- Review handler/template tests

## Tests

- Short review renders fully without Read more.
- Long review truncates at a valid Unicode/word boundary.
- Preview is a faithful prefix.
- Full endpoint returns the exact review by ID and page.
- Wrong review/page combination returns `404`.
- HTMX fragment contains full escaped text.
- Appended pagination cards also use previews.
- Spoiler/preliminary labels and reactions remain intact.
- `aria-expanded`/`aria-controls` are correct.

## Observability

Track initial Reviews response bytes, server duration, expansion requests, and next-page failures. Do not log review text.

## Rollout

1. Ship HTTP compression first.
2. Add preview fields and templates behind a conservative preview length.
3. Add full expansion endpoint and browser verification.
4. Adjust preview length from real usage, not solely byte targets.

## Acceptance criteria

- Initial uncompressed Reviews HTML is below 100KB for the audited anime.
- Full review text remains available on demand.
- No review is skipped because of previewing.
- Expansion requires no full page reload.
- Unicode text, spoiler state, and keyboard behavior remain correct.
