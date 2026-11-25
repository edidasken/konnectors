# Security

## Reporting

If you believe you have found a security issue in Konnectors, open a private report to the repository owner (GitHub Security Advisories when enabled, or contact the copyright holder). Do not open a public issue that includes secrets, tokens, hostnames, or personal data.

## Permanent no-personal-data rule

Nothing personal or sensitive ever goes in this repository: no secrets, tokens, keys, hostnames, machine names, personal paths, personal emails, or other personal data. Configure everything with environment variables and `.example` files that contain only placeholders.

## Expectations for operators

- Keep upstream credentials (for example a GitHub PAT) and filesystem bearer tokens only on the trusted host.
- Issue per-client credentials where the package supports them; store hashes or mode-600 secrets at rest; rotate and revoke when needed.
- Prefer private network reachability; do not enable public exposure without an explicit operator decision.
- Never paste real secrets into issues, PRs, chat, or docs.
- Scope `local-files` to an intentional root; treat destructive tools (`delete_path`, `truncate_file`) with care.

## What this project will not do

- Commit real secrets or example files filled with live values.
- Log secrets in audit output or health endpoints.
- Silently expose services to the public Internet.
