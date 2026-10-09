"use client";

import { useMemo, useState } from "react";
import { additionImpact, periodInsights, summaryAt } from "../lib/insights";
import { runScenario } from "../lib/portfolio";
import { dateInRome } from "../lib/schedule";
import type { CostMethod, LabData } from "../lib/types";

export function PortfolioAssistant({ data, language, costMethod, money }: { data: LabData; language: "en" | "zh"; costMethod: CostMethod; money: (n: number | null | undefined) => string }) {
  const en = language === "en", today = dateInRome();
  const t = (zh: string, english: string) => en ? english : zh;
  const [question, setQuestion] = useState("returns");
  const [start, setStart] = useState(today.slice(0,7)+"-01");
  const [end, setEnd] = useState(today);
  const [symbol, setSymbol] = useState(data.assets.find(a=>a.symbol==="NVDA")?.symbol ?? data.assets[0]?.symbol ?? "");
  const [shock, setShock] = useState(-10);
  const computed = useMemo(() => {
    try {
      return { current: summaryAt(data,today,costMethod), addition: additionImpact(data,today,costMethod) };
    } catch { return { current: null, addition: null }; }
  },[data,costMethod,today]);
  const report = useMemo(() => {
    try { return end > today ? null : periodInsights(data,start,end,costMethod); }
    catch { return null; }
  },[data,start,end,costMethod,today]);
  const { current, addition } = computed;
  const pct = (n: number | null | undefined) => n == null ? "—" : `${(n*100).toFixed(2)}%`;
  const result = current && Number.isFinite(shock) && shock >= -100 && shock <= 500 ? runScenario(current,{qqqPct:0,semiconductorPct:0,usdCnyPct:0,usdHkdPct:0,eurUsdPct:0,addedCashUsd:0,specific:{[symbol]:shock/100}}) : null;
  const thesis = data.theses.filter(t=>t.symbol===symbol).sort((a,b)=>b.openedAt.localeCompare(a.openedAt))[0];
  const original = thesis && [...thesis.revisions, thesis.revision].sort((a,b)=>a.revisedAt.localeCompare(b.revisedAt))[0];
  return <section className="portfolio-assistant analysis-section" data-no-translate>
    <header className="assistant-heading"><div><span className="workspace-kicker">PORTFOLIO / EXPLAINED</span><h2>{t("看懂我的账本","Understand my portfolio")}</h2><p>{t("收益、仓位与投资理由，用真实记录和可追溯的计算说明。","Returns, exposure and investment reasons, backed by your records and traceable calculations.")}</p></div><span className="assistant-seal" aria-hidden="true">α</span></header>
    <div className="assistant-questions" aria-label={t("选择问题","Choose a question")}>
      {[["returns",t("哪只资产贡献了收益？","What drove my returns?")],["addition",t("加仓改变了多少集中度？","How did my addition change exposure?")],["shock",t("如果一只股票下跌？","What if a stock falls?")],["thesis",t("当初为什么买？","Why did I buy?")]].map(([id,label],i)=><button type="button" key={id} aria-pressed={question===id} onClick={()=>setQuestion(id)}><small>0{i+1}</small><span>{label}</span></button>)}
    </div>
    <div className="assistant-answer" key={question} aria-live="polite">
      {question==="returns" ? <>
        <div className="assistant-filters"><label>{t("开始","From")}<input type="date" value={start} max={end} onChange={e=>setStart(e.target.value)} /></label><label>{t("结束","To")}<input type="date" value={end} min={start} max={today} onChange={e=>setEnd(e.target.value)} /></label></div>
        {!report ? <p role="alert">{t("请选择有效日期，不能晚于今天。","Choose valid dates no later than today.")}</p> : <>
          <div className="assistant-number"><span>{t("区间损益","Period P&L")}</span><strong>{money(report.pnl)}</strong><small>{report.baseline} → {report.end}</small></div>
          <div className="insight-contributions">{report.rows.map(r=><div key={r.assetId??"unassigned"}><strong>{r.symbol==="UNASSIGNED"?t("未分配费用 / 税","Unassigned fees / taxes"):r.symbol}</strong><span className={r.pnl==null?"":r.pnl>=0?"positive":"negative"}>{money(r.pnl)}</span></div>)}</div>
          <p>{t("计算：期末累计损益 − 期初累计损益，包含卖出、股息与已记费用；按所选成本口径。缺少边界价格或汇率时留空。","Calculation: ending cumulative P&L minus beginning cumulative P&L, including sales, dividends and recorded fees, using the selected cost method. Missing boundary prices or FX stay unavailable.")}</p>
          {report.carried ? <p className="insight-caution">{t("部分边界沿用最近有效价格，不能当成精确收盘收益。","Some boundary marks are carried forward; this is not an exact close-to-close return.")}</p> : null}
          <details className="insight-evidence"><summary>{t("查看价格、交易与计算依据","Inspect marks, trades and calculation")}</summary>
            <p>{t("期初 / 期末市值","Opening / closing value")}: {money(report.before.totalValueUsd)} / {money(report.after.totalValueUsd)} · {t("净投入变化","Net investment change")}: {money(report.netInvestment)}</p>
            <p>{t("费用暂记的成交","Trades with provisional charges")}: {report.provisional}</p>
            {report.rows.map(r=><div key={r.assetId??"unassigned"}><strong>{r.symbol}</strong>{[[t("期初","Opening"),r.beforeMarks],[t("期末","Closing"),r.afterMarks]].map(([label,marks])=><p key={String(label)}>{String(label)}: {(marks as typeof r.beforeMarks).map(p=>`${p.date??"—"} · ${p.provider??"—"}${p.delayed?t(" · 延迟"," · delayed"):""}`).join("; ")||t("没有期末持仓","No open position")}</p>)}</div>)}
            {report.trades.map(tx=><p key={tx.id}>{tx.tradedAt.slice(0,10)} · {data.assets.find(a=>a.id===tx.assetId)?.symbol??tx.type} · {tx.type} · {tx.quantity} × {tx.unitPrice??"—"} {tx.currency} · {tx.source} · #{tx.id}</p>)}
            <p>{t("非 USD 估值使用不晚于边界日期的最近有效汇率；历史账本更正会重算结果。","Non-USD valuations use the latest valid FX on or before each boundary. Historical ledger corrections restate the result.")}</p>
          </details>
        </>}
      </> : null}
      {question==="addition" ? addition ? <>
        <h3>{t("最近一笔加仓的影响","Your latest addition")}</h3><p>{addition.trade.tradedAt.slice(0,10)} · {data.assets.find(a=>a.id===addition.trade.assetId)?.symbol} · {addition.trade.quantity} × {addition.trade.unitPrice} {addition.trade.currency}</p>
        <div className="assistant-number"><span>{t("科技 + 半导体占比","Technology + semiconductors")}</span><strong>{pct(addition.beforeTech)} → {pct(addition.afterTech)}</strong></div>
        <p>{t("加仓前后使用相同的最新价格和汇率，只隔离这一笔交易的仓位影响；不代表当日历史权重。此笔之后的交易不纳入比较。","Both sides use identical latest prices and FX to isolate this trade. These are not historical weights on the trade date. Subsequent trades are excluded.")}</p>
        {addition.unclassified.length ? <p className="insight-caution">{t("以下未分类资产未计入科技占比","Unclassified assets excluded from the technology numerator")}: {addition.unclassified.join(", ")}</p> : null}
        <details className="insight-evidence"><summary>{t("计算依据","Calculation evidence")}</summary><p>#{addition.trade.id} · {addition.trade.source}</p>{addition.after.positions.map(p=><p key={p.key}>{p.symbol} · {p.sector} · {p.priceDate??"—"} · {p.priceProvider??"—"} · {money(p.marketValueUsd)}</p>)}</details>
      </> : <p>{t("还没有可比较的买入记录。","No purchase is available to compare.")}</p> : null}
      {question==="shock" || question==="thesis" ? <div className="assistant-filters"><label>{t("标的","Asset")}<select value={symbol} onChange={e=>setSymbol(e.target.value)}>{data.assets.map(a=><option key={a.id} value={a.symbol}>{a.symbol}</option>)}</select></label>{question==="shock" ? <label>{t("价格变动 %","Price change %")}<input type="number" min={-100} max={500} step="any" value={Number.isFinite(shock)?shock:""} onChange={e=>setShock(e.target.value===""?NaN:Number(e.target.value))} /></label> : null}</div> : null}
      {question==="shock" ? <><div className="assistant-number"><span>{t("组合损益影响","Portfolio impact")}</span><strong>{money(result?.changeUsd)}</strong><small>{pct(result?.changePct)}</small></div><p>{t("假设其它价格、汇率与数量保持不变。这是所选资产自身的价格变化，不是指数变化，也不是预测。","All other prices, FX and quantities stay constant. This changes the selected asset's own price, not an index, and is not a forecast.")}</p>{current?.positions.filter(p=>p.symbol===symbol).map(p=><p key={p.key}>{p.symbol}: {money(p.marketValueUsd)} × {Number.isFinite(shock)?shock:"—"}% · {p.priceDate??"—"} · {p.priceProvider??"—"}</p>)}{!current?.positions.some(p=>p.symbol===symbol)?<p>{t("当前未持有该资产。","You do not currently hold this asset.")}</p>:null}</> : null}
      {question==="thesis" ? thesis ? <><div className="assistant-thesis"><section><h3>{t("最初记录","Original record")}</h3><small>{original?.revisedAt.slice(0,10)}</small><p>{original?.buyReason}</p></section><section><h3>{t("最新判断","Latest judgment")}</h3><small>{thesis.revision.revisedAt.slice(0,10)}</small><p>{thesis.revision.buyReason}</p><strong>{t("失效条件","Invalidation")}</strong><p>{thesis.revision.invalidation}</p></section></div><p>{t("尚未完成的复盘","Open reviews")}: {(data.reviews??[]).filter(r=>r.thesisId===thesis.id&&!r.completedAt).map(r=>r.dueAt).join(" · ")||t("无","None")}</p><p>{t("以上为你的原始记录；是否被市场证实仍需你在投资逻辑页复盘。","These are your recorded views. Evaluate the evidence in the thesis review workspace.")}</p></> : <p>{t("尚未记录该资产的投资逻辑，可到顶部「逻辑」添加。","No thesis recorded for this asset. Add one in Thesis above.")}</p> : null}
    </div>
  </section>;
}
