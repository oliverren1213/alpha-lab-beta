# Changelog

All notable changes to Alpha Lab Beta are documented here.

## 0.3.0-beta.1 — 2026-10-09

- Synchronized the private application's glass navigation, mobile scroll behavior, Pride palettes, interactive charts and workflow improvements.
- Added browser-local PDF extraction/OCR and a persistent, visitor-scoped transaction inbox with duplicate/conflict checks and atomic undo.
- Added statement fee status, decision reviews, portfolio explanations and editable weekly notes.
- Recalculate historical valuations and attribution from each visitor's own ledger and stored marks. Demo marks remain explicitly simulated.
- Added public-source daily news and a seven-day economic calendar with honest source failures and cache freshness.
- Preserved English default, the guide on every guest page visit, About, the original public URL and guest isolation.
- Fixed imported guest ledgers being reset on reopening, and translated confirmation dialogs.
- Verified 53 deterministic tests and all seven pages at a 390px mobile viewport in dark mode.

## 0.2.0-beta.1 — 2026-09-10

### Added

- English/Chinese language selector with English as the public default
- Lightweight first-visit guide and an isolated, resettable guest workspace
- Guided three-step transaction entry with quick buy, sell, and cash actions
- Portfolio history curve and a simplified data-health summary
- Public product and engineering overview for evaluators

### Improved

- CSV import can intentionally replace demo fixtures with an isolated user ledger
- Mobile navigation, onboarding, transaction entry, and analytical layouts
- Public documentation now reflects anonymous guest access and 23 deterministic tests

## 0.1.0-beta.1 — 2026-09-08

### Added

- Public Beta with Sign in with ChatGPT
- Per-user D1 isolation for private investment records
- Weighted-average and FIFO portfolio accounting
- Multi-currency valuation and FX-impact approximation
- Auditable price, NAV, and data-freshness status
- CSV ledger onboarding, duplicate detection, import rollback, export, and JSON backup/restore
- Versioned investment theses, scenario analysis, and weekly memo
- Rome-time scheduled refresh windows and stale-on-open guard
- Responsive light/dark interface and privacy-safe social preview
- 21 deterministic financial and data-behavior tests

### Known limitations

- Public deployment contains no personal-use market-data API key.
- Manual fund NAV remains the default legal, auditable workflow for unsupported funds.
- Decision-review scoring and broker OAuth are outside this Beta scope.
