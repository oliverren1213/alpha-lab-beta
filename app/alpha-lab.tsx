"use client";

import { FormEvent, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { installTranslations, translateText, type Language } from "../lib/i18n";
import { calculatePortfolio, currencyRate, runScenario, type ScenarioShock } from "../lib/portfolio";
import { normalizeTradeDate, transactionAmountPreview } from "../lib/transaction-form";
import { transactionFingerprint } from "../lib/transaction-fingerprint";
import type {
  Asset,
  CostMethod,
  Currency,
  LabData,
  LedgerTransaction,
  TransactionType,
} from "../lib/types";

type View = "portfolio" | "ledger" | "thesis" | "scenario" | "memo" | "data" | "about";
type Notice = { tone: "info" | "success" | "error"; text: string } | null;
type TransactionDraft = {
  accountId: string;
  assetId: string;
  type: TransactionType;
  tradedAt: string;
  settlementDate: string;
  quantity: string;
  unitPrice: string;
  currency: Currency;
  fee: string;
  tax: string;
  fxToBase: string;
  totalAmount: string;
  source: string;
  note: string;
  reconciled: boolean;
};

const views: Array<{ id: View; label: string; short: string }> = [
  { id: "portfolio", label: "组合总览", short: "组合" },
  { id: "ledger", label: "交易账本", short: "账本" },
  { id: "thesis", label: "投资逻辑", short: "逻辑" },
  { id: "scenario", label: "情景实验室", short: "情景" },
  { id: "memo", label: "每周备忘", short: "备忘" },
  { id: "data", label: "数据与更新", short: "数据" },
  { id: "about", label: "关于项目", short: "关于" },
];

const currencyLabels: Record<Currency, string> = {
  USD: "USD",
  HKD: "HKD",
  CNY: "RMB",
  EUR: "EUR",
};

const transactionLabels: Record<string, string> = {
  BUY: "买入",
  SELL: "卖出",
  DIVIDEND: "股息",
  DIVIDEND_TAX: "股息税",
  FEE: "费用",
  SUBSCRIPTION: "申购",
  REDEMPTION: "赎回",
  SPLIT: "拆股",
  CASH_IN: "资金转入",
  CASH_OUT: "资金转出",
};

const pricedTransactionTypes = new Set<TransactionType>(["BUY", "SELL", "SUBSCRIPTION", "REDEMPTION"]);
const amountTransactionTypes = new Set<TransactionType>(["DIVIDEND", "DIVIDEND_TAX", "FEE", "CASH_IN", "CASH_OUT"]);
const assetTransactionTypes = new Set<TransactionType>([...pricedTransactionTypes, "DIVIDEND", "SPLIT"]);
const costTransactionTypes = new Set<TransactionType>([...pricedTransactionTypes, "DIVIDEND", "CASH_IN", "CASH_OUT"]);

const transactionAmountLabels: Partial<Record<TransactionType, string>> = {
  DIVIDEND: "税前股息金额",
  DIVIDEND_TAX: "股息税金额",
  FEE: "费用金额",
  CASH_IN: "转入金额",
  CASH_OUT: "转出金额",
};

const transactionSubmitLabels: Record<TransactionType, string> = {
  BUY: "确认买入",
  SELL: "确认卖出",
  DIVIDEND: "记录股息",
  DIVIDEND_TAX: "记录股息税",
  FEE: "记录费用",
  SUBSCRIPTION: "确认申购",
  REDEMPTION: "确认赎回",
  SPLIT: "记录拆股",
  CASH_IN: "记录转入",
  CASH_OUT: "记录转出",
};

const qualityLabels: Record<string, string> = {
  OFFICIAL_CLOSE: "正式收盘",
  FREE_REALTIME: "免费实时行情",
  DELAYED: "延迟行情",
  NAV: "基金净值",
  DEMO: "演示数据",
};

const emptyShock: ScenarioShock = {
  qqqPct: 0,
  semiconductorPct: 0,
  usdCnyPct: 0,
  usdHkdPct: 0,
  eurUsdPct: 0,
  addedCashUsd: 0,
  specific: {},
};

export function AlphaLab({
  initialData,
  displayName,
  isGuest = false,
}: { initialData: LabData; displayName: string; isGuest?: boolean }) {
  const [data, setData] = useState(initialData);
  const [view, setView] = useState<View>("portfolio");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [costMethod, setCostMethod] = useState<CostMethod>("WEIGHTED_AVERAGE");
  const [notice, setNotice] = useState<Notice>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window === "undefined") return "en";
    return window.localStorage.getItem("alpha-language") === "zh" ? "zh" : "en";
  });
  const [theme, setTheme] = useState<"system" | "light" | "dark">(() => {
    if (typeof window === "undefined") return "system";
    const saved = window.localStorage.getItem("alpha-theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  });

  useLayoutEffect(() => {
    window.localStorage.setItem("alpha-language", language);
    return installTranslations(language);
  }, [language]);

  const portfolio = useMemo(() => {
    try {
      return { summary: calculatePortfolio({ ...data, costMethod }), error: null };
    } catch (error) {
      return {
        summary: null,
        error: error instanceof Error ? error.message : "组合计算失败",
      };
    }
  }, [costMethod, data]);

  const displayRate = useMemo(() => {
    try {
      return currencyRate("USD", currency, data.fxRates);
    } catch {
      return currency === "USD" ? 1 : null;
    }
  }, [currency, data.fxRates]);

  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("alpha-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (isGuest && window.localStorage.getItem("alpha-beta-welcome") !== "dismissed") {
      setShowWelcome(true);
    }
  }, [isGuest]);

  useEffect(() => {
    if (!isOlderThan90Minutes(initialData.lastSuccessfulUpdateAt)) return;
    let active = true;
    async function refreshOnOpen() {
      try {
        const response = await fetch("/api/refresh", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trigger: "STALE_OPEN" }),
        });
        const result = await response.json() as { error?: string; skipped?: boolean };
        if (!response.ok) throw new Error(result.error ?? "后台更新失败");
        if (!result.skipped) {
          const fresh = await fetchData();
          if (active) setData(fresh);
        }
      } catch (error) {
        if (active) {
          setNotice({
            tone: "error",
            text: error instanceof Error ? error.message : "后台更新失败",
          });
        }
      }
    }
    void refreshOnOpen();
    return () => { active = false; };
  }, [initialData.lastSuccessfulUpdateAt]);

  async function reloadData() {
    const fresh = await fetchData();
    setData(fresh);
    return fresh;
  }

  async function refreshData() {
    setRefreshing(true);
    setNotice({ tone: "info", text: "正在向已配置的数据源请求最新数据" });
    try {
      const response = await fetch("/api/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trigger: "MANUAL" }),
      });
      const result = await response.json() as {
        error?: string;
        skipped?: boolean;
        status?: string;
        errorSummary?: string | null;
      };
      if (!response.ok) throw new Error(result.error ?? "更新失败");
      await reloadData();
      if (result.skipped) {
        setNotice({ tone: "info", text: "刷新冷却中，已保留最近有效数据" });
      } else if (result.status === "SUCCESS") {
        setNotice({ tone: "success", text: "本次更新已写入数据库" });
      } else {
        setNotice({ tone: "error", text: result.errorSummary ?? "部分数据未能更新，仍显示最近有效值" });
      }
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "更新失败" });
    } finally {
      setRefreshing(false);
    }
  }

  function logout() {
    window.location.assign("/signout-with-chatgpt?return_to=/");
  }

  function selectView(next: View) {
    setView(next);
    window.scrollTo({ top: 0 });
  }

  function dismissWelcome(nextView: View = "portfolio") {
    window.localStorage.setItem("alpha-beta-welcome", "dismissed");
    setShowWelcome(false);
    selectView(nextView);
  }

  async function resetDemo() {
    if (!confirmUi("重置会清除你在当前访客空间的修改，并恢复演示数据。继续？")) return;
    setResettingDemo(true);
    try {
      const response = await fetch("/api/guest/reset", { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "无法重置演示空间");
      await reloadData();
      setNotice({ tone: "success", text: "演示空间已恢复，可以重新体验所有功能" });
      selectView("portfolio");
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "无法重置演示空间" });
    } finally {
      setResettingDemo(false);
    }
  }

  const money = (value: number | null | undefined) =>
    formatMoney(value, currency, displayRate);
  const t = (value: string) => translateText(value, language);

  return (
    <div className="alpha-app">
      <header className="app-topbar liquid-glass-web-approx">
        <div className="topbar-inner">
          <div className="brand-lockup">
            <span className="brand-mark" aria-hidden="true">α</span>
            <strong>Alpha Lab <span>Beta</span></strong>
          </div>
          <nav className="primary-nav" aria-label={t("主要导航")}>
            {views.map((item) => (
              <button
                key={item.id}
                aria-current={view === item.id ? "page" : undefined}
                aria-label={t(item.label)}
                className={view === item.id ? "active" : ""}
                onClick={() => selectView(item.id)}
                title={t(item.label)}
                type="button"
              >
                {t(item.short)}
              </button>
            ))}
          </nav>
          <div className="topbar-actions">
            <span className="user-badge" title={displayName}>{displayName}</span>
            <label className="compact-select language-select">
              <span className="sr-only">Language</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </label>
            {!isGuest ? <button className="text-button" onClick={logout} type="button">退出</button> : null}
          </div>
        </div>
      </header>

      <main className="workspace">
        {isGuest ? (
          <div className="demo-ribbon" role="status">
            <div><strong>独立演示空间</strong><span>示例数据与你的操作只存在于当前访客空间，不是任何人的真实持仓。</span></div>
            <div className="demo-ribbon-actions">
              <button className="text-button" type="button" onClick={() => setShowWelcome(true)}>使用指南</button>
              <button className="text-button" type="button" onClick={() => void resetDemo()} disabled={resettingDemo}>{resettingDemo ? "重置中" : "重置演示"}</button>
            </div>
          </div>
        ) : null}
        {showWelcome ? (
          <section className="welcome-card" aria-labelledby="welcome-title">
            <div className="welcome-copy">
              <span className="welcome-kicker">PUBLIC BETA · ISOLATED DEMO</span>
              <h1 id="welcome-title">从一笔交易，到一套可核对的投资决策。</h1>
              <p>体验真实成本、收益归因、价格审计与投资逻辑。所有预置记录都明确标注为演示数据。</p>
            </div>
            <ol className="welcome-steps">
              <li><span>01</span><div><strong>查看组合</strong><small>先看成本、收益和价格时间。</small></div></li>
              <li><span>02</span><div><strong>试录交易</strong><small>重复成交会自动拦截。</small></div></li>
              <li><span>03</span><div><strong>运行情景</strong><small>改变假设，不改正式账本。</small></div></li>
            </ol>
            <div className="welcome-actions">
              <button className="primary-button" type="button" onClick={() => dismissWelcome("portfolio")}>开始体验</button>
              <button className="secondary-button" type="button" onClick={() => dismissWelcome("ledger")}>直接试录交易</button>
            </div>
          </section>
        ) : null}
        <header className="workspace-header">
          <h1>{t(viewTitle(view))}</h1>
          <div className="header-actions">
            {view !== "portfolio" && view !== "about" ? <DataFreshness data={data} /> : null}
            <label className="compact-select mobile-language-select">
              <span className="sr-only">Language</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
                <option value="en">EN</option><option value="zh">中文</option>
              </select>
            </label>
            {view !== "about" ? <label className="compact-select">
              <span className="sr-only">显示货币</span>
              <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
                {(Object.keys(currencyLabels) as Currency[]).map((item) => (
                  <option key={item} value={item}>{currencyLabels[item]}</option>
                ))}
              </select>
            </label> : null}
            <label className="compact-select theme-select">
              <span className="sr-only">主题</span>
              <select value={theme} onChange={(event) => setTheme(event.target.value as typeof theme)}>
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </label>
            {view !== "about" ? <button className="primary-button" onClick={refreshData} disabled={refreshing} type="button">
              {refreshing ? "更新中" : "刷新数据"}
            </button> : null}
          </div>
        </header>

        {notice ? (
          <div className={`notice app-toast ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} aria-label="关闭提示" type="button">关闭</button>
          </div>
        ) : null}

        {portfolio.error ? <div className="notice error" role="alert">组合计算错误：{portfolio.error}</div> : null}
        {displayRate == null ? (
          <div className="notice error" role="alert">缺少 {currencyLabels[currency]} 汇率，金额不会被静默换算为 0。</div>
        ) : null}

        {view === "portfolio" ? (
          <PortfolioView
            data={data}
            summary={portfolio.summary}
            money={money}
            currency={currency}
            displayRate={displayRate}
            costMethod={costMethod}
            setCostMethod={setCostMethod}
            openLedger={() => selectView("ledger")}
          />
        ) : null}
        {view === "ledger" ? (
          <LedgerView data={data} reload={reloadData} setNotice={setNotice} />
        ) : null}
        {view === "thesis" ? (
          <ThesisView data={data} reload={reloadData} setNotice={setNotice} />
        ) : null}
        {view === "scenario" ? (
          <ScenarioView summary={portfolio.summary} money={money} displayRate={displayRate} />
        ) : null}
        {view === "memo" ? (
          <MemoView data={data} summary={portfolio.summary} money={money} />
        ) : null}
        {view === "data" ? (
          <DataView
            data={data}
            summary={portfolio.summary}
            reload={reloadData}
            setNotice={setNotice}
            refreshData={refreshData}
            refreshing={refreshing}
          />
        ) : null}
        {view === "about" ? <AboutView language={language} /> : null}
      </main>
    </div>
  );
}

function PortfolioView({
  data,
  summary,
  money,
  currency,
  displayRate,
  costMethod,
  setCostMethod,
  openLedger,
}: {
  data: LabData;
  summary: ReturnType<typeof calculatePortfolio> | null;
  money: (value: number | null | undefined) => string;
  currency: Currency;
  displayRate: number | null;
  costMethod: CostMethod;
  setCostMethod: (value: CostMethod) => void;
  openLedger: () => void;
}) {
  if (!data.transactions.length || !summary) {
    return (
      <EmptyState
        title="先建立真实账本"
        body="导入结单 CSV 或录入第一笔交易后，这里才会计算持仓、成本和收益。系统不会放入演示持仓。"
        action="打开交易账本"
        onAction={openLedger}
      />
    );
  }
  const positionCostUsd = summary.positions.reduce((total, position) => total + position.costBasisUsd, 0);
  const primaryMetrics = [
    ["持仓市值", summary.marketValueUsd],
    ["净投入", summary.netContributionsUsd],
    ["账本持仓成本", positionCostUsd],
    ["账本现金", summary.cashUsd],
  ] as const;
  const pnlBreakdown = [
    ["已实现收益", summary.realizedPnlUsd],
    ["未实现收益", summary.unrealizedPnlUsd],
    ["股息收入", summary.dividendIncomeUsd],
    ["手续费和税费", -(summary.feesUsd + summary.withholdingTaxUsd)],
    ["汇率损益", summary.fxPnlUsd],
  ] as const;
  const returnRate = summary.totalReturnRate == null
    ? "缺少数据"
    : formatPercent(summary.totalReturnRate);
  const pendingCostKeys = new Set(data.transactions
    .filter((transaction) => !transaction.reconciled && transaction.assetId &&
      ["BUY", "SELL", "SUBSCRIPTION", "REDEMPTION", "SPLIT"].includes(transaction.type))
    .map((transaction) => `${transaction.accountId}:${transaction.assetId}`));
  const pendingCount = data.transactions.filter((transaction) => !transaction.reconciled).length;
  const priceDates = summary.positions
    .map((position) => position.priceDate)
    .filter((date): date is string => Boolean(date))
    .sort();
  const valuationRange = !priceDates.length
    ? "缺少估值日期"
    : priceDates[0] === priceDates.at(-1)
      ? formatDate(priceDates[0])
      : `${formatDate(priceDates[0])} – ${formatDate(priceDates.at(-1)!)}`;
  const healthIssues = [
    ...(summary.missingAssetIds.length ? [`${summary.missingAssetIds.length} 项持仓缺少价格或汇率`] : []),
    ...(summary.cashUsd < -0.005 ? [`账本现金 ${money(summary.cashUsd)}，可能缺少入金或现金余额记录`] : []),
    ...(pendingCount ? [`${pendingCount} 笔交易待核对`] : []),
  ];
  const healthTitle = summary.missingAssetIds.length
    ? "估值不完整"
    : pendingCount
      ? "账本有待核对项"
      : "账本现金为负";
  const hasUsefulSector = summary.allocation.bySector.some((row) => row.label !== "Unclassified");

  return (
    <div className="view-stack">
      <section className="portfolio-hero" aria-labelledby="portfolio-value">
        <div className="hero-meta">
          <div><span>账户净值</span><small>{valuationRange} 价格 · {currencyLabels[currency]} 显示</small></div>
          <DataFreshness data={data} />
        </div>
        <strong id="portfolio-value">{money(summary.totalValueUsd)}</strong>
        <div className="hero-performance">
          <div><span>今日价格影响（估算）</span><strong className={toneClass(summary.todayPnlUsd)}>{money(summary.todayPnlUsd)}</strong></div>
          <div><span>累计损益</span><strong className={toneClass(summary.cumulativePnlUsd)}>{money(summary.cumulativePnlUsd)}</strong><small>净投入回报（非年化） {returnRate}</small></div>
        </div>
        <PerformanceCurve points={data.history.slice(-12)} money={money} />
      </section>

      <section className="metric-board primary-metrics" aria-label="组合关键指标">
        {primaryMetrics.map(([label, value]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong className={label === "账本现金" ? toneClass(value) : "neutral-number"}>{money(value)}</strong>
          </div>
        ))}
      </section>

      {healthIssues.length ? (
        <div className={`health-bar ${summary.missingAssetIds.length ? "error" : "warning"}`}>
          <span className="health-dot" aria-hidden="true" />
          <div><strong>{healthTitle}</strong><small>{healthIssues.join(" · ")}</small></div>
        </div>
      ) : null}

      <section className="analysis-section">
        <header className="section-heading split-heading">
          <div><h2>持仓</h2><p>成本包含已计入账本的手续费和税费；待核对成交会明确标记。</p></div>
          <label className="cost-method-control"><span>成本口径</span><select value={costMethod} onChange={(event) => setCostMethod(event.target.value as CostMethod)}><option value="WEIGHTED_AVERAGE">加权平均</option><option value="FIFO">FIFO</option></select></label>
        </header>
        <div className="table-shell positions-table">
          <table>
            <thead><tr>
              <th>标的</th><th className="numeric">数量</th><th className="numeric">当前价格</th><th className="numeric">持仓成本</th>
              <th className="numeric">市值</th><th className="numeric">今日价格影响</th><th className="numeric">持有损益</th>
            </tr></thead>
            <tbody>
              {summary.positions.map((position) => {
                const holdingReturn = position.unrealizedUsd == null || !position.costBasisUsd
                  ? null
                  : position.unrealizedUsd / position.costBasisUsd;
                return <tr key={position.key}>
                  <td className="position-asset" data-label="标的"><strong>{position.symbol}</strong><small>{position.accountName} · {position.name}{position.isLeveraged ? " · 杠杆 ETF" : ""}</small></td>
                  <td className="numeric position-quantity" data-label="数量">{formatNumber(position.quantity)}</td>
                  <td className="numeric position-price" data-label="当前价格"><strong>{formatLocal(position.price, position.currency)}</strong><small>{qualityLabels[position.priceDataQuality ?? ""] ?? "缺少价格"} · {position.priceDate ? formatDate(position.priceDate) : "无日期"}</small><details className="price-audit"><summary>价格来源</summary><small>{position.priceProvider ?? "未记录数据源"}</small><small>{position.priceQuotedAt ? `报价 ${formatDateTime(position.priceQuotedAt)}` : position.priceFetchedAt ? `获取 ${formatDateTime(position.priceFetchedAt)}` : "无获取时间"}</small><small>{position.priceIsDelayed ? "数据源标记为延迟" : "数据源未标记延迟"}</small>{position.referencePriceDate ? <small>比较基准 {formatDate(position.referencePriceDate)}</small> : null}</details></td>
                  <td className="numeric position-cost" data-label="持仓成本"><strong>{formatLocal(position.costBasisLocal, position.currency)}</strong><small>均价 {formatLocal(position.averageCostLocal, position.currency)} / {position.assetType === "FUND" ? "份" : "股"}</small>{pendingCostKeys.has(position.key) ? <small className="cost-pending">含待核对交易</small> : null}</td>
                  <td className="numeric position-value" data-label="市值">{money(position.marketValueUsd)}</td>
                  <td className={`numeric position-today ${toneClass(position.todayPnlUsd)}`} data-label="今日价格影响">{money(position.todayPnlUsd)}</td>
                  <td className={`numeric position-return ${toneClass(position.unrealizedUsd)}`} data-label="持有损益"><strong>{money(position.unrealizedUsd)}</strong><small className={toneClass(holdingReturn)}>{formatPercent(holdingReturn)}</small></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      <details className="analysis-disclosure">
        <summary><span>收益拆解</span><small>已实现、未实现、股息、费用与汇率影响</small></summary>
        <section className="metric-board breakdown-metrics" aria-label="收益拆解">
          {pnlBreakdown.map(([label, value]) => <div className="metric" key={label}><span>{label}</span><strong className={toneClass(value)}>{money(value)}</strong></div>)}
        </section>
      </details>

      <section className="analysis-section">
        <SectionHeading title="集中度" body="按账户净值计算；负现金可能使持仓权重合计超过 100%。" />
        <div className="allocation-focus"><AllocationList title="按标的" rows={summary.allocation.byAsset.slice(0, 5)} money={money} /></div>
      </section>

      <details className="analysis-disclosure more-analysis">
        <summary><span>更多组合分析</span><small>账户、资产类型与历史快照</small></summary>
        <div className="analysis-disclosure-body">
          <div className="allocation-layout">
            <AllocationList title="按账户" rows={summary.allocation.byAccount} money={money} />
            <AllocationList title="按资产类型" rows={summary.allocation.byType} money={money} />
            {hasUsefulSector ? <AllocationList title="按行业" rows={summary.allocation.bySector} money={money} /> : null}
          </div>
          <section className="history-section"><h3>最近快照</h3>{data.history.length ? <div className="table-shell compact-table"><table><thead><tr><th>日期</th><th className="numeric">组合</th><th className="numeric">本金</th><th className="numeric">QQQ</th><th className="numeric">SPY</th><th>状态</th></tr></thead><tbody>{data.history.slice(-8).reverse().map((point) => <tr key={`${point.date}-${point.portfolio}`}><td>{formatDate(point.date)}</td><td className="numeric">{displayRate == null ? "缺少汇率" : formatMoney(point.portfolio, currency, displayRate)}</td><td className="numeric">{displayRate == null ? "缺少汇率" : formatMoney(point.contributions, currency, displayRate)}</td><td className="numeric">{point.qqq == null ? "缺少" : formatNumber(point.qqq)}</td><td className="numeric">{point.spy == null ? "缺少" : formatNumber(point.spy)}</td><td>{point.status}</td></tr>)}</tbody></table></div> : <InlineEmpty text="尚无每日组合快照。" />}</section>
        </div>
      </details>
    </div>
  );
}

function LedgerView({ data, reload, setNotice }: {
  data: LabData;
  reload: () => Promise<LabData>;
  setNotice: (notice: Notice) => void;
}) {
  const [editing, setEditing] = useState<LedgerTransaction | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<TransactionDraft>(() => createTransactionDraft(data));
  const assetById = new Map(data.assets.map((asset) => [asset.id, asset]));
  const accountById = new Map(data.accounts.map((account) => [account.id, account]));
  const pricedTransaction = pricedTransactionTypes.has(draft.type);
  const amountTransaction = amountTransactionTypes.has(draft.type);
  const assetTransaction = assetTransactionTypes.has(draft.type);
  const costTransaction = costTransactionTypes.has(draft.type);
  const selectedAsset = assetById.get(draft.assetId) ?? null;
  const quantity = draftNumber(draft.quantity);
  const unitPrice = draftNumber(draft.unitPrice);
  const totalAmount = draftNumber(draft.totalAmount);
  const amountPreview = transactionAmountPreview({
    type: draft.type,
    quantity,
    unitPrice,
    totalAmount,
    fee: draftNumber(draft.fee) ?? 0,
    tax: draftNumber(draft.tax) ?? 0,
  });
  const draftFingerprint = transactionFingerprint({
    accountId: draft.accountId,
    assetId: assetTransaction ? draft.assetId || null : null,
    type: draft.type,
    tradedAt: draft.tradedAt,
    quantity: quantity ?? 0,
    unitPrice,
  });
  const duplicate = draftFingerprint
    ? data.transactions.find((transaction) =>
      transaction.id !== editing?.id && transactionFingerprint(transaction) === draftFingerprint
    ) ?? null
    : null;
  const stepOneReady = Boolean(draft.accountId && (!assetTransaction || draft.assetId));
  const stepTwoReady = Boolean(
    draft.tradedAt &&
    (pricedTransaction ? quantity != null && quantity > 0 && unitPrice != null && unitPrice > 0
      : amountTransaction ? totalAmount != null && totalAmount > 0
        : draft.type === "SPLIT" ? quantity != null && quantity > 0
          : true) &&
    (draft.currency === "USD" || ((draftNumber(draft.fxToBase) ?? 0) > 0)),
  );
  const filtered = data.transactions.filter((transaction) => {
    const asset = transaction.assetId ? assetById.get(transaction.assetId) : null;
    const haystack = `${asset?.symbol ?? ""} ${asset?.name ?? ""} ${transaction.note ?? ""} ${transaction.source}`.toLowerCase();
    return (typeFilter === "ALL" || transaction.type === typeFilter) && haystack.includes(search.toLowerCase());
  });

  async function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const form = new FormData(event.currentTarget);
      const wasEditing = Boolean(editing);
      const payload = {
        accountId: String(form.get("accountId") ?? ""),
        assetId: String(form.get("assetId") ?? "") || null,
        type: String(form.get("type") ?? "") as TransactionType,
        tradedAt: normalizeTradeDate(String(form.get("tradedAt") ?? "")),
        settlementDate: String(form.get("settlementDate") ?? "") || null,
        quantity: numberField(form, "quantity", 0) ?? 0,
        unitPrice: numberField(form, "unitPrice", null),
        currency: String(form.get("currency") ?? "USD") as Currency,
        fee: numberField(form, "fee", 0),
        tax: numberField(form, "tax", 0),
        fxToBase: numberField(form, "fxToBase", null),
        totalAmount: numberField(form, "totalAmount", null),
        source: String(form.get("source") ?? "Manual"),
        note: String(form.get("note") ?? "") || null,
        reconciled: form.get("reconciled") === "on",
      };
      const fingerprint = transactionFingerprint(payload);
      const duplicate = fingerprint && data.transactions.find((transaction) =>
        transaction.id !== editing?.id && transactionFingerprint(transaction) === fingerprint
      );
      if (duplicate) {
        setNotice({
          tone: "info",
          text: "这笔成交已在账本中，本次已跳过，没有重复写入。",
        });
        return;
      }
      const response = await fetch(editing ? `/api/transactions/${editing.id}` : "/api/transactions", {
        method: editing ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        if (response.status === 409) {
          setNotice({ tone: "info", text: "这笔成交已在账本中，本次已跳过，没有重复写入。" });
          return;
        }
        throw new Error(result.error ?? "无法保存交易");
      }
      const fresh = await reload();
      setEditing(null);
      setAdvancedOpen(false);
      setEditorOpen(false);
      setStep(1);
      setDraft(createTransactionDraft(fresh));
      setNotice({ tone: "success", text: wasEditing ? "交易已更新，成本与收益已重新计算" : "交易已写入账本，成本与收益已重新计算" });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "无法保存交易" });
    } finally {
      setSaving(false);
    }
  }

  function editTransaction(transaction: LedgerTransaction) {
    setEditing(transaction);
    setAdvancedOpen(Boolean(transaction.settlementDate || transaction.fee || transaction.tax || transaction.note));
    setDraft(createTransactionDraft(data, transaction));
    setEditorOpen(true);
    setStep(1);
    document.getElementById("transaction-editor")?.scrollIntoView({ behavior: "smooth" });
  }

  function cancelEditing() {
    setEditing(null);
    setAdvancedOpen(false);
    setEditorOpen(false);
    setStep(1);
    setDraft(createTransactionDraft(data));
  }

  function openEditor(type: TransactionType = "BUY") {
    setEditing(null);
    setAdvancedOpen(false);
    setStep(1);
    setDraft({ ...createTransactionDraft(data), type });
    setEditorOpen(true);
    requestAnimationFrame(() => document.getElementById("transaction-editor")?.scrollIntoView({ behavior: "smooth" }));
  }

  async function deleteTransaction(transaction: LedgerTransaction) {
    if (!confirmUi("确认删除这笔交易？此操作会改变成本和收益计算。")) return;
    const response = await fetch(`/api/transactions/${transaction.id}`, { method: "DELETE" });
    const result = await response.json() as { error?: string };
    if (!response.ok) {
      setNotice({ tone: "error", text: result.error ?? "删除失败" });
      return;
    }
    await reload();
    setNotice({ tone: "success", text: "交易已删除，组合数据已重新读取" });
  }

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (data.demoMode && !confirmUi("导入 CSV 会替换当前演示数据，并建立你的独立账本。继续？")) return;
    setImporting(true);
    try {
      const form = new FormData(formElement);
      form.set("replaceDemo", data.demoMode ? "true" : "false");
      const response = await fetch("/api/import/csv", { method: "POST", body: form });
      const result = await response.json() as {
        error?: string;
        imported?: number;
        skippedDuplicates?: number;
      };
      if (!response.ok) throw new Error(result.error ?? "CSV 导入失败");
      await reload();
      formElement.reset();
      const imported = result.imported ?? 0;
      const skipped = result.skippedDuplicates ?? 0;
      setNotice({
        tone: imported ? "success" : "info",
        text: skipped
          ? `已导入 ${imported} 笔，另有 ${skipped} 笔重复成交已跳过`
          : `已导入 ${imported} 笔记录`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "CSV 导入失败" });
    } finally {
      setImporting(false);
    }
  }

  async function restoreBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("backup");
    if (!(file instanceof File)) return;
    if (!confirmUi("恢复会替换当前 Alpha Lab 数据。确认继续？")) return;
    try {
      const backup = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/backup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "REPLACE", backup }),
      });
      const result = await response.json() as { error?: string; restored?: number };
      if (!response.ok) throw new Error(result.error ?? "恢复失败");
      await reload();
      formElement.reset();
      setNotice({ tone: "success", text: `已恢复 ${result.restored ?? 0} 条记录` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "恢复失败" });
    }
  }

  return (
    <div className="view-stack">
      <section className="ledger-command">
        <div><span>快速录入</span><strong>你做了什么交易？</strong><small>选择动作后，只需完成三步。高级字段默认收起。</small></div>
        <div className="quick-trade-actions">
          <button type="button" onClick={() => openEditor("BUY")}>买入</button>
          <button type="button" onClick={() => openEditor("SELL")}>卖出</button>
          <button type="button" onClick={() => openEditor("CASH_IN")}>资金转入</button>
          <button className="primary-button" type="button" onClick={() => openEditor()}>其他交易</button>
        </div>
      </section>

      {editorOpen ? <section className="editor-panel transaction-editor" id="transaction-editor">
        <SectionHeading
          title={editing ? "修改交易" : "记录一笔交易"}
          body="只记录已成交；未成交和已撤销订单不用录。系统会自动检查重复。"
        />
        {!data.accounts.length ? (
          <InlineEmpty text="尚无账户。先用 CSV 模板导入第一批真实记录，账户与资产会一并建立。" />
        ) : (
          <form className="transaction-form" onSubmit={submitTransaction}>
            <ol className="transaction-steps" aria-label="交易录入步骤">
              {([{ number: 1, label: "选择交易" }, { number: 2, label: "填写成交" }, { number: 3, label: "核对保存" }] as const).map(({ number, label }) => (
                <li className={step === number ? "active" : step > number ? "complete" : ""} key={number}>
                  <button type="button" disabled={number === 2 ? !stepOneReady : number === 3 ? !(stepOneReady && stepTwoReady) : false} onClick={() => setStep(number as 1 | 2 | 3)}>
                    <span>{number}</span><strong>{label}</strong>
                  </button>
                </li>
              ))}
            </ol>

            <div className={`transaction-step-panel ${step === 1 ? "active" : ""}`}>
              <div className="step-heading"><span>STEP 1</span><strong>选择交易</strong><small>先确认方向、账户与标的。</small></div>
              <div className="transaction-primary">
              <Field label="交易类型">
                <select name="type" value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as TransactionType }))}>
                  {Object.entries(transactionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="账户">
                <select name="accountId" value={draft.accountId} onChange={(event) => setDraft((current) => ({ ...current, accountId: event.target.value }))} required>
                  {data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </Field>

              {assetTransaction ? <Field label="标的">
                <select name="assetId" value={draft.assetId} onChange={(event) => {
                  const asset = assetById.get(event.target.value);
                  setDraft((current) => ({
                    ...current,
                    assetId: event.target.value,
                    currency: asset?.currency ?? current.currency,
                    fxToBase: asset?.currency === "USD" ? "1" : "",
                  }));
                }} required>
                  {!data.assets.length ? <option value="">请先导入资产</option> : null}
                  {data.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol} · {asset.name}</option>)}
                </select>
              </Field> : null}
              </div>
              <div className="step-actions"><button className="primary-button" type="button" disabled={!stepOneReady} onClick={() => setStep(2)}>下一步：填写成交</button></div>
            </div>

            <div className={`transaction-step-panel ${step === 2 ? "active" : ""}`}>
              <div className="step-heading"><span>STEP 2</span><strong>填写成交</strong><small>使用券商或基金平台上的实际数字。</small></div>
              <div className="transaction-primary">
              <Field label="成交日期（以券商为准）">
                <input name="tradedAt" type="date" value={draft.tradedAt} onChange={(event) => setDraft((current) => ({ ...current, tradedAt: event.target.value }))} required />
              </Field>

              {pricedTransaction ? <>
                <Field label={draft.type === "SUBSCRIPTION" || draft.type === "REDEMPTION" ? "份额" : "数量"}>
                  <input name="quantity" type="number" min="0.00000001" step="any" inputMode="decimal" value={draft.quantity} onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))} placeholder="例如 1" required />
                </Field>
                <Field label={draft.type === "SUBSCRIPTION" || draft.type === "REDEMPTION" ? "成交净值" : "成交价"}>
                  <input name="unitPrice" type="number" min="0.00000001" step="any" inputMode="decimal" value={draft.unitPrice} onChange={(event) => setDraft((current) => ({ ...current, unitPrice: event.target.value }))} placeholder="以结单为准" required />
                </Field>
              </> : null}

              {amountTransaction ? <Field label={transactionAmountLabels[draft.type] ?? "金额"}>
                <input name="totalAmount" type="number" min="0.00000001" step="any" inputMode="decimal" value={draft.totalAmount} onChange={(event) => setDraft((current) => ({ ...current, totalAmount: event.target.value }))} placeholder="请输入实际金额" required />
              </Field> : null}

              {draft.type === "SPLIT" ? <Field label="拆股倍数">
                <input name="quantity" type="number" min="0.00000001" step="any" inputMode="decimal" value={draft.quantity} onChange={(event) => setDraft((current) => ({ ...current, quantity: event.target.value }))} placeholder="例如 3 表示 1 拆 3" required />
              </Field> : null}

              <Field label="交易币种">
                {assetTransaction ? <>
                  <input name="currency" type="hidden" value={draft.currency} />
                  <span className="static-control">{currencyLabels[draft.currency]}</span>
                </> : <select name="currency" value={draft.currency} onChange={(event) => {
                  const currency = event.target.value as Currency;
                  setDraft((current) => ({ ...current, currency, fxToBase: currency === "USD" ? "1" : "" }));
                }}>
                  {(Object.keys(currencyLabels) as Currency[]).map((item) => <option key={item} value={item}>{currencyLabels[item]}</option>)}
                </select>}
              </Field>

              {draft.currency !== "USD" ? <Field label={`成交日汇率（1 ${draft.currency} = ? USD）`}>
                <input name="fxToBase" type="number" min="0.00000001" step="any" inputMode="decimal" value={draft.fxToBase} onChange={(event) => setDraft((current) => ({ ...current, fxToBase: event.target.value }))} placeholder="不要用今天汇率代替" required />
                <small className="field-hint">只填结单所用或可核实的成交日汇率</small>
              </Field> : <input name="fxToBase" type="hidden" value="1" />}
              </div>
              <div className="step-actions"><button className="text-button" type="button" onClick={() => setStep(1)}>返回</button><button className="primary-button" type="button" disabled={!stepTwoReady} onClick={() => setStep(3)}>下一步：核对</button></div>
            </div>

            <div className={`transaction-step-panel ${step === 3 ? "active" : ""}`}>
              <div className="step-heading"><span>STEP 3</span><strong>核对并保存</strong><small>保存前再看一眼关键信息。</small></div>
              <div className={`transaction-preview ${duplicate ? "transaction-duplicate" : ""}`} aria-live="polite">
                <span className="preview-eyebrow">{duplicate ? "发现重复" : "将记录"}</span>
                <strong className="preview-title">{transactionPreviewTitle(draft, selectedAsset)}</strong>
                <span className="preview-context">{draft.tradedAt ? formatDate(draft.tradedAt) : "待选择日期"} · {accountById.get(draft.accountId)?.name ?? "待选择账户"}</span>
                <span className="preview-meta">{duplicate
                  ? "这笔成交已在账本中，不会重复写入。"
                  : transactionPreviewMeta(draft, amountPreview)}</span>
              </div>

              <details className="transaction-advanced" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
                <summary><span>费用与更多信息</span><small>手续费、税费、结算与备注</small></summary>
                <div className="transaction-advanced-grid">
                  {costTransaction ? <>
                    <Field label="手续费"><input name="fee" type="number" min="0" step="any" inputMode="decimal" value={draft.fee} onChange={(event) => setDraft((current) => ({ ...current, fee: event.target.value }))} /></Field>
                    <Field label="税费"><input name="tax" type="number" min="0" step="any" inputMode="decimal" value={draft.tax} onChange={(event) => setDraft((current) => ({ ...current, tax: event.target.value }))} /></Field>
                  </> : null}
                  <Field label="结算日期"><input name="settlementDate" type="date" value={draft.settlementDate} onChange={(event) => setDraft((current) => ({ ...current, settlementDate: event.target.value }))} /></Field>
                  <Field label="来源"><input name="source" maxLength={120} value={draft.source} onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))} required /></Field>
                  <Field label="备注" wide><textarea name="note" maxLength={500} value={draft.note} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="选填：订单号、费用说明或其他核对线索" /></Field>
                </div>
              </details>

              <label className="reconcile-toggle" htmlFor="transaction-reconciled">
                <input id="transaction-reconciled" name="reconciled" type="checkbox" checked={draft.reconciled} onChange={(event) => setDraft((current) => ({ ...current, reconciled: event.target.checked }))} />
                <span className="reconcile-copy">已核对原始成交记录<small>数量、成交价和费用都与券商或基金平台记录一致时再勾选</small></span>
              </label>

              <div className="transaction-submit-bar">
                <button className="text-button" type="button" onClick={() => setStep(2)}>返回修改</button>
                <button className="text-button" type="button" onClick={cancelEditing}>{editing ? "取消编辑" : "取消"}</button>
                <button className="primary-button" disabled={saving || Boolean(duplicate)} type="submit">{saving ? "保存中" : editing ? "保存修改" : transactionSubmitLabels[draft.type]}</button>
              </div>
            </div>
          </form>
        )}
      </section> : null}

      <section className="analysis-section">
        <SectionHeading title="正式账本" body={`${data.transactions.length} 笔记录，按成交日期倒序。资金转入不会被计入投资收益。`} />
        <div className="filter-row">
          <input aria-label="搜索账本" placeholder="搜索标的、来源或备注" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select aria-label="筛选交易类型" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="ALL">全部类型</option>{Object.entries(transactionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
        {filtered.length ? (
          <div className="table-shell ledger-table">
            <table>
              <thead><tr><th>成交日期</th><th>类型</th><th>标的</th><th>账户</th><th className="numeric">数量</th><th className="numeric">单价</th><th className="numeric">费用和税</th><th>核对</th><th>操作</th></tr></thead>
              <tbody>{filtered.map((transaction) => {
                const asset = transaction.assetId ? assetById.get(transaction.assetId) : null;
                return <tr key={transaction.id}>
                  <td className="trade-date" data-label="成交日期">{formatTradeDate(transaction.tradedAt)}</td>
                  <td className={`trade-type ${transaction.type.toLowerCase()}`} data-label="类型"><span>{transactionLabels[transaction.type] ?? transaction.type}</span></td>
                  <td className="trade-asset" data-label="标的"><strong>{asset?.symbol ?? "现金"}</strong><small>{transaction.source}</small></td>
                  <td className="trade-account" data-label="账户">{accountById.get(transaction.accountId)?.name ?? "未知账户"}</td>
                  <td className="numeric trade-quantity" data-label="数量">{formatNumber(transaction.quantity)}</td>
                  <td className="numeric trade-price" data-label="单价">{formatLocal(transaction.unitPrice, transaction.currency)}</td>
                  <td className="numeric trade-costs" data-label="费用和税">{formatLocal(transaction.fee + transaction.tax, transaction.currency)}</td>
                  <td className="trade-check" data-label="核对"><span className={transaction.reconciled ? "status-pill checked" : "status-pill pending"}>{transaction.reconciled ? "已核对" : "待核对"}</span></td>
                  <td className="row-actions" data-label="操作"><button onClick={() => editTransaction(transaction)} type="button">编辑</button><button onClick={() => void deleteTransaction(transaction)} type="button">删除</button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : <InlineEmpty text="没有符合当前筛选的交易。" />}
      </section>

      {data.importBatches.length ? (
        <section className="analysis-section">
          <SectionHeading title="导入批次" body="删除批次会同时删除该批次写入的交易，不影响其他来源。" />
          <div className="batch-grid">{data.importBatches.map((batch) => (
            <article key={batch.id}><div><strong>{batch.filename ?? batch.source}</strong><small>{batch.rowCount} 行，{formatDateTime(batch.createdAt)}</small></div><button type="button" onClick={async () => {
              if (!confirmUi("确认删除整个导入批次？")) return;
              const response = await fetch(`/api/imports/${batch.id}`, { method: "DELETE" });
              if (response.ok) { await reload(); setNotice({ tone: "success", text: "导入批次已删除" }); }
              else setNotice({ tone: "error", text: "无法删除导入批次" });
            }}>删除批次</button></article>
          ))}</div>
        </section>
      ) : null}

      <details className="ledger-tools" open={!data.transactions.length}>
        <summary>{data.transactions.length ? "导入、导出与备份" : "从 CSV 建立第一份账本"}</summary>
        <section className="action-ribbon">
          <form onSubmit={importCsv} className="inline-form">
            <label className="file-button">选择 CSV<input name="file" type="file" accept=".csv,text/csv" required /></label>
            <button className="secondary-button" disabled={importing} type="submit">{importing ? "导入中" : "导入账本"}</button>
          </form>
          <a className="secondary-button" href="/alpha-lab-transactions-template.csv" download>下载模板</a>
          <a className="secondary-button" href="/api/export/csv">导出 CSV</a>
          <a className="secondary-button" href="/api/backup">完整 JSON 备份</a>
          <form onSubmit={restoreBackup} className="inline-form">
            <label className="file-button">选择备份<input name="backup" type="file" accept="application/json,.json" required /></label>
            <button className="secondary-button" type="submit">恢复</button>
          </form>
        </section>
      </details>
    </div>
  );
}

function ThesisView({ data, reload, setNotice }: {
  data: LabData;
  reload: () => Promise<LabData>;
  setNotice: (notice: Notice) => void;
}) {
  async function createThesis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = Object.fromEntries(form.entries());
    const response = await fetch("/api/theses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setNotice({ tone: "error", text: result.error ?? "保存失败" }); return; }
    await reload();
    formElement.reset();
    setNotice({ tone: "success", text: "原始投资逻辑已保存，并安排 7、30、90 天复盘" });
  }

  async function appendRevision(event: FormEvent<HTMLFormElement>, thesisId: string) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch(`/api/theses/${thesisId}/revisions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setNotice({ tone: "error", text: result.error ?? "追加失败" }); return; }
    await reload();
    formElement.reset();
    setNotice({ tone: "success", text: "新 revision 已追加，旧判断未被覆盖" });
  }

  return (
    <div className="view-stack">
      <section className="editor-panel">
        <SectionHeading title="记录原始判断" body="先写下当时真正相信的理由。系统保存 revision，不会用后见之明覆盖旧版本。" />
        {data.assets.length ? (
          <form className="record-form thesis-form" onSubmit={createThesis}>
            <Field label="标的"><select name="assetId" required>{data.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.symbol}，{asset.name}</option>)}</select></Field>
            <Field label="决策类型"><select name="decisionType"><option value="INVESTMENT">投资</option><option value="TRADE">交易</option><option value="TASK">任务性交易</option><option value="WATCH">观察</option></select></Field>
            <Field label="建立日期"><input name="openedAt" type="date" defaultValue={todayDate()} required /></Field>
            <Field label="预期持有期限"><input name="horizon" placeholder="例如 3 到 5 年" required /></Field>
            <Field label="最大可接受亏损"><input name="maxLoss" type="number" min="0" step="any" placeholder="以小数或金额记录" /></Field>
            <Field label="计划仓位"><input name="plannedWeight" type="number" min="0" step="any" placeholder="例如 0.08" /></Field>
            <Field label="信心等级"><select name="confidence" defaultValue="3">{[1, 2, 3, 4, 5].map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field label="当前状态"><select name="status" defaultValue="UNCHANGED"><option value="STRENGTHENED">Strengthened</option><option value="UNCHANGED">Unchanged</option><option value="WEAKENED">Weakened</option><option value="INVALIDATED">Invalidated</option><option value="CLOSED">Closed</option></select></Field>
            <Field label="买入或观察理由" wide><textarea name="buyReason" required /></Field>
            <Field label="市场可能低估的因素" wide><textarea name="mispricing" /></Field>
            <Field label="关键催化剂" wide><textarea name="catalysts" /></Field>
            <Field label="主要风险" wide><textarea name="risks" required /></Field>
            <Field label="Thesis 失效条件" wide><textarea name="invalidation" required /></Field>
            <Field label="信息来源" wide><textarea name="sources" /></Field>
            <div className="form-actions"><button className="primary-button" type="submit">保存原始判断</button></div>
          </form>
        ) : <InlineEmpty text="先导入至少一个真实资产，才能建立投资逻辑。" />}
      </section>

      <section className="analysis-section">
        <SectionHeading title="Thesis 档案" body={`${data.theses.length} 条逻辑记录。短期涨跌不会自动决定 thesis 对错。`} />
        {data.theses.length ? <div className="thesis-list">{data.theses.map((thesis) => (
          <article className="thesis-record" key={thesis.id}>
            <header><div><strong>{thesis.symbol}</strong><span>{thesis.status}</span></div><small>{formatDate(thesis.openedAt)}，信心 {thesis.confidence}/5，期限 {thesis.horizon}</small></header>
            <dl><div><dt>原始理由</dt><dd>{thesis.revision.buyReason}</dd></div><div><dt>主要风险</dt><dd>{thesis.revision.risks}</dd></div><div><dt>失效条件</dt><dd>{thesis.revision.invalidation}</dd></div></dl>
            <details><summary>查看 {thesis.revisions.length} 个 revision</summary><ol>{thesis.revisions.map((revision) => <li key={`${revision.revisedAt}-${revision.buyReason}`}><time>{formatDateTime(revision.revisedAt)}</time><p>{revision.buyReason}</p>{revision.note ? <small>{revision.note}</small> : null}</li>)}</ol></details>
            <details><summary>追加 revision</summary><form className="revision-form" onSubmit={(event) => appendRevision(event, thesis.id)}>
              <Field label="当前判断" wide><textarea name="buyReason" required /></Field>
              <Field label="主要风险" wide><textarea name="risks" required /></Field>
              <Field label="失效条件" wide><textarea name="invalidation" required /></Field>
              <Field label="状态"><select name="status" defaultValue={thesis.status}><option value="STRENGTHENED">Strengthened</option><option value="UNCHANGED">Unchanged</option><option value="WEAKENED">Weakened</option><option value="INVALIDATED">Invalidated</option><option value="CLOSED">Closed</option></select></Field>
              <Field label="备注" wide><textarea name="note" /></Field>
              <div className="form-actions"><button className="secondary-button" type="submit">追加，不覆盖</button></div>
            </form></details>
          </article>
        ))}</div> : <InlineEmpty text="还没有 thesis。记录第一条时，系统会同时安排复盘日期。" />}
      </section>
    </div>
  );
}

function ScenarioView({ summary, money, displayRate }: {
  summary: ReturnType<typeof calculatePortfolio> | null;
  money: (value: number | null | undefined) => string;
  displayRate: number | null;
}) {
  const [shock, setShock] = useState(emptyShock);
  const result = summary ? runScenario(summary, shock) : null;
  const set = (key: keyof ScenarioShock, value: number) => setShock((current) => ({ ...current, [key]: value }));
  const presets: Array<[string, Partial<ScenarioShock>]> = [
    ["NVDA 财报不及预期", { specific: { NVDA: -0.18 } }],
    ["AI 与半导体回调", { semiconductorPct: -0.2, qqqPct: -0.08 }],
    ["Nasdaq 熊市", { qqqPct: -0.25, semiconductorPct: -0.12 }],
    ["软着陆与降息", { qqqPct: 0.12, semiconductorPct: 0.08 }],
    ["美元走弱", { usdCnyPct: -0.05, usdHkdPct: -0.01, eurUsdPct: 0.06 }],
  ];
  return (
    <div className="view-stack scenario-layout">
      <section className="scenario-controls">
        <SectionHeading title="调整冲击假设" body="所有数字都是用户设定的情景，不是预测，也不会写回正式账本。" />
        <div className="preset-row">{presets.map(([label, values]) => <button key={label} type="button" onClick={() => setShock({ ...emptyShock, ...values })}>{label}</button>)}</div>
        <div className="shock-grid">
          <PercentInput label="QQQ 变化" value={shock.qqqPct} onChange={(value) => set("qqqPct", value)} />
          <PercentInput label="半导体板块" value={shock.semiconductorPct} onChange={(value) => set("semiconductorPct", value)} />
          <PercentInput label="USD/CNY 变化" value={shock.usdCnyPct} onChange={(value) => set("usdCnyPct", value)} />
          <PercentInput label="USD/HKD 变化" value={shock.usdHkdPct} onChange={(value) => set("usdHkdPct", value)} />
          <PercentInput label="EUR/USD 变化" value={shock.eurUsdPct} onChange={(value) => set("eurUsdPct", value)} />
          <Field label="追加资金，USD"><input type="number" value={shock.addedCashUsd} onChange={(event) => set("addedCashUsd", Number(event.target.value))} /></Field>
        </div>
        <button className="text-button" type="button" onClick={() => setShock(emptyShock)}>清空假设</button>
      </section>
      <section className="scenario-result">
        <SectionHeading title="组合影响" body="杠杆 ETF 只使用清楚标注的单日近似，不制造长期路径精度。" />
        {!summary || !result || displayRate == null ? <InlineEmpty text="需要完整持仓、价格和汇率后才能运行情景。" /> : <>
          <div className="scenario-number"><span>情景后组合价值</span><strong>{money(result.afterUsd)}</strong><small className={toneClass(result.changeUsd)}>{money(result.changeUsd)}，{formatPercent(result.changePct)}</small></div>
          <div className="scenario-stats"><div><span>情景前</span><strong>{money(result.beforeUsd)}</strong></div><div><span>恢复所需上涨</span><strong>{formatPercent(result.recoveryPct)}</strong></div></div>
          <div className="contribution-list">{result.contributions.map((item) => <div key={item.symbol}><strong>{item.symbol}</strong><span>{formatPercent(item.shockPct)}</span><span className={toneClass(item.changeUsd)}>{money(item.changeUsd)}</span></div>)}</div>
          <p className="model-warning">{result.warning}</p>
        </>}
      </section>
    </div>
  );
}

function MemoView({ data, summary, money }: {
  data: LabData;
  summary: ReturnType<typeof calculatePortfolio> | null;
  money: (value: number | null | undefined) => string;
}) {
  const changedTheses = data.theses.filter((thesis) =>
    thesis.revisions.some((revision) => Date.now() - new Date(revision.revisedAt).getTime() <= 7 * 86_400_000),
  );
  const issues = [
    ...(summary?.missingAssetIds.length ? [`${summary.missingAssetIds.length} 项持仓缺少价格或汇率`] : []),
    ...(data.updateStatus?.status === "FAILED" || data.updateStatus?.status === "PARTIAL" ? [data.updateStatus.errorSummary ?? "最近更新不完整"] : []),
    ...(data.transactions.some((transaction) => !transaction.reconciled) ? ["账本仍有待核对交易"] : []),
  ];
  const top = summary?.positions[0];
  return (
    <div className="view-stack">
      <div className="memo-toolbar"><button className="primary-button" type="button" onClick={() => window.print()}>打印或保存 PDF</button></div>
      <article className="memo-page">
        <header><div><p>Alpha Lab Beta</p><h2>每周投资备忘</h2></div><time>{formatDate(todayDate())}</time></header>
        <section className="memo-lead"><span>当前组合</span><strong>{money(summary?.totalValueUsd)}</strong><p>{summary ? `累计收益 ${money(summary.cumulativePnlUsd)}，今日收益 ${money(summary.todayPnlUsd)}` : "等待完整价格与账本数据"}</p></section>
        <div className="memo-columns">
          <section><h3>本周组合变化</h3><p>{data.history.length >= 2 ? "可从历史快照核对组合与本金变化。" : "暂无足够的周初和周末快照，不能虚构周度变动。"}</p></section>
          <section><h3>收益来源</h3><p>{summary ? `已实现 ${money(summary.realizedPnlUsd)}，未实现 ${money(summary.unrealizedPnlUsd)}，股息 ${money(summary.dividendIncomeUsd)}，汇率影响 ${money(summary.fxPnlUsd)}。` : "缺少可计算数据。"}</p></section>
          <section><h3>主要持仓</h3><p>{top ? `${top.symbol} 为当前最大持仓，占组合 ${formatPercent(top.weight)}。` : "尚无持仓。"}</p></section>
          <section><h3>Thesis 状态</h3><p>{changedTheses.length ? `最近七天有 ${changedTheses.length} 条 thesis revision。` : "最近七天没有已记录的 thesis 变化。"}</p></section>
          <section><h3>最大风险</h3><p>{top && (top.weight ?? 0) > 0.25 ? `${top.symbol} 集中度超过 25%，需要人工判断是否符合风险预算。` : "当前数据未触发单一持仓超过 25% 的提示。"}</p></section>
          <section><h3>数据与账目</h3>{issues.length ? <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p>No action required</p>}</section>
        </div>
        <footer>这是个人记录与分析，不构成投资建议，也不会鼓励为了互动而交易。</footer>
      </article>
    </div>
  );
}

function DataView({ data, summary, reload, setNotice, refreshData, refreshing }: {
  data: LabData;
  summary: ReturnType<typeof calculatePortfolio> | null;
  reload: () => Promise<LabData>;
  setNotice: (notice: Notice) => void;
  refreshData: () => Promise<void>;
  refreshing: boolean;
}) {
  const funds = data.assets.filter((asset) => asset.assetType === "FUND");
  const pricedHoldings = summary?.positions.filter((position) => position.price != null).length ?? 0;
  const totalHoldings = summary?.positions.length ?? 0;
  const sourceErrors = data.dataSources.filter((source) => source.lastError).length;
  async function saveNav(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const response = await fetch("/api/fund-nav", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    const result = await response.json() as { error?: string; snapshotUpdated?: boolean };
    if (!response.ok) { setNotice({ tone: "error", text: result.error ?? "净值保存失败" }); return; }
    await reload();
    formElement.reset();
    setNotice({ tone: "success", text: result.snapshotUpdated ? "基金 NAV 和组合快照已写入数据库" : "基金 NAV 已写入，组合仍缺少其他价格或汇率" });
  }
  return (
    <div className="view-stack">
      <section className="data-status-hero">
        <div><span>最近成功更新</span><strong>{data.lastSuccessfulUpdateAt ? formatDateTime(data.lastSuccessfulUpdateAt) : "尚未成功执行"}</strong><small>{data.updateStatus ? `最近运行 ${data.updateStatus.status}，${data.updateStatus.successCount} 成功，${data.updateStatus.failureCount} 失败` : "暂无更新记录"}</small></div>
        <button className="primary-button" onClick={refreshData} disabled={refreshing} type="button">{refreshing ? "更新中" : "立即刷新"}</button>
      </section>
      <section className="data-health-grid" aria-label="数据健康概览">
        <div><span>持仓定价</span><strong>{pricedHoldings}/{totalHoldings}</strong><small>有可审计价格的当前持仓</small></div>
        <div><span>待处理问题</span><strong className={sourceErrors ? "negative-number" : "positive-number"}>{sourceErrors}</strong><small>数据源最近错误</small></div>
        <div><span>汇率记录</span><strong>{latestFx(data.fxRates).length}</strong><small>当前可用货币对</small></div>
      </section>
      <details className="analysis-disclosure data-details">
        <summary><span>查看数据来源</span><small>行情、基金净值与汇率的完整状态</small></summary>
        <div className="analysis-disclosure-body source-grid">{data.dataSources.map((source) => (
          <article key={source.id}><header><strong>{source.provider}</strong><span>{source.enabled ? "启用" : "停用"}</span></header><p>{source.label}</p><small>{source.delayDescription}</small><dl><div><dt>最近成功</dt><dd>{source.lastSuccessAt ? formatDateTime(source.lastSuccessAt) : "尚无"}</dd></div><div><dt>最近错误</dt><dd>{source.lastError ?? "无"}</dd></div></dl></article>
        ))}</div>
      </details>
      <section className="editor-panel">
        <SectionHeading title="确认基金 NAV" body="只有人工确认的净值会进入正式数据库。请同时保留基金公布的原始净值日期。" />
        {funds.length ? <form className="nav-form" onSubmit={saveNav}><Field label="基金"><select name="assetId">{funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.symbol}，{fund.name}</option>)}</select></Field><Field label="NAV"><input name="nav" type="number" min="0" step="any" required /></Field><Field label="净值日期"><input name="navDate" type="date" max={todayDate()} required /></Field><button className="primary-button" type="submit">确认并写入</button></form> : <InlineEmpty text="账本中还没有基金资产。导入基金申购记录后可在此维护 NAV。" />}
      </section>
      <section className="analysis-section">
        <SectionHeading title="价格审计" body="页面展示的是每项当前持仓实际采用的价格，而不是请求时间伪装出的今日价格。" />
        {summary?.positions.length ? <div className="table-shell"><table><thead><tr><th>标的</th><th>类型</th><th>价格日期</th><th>报价时间</th><th>数据属性</th><th>延迟</th><th>Provider</th></tr></thead><tbody>{summary.positions.map((position) => <tr key={position.key}><td><strong>{position.symbol}</strong></td><td>{position.assetType}</td><td>{position.priceDate ? formatDate(position.priceDate) : "缺少"}</td><td>{position.priceQuotedAt ? formatDateTime(position.priceQuotedAt) : position.priceFetchedAt ? `获取 ${formatDateTime(position.priceFetchedAt)}` : "缺少"}</td><td>{qualityLabels[position.priceDataQuality ?? ""] ?? "缺少"}</td><td>{position.priceIsDelayed ? "是" : "否或未标记"}</td><td>{position.priceProvider ?? "缺少"}</td></tr>)}</tbody></table></div> : <InlineEmpty text="尚无可审计的持仓价格。" />}
      </section>
      <section className="analysis-section">
        <SectionHeading title="基准收盘" body="QQQ 与 SPY 只保存最近正式收盘，不把下午盘中报价伪装成收盘数据。" />
        {data.benchmarks.length ? <div className="fx-grid">{latestBenchmarks(data.benchmarks).map((item) => <div key={item.symbol}><span>{item.symbol}</span><strong>{formatLocal(item.close, "USD")}</strong><small>{formatDate(item.priceDate)}，{item.provider}</small></div>)}</div> : <InlineEmpty text="尚无基准记录。上午更新成功后会写入 QQQ 与 SPY。" />}
      </section>
      <section className="analysis-section">
        <SectionHeading title="汇率记录" body="Frankfurter 使用 ECB 最近公布的工作日参考汇率，不伪装成盘中外汇报价。" />
        {data.fxRates.length ? <div className="fx-grid">{latestFx(data.fxRates).map((rate) => <div key={`${rate.baseCurrency}-${rate.quoteCurrency}`}><span>{rate.baseCurrency}/{rate.quoteCurrency}</span><strong>{formatNumber(rate.rate, 6)}</strong><small>{formatDate(rate.rateDate)}，{rate.provider}</small></div>)}</div> : <InlineEmpty text="尚无汇率。点击刷新后会先尝试无需 key 的 ECB 数据源。" />}
      </section>
      <section className="schedule-note"><h3>免费调度方案</h3><p>Cloudflare Cron 已配置 Rome 09:15 与 18:15 的冬夏令时候选时间，Worker 只在对应 Rome 时间窗口执行。页面出现真实 CRON 运行记录后，可确认远程自动更新已实际运行。</p></section>
    </div>
  );
}

function AboutView({ language }: { language: Language }) {
  const t = (value: string) => translateText(value, language);
  return (
    <div className="view-stack about-view">
      <section className="about-hero">
        <span className="about-kicker">ALPHA LAB · PUBLIC BETA</span>
        <h2>{t("An investment workspace built for evidence, not excitement.")}</h2>
        <p>{t("Alpha Lab connects the transaction ledger, portfolio math, price provenance and the original investment thesis—so every number can be traced and every decision can be reviewed.")}</p>
        <div className="about-principles">
          <span>{t("Auditable by design")}</span><span>{t("Private by account")}</span><span>{t("No AI stock picks")}</span>
        </div>
      </section>
      <section className="about-grid">
        <article><span>01</span><h3>{t("Ledger-first accounting")}</h3><p>{t("Weighted-average and FIFO cost basis, fees, taxes, cash flows, funds, splits and duplicate-trade protection all begin with the underlying transaction record.")}</p></article>
        <article><span>02</span><h3>{t("Honest market data")}</h3><p>{t("Price date, quote time, provider and delay status remain visible. Missing data stays missing; a request timestamp never masquerades as today’s price.")}</p></article>
        <article><span>03</span><h3>{t("Decision quality")}</h3><p>{t("Versioned investment theses and scenario tests separate the original reasoning from hindsight and keep forecasts out of the official ledger.")}</p></article>
        <article><span>04</span><h3>{t("Production architecture")}</h3><p>{t("React and Vinext run on a Cloudflare Worker with owner-scoped D1 persistence, signed guest sessions and deterministic financial-calculation tests.")}</p></article>
      </section>
      <section className="about-note"><strong>{t("Public Beta boundary")}</strong><p>{t("This demo does not execute trades or provide personalized investment advice. Anonymous visitors receive isolated example data and may reset the workspace at any time.")}</p></section>
    </div>
  );
}

function DataFreshness({ data }: { data: LabData }) {
  const stale = isOlderThan90Minutes(data.lastSuccessfulUpdateAt);
  const failed = data.updateStatus?.status === "FAILED" || data.updateStatus?.status === "PARTIAL";
  return <div className={`freshness ${stale || failed ? "attention" : "current"}`}><strong>{!data.lastSuccessfulUpdateAt ? "未更新" : failed ? "部分更新" : stale ? "数据过期" : "数据已更新"}</strong><small>{data.lastSuccessfulUpdateAt ? formatDateTime(data.lastSuccessfulUpdateAt) : "等待首次真实写入"}</small></div>;
}

function PerformanceCurve({ points, money }: {
  points: LabData["history"];
  money: (value: number | null | undefined) => string;
}) {
  if (points.length < 2) {
    return <div className="portfolio-curve curve-empty"><span>组合轨迹</span><small>每日快照写入后，这里会形成可核对的历史曲线。</small></div>;
  }
  const values = points.map((point) => point.portfolio);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coordinates = points.map((point, index) => ({
    x: points.length === 1 ? 50 : (index / (points.length - 1)) * 100,
    y: 43 - ((point.portfolio - min) / range) * 34,
  }));
  const line = coordinates.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = `${line} L100,48 L0,48 Z`;
  const change = values.at(-1)! - values[0];
  return (
    <div className="portfolio-curve">
      <div className="curve-heading"><div><span>组合轨迹</span><small>{formatDate(points[0].date)} – {formatDate(points.at(-1)!.date)}</small></div><strong className={toneClass(change)}>{money(change)}</strong></div>
      <svg viewBox="0 0 100 50" role="img" aria-label="组合历史价值曲线" preserveAspectRatio="none">
        <path className="curve-area" d={area} />
        <path className="curve-line" d={line} />
      </svg>
    </div>
  );
}

function AllocationList({ title, rows, money }: {
  title: string;
  rows: Array<{ label: string; valueUsd: number; weight: number }>;
  money: (value: number | null | undefined) => string;
}) {
  return <div className="allocation-group"><h3>{title}</h3>{rows.length ? rows.map((row) => <div className="allocation-row" key={row.label}><div><strong>{row.label}</strong><span>{formatPercent(row.weight)}</span></div><div className="allocation-line" style={{ "--allocation": `${Math.min(100, Math.max(0, row.weight * 100))}%` } as React.CSSProperties} /><small>{money(row.valueUsd)}</small></div>) : <InlineEmpty text="无数据" />}</div>;
}

function SectionHeading({ title, body }: { title: string; body: string }) {
  return <header className="section-heading"><h2>{title}</h2><p>{body}</p></header>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={`field ${wide ? "wide" : ""}`}><span>{label}</span>{children}</label>;
}

function PercentInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <Field label={label}><div className="percent-input"><input type="number" step="0.1" value={Number((value * 100).toFixed(2))} onChange={(event) => onChange(Number(event.target.value) / 100)} /><span>%</span></div></Field>;
}

function EmptyState({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return <section className="empty-state"><span className="empty-alpha" aria-hidden="true">α</span><h2>{title}</h2><p>{body}</p><button className="primary-button" type="button" onClick={onAction}>{action}</button></section>;
}

function InlineEmpty({ text }: { text: string }) {
  return <p className="inline-empty">{text}</p>;
}

function viewTitle(view: View) {
  const titles: Record<View, string> = {
    portfolio: "投资组合",
    ledger: "真实交易账本",
    thesis: "投资逻辑",
    scenario: "情景压力测试",
    memo: "每周投资备忘",
    data: "数据状态",
    about: "关于 Alpha Lab",
  };
  return titles[view];
}

async function fetchData() {
  const response = await fetch("/api/data", { cache: "no-store" });
  const body = await response.json() as LabData & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "无法读取数据库");
  return body;
}

function formatMoney(value: number | null | undefined, currency: Currency, rate: number | null) {
  if (value == null || !Number.isFinite(value) || rate == null) return "缺少数据";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    maximumFractionDigits: Math.abs(value * rate) < 1_000 ? 2 : 0,
  }).format(value * rate);
}

function formatLocal(value: number | null | undefined, currency: Currency) {
  if (value == null || !Number.isFinite(value)) return "缺少";
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 4 }).format(value);
}

function formatNumber(value: number | null | undefined, digits = 4) {
  if (value == null || !Number.isFinite(value)) return "缺少";
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "缺少数据";
  return new Intl.NumberFormat("zh-CN", { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(value);
}

function formatDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric", timeZone: "Europe/Rome" }).format(date);
}

function formatTradeDate(value: string) {
  const tradeDate = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
  return tradeDate ? formatDate(tradeDate) : value;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome", timeZoneName: "short" }).format(date);
}

function toneClass(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value === 0) return "neutral-number";
  return value > 0 ? "positive-number" : "negative-number";
}

function isOlderThan90Minutes(value: string | null) {
  if (!value) return true;
  const time = new Date(value).getTime();
  return !Number.isFinite(time) || Date.now() - time > 90 * 60_000;
}

function todayDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function confirmUi(message: string) {
  const language = window.localStorage.getItem("alpha-language") === "zh" ? "zh" : "en";
  return window.confirm(translateText(message, language));
}

function createTransactionDraft(data: LabData, editing?: LedgerTransaction | null): TransactionDraft {
  const accountId = editing?.accountId ?? data.accounts[0]?.id ?? "";
  const recentAssetId = data.transactions.find((transaction) =>
    transaction.accountId === accountId && transaction.assetId
  )?.assetId;
  const asset = editing?.assetId
    ? data.assets.find((item) => item.id === editing.assetId)
    : data.assets.find((item) => item.id === recentAssetId)
      ?? data.assets.find((item) => item.assetType !== "CASH")
      ?? data.assets[0];
  const currency = editing?.currency
    ?? asset?.currency
    ?? data.accounts.find((account) => account.id === accountId)?.baseCurrency
    ?? "USD";

  return {
    accountId,
    assetId: editing?.assetId ?? asset?.id ?? "",
    type: editing?.type ?? "BUY",
    tradedAt: editing?.tradedAt.slice(0, 10) ?? todayDate(),
    settlementDate: editing?.settlementDate ?? "",
    quantity: editing ? String(editing.quantity) : "",
    unitPrice: editing?.unitPrice == null ? "" : String(editing.unitPrice),
    currency,
    fee: String(editing?.fee ?? 0),
    tax: String(editing?.tax ?? 0),
    fxToBase: editing?.fxToBase == null ? (currency === "USD" ? "1" : "") : String(editing.fxToBase),
    totalAmount: editing?.totalAmount == null ? "" : String(editing.totalAmount),
    source: editing?.source ?? "手工录入",
    note: editing?.note ?? "",
    reconciled: editing?.reconciled ?? false,
  };
}

function draftNumber(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function transactionPreviewTitle(draft: TransactionDraft, asset: Asset | null) {
  const label = transactionLabels[draft.type] ?? draft.type;
  const quantity = draftNumber(draft.quantity);
  if (pricedTransactionTypes.has(draft.type)) {
    if (!asset || quantity == null || draftNumber(draft.unitPrice) == null) return "填写数量和成交价后显示确认内容";
    return `${label} ${asset.symbol} ${formatNumber(quantity)} ${asset.assetType === "FUND" ? "份" : "股"}`;
  }
  if (draft.type === "SPLIT") {
    if (!asset || quantity == null) return "填写拆股倍数后显示确认内容";
    return `${asset.symbol} 持仓数量 × ${formatNumber(quantity)}`;
  }
  const amount = draftNumber(draft.totalAmount);
  if (amount == null) return "填写金额后显示确认内容";
  return `${label}${asset ? ` ${asset.symbol}` : ""} ${formatLocal(amount, draft.currency)}`;
}

function transactionPreviewMeta(
  draft: TransactionDraft,
  preview: { gross: number; cashChange: number } | null,
) {
  if (draft.type === "SPLIT") return "拆股只改变数量与每股成本，不改变持仓总成本";
  if (!preview) return pricedTransactionTypes.has(draft.type)
    ? "先填成交数量与成交价"
    : "先填结单中的实际金额";
  const cash = formatLocal(Math.abs(preview.cashChange), draft.currency);
  if (draft.type === "BUY" || draft.type === "SUBSCRIPTION") {
    return `成交价 ${formatLocal(draftNumber(draft.unitPrice), draft.currency)} · 预计成本 ${cash}`;
  }
  if (draft.type === "SELL" || draft.type === "REDEMPTION") {
    return `成交价 ${formatLocal(draftNumber(draft.unitPrice), draft.currency)} · 预计回笼 ${cash}`;
  }
  if (draft.type === "DIVIDEND" || draft.type === "CASH_IN") return `预计账户增加 ${cash}`;
  return `预计账户减少 ${cash}`;
}

function numberField(form: FormData, key: string, fallback: number | null) {
  const value = String(form.get(key) ?? "");
  if (!value) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function latestFx(rates: LabData["fxRates"]) {
  const latest = new Map<string, LabData["fxRates"][number]>();
  for (const rate of rates) {
    const key = `${rate.baseCurrency}:${rate.quoteCurrency}`;
    const current = latest.get(key);
    if (!current || rate.rateDate > current.rateDate) latest.set(key, rate);
  }
  return [...latest.values()];
}

function latestBenchmarks(items: LabData["benchmarks"]) {
  const latest = new Map<string, LabData["benchmarks"][number]>();
  for (const item of items) {
    const current = latest.get(item.symbol);
    if (!current || item.priceDate > current.priceDate) latest.set(item.symbol, item);
  }
  return [...latest.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
