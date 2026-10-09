import { calculatePortfolio } from "./portfolio";
import { visibleNote, feeStatus } from "./fee-status";
import type { CostMethod, LabData } from "./types";

function validDate(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(day + "T12:00:00Z").toISOString().slice(0, 10) !== day) throw new Error("Invalid date");
  return day;
}
export function previousDay(day: string) {
  const date = new Date(validDate(day) + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
export function summaryAt(data: LabData, day: string, costMethod: CostMethod = "WEIGHTED_AVERAGE") {
  validDate(day);
  return calculatePortfolio({ ...data, costMethod,
    transactions: data.transactions.filter((t) => t.tradedAt.slice(0, 10) <= day),
    prices: data.prices.filter((p) => p.priceDate <= day),
    fxRates: data.fxRates.filter((p) => p.rateDate <= day),
  });
}

/** Period P&L = change in cumulative ledger P&L, including sales/dividends/fees.
 * Boundary valuations only use stored marks on or before that date. No backfill or prediction.
 */
export function periodInsights(data: LabData, start: string, end: string, costMethod: CostMethod = "WEIGHTED_AVERAGE") {
  validDate(start); validDate(end);
  if (start > end) throw new Error("Invalid period");
  const baseline = previousDay(start);
  const before = summaryAt(data, baseline, costMethod);
  const after = summaryAt(data, end, costMethod);
  const assetIds = [...new Set(data.transactions.filter((t) => t.tradedAt.slice(0, 10) <= end && !["CASH_IN", "CASH_OUT"].includes(t.type)).map((t) => t.assetId))];
  // ponytail: small personal ledger, recompute per asset; index if thousands of assets become relevant.
  const rows = assetIds.map((assetId) => {
    const subset = { ...data, transactions: data.transactions.filter((t) => t.assetId === assetId) };
    const a = summaryAt(subset, baseline, costMethod), b = summaryAt(subset, end, costMethod);
    return { assetId, symbol: data.assets.find((a) => a.id === assetId)?.symbol ?? "UNASSIGNED",
      pnl: a.cumulativePnlUsd == null || b.cumulativePnlUsd == null ? null : b.cumulativePnlUsd - a.cumulativePnlUsd,
      beforeMarks: a.positions.map((p) => ({ symbol: p.symbol, date: p.priceDate, provider: p.priceProvider, delayed: p.priceIsDelayed })),
      afterMarks: b.positions.map((p) => ({ symbol: p.symbol, date: p.priceDate, provider: p.priceProvider, delayed: p.priceIsDelayed })),
    };
  }).sort((a,b) => Math.abs(b.pnl ?? 0) - Math.abs(a.pnl ?? 0));
  const trades = data.transactions.filter((t) => t.tradedAt.slice(0, 10) >= start && t.tradedAt.slice(0, 10) <= end && !["CASH_IN", "CASH_OUT"].includes(t.type));
  return { start, end, baseline, before, after, rows, trades,
    pnl: before.cumulativePnlUsd == null || after.cumulativePnlUsd == null ? null : after.cumulativePnlUsd - before.cumulativePnlUsd,
    netInvestment: after.netContributionsUsd - before.netContributionsUsd,
    carried: before.positions.some((p) => p.priceDate !== baseline) || after.positions.some((p) => p.priceDate !== end),
    provisional: trades.filter((t) => feeStatus(t) === "PROVISIONAL").length,
  };
}

/** Isolates the most recent addition using identical current prices/FX on both sides. */
export function additionImpact(data: LabData, asOf: string, costMethod: CostMethod) {
  const ordered = data.transactions.filter((t) => t.tradedAt.slice(0,10) <= asOf).slice().sort((a,b) => a.tradedAt.localeCompare(b.tradedAt) || a.id.localeCompare(b.id));
  const index = ordered.findLastIndex((t) => t.type === "BUY" || t.type === "SUBSCRIPTION");
  if (index < 0) return null;
  const trade = ordered[index];
  const before = summaryAt({ ...data, transactions: ordered.slice(0,index) },asOf,costMethod);
  const after = summaryAt({ ...data, transactions: ordered.slice(0,index+1) },asOf,costMethod);
  const tech = (summary: typeof before) => summary.totalValueUsd == null || summary.totalValueUsd <= 0 ? null : summary.positions
    .filter((p) => ["Technology", "Semiconductors"].includes(p.sector)).reduce((sum,p) => sum + (p.weight ?? 0),0);
  return { trade, before, after, beforeTech: tech(before), afterTech: tech(after),
    unclassified: after.positions.filter((p) => p.sector === "Unclassified").map((p) => p.symbol) };
}

export function weeklyDraft(data: LabData, week: string, today: string, language: "en" | "zh") {
  validDate(week); validDate(today);
  if (new Date(week+"T12:00:00Z").getUTCDay() !== 1 || week > today) throw new Error("Invalid week");
  const sunday = new Date(week+"T12:00:00Z"); sunday.setUTCDate(sunday.getUTCDate()+6);
  const end = [sunday.toISOString().slice(0,10),today].sort()[0];
  const report = periodInsights(data,week,end);
  const en = language === "en";
  const money = (n: number | null) => n == null ? (en ? "unavailable: missing boundary valuation" : "不可计算：缺少边界估值") : new Intl.NumberFormat(en ? "en-US" : "zh-CN",{style:"currency",currency:"USD"}).format(n);
  const pct = (n: number | null) => n == null ? "—" : `${(n*100).toFixed(1)}%`;
  const top = report.after.positions[0];
  const reviews = (data.reviews ?? []).filter((r) => r.dueAt <= end && (!r.completedAt || r.completedAt.slice(0,10) > end));
  const revisions = data.theses.flatMap((t) => t.revisions.filter((r) => r.revisedAt.slice(0,10) >= week && r.revisedAt.slice(0,10) <= end).map((r) => `${t.symbol}: ${r.buyReason}`));
  const text = [
    en ? `Weekly review · ${week} to ${end}` : `每周复盘 · ${week} 至 ${end}`,
    en ? "Local ledger template, not generative AI. Amounts in USD; edit before saving." : "本地账本模板，非生成式 AI。金额为 USD；编辑确认后再保存。",
    "", en ? "1. What changed" : "1. 本周变化",
    `${en ? "Period P&L" : "区间损益"}: ${money(report.pnl)}`,
    `${en ? "Net investment change (not account deposits)" : "净投入变化（非账户入金）"}: ${money(report.netInvestment)}`,
    `${en ? "Boundary comparison" : "边界比较"}: ${report.baseline} → ${end}`,
    ...report.rows.map((r) => `${r.symbol}: ${money(r.pnl)}`),
    "", en ? "2. Risk and data" : "2. 风险与数据",
    top ? `${top.symbol}: ${en ? "largest holding" : "最大持仓"} ${pct(top.weight)}` : (en ? "No valued holdings." : "没有可估值持仓。"),
    report.carried ? (en ? "Carried marks are used; this is not an exact close-to-close result." : "使用了沿用价格，非精确收盘到收盘收益。") : (en ? "See boundary marks in the portfolio assistant." : "边界价格可在组合助手查看。"),
    `${en ? "Provisional trade charges" : "成交费用暂记"}: ${report.provisional}; ${en ? "pending execution checks" : "成交待核对"}: ${report.trades.filter((t)=>!t.reconciled).length}`,
    ...report.rows.flatMap((r) => r.afterMarks.map((p) => `${p.symbol}: ${p.date ?? "—"} · ${p.provider ?? "—"}${p.delayed ? (en ? " · delayed" : " · 延迟") : ""}`)),
    "", en ? "3. Recorded reasoning" : "3. 已记录判断",
    ...revisions,
    ...report.trades.filter((t)=>visibleNote(t.note)).map((t)=>`${t.tradedAt.slice(0,10)} · ${data.assets.find((a)=>a.id===t.assetId)?.symbol ?? t.type}: ${visibleNote(t.note)}`),
    ...(!revisions.length ? [en ? "No thesis revision recorded this week." : "本周没有投资逻辑修订记录。"] : []),
    `${en ? "Reviews due by period end" : "截至期末待复盘"}: ${reviews.length}`,
    "", en ? "4. My judgment / next evidence to check\n[Write your own view here. No news or explanations have been invented.]" : "4. 我的判断 / 下周要验证的证据\n[在这里填写。系统没有编造新闻或涨跌原因。]",
  ].join("\n");
  return text.length <= 12000 ? text : text.slice(0,11800) + (en ? "\n[Draft shortened. Inspect full evidence in the portfolio assistant.]" : "\n[草稿已精简，完整依据请查看组合助手。]");
}
