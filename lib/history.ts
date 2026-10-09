import { calculatePortfolio } from "./portfolio";
import type { LabData, PortfolioHistoryPoint } from "./types";

/**
 * Restated end-of-date valuations from the CURRENT ledger and stored market records.
 * Original snapshots stay untouched. Corrections therefore update the entire curve.
 * A later-published official NAV may restate its NAV date; future-dated prices/FX
 * never value an earlier date. Carried marks are disclosed, not called daily closes.
 */
export function rebuildHistory(data: Pick<LabData, "accounts" | "assets" | "transactions" | "prices" | "fxRates" | "benchmarks">,
  snapshotDates: string[], asOf: string): PortfolioHistoryPoint[] {
  const firstTrade = data.transactions.filter((tx) => !["CASH_IN", "CASH_OUT"].includes(tx.type))
    .map((tx) => tx.tradedAt.slice(0, 10)).sort()[0];
  if (!firstTrade) return [];
  const dates = [...new Set([...snapshotDates, ...data.prices.map((p) => p.priceDate),
    ...data.transactions.map((tx) => tx.tradedAt.slice(0, 10)), asOf])]
    .filter((day) => day >= firstTrade && day <= asOf && /^\d{4}-\d{2}-\d{2}$/.test(day)).sort();
  // ponytail: O(days * records) for a personal ledger; incremental indexing if history grows large.
  return dates.map((date) => {
    const prices = data.prices.filter((p) => p.priceDate <= date);
    const fxRates = data.fxRates.filter((rate) => rate.rateDate <= date);
    const transactions = data.transactions.filter((tx) => tx.tradedAt.slice(0, 10) <= date);
    const summary = calculatePortfolio({ ...data, transactions, prices, fxRates, costMethod: "WEIGHTED_AVERAGE" });
    const benchmark = (symbol: "QQQ" | "SPY") => data.benchmarks.filter((p) => p.symbol === symbol && p.priceDate === date).at(-1)?.close ?? null;
    return { date, portfolio: summary.totalValueUsd, contributions: summary.netContributionsUsd,
      qqq: benchmark("QQQ"), spy: benchmark("SPY"), missingAssetIds: summary.missingAssetIds,
      priceDates: Object.fromEntries(summary.positions.map((p) => [p.assetId, p.priceDate ?? ""])),
      status: summary.totalValueUsd == null ? "GAP" : summary.positions.some((p) => p.priceDate !== date) ? "CARRIED" : "RESTATED" };
  });
}
