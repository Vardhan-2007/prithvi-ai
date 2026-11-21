# Security policy

PRITHVI AI is an experimental prototype and is **not** an emergency or alerting system. Please do not rely on it for safety decisions.

## Reporting a vulnerability
Please **do not open a public issue** for security problems. Use GitHub's private reporting instead:
**Security tab → "Report a vulnerability"** on this repository.

Include what you found, how to reproduce it, and the impact you expect. We will acknowledge reports as soon as we can and fix confirmed issues in a reasonable time.

## Scope notes
* The API has no authentication and is meant for local development. Do not expose it to the internet as is.
* Never commit secrets. `.env` files are git-ignored; use `.env.example` as the template.
