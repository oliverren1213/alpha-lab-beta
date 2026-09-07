export type Currency = "USD" | "HKD" | "CNY" | "EUR";
export type CostMethod = "WEIGHTED_AVERAGE" | "FIFO";
export type AssetType = "STOCK" | "ETF" | "FUND" | "CASH";
export type TransactionType =
  | "BUY"
  | "SELL"
  | "DIVIDEND"
  | "DIVIDEND_TAX"
  | "FEE"
  | "SUBSCRIPTION"
  | "REDEMPTION"
  | "SPLIT"
  | "CASH_IN"
  | "CASH_OUT";

export type Account = {
  id: string;
  name: string;
  institution: string;
  baseCurrency: Currency;
  maskedAccount: string | null;
  isDemo: boolean;
};

export type Asset = {
  id: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  currency: Currency;
  sector: string | null;
  providerSymbol: string | null;
  isLeveraged: boolean;
  leverageTarget: number | null;
  isDemo: boolean;
};

export type LedgerTransaction = {
  id: string;
  accountId: string;
  assetId: string | null;
  type: TransactionType;
  tradedAt: string;
  settlementDate: string | null;
  quantity: number;
  unitPrice: number | null;
  currency: Currency;
  fee: number;
  tax: number;
  fxToBase: number | null;
  totalAmount: number | null;
  source: string;
  importBatchId: string | null;
  note: string | null;
  reconciled: boolean;
  isDemo: boolean;
};

export type PriceSnapshot = {
  assetId: string;
  priceDate: string;
  fetchedAt: string;
  provider: string;
  quotedAt: string | null;
  session: "MORNING" | "AFTERNOON" | "MANUAL" | "NAV" | "DEMO";
  dataQuality: "OFFICIAL_CLOSE" | "FREE_REALTIME" | "DELAYED" | "NAV" | "DEMO";
  isDelayed: boolean;
  price: number | null;
  nav: number | null;
  currency: Currency;
  status: "FRESH" | "STALE" | "FAILED" | "DEMO";
  isDemo: boolean;
};

export type FxSnapshot = {
  baseCurrency: Currency;
  quoteCurrency: Currency;
  rateDate: string;
  rate: number;
  provider: string;
  status: "FRESH" | "STALE" | "FAILED" | "DEMO";
  isDemo: boolean;
};

export type PortfolioHistoryPoint = {
  date: string;
  portfolio: number;
  contributions: number;
  qqq: number | null;
  spy: number | null;
  status: string;
};

export type BenchmarkSnapshot = {
  symbol: "QQQ" | "SPY";
  priceDate: string;
  close: number;
  provider: string;
  fetchedAt: string;
  isDemo: boolean;
};

export type ThesisRecord = {
  id: string;
  assetId: string;
  symbol: string;
  decisionType: string;
  openedAt: string;
  horizon: string;
  maxLoss: number | null;
  plannedWeight: number | null;
  confidence: number;
  status: string;
  revision: ThesisRevision;
  revisions: ThesisRevision[];
};

export type ThesisRevision = {
    revisedAt: string;
    buyReason: string;
    mispricing: string | null;
    catalysts: string | null;
    risks: string;
    invalidation: string;
    sources: string | null;
    note: string | null;
};

export type UpdateStatus = {
  id: string;
  trigger: string;
  mode: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  successCount: number;
  failureCount: number;
  errorSummary: string | null;
};

export type DataSourceStatus = {
  id: string;
  kind: string;
  provider: string;
  label: string;
  enabled: boolean;
  delayDescription: string;
  lastSuccessAt: string | null;
  lastError: string | null;
};

export type ImportBatchSummary = {
  id: string;
  source: string;
  filename: string | null;
  status: string;
  rowCount: number;
  confirmedAt: string | null;
  createdAt: string;
};

export type LabData = {
  accounts: Account[];
  assets: Asset[];
  transactions: LedgerTransaction[];
  prices: PriceSnapshot[];
  fxRates: FxSnapshot[];
  benchmarks: BenchmarkSnapshot[];
  history: PortfolioHistoryPoint[];
  theses: ThesisRecord[];
  dataSources: DataSourceStatus[];
  importBatches: ImportBatchSummary[];
  updateStatus: UpdateStatus | null;
  lastSuccessfulUpdateAt: string | null;
  demoMode: boolean;
  generatedAt: string;
};
