# Cloudflare Pages

This repository uses **Next.js Static HTML Export**, not Vite.

Use these exact Pages settings:

| Setting                | Value                                      |
| ---------------------- | ------------------------------------------ |
| Framework preset       | Next.js (Static HTML Export)               |
| Production branch      | `main`                                     |
| Root directory         | Repository root (leave the field blank)    |
| Build command          | `pnpm --filter @crypto-founders/web build` |
| Build output directory | `apps/web/out`                             |
| Node.js                | `22`                                       |
| pnpm                   | `11.9.0`                                   |

Set these public build-time environment variables in both Preview and Production as appropriate:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT` (optional)

Only `NEXT_PUBLIC_*` values belong in the Pages build. Do not add database credentials, service-role keys, provider API keys, or `CRON_SECRET`.

Cloudflare should install with `pnpm install --frozen-lockfile`. If an explicit install command is required, set `PNPM_VERSION=11.9.0` and use that command. The output is fully static and requires no Pages Functions or Next.js server runtime.
