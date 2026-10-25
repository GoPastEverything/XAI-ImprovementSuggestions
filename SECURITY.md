# Security and publication review

This is a local development prototype, not an authenticated public hosting service. The API binds to loopback and rejects non-local Host/Origin requests and cross-site browser requests. Keep those protections in place. Public repository availability is not permission to expose the development server to the internet.

## What is intentionally public

- Application source, documentation, tests, and a dependency lockfile.
- An attributed snapshot of 12 public X posts and 18 saved images. This is saved data, not a connection to the author's account.
- The isolated PULSE research module with its upstream license.

## What is excluded

- Original saved HTML, ZIP archives, browser scripts, cookies, HAR files, account sessions, and OAuth token stores.
- Actual `.env` files, local discussions, imported personal snapshots, browser databases, build outputs, screenshots, and machine configuration.
- Original Git history and local Git identity settings.

Only `.env.example`, with blank credential values and local defaults, belongs in Git. Never put access tokens, cookies, client secrets, or signing secrets into frontend source or `VITE_` variables: those variables can be bundled into browser JavaScript.

## Review performed October 25, 2026

The source publication set and user-provided saved-page text assets were scanned with Gitleaks 8.30.1. Additional pattern checks covered token formats, private keys, embedded credentials, account-cookie assignments, and personal Windows paths. Findings were reviewed without printing secret values. The saved HTML/scripts were not executed or included in this repository.

Inherited permissive CORS was replaced with local-origin controls; a shared development session-signing string was replaced with a per-process random secret. Production OAuth still requires an explicitly configured secret. Dependency updates resolved the 17 initially reported npm advisories; the final dependency audit and verification results are recorded in the publication report.

No scanner or review guarantees that software has no vulnerabilities. Re-run checks when changing dependencies, importing data, enabling integrations, or preparing a deployment.

If a credential is ever committed, remove it from publication and rotate it with its issuing service. Deleting the current file alone does not remove a secret from Git history.
