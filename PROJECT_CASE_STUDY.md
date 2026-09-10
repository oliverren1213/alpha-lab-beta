# Alpha Lab Beta — Product & Engineering Case Study

## One-line outcome

Designed and built a multi-user investment-analysis Beta that turns raw transactions into auditable cost basis, performance, FX attribution, data-quality status, and decision-review records.

## Product problem

Retail investment apps often optimize for headline portfolio value. That makes three questions surprisingly difficult:

1. Is the displayed return reproducible from the underlying ledger?
2. Which price, NAV date, FX rate, and cost method produced it?
3. Did the original investment thesis improve, weaken, or simply get rewritten after the outcome?

Alpha Lab treats the ledger and evidence trail as the source of truth. It keeps missing or stale information explicit instead of filling gaps with plausible-looking values.

## Product decisions

- **Analysis, not recommendations:** the product explains a portfolio; it does not generate trades.
- **Real records only:** no production mock holdings or random quotes.
- **Auditability over false precision:** price dates, timestamps, delay flags, and NAV dates remain visible.
- **User isolation by construction:** every private record is owner-scoped at the API and query layers.
- **Low-friction onboarding:** an isolated guest demo, guided trade entry, and validated CSV import let people understand the product before committing their own records.
- **Decision quality over activity:** versioned theses and scheduled reviews reward learning rather than frequent trading.

## Engineering challenges solved

### Financial state reconstruction

The calculation engine replays the ledger chronologically and supports both weighted-average and FIFO cost basis. It separates capital flows from investment return, avoids double-counting fees and withholding tax, preserves remaining basis after partial sales, and restarts basis after a complete exit and re-entry.

### Multi-currency attribution

Each transaction can store its verified transaction-date FX rate while current valuation uses the latest reference FX graph. This enables an explicit approximation of FX impact without silently substituting missing conversions.

### Data freshness and provenance

Morning and afternoon snapshots have different comparison rules. Fund NAVs keep their published date. Provider failures preserve the last valid record. A refresh run stores success/failure counts and a non-secret error summary.

### Public product, private records

The Beta is publicly usable without a login. Anonymous visitors receive signed, isolated guest sessions; signed-in visitors use trusted platform identity. Server APIs derive the owner ID rather than accepting one from the client. Shared market observations remain separate from owner-specific manual NAVs and portfolio snapshots.

## Evidence

- 23 deterministic calculation and data-behavior tests
- TypeScript strict-mode typecheck
- Lint and production Worker build
- Persistent D1 migrations with per-owner uniqueness constraints
- Public source history and tagged Beta release
- Deployed product URL recorded in the GitHub repository after publication

## Suggested CV wording

**Project — Alpha Lab Beta, Product Designer & Full-Stack Developer**

Built a privacy-first, multi-user investment analytics platform on React, Cloudflare Workers, and D1; implemented auditable FIFO/weighted-average cost basis, multi-currency P&L attribution, timestamped market-data quality controls, bilingual guest onboarding, CSV/backup workflows, and owner-scoped persistence, supported by 23 deterministic tests.

## Honest limitations

- The public Beta ships without a personal-use market-data credential; production operators must configure a suitably licensed source.
- Fund NAV is confirmed manually rather than scraped.
- Intraday attribution is an estimate and does not yet model every trade-timing interaction.
- It is not a broker, tax engine, or personalized financial adviser.
