# Security

Margin stores a private reading library. A public source repository must not contain the contents or credentials of an installation.

## Credentials and local files

- Put development secrets in ignored `.env.local`; configure deployed secrets in the hosting provider.
- Generate independent random setup and cron secrets. `.env.example` must contain no real credentials.
- Keep `.vercel/`, local databases, library exports and backups out of Git. Custom data directories must be excluded separately.
- Read tokens expose articles and annotations. Capture tokens can save URLs. Treat both as secrets and revoke them in Settings when no longer needed.
- If a credential is committed, revoke or rotate it immediately. Deleting it in a later commit does not remove it from history.

## Trust boundaries

The application has one account per installation. Passwords use salted scrypt hashes; opaque tokens are stored hashed. Browser mutations check the request origin. URL capture validates destinations and bounds retrieval; imported content is sanitized and parsing is bounded.

Library data is readable by the server and database administrator. It is not end-to-end encrypted. Backups contain private document text, annotations and potentially original files; protect them accordingly. External media and explicitly loaded video players can contact third parties.

These controls are implementation details, not a claim of an independent security audit. Review hosting configuration and dependency updates before exposing an installation.

## Reporting a vulnerability

Do not put credentials, private library content or exploitable sensitive details in a public issue. Use GitHub private vulnerability reporting if enabled on the repository. Otherwise ask the maintainer for a private reporting channel without disclosing the vulnerability publicly. Include a minimal synthetic reproduction and the affected commit in the private report.
