# Fix 03: optimize logo and icon assets

Priority: P1  
Risk: Low  
Primary benefit: First-load transfer

## Issue

The navigation logo is a 1100x849 PNG weighing about 392KB, but it is displayed at roughly 40px high. The favicon is a 512x512 PNG weighing about 113KB. Their source dimensions and transfer sizes are much larger than their rendered use.

These files are cached by the browser after first use, but the first authenticated page pays the cost. Without long-lived cache headers, they may also be revalidated more often than necessary.

## Desired behavior

- The navigation logo remains visually crisp on standard and high-density displays.
- Transparency is preserved.
- Favicons and Apple touch icons use purpose-sized files.
- The application manifest references valid dimensions.
- The total first-load logo/icon transfer is materially smaller.

## Proposed asset set

### Navigation logo

Create a transparent asset around 128px high for a 40px CSS slot. This provides more than 3x density for high-DPI screens without shipping the 1100px source.

Preferred formats:

- WebP for the navigation image, with PNG fallback only if a target browser requires it.
- Optimized PNG if keeping one format is operationally simpler.

Do not use AVIF for a tiny UI logo unless the encoder preserves edges and transparency without visible artifacts; byte savings may not justify compatibility and build complexity.

### Favicons

Use purpose-sized files:

- 32x32 and optionally 16x16 favicon.
- 180x180 Apple touch icon.
- 192x192 and 512x512 manifest icons if the PWA manifest advertises those sizes.

The large manifest icon should not be loaded as the ordinary browser favicon.

## Implementation steps

1. Keep the original logo source outside the runtime asset path or clearly mark it as source artwork.
2. Export the navigation logo at an appropriate high-density dimension.
3. Export favicon/touch/manifest variants at their declared sizes.
4. Update `templates/components/navigation.gohtml`, `templates/base.gohtml`, and `static/assets/manifest.json` to reference the correct variants.
5. Add explicit `width` and `height` attributes to the navigation `<img>` to reserve layout space and avoid layout shift.
6. Combine with immutable caching after filenames or URLs are versioned.

## Quality checks

Inspect assets against both light and dark themes:

- No white or dark halo around transparent edges.
- No visible ringing or color shift.
- Logo remains legible at its actual 40px display size.
- Touch icon background and mask behavior are intentional.
- Browser tabs show the correct favicon at small sizes.

## Affected files

- `static/assets/logo.png` or its replacement
- `static/assets/favicon.png` and icon variants
- `static/assets/manifest.json`
- `templates/base.gohtml`
- `templates/components/navigation.gohtml`

## Tests

- Manifest JSON remains valid and every referenced file exists.
- Declared icon dimensions match actual dimensions.
- Template render tests include the intended logo/favicon URLs and explicit navigation-image dimensions.
- Browser smoke test confirms logo and favicon requests return `200`.

## Verification

- Compare file sizes before and after.
- Open home, login, and watch pages at 1x and 2x device scale.
- Check the browser tab icon.
- Inspect the manifest in browser developer tools.
- Confirm image requests return the intended cache headers after Fix 02.

## Observability

Record asset byte sizes in the build/release output. Browser monitoring should watch image request failures and layout shift around navigation. No user-identifying telemetry is needed.

## Rollout

Ship new filenames or versioned URLs so old cached images cannot mask the result. Keep the previous source artwork outside the served runtime path for easy re-export, but do not retain oversized duplicates under URLs browsers may fetch.

## Acceptance criteria

- Navigation logo is below 50KB, preferably below 25KB.
- Ordinary favicon is below 20KB.
- No visible regression at the rendered size.
- Explicit image dimensions prevent navigation layout shift.
- Manifest icon declarations match actual pixel dimensions.
