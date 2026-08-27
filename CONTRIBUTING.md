# Contributing

## Setup

Use Node.js 22 and pnpm 11.9.0.

```bash
pnpm install --frozen-lockfile
pnpm e2e:install
pnpm check
pnpm test:e2e
```

## Data and methodology changes

- Preserve source URLs, observation dates, provenance, and uncertainty.
- Never substitute guessed, zero, or synthetic values for missing production evidence.
- Update evidence status, confidence components, notes, and source references together.
- Do not award full ownership or outside-capital completeness when that evidence is unknown.
- Prioritize ownership and financing evidence for the highest-ranked upper estimates before price-frequency work.
- Keep personal-wealth claims distinct from the value-created metric.
- Update the calculation or data-contract version when semantics change.
- Add or update focused tests for every behavior change.

Open a focused pull request describing the evidence, user-visible impact, validation performed, and any release or migration requirement. Do not edit an applied database migration; add a forward-only migration.
