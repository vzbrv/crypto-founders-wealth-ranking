# Production review

## Performance

- The web application remains a static export; no Next.js server runtime is required.
- Ranking and project data are bundled at build time. The status page performs one abortable, cache-bypassed request to the narrow public status view.
- Provider ingestion remains outside page requests and runs on bounded schedules.
- Metadata images are generated at build time and shared across routes.
- The production build is the release gate. No synthetic Core Web Vitals score is claimed without measuring the deployed origin.

After deployment, record mobile and desktop Lighthouse results for `/`, `/project/[slug]`, and `/status`. Investigate regressions in LCP, INP, CLS, transfer size, or request count before the next release.

## Accessibility

- A keyboard-visible skip link targets the main content on every public page.
- Global focus indicators use `:focus-visible`.
- Provider state uses text as well as color and is presented in a semantic table.
- Page regions retain headings, navigation labels, and responsive layouts.
- Browser coverage verifies skip-link focus and status-table semantics.

Automated checks do not establish WCAG conformance. Before production launch, manually review keyboard order, 200% zoom, contrast, reduced motion, and VoiceOver or NVDA announcements on the ranking, project, methodology, sources, and status pages. Log defects with route, viewport, assistive technology, and reproduction steps.

## Search and sharing

The root layout defines a title template, description, canonical base, robots directives, Twitter card, and Open Graph defaults. Route metadata supplies canonical project URLs. `robots.ts`, `sitemap.ts`, `manifest.ts`, and the generated Open Graph image are included in the static build. `NEXT_PUBLIC_SITE_URL` must be the canonical HTTPS production origin before building.
