# Contributing

Thanks for helping with Konnectors — MCP bridges/adapters for the connectors that are missing.

## Strict rule (permanent)

Nothing personal or sensitive ever goes in this repository: no secrets, tokens, keys, hostnames, machine names, personal paths, personal emails, or other personal data. Everything is configured by environment variables and `.example` files (never real values). This rule is permanent.

Before you open a PR:

1. Use only placeholders (`REPLACE_ME_*`, `/path/to/...`, `${env:VAR}`) in docs and examples.
2. Do not add real hostnames, tailnet MagicDNS names, machine names, home-directory paths, or emails.
3. Do not commit `.env`, live `config.toml`, key stores, password files, bearer token files, or audit logs.
4. Prefer bridges/adapters language. Do not name missing connectors as anything other than bridges/adapters. Do not reuse prior private project brand names in this repository.
5. Run package tests (`cd github-gateway && npm test`, `cd local-files && npm test`) and keep CI green on GitHub-hosted Ubuntu runners.

## Pull requests

- One focused change per PR.
- Reference the tracking issue when there is one (for example `edidasken/code#69`).
- Summarize what changed and how you verified it (tests + any secret scans).
