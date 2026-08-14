# Security policy

## Supported versions

Security fixes are provided for the latest release on `main`.

## Reporting

Do not open a public issue for a vulnerability or exposed secret. Use GitHub's private vulnerability reporting for this repository. Include affected routes or components, reproduction steps, impact, and suggested mitigation when available.

Never include service-role keys, provider API keys, database credentials, `CRON_SECRET`, request headers, or connection strings in reports, logs, screenshots, fixtures, or browser bundles.

General architecture controls are documented in [docs/security.md](docs/security.md).
