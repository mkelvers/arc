# Search result deduplication and compact-row QA

- Source visual truth: `/var/folders/65/gdrklgyn4tq96wjjy_pxxtnr0000gn/T/TemporaryItems/NSIRD_screencaptureui_UZt20a/Screenshot 2026-08-08 at 21.34.02.png`
- Hover visual truth: `/var/folders/65/gdrklgyn4tq96wjjy_pxxtnr0000gn/T/TemporaryItems/NSIRD_screencaptureui_y1bHBn/Screenshot 2026-08-08 at 21.34.41.png`
- Movie visual truth: `/var/folders/65/gdrklgyn4tq96wjjy_pxxtnr0000gn/T/TemporaryItems/NSIRD_screencaptureui_GswdTx/Screenshot 2026-08-08 at 21.34.48.png`
- Source problem evidence: `/var/folders/65/gdrklgyn4tq96wjjy_pxxtnr0000gn/T/TemporaryItems/NSIRD_screencaptureui_CRSrfn/Screenshot 2026-08-08 at 21.33.29.png`
- Source pixels: 977 x 275 default series, 993 x 277 hover series, 1018 x 162 movies
- Intended implementation viewport: 1084 x 626 CSS pixels at density 1
- Implementation screenshot: unavailable
- State: desktop dark theme, `slime` results, default and first-card hover
- Density normalization: not applicable; an implementation capture could not be produced

## Full-view comparison evidence

The source images were opened and inspected at their original resolution. The local implementation redirected to Arc's human-verification screen before the search route could render. A same-state full-view comparison therefore could not be completed.

## Focused-region comparison evidence

The focused sources establish three-column compact rows with 2:3 posters, title and secondary metadata at right, no default card background, and a surfaced hover state containing rating and actions. The implementation follows those explicit properties, but browser-rendered evidence is unavailable for a pixel-level comparison.

## Findings

- [P1] Rendered fidelity is unverified
  - Location: search route, default and hover states.
  - Evidence: source captures are available, but the implementation capture is blocked by the human-verification route.
  - Impact: typography, compact-row density, hover alignment, and responsive spacing cannot be judged against the references.
  - Fix: complete the human-verification step in an available browser, capture the search route at 1084 x 626, and compare the default and hover states side by side with the references.

## Required fidelity surfaces

- Fonts and typography: implemented with Arc's Inter system and reference-aligned weights; rendered wrapping remains unverified.
- Spacing and layout rhythm: three-column compact-row grids with six initially visible results are implemented; rendered proportions remain unverified.
- Colors and visual tokens: search uses the former header color and the global header is lighter; rendered contrast remains unverified.
- Image quality and asset fidelity: Top Results deduplicate identical rendered backdrop URLs and compact rows use stored TMDB posters without new TMDB requests; actual crop quality remains unverified.
- Copy and content: `Top Results`, `Series`, `Movies`, `SEE MORE`, audio labels, ratings, genres, and action tooltips match the requested content model.

## Comparison history

- Previous pass: blocked before implementation capture by Arc's human-verification screen.
- Current pass: repeated top-result artwork is now deduplicated and poster tiles are replaced by the supplied compact-row design; post-fix capture remains blocked by the same verification screen.

## Implementation checklist

- Capture the verified search route at the reference viewport.
- Compare default top-result cards, first-card hover, poster sections, and see-more detail.
- Fix any P1/P2 mismatches before changing the final result.

final result: blocked
