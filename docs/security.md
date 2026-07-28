# Security

The intended product is read-only. It must not request private keys, sign transactions, submit on-chain writes, or expose provider credentials to browsers.

Provider access will run only in Supabase Edge Functions behind narrow adapters. Secrets stay in Edge Function or GitHub Actions configuration. The browser may receive only the Supabase URL and publishable public key.

Supabase tables must enable row-level security. Anonymous clients may select only approved publication-safe views and must receive no insert, update, or delete policy. Privileged writes use server-side credentials only. There is no auth or admin system; curated changes flow through repository review, validation, and idempotent sync.
