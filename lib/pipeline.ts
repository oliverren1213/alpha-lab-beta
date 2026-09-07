import { calculatePortfolio } from "./portfolio";
import {
  all,
  ensureDatabase,
  getDatabase,
  getRuntimeEnv,
  id,
  loadLabData,
} from "./database";
import {
  AlphaVantageFundamentalProvider,
  FinnhubQuoteProvider,
  FrankfurterFxProvider,
  wait,
} from "./providers";
import { dateInRome, olderThan90Minutes, type RefreshMode } from "./schedule";
import type { Asset, Currency } from "./types";

export type UpdateTrigger = "MANUAL" | "CRON" | "STALE_OPEN";

export async function runDailyUpdate(trigger: UpdateTrigger, mode: RefreshMode) {
  await ensureDatabase();
  const database = getDatabase();
  const active = await database.prepare(
    "SELECT id FROM update_runs WHERE status='RUNNING' AND started_at>? LIMIT 1",
  ).bind(new Date(Date.now() - 15 * 60_000).toISOString()).first<{ id: string }>();
  if (active) return { runId: active.id, status: "ALREADY_RUNNING", successCount: 0, failureCount: 0 };

  const runId = id("run");
  const startedAt = new Date().toISOString();
  await database.prepare(
    "INSERT INTO update_runs (id,trigger,mode,status,started_at,success_count,failure_count) VALUES (?,?,?,?,?,?,?)",
  ).bind(runId, trigger, mode, "RUNNING", startedAt, 0, 0).run();

  const realAssetRows = await all(
    database,
    `SELECT DISTINCT a.* FROM assets a JOIN transactions t ON t.asset_id=a.id
     WHERE t.is_demo=0 ORDER BY a.symbol`,
  );
  const assets = realAssetRows.map(mapAsset);
  let successCount = 0;
  let failureCount = 0;
  const failureKinds = new Set<string>();

  try {
    const fxProvider = new FrankfurterFxProvider();
    const fx = await fxProvider.getUsdRates(["HKD", "CNY", "EUR"]);
    const fetchedAt = new Date().toISOString();
    const statements = Object.entries(fx.rates)
      .filter(([currency, rate]) => currency !== "USD" && rate != null)
      .map(([currency, rate]) =>
        database.prepare(
          `INSERT INTO fx_rates
           (id,base_currency,quote_currency,rate_date,rate,provider,fetched_at,status,is_demo)
           VALUES (?,?,?,?,?,?,?,?,0)
           ON CONFLICT(base_currency,quote_currency,rate_date,provider)
           DO UPDATE SET rate=excluded.rate,fetched_at=excluded.fetched_at,status='FRESH'`,
        ).bind(id("fx"), "USD", currency, fx.rateDate, rate, fxProvider.name, fetchedAt, "FRESH"),
      );
    if (statements.length) await database.batch(statements);
    successCount += statements.length;
    await recordSourceSuccess("source-fx", fetchedAt);
  } catch {
    failureCount += 1;
    failureKinds.add("汇率参考数据");
    await recordSourceError("source-fx", "汇率参考数据请求失败");
  }

  const exchangeTraded = assets.filter(
    (asset) => asset.assetType === "STOCK" || asset.assetType === "ETF",
  );
  const finnhubKey = getRuntimeEnv().FINNHUB_API_KEY;
  if (exchangeTraded.length && !finnhubKey) {
    failureCount += exchangeTraded.length;
    failureKinds.add("尚未配置 Finnhub 免费 API Key");
    await recordSourceError("source-prices", "尚未配置 Finnhub 免费 API Key");
  } else if (finnhubKey) {
    const provider = new FinnhubQuoteProvider(finnhubKey);
    let holidays: Set<string> | null = new Set();
    if (mode === "MORNING") {
      try {
        holidays = await provider.getMarketHolidays();
      } catch {
        holidays = null;
        failureCount += 1;
        failureKinds.add("美国市场交易日历请求失败，未写入可能日期错误的收盘价");
      }
    }
    if (holidays) {
      for (const asset of exchangeTraded) {
        try {
          const price = await provider.getPrice(asset, mode, holidays);
          const fetchedAt = new Date().toISOString();
          await database.prepare(
            `INSERT INTO price_snapshots
             (id,owner_id,asset_id,price_date,fetched_at,provider,quoted_at,session,data_quality,is_delayed,
              price,nav,currency,status,is_demo)
             VALUES (?,'GLOBAL',?,?,?,?,?,?,?,?,?,NULL,?,'FRESH',0)
             ON CONFLICT(owner_id,asset_id,price_date,provider,session)
             DO UPDATE SET price=excluded.price,fetched_at=excluded.fetched_at,
              quoted_at=excluded.quoted_at,data_quality=excluded.data_quality,
              is_delayed=excluded.is_delayed,status='FRESH'`,
          ).bind(
            id("price"), asset.id, price.priceDate, fetchedAt, price.provider,
            price.quotedAt, mode, price.dataQuality, price.isDelayed ? 1 : 0,
            price.price, price.currency,
          ).run();
          successCount += 1;
          await recordSourceSuccess("source-prices", fetchedAt);
        } catch {
          failureCount += 1;
          failureKinds.add("部分 Finnhub 行情请求失败");
          await recordSourceError("source-prices", "部分行情请求失败");
        }
        await wait(1_050);
      }
      if (mode === "MORNING") {
        const benchmarkResult = await updateBenchmarks(provider, holidays);
        successCount += benchmarkResult.successCount;
        failureCount += benchmarkResult.failureCount;
        if (benchmarkResult.failureCount) failureKinds.add("部分 QQQ/SPY 基准收盘更新失败");
      }
    }
  }

  const funds = assets.filter((asset) => asset.assetType === "FUND");
  if (funds.length) {
    const missingNav = await missingFundNavCount(funds);
    if (missingNav) {
      failureCount += missingNav;
      failureKinds.add("部分基金尚无已确认 NAV");
    }
  }

  if (mode === "MORNING") await updateOptionalFundamentals(assets, failureKinds);

  try {
    if (await persistPortfolioSnapshot(mode, failureCount ? "PARTIAL" : "FRESH")) {
      successCount += 1;
    } else if (assets.length) {
      failureCount += 1;
      failureKinds.add("组合快照缺少价格或汇率");
    }
  } catch {
    failureCount += 1;
    failureKinds.add("组合快照计算失败");
  }

  if (!assets.length) failureKinds.add("尚无已确认持仓，本次仅更新汇率");
  const status = failureCount === 0 ? "SUCCESS" : successCount > 0 ? "PARTIAL" : "FAILED";
  const errorSummary = failureKinds.size ? [...failureKinds].join("; ") : null;
  await finishRun(runId, status, successCount, failureCount, errorSummary);
  return { runId, status, mode, successCount, failureCount, errorSummary };
}

export async function persistPortfolioSnapshot(
  session: RefreshMode | "NAV",
  status = "FRESH",
  ownerId?: string,
): Promise<boolean> {
  await ensureDatabase();
  if (!ownerId) {
    const owners = await all(getDatabase(), "SELECT DISTINCT owner_id FROM transactions WHERE is_demo=0");
    let persisted = false;
    for (const owner of owners) {
      persisted = await persistPortfolioSnapshot(session, status, String(owner.owner_id)) || persisted;
    }
    return persisted;
  }
  const data = await loadLabData(ownerId);
  if (!data.transactions.length) return false;
  const summary = calculatePortfolio({ ...data, costMethod: "WEIGHTED_AVERAGE" });
  if (summary.totalValueUsd == null || summary.unrealizedPnlUsd == null || summary.fxPnlUsd == null) {
    return false;
  }
  await getDatabase().prepare(
    `INSERT INTO portfolio_snapshots
     (id,owner_id,snapshot_date,base_currency,total_value,net_contributions,realized_pnl,unrealized_pnl,
      dividend_income,fee_and_tax,fx_pnl,status,session,created_at,is_demo)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
     ON CONFLICT(owner_id,snapshot_date,base_currency,session) DO UPDATE SET
      total_value=excluded.total_value,net_contributions=excluded.net_contributions,
      realized_pnl=excluded.realized_pnl,unrealized_pnl=excluded.unrealized_pnl,
      dividend_income=excluded.dividend_income,fee_and_tax=excluded.fee_and_tax,
      fx_pnl=excluded.fx_pnl,status=excluded.status,created_at=excluded.created_at`,
  ).bind(
    id("portfolio"), ownerId, dateInRome(), "USD", summary.totalValueUsd, summary.netContributionsUsd,
    summary.realizedPnlUsd, summary.unrealizedPnlUsd, summary.dividendIncomeUsd,
    summary.feesUsd + summary.withholdingTaxUsd, summary.fxPnlUsd,
    status, session, new Date().toISOString(),
  ).run();
  return true;
}

export async function refreshAllowed(trigger: UpdateTrigger) {
  await ensureDatabase();
  const database = getDatabase();
  if (trigger === "STALE_OPEN") {
    const latestSuccess = await database.prepare(
      "SELECT completed_at FROM update_runs WHERE status IN ('SUCCESS','PARTIAL') AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1",
    ).first<{ completed_at: string }>();
    if (!olderThan90Minutes(latestSuccess?.completed_at ?? null)) {
      return { allowed: false, retryAfterSeconds: 0, reason: "数据尚未过期 90 分钟" };
    }
  }
  const latest = await database.prepare(
    "SELECT started_at FROM update_runs WHERE trigger=? ORDER BY started_at DESC LIMIT 1",
  ).bind(trigger).first<{ started_at: string }>();
  if (!latest) return { allowed: true, retryAfterSeconds: 0, reason: null };
  const elapsed = Date.now() - new Date(latest.started_at).getTime();
  const cooldown = trigger === "STALE_OPEN" ? 90 * 60_000 : 5 * 60_000;
  return {
    allowed: elapsed >= cooldown,
    retryAfterSeconds: Math.max(0, Math.ceil((cooldown - elapsed) / 1000)),
    reason: elapsed >= cooldown ? null : "刷新仍在冷却时间内",
  };
}

async function updateOptionalFundamentals(assets: Asset[], failureKinds: Set<string>) {
  const apiKey = getRuntimeEnv().ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return;
  const database = getDatabase();
  const provider = new AlphaVantageFundamentalProvider(apiKey);
  const throttle = Math.max(1_000, Number(getRuntimeEnv().ALPHA_VANTAGE_THROTTLE_MS ?? 13_000));
  for (const asset of assets.filter((item) => item.assetType === "STOCK")) {
    try {
      const value = await provider.getValuation(asset);
      if (value) {
        await database.prepare(
          `INSERT INTO valuation_snapshots
           (id,asset_id,as_of_date,provider,market_cap,trailing_pe,forward_pe,price_sales,ev_ebitda,
            earnings_yield,revenue_growth,eps_growth,high_52w,low_52w,status,fetched_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(asset_id,as_of_date,provider) DO UPDATE SET
            market_cap=excluded.market_cap,trailing_pe=excluded.trailing_pe,forward_pe=excluded.forward_pe,
            price_sales=excluded.price_sales,ev_ebitda=excluded.ev_ebitda,
            earnings_yield=excluded.earnings_yield,revenue_growth=excluded.revenue_growth,
            eps_growth=excluded.eps_growth,high_52w=excluded.high_52w,low_52w=excluded.low_52w,
            status='FRESH',fetched_at=excluded.fetched_at`,
        ).bind(
          id("valuation"), asset.id, value.asOfDate, value.provider, value.marketCap,
          value.trailingPe, value.forwardPe, value.priceSales, value.evEbitda,
          value.earningsYield, value.revenueGrowth, value.epsGrowth, value.high52w, value.low52w,
          "FRESH", new Date().toISOString(),
        ).run();
      }
    } catch {
      failureKinds.add("可选基本面数据请求失败");
    }
    await wait(throttle);
  }
}

async function missingFundNavCount(funds: Asset[]) {
  const placeholders = funds.map(() => "?").join(",");
  const row = await getDatabase().prepare(
    `SELECT COUNT(*) missing FROM assets a WHERE a.id IN (${placeholders})
     AND NOT EXISTS (SELECT 1 FROM price_snapshots p WHERE p.asset_id=a.id AND p.nav IS NOT NULL)`,
  ).bind(...funds.map((fund) => fund.id)).first<{ missing: number }>();
  return Number(row?.missing ?? 0);
}

async function updateBenchmarks(provider: FinnhubQuoteProvider, holidays: Set<string>) {
  let successCount = 0;
  let failureCount = 0;
  for (const symbol of ["QQQ", "SPY"] as const) {
    try {
      const price = await provider.getPrice({
        id: `benchmark-${symbol.toLowerCase()}`,
        symbol,
        name: symbol,
        assetType: "ETF",
        currency: "USD",
        sector: null,
        providerSymbol: symbol,
        isLeveraged: false,
        leverageTarget: null,
        isDemo: false,
      }, "MORNING", holidays);
      const fetchedAt = new Date().toISOString();
      await getDatabase().prepare(
        `INSERT INTO benchmark_snapshots
         (id,symbol,price_date,close,provider,fetched_at,is_demo)
         VALUES (?,?,?,?,?,?,0)
         ON CONFLICT(symbol,price_date,provider) DO UPDATE SET
          close=excluded.close,fetched_at=excluded.fetched_at`,
      ).bind(id("benchmark"), symbol, price.priceDate, price.price, price.provider, fetchedAt).run();
      await recordSourceSuccess("source-benchmarks", fetchedAt);
      successCount += 1;
    } catch {
      await recordSourceError("source-benchmarks", "部分基准收盘请求失败");
      failureCount += 1;
    }
    await wait(1_050);
  }
  return { successCount, failureCount };
}

async function recordSourceSuccess(sourceId: string, at: string) {
  await getDatabase().prepare(
    "UPDATE data_sources SET last_success_at=?,last_error=NULL WHERE id=?",
  ).bind(at, sourceId).run();
}

async function recordSourceError(sourceId: string, message: string) {
  await getDatabase().prepare(
    "UPDATE data_sources SET last_error=? WHERE id=?",
  ).bind(message, sourceId).run();
}

async function finishRun(
  runId: string,
  status: string,
  successCount: number,
  failureCount: number,
  errorSummary: string | null,
) {
  await getDatabase().prepare(
    "UPDATE update_runs SET status=?,completed_at=?,success_count=?,failure_count=?,error_summary=? WHERE id=?",
  ).bind(status, new Date().toISOString(), successCount, failureCount, errorSummary, runId).run();
}

function mapAsset(row: Record<string, unknown>): Asset {
  return {
    id: String(row.id), symbol: String(row.symbol), name: String(row.name),
    assetType: String(row.asset_type) as Asset["assetType"],
    currency: String(row.currency) as Currency,
    sector: row.sector == null ? null : String(row.sector),
    providerSymbol: row.provider_symbol == null ? null : String(row.provider_symbol),
    isLeveraged: Boolean(row.is_leveraged),
    leverageTarget: row.leverage_target == null ? null : Number(row.leverage_target),
    isDemo: Boolean(row.is_demo),
  };
}
