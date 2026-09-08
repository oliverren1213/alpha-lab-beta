import type {
  Account,
  Asset,
  CostMethod,
  Currency,
  FxSnapshot,
  LedgerTransaction,
  PriceSnapshot,
} from "./types";

type Lot = {
  quantity: number;
  localUnitCost: number;
  baseUnitCost: number;
};

type PositionState = {
  accountId: string;
  assetId: string;
  quantity: number;
  costBase: number;
  costLocal: number;
  lots: Lot[];
  realized: number;
};

export type CalculatedPosition = {
  key: string;
  accountId: string;
  accountName: string;
  assetId: string;
  symbol: string;
  name: string;
  assetType: Asset["assetType"];
  currency: Currency;
  sector: string;
  isLeveraged: boolean;
  leverageTarget: number | null;
  quantity: number;
  costBasisUsd: number;
  costBasisLocal: number;
  averageCostLocal: number;
  price: number | null;
  priceDate: string | null;
  priceFetchedAt: string | null;
  priceQuotedAt: string | null;
  priceProvider: string | null;
  priceSession: PriceSnapshot["session"] | null;
  priceDataQuality: PriceSnapshot["dataQuality"] | null;
  priceIsDelayed: boolean | null;
  referencePriceDate: string | null;
  priceStatus: string;
  marketValueUsd: number | null;
  todayPnlUsd: number | null;
  unrealizedUsd: number | null;
  fxPnlUsd: number | null;
  weight: number | null;
};

export type PortfolioSummary = {
  asOf: string;
  costMethod: CostMethod;
  totalValueUsd: number | null;
  netContributionsUsd: number;
  marketValueUsd: number | null;
  cashUsd: number;
  todayPnlUsd: number | null;
  cumulativePnlUsd: number | null;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number | null;
  dividendIncomeUsd: number;
  withholdingTaxUsd: number;
  feesUsd: number;
  fxPnlUsd: number | null;
  totalReturnRate: number | null;
  missingAssetIds: string[];
  positions: CalculatedPosition[];
  allocation: {
    byAsset: Array<{ label: string; valueUsd: number; weight: number }>;
    byAccount: Array<{ label: string; valueUsd: number; weight: number }>;
    bySector: Array<{ label: string; valueUsd: number; weight: number }>;
    byType: Array<{ label: string; valueUsd: number; weight: number }>;
  };
};

const EPSILON = 1e-8;

export function calculatePortfolio(input: {
  accounts: Account[];
  assets: Asset[];
  transactions: LedgerTransaction[];
  prices: PriceSnapshot[];
  fxRates: FxSnapshot[];
  costMethod: CostMethod;
}): PortfolioSummary {
  const accountById = new Map(input.accounts.map((account) => [account.id, account]));
  const assetById = new Map(input.assets.map((asset) => [asset.id, asset]));
  const latestPrices = latestPriceMap(input.prices);
  const previousPrices = referencePriceMap(input.prices, latestPrices);
  const positions = new Map<string, PositionState>();
  let cashUsd = 0;
  let netContributionsUsd = 0;
  let dividendIncomeUsd = 0;
  let withholdingTaxUsd = 0;
  let feesUsd = 0;
  let realizedPnlUsd = 0;

  const sorted = [...input.transactions].sort(
    (a, b) => a.tradedAt.localeCompare(b.tradedAt) || a.id.localeCompare(b.id),
  );

  for (const transaction of sorted) {
    const fx = transactionFxToUsd(transaction);
    const feeBase = transaction.fee * fx;
    const taxBase = transaction.tax * fx;

    if (transaction.type === "CASH_IN" || transaction.type === "CASH_OUT") {
      const amount = requiredAmount(transaction) * fx;
      const direction = transaction.type === "CASH_IN" ? 1 : -1;
      feesUsd += feeBase;
      withholdingTaxUsd += taxBase;
      cashUsd += direction * amount - feeBase - taxBase;
      netContributionsUsd += direction * amount;
      continue;
    }

    if (transaction.type === "DIVIDEND") {
      const gross = requiredAmount(transaction) * fx;
      feesUsd += feeBase;
      withholdingTaxUsd += taxBase;
      dividendIncomeUsd += gross;
      cashUsd += gross - feeBase - taxBase;
      continue;
    }

    if (transaction.type === "DIVIDEND_TAX") {
      const amount = Math.abs(transaction.totalAmount ?? transaction.tax ?? 0) * fx;
      withholdingTaxUsd += amount;
      cashUsd -= amount;
      continue;
    }

    if (transaction.type === "FEE") {
      const amount = Math.abs(transaction.totalAmount ?? transaction.fee ?? 0) * fx;
      feesUsd += amount;
      cashUsd -= amount;
      continue;
    }

    if (!transaction.assetId) {
      throw new Error(`${transaction.type} transaction ${transaction.id} is missing an asset`);
    }
    const asset = assetById.get(transaction.assetId);
    if (!asset) throw new Error(`Unknown asset ${transaction.assetId}`);
    const key = `${transaction.accountId}:${transaction.assetId}`;
    const state = positions.get(key) ?? {
      accountId: transaction.accountId,
      assetId: transaction.assetId,
      quantity: 0,
      costBase: 0,
      costLocal: 0,
      lots: [],
      realized: 0,
    };

    if (transaction.type === "SPLIT") {
      if (transaction.quantity <= 0) throw new Error("Split ratio must be positive");
      state.quantity *= transaction.quantity;
      state.lots = state.lots.map((lot) => ({
        ...lot,
        quantity: lot.quantity * transaction.quantity,
        localUnitCost: lot.localUnitCost / transaction.quantity,
        baseUnitCost: lot.baseUnitCost / transaction.quantity,
      }));
      positions.set(key, state);
      continue;
    }

    const isBuy = transaction.type === "BUY" || transaction.type === "SUBSCRIPTION";
    const isSell = transaction.type === "SELL" || transaction.type === "REDEMPTION";
    if (!isBuy && !isSell) continue;
    const quantity = positive(transaction.quantity, "quantity");
    const unitPrice = positive(transaction.unitPrice, "unit price");
    const grossLocal = quantity * unitPrice;

    if (isBuy) {
      const localCost = grossLocal + transaction.fee + transaction.tax;
      const baseCost = localCost * fx;
      feesUsd += feeBase;
      withholdingTaxUsd += taxBase;
      state.quantity += quantity;
      state.costLocal += localCost;
      state.costBase += baseCost;
      state.lots.push({
        quantity,
        localUnitCost: localCost / quantity,
        baseUnitCost: baseCost / quantity,
      });
      cashUsd -= baseCost;
      positions.set(key, state);
      continue;
    }

    if (quantity - state.quantity > EPSILON) {
      throw new Error(
        `Transaction ${transaction.id} sells ${quantity} but only ${state.quantity} is available`,
      );
    }
    const proceedsBase = (grossLocal - transaction.fee - transaction.tax) * fx;
    feesUsd += feeBase;
    withholdingTaxUsd += taxBase;
    const allocated =
      input.costMethod === "FIFO"
        ? consumeFifo(state, quantity)
        : consumeWeightedAverage(state, quantity);
    const realized = proceedsBase - allocated.base;
    state.realized += realized;
    realizedPnlUsd += realized;
    cashUsd += proceedsBase;
    positions.set(key, state);
  }

  const calculated: CalculatedPosition[] = [];
  const missingAssetIds: string[] = [];
  let investedMarketValueUsd = 0;
  let unrealizedPnlUsd = 0;
  let fxPnlUsd = 0;
  let todayPnlUsd = 0;
  let hasMissingPrice = false;
  let hasMissingPreviousPrice = false;

  for (const [key, state] of positions) {
    if (state.quantity <= EPSILON) continue;
    const asset = assetById.get(state.assetId);
    const account = accountById.get(state.accountId);
    if (!asset || !account) continue;
    const latest = latestPrices.get(state.assetId) ?? null;
    const previous = previousPrices.get(state.assetId) ?? null;
    const currentPrice = latest?.price ?? latest?.nav ?? null;
    let marketValueUsd: number | null = null;
    let positionUnrealized: number | null = null;
    let positionFxPnl: number | null = null;
    let positionTodayPnl: number | null = null;

    if (currentPrice == null) {
      hasMissingPrice = true;
      missingAssetIds.push(state.assetId);
    } else {
      try {
        const currentFx = currencyRate(asset.currency, "USD", input.fxRates);
        marketValueUsd = state.quantity * currentPrice * currentFx;
        positionUnrealized = marketValueUsd - state.costBase;
        const acquisitionFx = state.costLocal > EPSILON ? state.costBase / state.costLocal : currentFx;
        positionFxPnl =
          asset.currency === "USD"
            ? 0
            : state.quantity * currentPrice * (currentFx - acquisitionFx);
        investedMarketValueUsd += marketValueUsd;
        unrealizedPnlUsd += positionUnrealized;
        fxPnlUsd += positionFxPnl;

        const previousPrice = previous?.price ?? previous?.nav ?? null;
        if (previousPrice == null) {
          hasMissingPreviousPrice = true;
        } else {
          positionTodayPnl = state.quantity * (currentPrice - previousPrice) * currentFx;
          todayPnlUsd += positionTodayPnl;
        }
      } catch {
        hasMissingPrice = true;
        missingAssetIds.push(state.assetId);
      }
    }

    calculated.push({
      key,
      accountId: account.id,
      accountName: account.name,
      assetId: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      assetType: asset.assetType,
      currency: asset.currency,
      sector: asset.sector ?? "Unclassified",
      isLeveraged: asset.isLeveraged,
      leverageTarget: asset.leverageTarget,
      quantity: state.quantity,
      costBasisUsd: state.costBase,
      costBasisLocal: state.costLocal,
      averageCostLocal: state.quantity > EPSILON ? state.costLocal / state.quantity : 0,
      price: currentPrice,
      priceDate: latest?.priceDate ?? null,
      priceFetchedAt: latest?.fetchedAt ?? null,
      priceQuotedAt: latest?.quotedAt ?? null,
      priceProvider: latest?.provider ?? null,
      priceSession: latest?.session ?? null,
      priceDataQuality: latest?.dataQuality ?? null,
      priceIsDelayed: latest?.isDelayed ?? null,
      referencePriceDate: previous?.priceDate ?? null,
      priceStatus: latest?.status ?? "MISSING",
      marketValueUsd,
      todayPnlUsd: positionTodayPnl,
      unrealizedUsd: positionUnrealized,
      fxPnlUsd: positionFxPnl,
      weight: null,
    });
  }

  const totalValueUsd = hasMissingPrice ? null : investedMarketValueUsd + cashUsd;
  for (const position of calculated) {
    position.weight =
      totalValueUsd && position.marketValueUsd != null
        ? position.marketValueUsd / totalValueUsd
        : null;
  }
  const cumulativePnlUsd =
    totalValueUsd == null ? null : totalValueUsd - netContributionsUsd;
  const allocation = buildAllocation(calculated, totalValueUsd);

  return {
    asOf:
      [...latestPrices.values()]
        .map((price) => price.priceDate)
        .sort()
        .at(-1) ?? new Date().toISOString().slice(0, 10),
    costMethod: input.costMethod,
    totalValueUsd,
    netContributionsUsd,
    marketValueUsd: hasMissingPrice ? null : investedMarketValueUsd,
    cashUsd,
    todayPnlUsd: hasMissingPreviousPrice || hasMissingPrice ? null : todayPnlUsd,
    cumulativePnlUsd,
    realizedPnlUsd,
    unrealizedPnlUsd: hasMissingPrice ? null : unrealizedPnlUsd,
    dividendIncomeUsd,
    withholdingTaxUsd,
    feesUsd,
    fxPnlUsd: hasMissingPrice ? null : fxPnlUsd,
    totalReturnRate:
      cumulativePnlUsd == null || Math.abs(netContributionsUsd) <= EPSILON
        ? null
        : cumulativePnlUsd / netContributionsUsd,
    missingAssetIds,
    positions: calculated.sort((a, b) => (b.marketValueUsd ?? -1) - (a.marketValueUsd ?? -1)),
    allocation,
  };
}

function consumeWeightedAverage(state: PositionState, quantity: number) {
  const fraction = state.quantity <= EPSILON ? 0 : quantity / state.quantity;
  const base = state.costBase * fraction;
  const local = state.costLocal * fraction;
  state.quantity -= quantity;
  state.costBase -= base;
  state.costLocal -= local;
  if (state.quantity <= EPSILON) {
    state.quantity = 0;
    state.costBase = 0;
    state.costLocal = 0;
    state.lots = [];
  }
  return { base, local };
}

function consumeFifo(state: PositionState, quantity: number) {
  let remaining = quantity;
  let base = 0;
  let local = 0;
  while (remaining > EPSILON) {
    const lot = state.lots[0];
    if (!lot) throw new Error("FIFO lot inventory is inconsistent");
    const used = Math.min(lot.quantity, remaining);
    base += used * lot.baseUnitCost;
    local += used * lot.localUnitCost;
    lot.quantity -= used;
    remaining -= used;
    if (lot.quantity <= EPSILON) state.lots.shift();
  }
  state.quantity -= quantity;
  state.costBase -= base;
  state.costLocal -= local;
  if (state.quantity <= EPSILON) {
    state.quantity = 0;
    state.costBase = 0;
    state.costLocal = 0;
  }
  return { base, local };
}

function latestPriceMap(prices: PriceSnapshot[]) {
  const result = new Map<string, PriceSnapshot>();
  for (const price of prices) {
    if (price.status === "FAILED" || (price.price == null && price.nav == null)) continue;
    const current = result.get(price.assetId);
    if (!current || compareSnapshot(price, current) > 0) result.set(price.assetId, price);
  }
  return result;
}

function referencePriceMap(
  prices: PriceSnapshot[],
  latestByAsset: Map<string, PriceSnapshot>,
) {
  const grouped = new Map<string, PriceSnapshot[]>();
  for (const price of prices) {
    if (price.status === "FAILED" || (price.price == null && price.nav == null)) continue;
    const values = grouped.get(price.assetId) ?? [];
    values.push(price);
    grouped.set(price.assetId, values);
  }
  const result = new Map<string, PriceSnapshot>();
  for (const [assetId, values] of grouped) {
    const latest = latestByAsset.get(assetId);
    if (!latest) continue;
    const candidates = values.filter((value) => value !== latest);
    const preferred = candidates.filter((value) => {
      if (latest.session === "AFTERNOON") {
        return value.dataQuality === "OFFICIAL_CLOSE" && value.priceDate <= latest.priceDate;
      }
      if (latest.dataQuality === "NAV") {
        return value.nav != null && value.priceDate < latest.priceDate;
      }
      return value.dataQuality === "OFFICIAL_CLOSE" && value.priceDate < latest.priceDate;
    });
    const fallback = candidates.filter((value) => value.priceDate < latest.priceDate);
    const reference = [...(preferred.length ? preferred : fallback)].sort(compareSnapshot).at(-1);
    if (reference) result.set(assetId, reference);
  }
  return result;
}

function compareSnapshot(left: PriceSnapshot, right: PriceSnapshot) {
  const date = left.priceDate.localeCompare(right.priceDate);
  if (date) return date;
  return left.fetchedAt.localeCompare(right.fetchedAt);
}

export function currencyRate(from: Currency, to: Currency, rates: FxSnapshot[]) {
  if (from === to) return 1;
  const latestByPair = new Map<string, FxSnapshot>();
  for (const rate of rates) {
    const key = `${rate.baseCurrency}:${rate.quoteCurrency}`;
    const current = latestByPair.get(key);
    if (!current || rate.rateDate > current.rateDate) latestByPair.set(key, rate);
  }
  const graph = new Map<Currency, Array<{ currency: Currency; rate: number }>>();
  for (const value of latestByPair.values()) {
    const direct = graph.get(value.baseCurrency) ?? [];
    direct.push({ currency: value.quoteCurrency, rate: value.rate });
    graph.set(value.baseCurrency, direct);
    const inverse = graph.get(value.quoteCurrency) ?? [];
    inverse.push({ currency: value.baseCurrency, rate: 1 / value.rate });
    graph.set(value.quoteCurrency, inverse);
  }
  const queue: Array<{ currency: Currency; rate: number }> = [{ currency: from, rate: 1 }];
  const visited = new Set<Currency>([from]);
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of graph.get(current.currency) ?? []) {
      if (visited.has(edge.currency)) continue;
      const rate = current.rate * edge.rate;
      if (edge.currency === to) return rate;
      visited.add(edge.currency);
      queue.push({ currency: edge.currency, rate });
    }
  }
  throw new Error(`Missing FX path from ${from} to ${to}`);
}

function transactionFxToUsd(transaction: LedgerTransaction) {
  if (transaction.currency === "USD") return 1;
  if (transaction.fxToBase == null || transaction.fxToBase <= 0) {
    throw new Error(`Transaction ${transaction.id} is missing a valid FX rate`);
  }
  return transaction.fxToBase;
}

function requiredAmount(transaction: LedgerTransaction) {
  const amount = transaction.totalAmount ??
    (transaction.unitPrice == null ? null : transaction.quantity * transaction.unitPrice);
  if (amount == null || !Number.isFinite(amount) || amount < 0) {
    throw new Error(`Transaction ${transaction.id} is missing a valid total amount`);
  }
  return amount;
}

function positive(value: number | null, label: string) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be positive`);
  }
  return value;
}

function buildAllocation(positions: CalculatedPosition[], totalValue: number | null) {
  const byAsset = new Map<string, number>();
  const byAccount = new Map<string, number>();
  const bySector = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const position of positions) {
    if (position.marketValueUsd == null) continue;
    add(byAsset, position.symbol, position.marketValueUsd);
    add(byAccount, position.accountName, position.marketValueUsd);
    add(bySector, position.sector, position.marketValueUsd);
    add(byType, position.assetType, position.marketValueUsd);
  }
  const rows = (map: Map<string, number>) =>
    [...map.entries()]
      .map(([label, valueUsd]) => ({
        label,
        valueUsd,
        weight: totalValue ? valueUsd / totalValue : 0,
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd);
  return {
    byAsset: rows(byAsset),
    byAccount: rows(byAccount),
    bySector: rows(bySector),
    byType: rows(byType),
  };
}

function add(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

export type ScenarioShock = {
  qqqPct: number;
  semiconductorPct: number;
  usdCnyPct: number;
  usdHkdPct: number;
  eurUsdPct: number;
  addedCashUsd: number;
  specific: Record<string, number>;
};

export function runScenario(
  summary: PortfolioSummary,
  shock: ScenarioShock,
): {
  beforeUsd: number | null;
  afterUsd: number | null;
  changeUsd: number | null;
  changePct: number | null;
  recoveryPct: number | null;
  contributions: Array<{ symbol: string; changeUsd: number; shockPct: number }>;
  warning: string;
} {
  if (summary.totalValueUsd == null) {
    return {
      beforeUsd: null,
      afterUsd: null,
      changeUsd: null,
      changePct: null,
      recoveryPct: null,
      contributions: [],
      warning: "Scenario unavailable because at least one position is missing a price.",
    };
  }
  const contributions = summary.positions
    .filter((position) => position.marketValueUsd != null)
    .map((position) => {
      let pct = shock.specific[position.symbol] ?? 0;
      if (position.symbol === "TQQQ") {
        pct += clamp(shock.qqqPct * 3, -1, 3);
      } else if (position.symbol === "QQQ" || position.sector === "Technology") {
        pct += shock.qqqPct;
      }
      if (position.sector === "Semiconductors") pct += shock.semiconductorPct;
      if (position.currency === "CNY") pct -= shock.usdCnyPct;
      if (position.currency === "HKD") pct -= shock.usdHkdPct;
      if (position.currency === "EUR") pct += shock.eurUsdPct;
      pct = clamp(pct, -1, 5);
      return {
        symbol: position.symbol,
        shockPct: pct,
        changeUsd: position.marketValueUsd! * pct,
      };
    })
    .sort((a, b) => Math.abs(b.changeUsd) - Math.abs(a.changeUsd));
  const changeUsd = contributions.reduce((sum, item) => sum + item.changeUsd, 0) + shock.addedCashUsd;
  const afterUsd = summary.totalValueUsd + changeUsd;
  return {
    beforeUsd: summary.totalValueUsd,
    afterUsd,
    changeUsd,
    changePct: changeUsd / summary.totalValueUsd,
    recoveryPct: afterUsd > 0 && changeUsd < 0 ? -changeUsd / afterUsd : 0,
    contributions,
    warning:
      "TQQQ uses a labeled one-day 3x approximation. Multi-day returns depend on the path, daily resets and volatility drag, so QQQ cumulative change is not simply multiplied by three.",
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
