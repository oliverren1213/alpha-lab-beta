import assert from "node:assert/strict";
import test,{after} from "node:test";
import {createServer} from "vite";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
const vite=await createServer({configFile:false,appType:"custom",logLevel:"silent",server:{middlewareMode:true}});
after(()=>vite.close());
const {chartWindow,chartGeometry,chartInterval,nearestChartPoint,installChartInspection,CHART_HEIGHT}=await vite.ssrLoadModule("/lib/chart.ts");
const {PortfolioChart}=await vite.ssrLoadModule("/app/portfolio-chart.tsx");
const point=(date,portfolio,contributions=100,status="RESTATED")=>({date,portfolio,contributions,status,qqq:null,spy:null});
const history=[point("2026-09-27",100),point("2026-09-28",220,200),point("2026-09-29",null,200,"GAP"),point("2026-10-01",230,200,"CARRIED")];
const money=value=>value==null?"—":`$${value.toFixed(2)}`;

test("chart windows sort copies, anchor to latest recorded date and retain missing valuations",()=>{
  const source=[...history].reverse();
  assert.deepEqual(chartWindow(source,0),history); assert.equal(source[0].date,"2026-10-01");
  assert.deepEqual(chartWindow(source,3).map(p=>p.date),["2026-09-29","2026-10-01"]);
  assert.deepEqual(chartWindow([],30),[]);
});

test("geometry has real calendar spacing, disconnected gaps and a visible zero in P&L",()=>{
  const values=chartGeometry(history,"value"),pnl=chartGeometry(history,"pnl");
  assert.equal(values.values[2],null);assert.equal((values.path.match(/M/g)||[]).length,2);
  assert.equal(pnl.values[1],20);assert.equal(pnl.values[3],30);
  assert.ok(pnl.zeroY>0&&pnl.zeroY<CHART_HEIGHT);
  assert.ok(Math.abs((values.coords[3].x-values.coords[2].x)/(values.coords[1].x-values.coords[0].x)-2)<1e-8);
  const solo=chartGeometry([point("2026-10-01",800)],"value");
  assert.equal(solo.coords[0].x,320);assert.equal(solo.coords[0].y,110);
  assert.equal(chartGeometry([point("2026-10-01",null)],"value").low,null);
});

test("interval P&L deducts new investment, keeps endpoint gaps unknown and records coverage",()=>{
  const result=chartInterval(history);
  assert.equal(result.amount,30);assert.equal(result.flow,100);assert.equal(result.rate,.3);
  assert.equal(result.gaps,1);assert.equal(result.carried,1);
  assert.equal(chartInterval(history.slice(1,3)).amount,null);
  assert.equal(chartInterval([history[0]]).amount,null);
  assert.equal(chartInterval([point("2026-09-27",0,0),point("2026-09-28",10,0)]).rate,null);
  assert.equal(nearestChartPoint([{x:10},{x:20},{x:40}],15),0);
  assert.equal(nearestChartPoint([{x:10},{x:20},{x:40}],31),2);
  assert.equal(nearestChartPoint([],10),-1);
});

test("chart renders bilingual labels, true trade prices and charges without nested slider controls",()=>{
  const trade={id:"fixture",assetId:"NVDA",type:"BUY",tradedAt:"2026-10-01",quantity:1,unitPrice:224,currency:"USD",fee:0,tax:0,note:"[alpha-fees:PROVISIONAL]"};
  const html=renderToStaticMarkup(React.createElement(PortfolioChart,{points:history,money,language:"en",currency:"USD",transactions:[trade],assets:[]}));
  assert.match(html,/Period P&amp;L/);assert.match(html,/USD/);assert.match(html,/\$224\.00/);assert.match(html,/Awaiting statement/);
  assert.match(html,/valuation gaps/);assert.match(html,/No comparable valuation/);
  const interval=renderToStaticMarkup(React.createElement(PortfolioChart,{points:[history[0],history[3]],money,language:"en",currency:"USD"}));assert.match(interval,/vs 4 days earlier · not a daily return/);
  assert.match(html,/role="slider"/);assert.match(html,/aria-valuemax="3"/);assert.match(html,/Previous valuation date/);
  const slider=html.match(/<div class="chart-plot"[\s\S]*?<\/div>/)[0];assert.doesNotMatch(slider,/<button/);
  const empty=renderToStaticMarkup(React.createElement(PortfolioChart,{points:[],money,language:"zh",currency:"USD"}));assert.match(empty,/缺少历史价格/);
});

test("pointer inspection coalesces frames and cached bounds, preserves vertical touch, releases and cleans up",()=>{
  const saved={window:globalThis.window,raf:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame};
  const frames=new Map(),listeners=new Map(),windowListeners=new Map(),captures=new Set(); let sequence=0,reads=0;
  globalThis.requestAnimationFrame=fn=>{frames.set(++sequence,fn);return sequence;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  globalThis.window={addEventListener:(type,fn)=>windowListeners.set(type,fn),removeEventListener:type=>windowListeners.delete(type)};
  const svg={getBoundingClientRect:()=>{reads++;return {left:0,width:640};},addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type),setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)};
  const selected=[],engaged=[],event=(x,y=50,type="mouse",extras={})=>({clientX:x,clientY:y,pointerType:type,isPrimary:true,button:0,pointerId:1,...extras});
  const paint=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());};
  let cleanup;
  try {
    cleanup=installChartInspection(svg,[{x:12},{x:320},{x:628}],index=>selected.push(index),value=>engaged.push(value));
    listeners.get("pointerenter")(event(10));for(let x=20;x<500;x++)listeners.get("pointermove")(event(x));
    assert.equal(reads,1);assert.equal(frames.size,1);paint();assert.deepEqual(selected,[2]);
    listeners.get("pointerleave")();listeners.get("pointerdown")(event(300,50,"touch"));
    listeners.get("pointermove")(event(301,70,"touch"));assert.equal(captures.size,0);assert.equal(frames.size,0);
    listeners.get("pointerdown")(event(100,50,"touch"));listeners.get("pointermove")(event(350,52,"touch"));
    assert.equal(captures.size,1);assert.equal(frames.size,1);paint();assert.equal(selected.at(-1),1);
    listeners.get("pointerup")(event(628,52,"touch"));assert.equal(selected.at(-1),2);assert.equal(captures.size,0);
    listeners.get("pointerdown")(event(100,50,"touch"));listeners.get("pointermove")(event(300,50,"touch"));
    listeners.get("pointerdown")(event(310,50,"touch",{isPrimary:false,pointerId:2}));assert.equal(captures.size,0);assert.equal(frames.size,0);
    windowListeners.get("scroll")();listeners.get("pointermove")(event(100));assert.ok(reads>=4);
    cleanup();assert.equal(listeners.size,0);assert.equal(windowListeners.size,0);assert.equal(frames.size,0);assert.equal(engaged.at(-1),false);
  } finally {cleanup?.();globalThis.window=saved.window;globalThis.requestAnimationFrame=saved.raf;globalThis.cancelAnimationFrame=saved.cancel;}
});
