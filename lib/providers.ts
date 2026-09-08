import type { Asset, Currency } from "./types";

export type ProviderPrice = {
  priceDate: string;
  price: number;
  currency: Currency;
  provider: string;
  quotedAt: string | null;
  dataQuality: "OFFICIAL_CLOSE" | "FREE_REALTIME" | "DELAYED" | "NAV";
  isDelayed: boolean;
};

export type ProviderValuation = {
  asOfDate: string;
  provider: string;
  marketCap: number | null;
  trailingPe: number | null;
  forwardPe: number | null;
  priceSales: number | null;
  evEbitda: number | null;
  earningsYield: number | null;
  revenueGrowth: number | null;
  epsGrowth: number | null;
  high52w: number | null;
  low52w: number | null;
};

export interface MarketPriceProvider {
  readonly name: string;
  getDailyClose(asset: Asset): Promise<ProviderPrice>;
}

export interface FundamentalProvider {
  readonly name: string;
  getValuation(asset: Asset): Promise<ProviderValuation | null>;
}

export interface FxProvider {
  readonly name: string;
  getUsdRates(currencies: Currency[]): Promise<{
    rateDate: string;
    rates: Partial<Record<Currency, number>>;
  }>;
}

export interface FundNavProvider {
  readonly name: string;
  getLatestNav(asset: Asset): Promise<ProviderPrice | null>;
}

export class AlphaVantagePriceProvider implements MarketPriceProvider {
  readonly name = "Alpha Vantage";
  constructor(private readonly apiKey: string) {}

  async getDailyClose(asset: Asset): Promise<ProviderPrice> {
    if (asset.assetType !== "STOCK" && asset.assetType !== "ETF") {
      throw new Error("Provider supports only exchange-traded assets");
    }
    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.set("function", "TIME_SERIES_DAILY");
    url.searchParams.set("symbol", asset.providerSymbol ?? asset.symbol);
    url.searchParams.set("outputsize", "compact");
    url.searchParams.set("apikey", this.apiKey);
    const body = await fetchJson<Record<string, unknown>>(url);
    const series = body["Time Series (Daily)"] as Record<string, Record<string, string>> | undefined;
    if (!series) throw new Error(providerMessage(body));
    const priceDate = Object.keys(series).sort().at(-1);
    const price = priceDate ? Number(series[priceDate]?.["4. close"]) : Number.NaN;
    if (!priceDate || !Number.isFinite(price) || price <= 0) {
      throw new Error("Provider returned no valid daily close");
    }
    return {
      priceDate,
      price,
      currency: asset.currency,
      provider: this.name,
      quotedAt: null,
      dataQuality: "OFFICIAL_CLOSE",
      isDelayed: false,
    };
  }
}

export class FinnhubQuoteProvider {
  readonly name = "Finnhub free personal-use quote";
  constructor(private readonly apiKey: string) {}

  async getMarketHolidays() {
    const url = new URL("https://finnhub.io/api/v1/stock/market-holiday");
    url.searchParams.set("exchange", "US");
    url.searchParams.set("token", this.apiKey);
    const body = await fetchJson<{ data?: Array<{ atDate?: string }> }>(url);
    return new Set((body.data ?? []).map((item) => item.atDate).filter(Boolean) as string[]);
  }

  async getPrice(
    asset: Asset,
    mode: "MORNING" | "AFTERNOON",
    holidays: Set<string>,
  ): Promise<ProviderPrice> {
    if (asset.assetType !== "STOCK" && asset.assetType !== "ETF") {
      throw new Error("Provider supports only exchange-traded assets");
    }
    const url = new URL("https://finnhub.io/api/v1/quote");
    url.searchParams.set("symbol", asset.providerSymbol ?? asset.symbol);
    url.searchParams.set("token", this.apiKey);
    let quote: { c?: number; pc?: number; t?: number } = {};
    for (let attempt = 0; attempt < 3; attempt += 1) {
      quote = await fetchJson(url);
      const valid = mode === "MORNING"
        ? Boolean(quote.pc && quote.pc > 0)
        : Boolean(quote.c && quote.c > 0 && quote.t);
      if (valid) break;
      if (attempt < 2) await wait(750 * 2 ** attempt);
    }
    if (mode === "MORNING") {
      if (!quote.pc || quote.pc <= 0) throw new Error("Provider returned no previous official close");
      return {
        priceDate: previousTradingDate(new Date(), holidays),
        price: quote.pc,
        currency: asset.currency,
        provider: this.name,
        quotedAt: null,
        dataQuality: "OFFICIAL_CLOSE",
        isDelayed: false,
      };
    }
    if (!quote.c || quote.c <= 0 || !quote.t) throw new Error("Provider returned no current quote");
    const quotedAt = new Date(quote.t * 1000);
    return {
      priceDate: dateInTimeZone(quotedAt, "America/New_York"),
      price: quote.c,
      currency: asset.currency,
      provider: this.name,
      quotedAt: quotedAt.toISOString(),
      dataQuality: "FREE_REALTIME",
      isDelayed: false,
    };
  }
}

export class AlphaVantageFundamentalProvider implements FundamentalProvider {
  readonly name = "Alpha Vantage";
  constructor(private readonly apiKey: string) {}

  async getValuation(asset: Asset): Promise<ProviderValuation | null> {
    if (asset.assetType !== "STOCK") return null;
    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.set("function", "OVERVIEW");
    url.searchParams.set("symbol", asset.providerSymbol ?? asset.symbol);
    url.searchParams.set("apikey", this.apiKey);
    const body = await fetchJson<Record<string, unknown>>(url);
    if (!body.Symbol) throw new Error(providerMessage(body));
    const trailingPe = numberOrNull(body.TrailingPE);
    return {
      asOfDate: new Date().toISOString().slice(0, 10),
      provider: this.name,
      marketCap: numberOrNull(body.MarketCapitalization),
      trailingPe,
      forwardPe: numberOrNull(body.ForwardPE),
      priceSales: numberOrNull(body.PriceToSalesRatioTTM),
      evEbitda: numberOrNull(body.EVToEBITDA),
      earningsYield: trailingPe && trailingPe > 0 ? 1 / trailingPe : null,
      revenueGrowth: numberOrNull(body.QuarterlyRevenueGrowthYOY),
      epsGrowth: numberOrNull(body.QuarterlyEarningsGrowthYOY),
      high52w: numberOrNull(body["52WeekHigh"]),
      low52w: numberOrNull(body["52WeekLow"]),
    };
  }
}

export class FrankfurterFxProvider implements FxProvider {
  readonly name = "Frankfurter / ECB reference rates";

  async getUsdRates(currencies: Currency[]) {
    const targets = currencies.filter((currency) => currency !== "USD");
    if (!targets.length) {
      return { rateDate: new Date().toISOString().slice(0, 10), rates: { USD: 1 } };
    }
    const url = new URL("https://api.frankfurter.app/latest");
    url.searchParams.set("from", "USD");
    url.searchParams.set("to", targets.join(","));
    const body = await fetchJson<{ date?: string; rates?: Partial<Record<Currency, number>> }>(url);
    if (!body.date || !body.rates) throw new Error("FX provider returned no reference rates");
    return { rateDate: body.date, rates: { USD: 1, ...body.rates } };
  }
}

export class ConfirmedManualFundProvider implements FundNavProvider {
  readonly name = "Confirmed manual NAV";
  async getLatestNav() {
    return null;
  }
}

async function fetchJson<T>(url: URL, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": "Alpha-Lab-Beta/1.0" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await wait(500 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Provider request failed");
}

function numberOrNull(value: unknown) {
  if (value == null || value === "None" || value === "-") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function providerMessage(body: Record<string, unknown>) {
  const message = body.Note ?? body.Information ?? body["Error Message"];
  return typeof message === "string" ? message.slice(0, 180) : "Provider returned an unexpected payload";
}

export function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function previousTradingDate(now: Date, holidays: Set<string>) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as { year: number; month: number; day: number };
  let candidate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - 1));
  for (let attempts = 0; attempts < 10; attempts += 1) {
    const date = candidate.toISOString().slice(0, 10);
    const weekday = candidate.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !holidays.has(date)) return date;
    candidate = new Date(candidate.getTime() - 86_400_000);
  }
  throw new Error("Unable to resolve the latest US trading day");
}

function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
