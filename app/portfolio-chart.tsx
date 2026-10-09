"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {CHART_HEIGHT,CHART_WIDTH,chartGeometry,chartInterval,chartWindow,installChartInspection,type ChartMetric} from "../lib/chart";
import {portfolioDayChange} from "../lib/portfolio";
import {feeStatus,feeStatusLabels} from "../lib/fee-status";
import {translateText,type Language} from "../lib/i18n";
import type {Asset,LedgerTransaction,PortfolioHistoryPoint} from "../lib/types";

type Props={points:PortfolioHistoryPoint[];money:(value:number|null|undefined)=>string;transactions?:LedgerTransaction[];assets?:Asset[];language:Language;currency:string};
const tradeTypes=new Set(["BUY","SELL","SUBSCRIPTION","REDEMPTION","DIVIDEND","DIVIDEND_TAX","FEE","SPLIT"]);
const actionNames:Record<string,[string,string]>={BUY:["买入","Buy"],SELL:["卖出","Sell"],SUBSCRIPTION:["申购","Subscribe"],REDEMPTION:["赎回","Redeem"],DIVIDEND:["股息","Dividend"],DIVIDEND_TAX:["股息税","Dividend tax"],FEE:["费用","Fee"],SPLIT:["拆股","Split"]};

export function PortfolioChart({points:history,money,transactions=[],assets=[],language,currency}:Props) {
  const en=language === "en", text=(zh:string,english:string)=>en?english:zh;
  const [activeDate,setActiveDate]=useState<string|null>(null),[period,setPeriod]=useState(30),[metric,setMetric]=useState<ChartMetric>("value"),[scrubbing,setScrubbing]=useState(false);
  const svgRef=useRef<SVGSVGElement>(null),plotRef=useRef<HTMLDivElement>(null);
  const ordered=useMemo(()=>chartWindow(history,0),[history]);
  const points=useMemo(()=>chartWindow(ordered,period),[ordered,period]);
  const geometry=useMemo(()=>chartGeometry(points,metric),[points,metric]);
  const interval=useMemo(()=>chartInterval(points),[points]);
  const indexByDate=useMemo(()=>new Map(ordered.map((point,index)=>[point.date,index])),[ordered]);
  const tradesByDate=useMemo(()=>{
    const map=new Map<string,LedgerTransaction[]>();
    for(const trade of transactions) if(tradeTypes.has(trade.type)) { const date=trade.tradedAt.slice(0,10); map.set(date,[...(map.get(date)??[]),trade]); }
    return map;
  },[transactions]);
  const assetById=useMemo(()=>new Map(assets.map(asset=>[asset.id,asset])),[assets]);
  const found=activeDate?points.findIndex(point=>point.date === activeDate):-1;
  const index=found<0?points.length-1:found,selected=points[index],active=geometry.coords[index];
  const previousIndex=selected?indexByDate.get(selected.date)??0:0;
  const change=portfolioDayChange(ordered,previousIndex);
  const days=previousIndex?Math.round((Date.parse(selected.date)-Date.parse(ordered[previousIndex-1].date))/86400000):0;
  const trades=selected?tradesByDate.get(selected.date)??[]:[];
  const formatters=useMemo(()=>({date:new Intl.DateTimeFormat(en?"en-GB":"zh-CN",{year:"numeric",month:"short",day:"numeric",timeZone:"UTC"}),short:new Intl.DateTimeFormat(en?"en-GB":"zh-CN",{month:"short",day:"numeric",timeZone:"UTC"}),percent:new Intl.NumberFormat(en?"en-GB":"zh-CN",{style:"percent",maximumFractionDigits:2,signDisplay:"exceptZero"})}),[en]);
  const date=(value:string,short=false)=>(short?formatters.short:formatters.date).format(new Date(value+"T12:00:00Z"));
  const percent=(value:number|null)=>value==null?"—":formatters.percent.format(value);
  const tone=(value:number|null)=>value==null||value===0?"neutral-number":value>0?"positive-number":"negative-number";
  const select=(next:number)=>{ const point=points[Math.max(0,Math.min(points.length-1,next))]; if(point) setActiveDate(point.date); };
  const stepLabel=change.amount==null?text("无可比估值","No comparable valuation"):days===1?text("较上一日 · 扣除资金影响","vs previous day · flow-adjusted"):text(`较 ${days} 天前 · 非单日涨跌`,`vs ${days} days earlier · not a daily return`);
  // Keep static SVG marks out of date-scrubbing reconciliation; only the cursor changes.
  const series=useMemo(()=><g>
    {geometry.ticks.map((tick,i)=><line key={i} className="sparkline-grid" x1="0" x2={CHART_WIDTH} y1={tick.y} y2={tick.y}/>)}
    {metric==="pnl"&&geometry.zeroY!=null?<line className="chart-zero" x1="0" x2={CHART_WIDTH} y1={geometry.zeroY} y2={geometry.zeroY}/>:null}
    <path className="sparkline-line" d={geometry.path}/>
    {points.map((point,i)=><g key={point.date}>{tradesByDate.has(point.date)?<circle className="chart-trade-marker" cx={geometry.coords[i].x} cy={CHART_HEIGHT-2} r="3.5"/>:null}{geometry.coords[i].y!=null&&geometry.low&&geometry.high&&(geometry.low.index===geometry.high.index||tradesByDate.has(point.date))?<circle className="chart-observation" cx={geometry.coords[i].x} cy={geometry.coords[i].y!} r={geometry.low.index===geometry.high.index?4:2.5}/>:null}</g>)}
  </g>,[geometry,metric,points,tradesByDate]);

  useEffect(()=>{
    if(!svgRef.current) return;
    return installChartInspection(svgRef.current,geometry.coords,next=>setActiveDate(points[next].date),setScrubbing);
  },[geometry.coords,points]);
  useEffect(()=>{
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation=plotRef.current?.animate([{opacity:.35},{opacity:1}],{duration:220,easing:"ease-out"});
    return ()=>animation?.cancel();
  },[period,metric]);

  return <section className="portfolio-chart" lang={language} aria-label={text("组合历史分析","Portfolio history explorer")}>
    <div className="chart-controls">
      <div className="chart-ranges" role="group" aria-label={text("图表时间范围","Chart time range")}>
        {([[7,"1W"],[30,"1M"],[90,"3M"],[0,"ALL"]] as const).map(([days,label])=><button type="button" key={days} aria-pressed={period===days} onClick={()=>{setPeriod(days);setActiveDate(null);}}>{label}</button>)}
      </div>
      <div className="chart-ranges chart-metrics" role="group" aria-label={text("图表指标","Chart metric")}>
        {([ ["value",text("持仓价值","Holdings")],["pnl",text("累计损益","Total P&L")] ] as const).map(([id,label])=><button type="button" key={id} aria-pressed={metric===id} onClick={()=>setMetric(id)}>{label}</button>)}
      </div>
    </div>
    {!selected||!geometry.low?<div className="sparkline-empty">{text("此范围缺少历史价格，无法重建估值。","Historical prices are missing for this range. Valuation cannot be reconstructed.")}</div>:<>
      <div className="chart-readout">
        <div><span>{date(selected.date)}</span><small>{metric==="value"?text("持仓价值","Holdings value"):text("累计损益","Cumulative P&L")} · {currency}</small></div>
        <div><strong>{money(geometry.values[index])}</strong><span className={tone(change.amount)}>{money(change.amount)} · {percent(change.rate)}</span></div>
      </div>
      <div className="chart-inspection-meta"><span>{selected.portfolio==null?text("历史数据缺口","Historical data gap"):stepLabel}</span><span className="chart-quality">{selected.portfolio==null?text("缺少价格","Missing marks"):selected.status==="CARRIED"?text("沿用历史价格","Carried marks"):text("历史回算","Restated")}</span></div>
      <div className="chart-canvas" ref={plotRef}>
        <div className="chart-scale" aria-hidden="true">{geometry.ticks.map((tick,i)=><span key={i} style={{top:`${tick.y/CHART_HEIGHT*100}%`}}>{money(tick.value)}</span>)}</div>
        <div className="chart-plot" role="slider" tabIndex={0} aria-orientation="horizontal" aria-label={text("选择历史估值日期","Select a historical valuation date")} aria-valuemin={0} aria-valuemax={points.length-1} aria-valuenow={index} aria-valuetext={`${date(selected.date)} · ${money(geometry.values[index])} · ${stepLabel} · ${percent(change.rate)}`}
          onKeyDown={event=>{ const next=({ArrowLeft:index-1,ArrowRight:index+1,Home:0,End:points.length-1} as Record<string,number>)[event.key]; if(next!=null){event.preventDefault();select(next);} }}>
          <svg ref={svgRef} className="portfolio-sparkline" data-scrubbing={scrubbing} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
            {series}
            <g className="chart-cursor" style={{transform:`translateX(${active.x}px)`}}>
              <line className="chart-crosshair" x1="0" x2="0" y1="0" y2={CHART_HEIGHT}/>
              {trades.length?<circle className="chart-trade-marker" cx="0" cy={CHART_HEIGHT-2} r="5"/>:null}
              {active.y!=null?<g className="chart-cursor-point" style={{transform:`translateY(${active.y}px)`}}><circle className="sparkline-halo" r="10"/><circle className="sparkline-point" r="4.5"/></g>:null}
            </g>
          </svg>
        </div>
      </div>
      <div className="chart-axis"><span>{date(points[0].date,true)}</span><span>{points.length>2?date(new Date((Date.parse(points[0].date)+Date.parse(points.at(-1)!.date))/2).toISOString().slice(0,10),true):""}</span><span>{date(points.at(-1)!.date,true)}</span></div>
      <div className="chart-inspection-tools">
        <div className="chart-day-controls"><button type="button" disabled={index===0} onClick={()=>select(index-1)} aria-label={text("上一个估值日","Previous valuation date")}><span aria-hidden="true">‹</span></button><button type="button" disabled={index===points.length-1} onClick={()=>select(index+1)} aria-label={text("下一个估值日","Next valuation date")}><span aria-hidden="true">›</span></button></div>
        <span>{text("横向拖动查看 · 圆点标记账本事件","Drag to inspect · dots mark ledger events")}</span>
        <button type="button" className="chart-latest" disabled={index===points.length-1} onClick={()=>setActiveDate(null)}>{text("最新","Latest")}</button>
      </div>
      <div className="chart-range-summary">
        <div><span>{text("区间损益","Period P&L")}</span><strong className={tone(interval.amount)}>{money(interval.amount)}</strong><small>{text("已扣除资金变化","After investment flows")}</small><small>{text("损益 / 期初持仓","P&L / starting holdings")} {percent(interval.rate)}</small></div>
        <div><span>{text("区间高点","Range high")}</span><strong>{money(geometry.high?.value)}</strong><small>{date(points[geometry.high!.index].date,true)}</small></div>
        <div><span>{text("区间低点","Range low")}</span><strong>{money(geometry.low.value)}</strong><small>{date(points[geometry.low.index].date,true)}</small></div>
      </div>
      {interval.gaps?<p className="chart-coverage">{text(`区间含 ${interval.gaps} 处估值缺口；高低点仅统计有数据的日期。`,`This range contains ${interval.gaps} valuation gaps; highs/lows cover available dates only.`)}</p>:null}
      <details className="chart-day-details" key={selected.date} open={trades.length>0}>
        <summary>{text("当日账本事件","Ledger events on this date")} <b>{trades.length}</b></summary>
        {trades.length?trades.map(trade=><div className="chart-trade-row" key={trade.id}>
          <div><strong>{trade.assetId?assetById.get(trade.assetId)?.symbol??trade.assetId:text("账户费用","Account charge")}</strong><span>{actionNames[trade.type]?.[en?1:0]??trade.type} {trade.quantity?new Intl.NumberFormat(en?"en-GB":"zh-CN",{maximumFractionDigits:6}).format(trade.quantity):""}{trade.unitPrice!=null?` × ${new Intl.NumberFormat(en?"en-GB":"zh-CN",{style:"currency",currency:trade.currency,minimumFractionDigits:2,maximumFractionDigits:4}).format(trade.unitPrice)}`:""}</span></div>
          <small>{text("费用 / 税费","Fee / tax")} {new Intl.NumberFormat(en?"en-GB":"zh-CN",{style:"currency",currency:trade.currency}).format(trade.fee)} / {new Intl.NumberFormat(en?"en-GB":"zh-CN",{style:"currency",currency:trade.currency}).format(trade.tax)} · {translateText(feeStatusLabels[feeStatus(trade)],language)}</small>
        </div>):<p>{text("这一天没有账本事件。","No ledger events on this date.")}</p>}
      </details>
      <details className="chart-method"><summary>{text("价格日期与计算口径","Price dates & methodology")}{interval.gaps?` · ${interval.gaps} ${text("处缺口","gaps")}`:""}</summary>
        <p>{text("按当前账本回算，不含账户现金。累计损益 = 持仓价值 − 净投入；区间损益比较起止估值并扣除资金变化。高低点按所选指标及已有估值日统计，纵轴自动缩放。","Restated from the current ledger; account cash excluded. Cumulative P&L = holdings value − net investment; period P&L compares the endpoints after investment flows. Highs/lows use the selected metric and recorded dates. The value axis is auto-scaled.")}</p>
        <p>{text("每日百分比以此前持仓市值为分母，非精确时间加权回报。日期不连续时显示整个间隔，不伪装成单日涨跌。价格缺口不补点、不连线。切换显示货币使用当前汇率，不是历史汇率收益曲线。","Daily percentages use prior holdings value, not an exact time-weighted return. Nonconsecutive dates show interval changes, not daily returns. Missing valuations stay disconnected. Display currency uses the current FX rate, not a historical FX return series.")}</p>
        <p>{date(points[0].date)} – {date(points.at(-1)!.date)} · {points.length} {text("个估值日","valuations")} · {interval.carried} {text("日沿用历史价格","dates with carried marks")}</p>
        {selected.portfolio==null?<p>{text("缺少行情的资产","Assets with missing marks")}: {(selected.missingAssetIds??[]).map(id=>assetById.get(id)?.symbol??id).join(", ")||"—"}</p>:null}
        {Object.entries(selected.priceDates??{}).map(([id,value])=><p key={id}>{assetById.get(id)?.symbol??id} · {value||text("缺少价格","Missing price")}{value&&value!==selected.date?` · ${text("沿用","carried")}`:""}</p>)}
      </details>
      <span className="chart-announcement sr-only" aria-live="polite" aria-atomic="true">{!scrubbing?`${date(selected.date)} · ${money(geometry.values[index])} · ${percent(change.rate)}`:""}</span>
    </>}
  </section>;
}
