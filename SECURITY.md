# Security Policy

## Supported version

Security fixes are applied to the latest Beta release.

## Reporting a vulnerability

Please use GitHub's private vulnerability-reporting feature when enabled. Do not open a public issue containing credentials, personal financial records, authentication tokens, or another person's data.

## Data-handling principles

- Production credentials belong only in server-side environment configuration.
- Repository history must never contain holdings, account exports, D1 dumps, or API keys.
- User ownership is derived from trusted Sites authentication headers and enforced in server-side queries.
- Missing or failed market data must not be replaced with generated values.
- This software is not designed to store brokerage passwords or execute trades.

