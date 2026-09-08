# Alpha Lab Beta

[![Beta](https://img.shields.io/badge/status-public_beta-0A84FF)](https://alpha-lab-beta.kv2dz8h2bw.chatgpt.site)
[![CI](https://github.com/oliverren1213/alpha-lab-beta/actions/workflows/ci.yml/badge.svg)](https://github.com/oliverren1213/alpha-lab-beta/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/deterministic_tests-21_passed-30D158)](#validation)

[Open the live Beta](https://alpha-lab-beta.kv2dz8h2bw.chatgpt.site)

![Alpha Lab Beta](public/og.png)

An auditable, private-by-default investment ledger and portfolio analysis workspace. Alpha Lab tracks what changed, how performance was calculated, and why an investment decision was made—without pretending to be an AI stock picker.

> Public Beta: the application is publicly reachable, but every visitor signs in with ChatGPT and can access only their own records.

## Why this exists

Most retail portfolio dashboards show a number without showing its provenance. Alpha Lab keeps the underlying transaction ledger, cost method, FX conversion, price timestamp, delay status, and investment thesis visible so a result can be checked against source records.

## Beta capabilities

- Transaction ledger with duplicate detection, reconciliation status, edit/delete, and import-batch rollback
- Weighted-average and FIFO cost basis, including fees, taxes, partial sales, stock splits, fund subscriptions, and redemptions
- Portfolio value, realized and unrealized P&L, dividends, fees, FX impact, and multi-currency display
- Price audit trail with provider, price date, quote time, session, and delay/data-quality labels
- Manual fund NAV workflow that preserves the actual NAV date
- CSV import/export and full JSON backup/restore
- Versioned investment theses with 7/30/90-day review dates
- Scenario analysis with an explicit warning for leveraged ETF path dependency
- Scheduled Rome-time refresh windows and a 90-minute stale-on-open refresh guard
- Responsive light/dark Apple-inspired interface

## Privacy and data integrity

- ChatGPT identity is verified server-side from Sites-provided headers.
- Accounts, transactions, imports, portfolio snapshots, fund NAVs, and theses are scoped by a stable per-Site user ID.
- Public market prices and ECB reference FX rates may be shared; private portfolio records are never shared.
- The repository contains no credentials, personal holdings, or production database exports.
- Missing prices remain missing. The application does not generate mock or random market data.
- Duplicate trades are rejected using account, asset, direction, trade date, quantity, and execution price.

## Data-source policy

- FX: Frankfurter / ECB working-day reference rates, no API key required.
- Funds: user-confirmed NAV and source date; the latest valid NAV remains visible until a newer value is confirmed.
- US equities and ETFs: provider adapter included, but the public deployment intentionally ships without a private personal-use market-data key. A production operator must configure a provider whose license permits the intended audience.
- Optional fundamentals: Alpha Vantage adapter, disabled when no key is configured.

This distinction matters: code support for a provider is not a claim that production data is configured or licensed.

## Architecture

```text
Browser
  -> Sign in with ChatGPT
  -> Vinext / React application
  -> Cloudflare Worker API
  -> owner-scoped Cloudflare D1 records

Scheduled Worker
  -> market / FX provider adapters
  -> timestamped snapshots
  -> recalculated owner-scoped portfolio snapshots
```

Core implementation areas:

- `app/alpha-lab.tsx` — working interface and user flows
- `lib/portfolio.ts` — portfolio and cost-basis engine
- `lib/database.ts` — owner-scoped persistence
- `lib/import-export.ts` — validated CSV and backup workflows
- `lib/pipeline.ts` — refresh pipeline and snapshots
- `db/schema.ts` and `drizzle/` — D1 schema and migrations
- `tests/core.test.mjs` — deterministic financial-calculation tests

## Validation

The Beta currently includes 21 deterministic tests covering:

- weighted average and FIFO;
- partial sale, full exit and re-entry;
- dividends, withholding, standalone fees and splits;
- fund subscriptions/redemptions and multi-currency valuation;
- cash flows versus investment return;
- missing-price behavior and morning/afternoon comparison rules;
- Rome daylight-saving schedules and the 90-minute stale threshold;
- market holidays, provider retries, CSV round trips, duplicate fingerprints, and transaction previews.

Run locally:

```bash
npm install
npm run typecheck
npm test
npm run lint
npm run build
```

Local development requires Node.js 22.13 or newer and a D1-compatible Worker environment. Copy `.dev.vars.example` to `.dev.vars` only for local, server-side configuration.

## CSV onboarding

Download `public/alpha-lab-transactions-template.csv` or use the template link in the ledger. Supported transaction types are:

`BUY`, `SELL`, `DIVIDEND`, `DIVIDEND_TAX`, `FEE`, `SUBSCRIPTION`, `REDEMPTION`, `SPLIT`, `CASH_IN`, and `CASH_OUT`.

Non-USD records require the verifiable transaction-date conversion rate expressed as `1 local currency = x USD`. Account identifiers are masked to their last four digits during import.

## Status and limits

This is a Beta, not a broker connection or execution system. It does not place trades, scrape financial websites, or provide personalized investment recommendations. Calculations should be reconciled against broker statements, fund disclosures, and original trade records.

See [PROJECT_CASE_STUDY.md](PROJECT_CASE_STUDY.md) for the product and engineering case study and [CHANGELOG.md](CHANGELOG.md) for release history.
