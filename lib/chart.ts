import type { PortfolioHistoryPoint } from "./types";

export type ChartMetric = "value" | "pnl";
export const CHART_WIDTH = 640, CHART_HEIGHT = 220, CHART_PADDING = 12;
const day = 86400000;

export function chartWindow(history: PortfolioHistoryPoint[], period: number) {
  const ordered = history.filter(point => Number.isFinite(Date.parse(point.date))).slice().sort((a,b) => a.date.localeCompare(b.date));
  const cutoff = Date.parse(ordered.at(-1)?.date ?? "") - (period - 1) * day;
  return ordered.filter(point => !period || Date.parse(point.date) >= cutoff);
}

export function chartGeometry(points: PortfolioHistoryPoint[], metric: ChartMetric) {
  const values = points.map(point => {
    const value = point.portfolio == null ? null : metric === "pnl" ? point.portfolio - point.contributions : point.portfolio;
    return value != null && Number.isFinite(value) ? value : null;
  });
  const valid = values.flatMap((value,index) => value == null ? [] : [{value,index}]);
  const low = valid.reduce<typeof valid[number] | null>((best,item) => !best || item.value < best.value ? item : best,null);
  const high = valid.reduce<typeof valid[number] | null>((best,item) => !best || item.value > best.value ? item : best,null);
  let min = low?.value ?? 0, max = high?.value ?? 1;
  if (metric === "pnl") { min = Math.min(0,min); max = Math.max(0,max); }
  const buffer = Math.max((max-min)*.08, max === min ? Math.max(Math.abs(max)*.025,1) : .01);
  min -= buffer; max += buffer;
  const first = Date.parse(points[0]?.date ?? "");
  const span = Date.parse(points.at(-1)?.date ?? "") - first;
  const y = (value: number) => CHART_HEIGHT - CHART_PADDING - (value-min)/(max-min)*(CHART_HEIGHT-CHART_PADDING*2);
  const coords = values.map((value,index) => ({
    x: span > 0 ? CHART_PADDING + (Date.parse(points[index].date)-first)/span*(CHART_WIDTH-CHART_PADDING*2) : CHART_WIDTH/2,
    y: value == null ? null : y(value),
  }));
  const path = coords.map((point,index) => point.y == null ? "" : `${index && coords[index-1].y != null ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  return {values,coords,path,low,high,ticks:[max,(max+min)/2,min].map(value => ({value,y:y(value)})),zeroY: min <= 0 && max >= 0 ? y(0) : null};
}

export function nearestChartPoint(coords: {x:number}[], x:number) {
  if (!coords.length) return -1;
  let low=0, high=coords.length-1;
  while (low < high) { const mid=(low+high)>>1; if (x > (coords[mid].x+coords[mid+1].x)/2) low=mid+1; else high=mid; }
  return low;
}

export function chartInterval(points: PortfolioHistoryPoint[]) {
  const start=points[0], end=points.at(-1);
  const valid = points.length > 1 && start?.portfolio != null && end?.portfolio != null;
  const flow = valid ? end!.contributions-start.contributions : null;
  const amount = valid ? end!.portfolio!-start.portfolio!-flow! : null;
  return {amount,flow,rate:amount != null && start.portfolio! > 1e-8 ? amount/start.portfolio! : null,
    gaps:points.filter(point => point.portfolio == null).length,
    carried:points.filter(point => point.status === "CARRIED").length};
}

// The browser owns vertical scrolling and pinch zoom. Only horizontal inspection captures a touch.
export function installChartInspection(svg: SVGSVGElement, coords: {x:number}[], onSelect: (index:number)=>void, onEngaged:(value:boolean)=>void) {
  let frame=0, queuedX:number|null=null, bounds:DOMRect|null=null, engaged=false;
  let gesture:{id:number;x:number;y:number;horizontal:boolean}|null=null;
  const engage=(value:boolean) => { if(value !== engaged) { engaged=value; onEngaged(value); } };
  const flush=() => { frame=0; if(queuedX == null || !bounds?.width) return; const x=(queuedX-bounds.left)/bounds.width*CHART_WIDTH; queuedX=null; const index=nearestChartPoint(coords,x); if(index>=0) onSelect(index); };
  const queue=(x:number) => { queuedX=x; if(!frame) frame=requestAnimationFrame(flush); };
  const release=() => { const previous=gesture; gesture=null; if(previous && svg.hasPointerCapture(previous.id)) svg.releasePointerCapture(previous.id); engage(false); };
  const cancel=() => { if(frame) cancelAnimationFrame(frame); frame=0; queuedX=null; release(); };
  const down=(event:PointerEvent) => {
    if(!event.isPrimary) { cancel(); return; }
    if(event.button !== 0) return;
    bounds=svg.getBoundingClientRect();
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,horizontal:event.pointerType === "mouse"};
    if(gesture.horizontal) { svg.setPointerCapture(event.pointerId); engage(true); queue(event.clientX); }
  };
  const enter=(event:PointerEvent) => { if(event.pointerType === "mouse") { bounds=svg.getBoundingClientRect(); engage(true); queue(event.clientX); } };
  const move=(event:PointerEvent) => {
    if(!event.isPrimary) return;
    bounds ??= svg.getBoundingClientRect();
    if(gesture?.id === event.pointerId) {
      const dx=Math.abs(event.clientX-gesture.x), dy=Math.abs(event.clientY-gesture.y);
      if(!gesture.horizontal) {
        if(dy > 8 && dy > dx) { cancel(); return; }
        if(dx < 8 || dx <= dy) return;
        gesture.horizontal=true; svg.setPointerCapture(event.pointerId); engage(true);
      }
      queue(event.clientX);
    } else if(event.pointerType === "mouse") { bounds ??= svg.getBoundingClientRect(); engage(true); queue(event.clientX); }
  };
  const up=(event:PointerEvent) => { if(gesture?.id !== event.pointerId) return; queue(event.clientX); if(frame) cancelAnimationFrame(frame); flush(); release(); };
  const leave=() => { if(!gesture) engage(false); };
  const resize=() => { bounds=null; cancel(); };
  const scroll=() => { bounds=null; };
  svg.addEventListener("pointerdown",down); svg.addEventListener("pointerenter",enter); svg.addEventListener("pointermove",move);
  svg.addEventListener("pointerup",up); svg.addEventListener("pointercancel",cancel); svg.addEventListener("lostpointercapture",cancel); svg.addEventListener("pointerleave",leave);
  window.addEventListener("resize",resize); window.addEventListener("blur",cancel);
  window.addEventListener("scroll",scroll,{passive:true});
  return () => {
    cancel(); svg.removeEventListener("pointerdown",down); svg.removeEventListener("pointerenter",enter); svg.removeEventListener("pointermove",move);
    svg.removeEventListener("pointerup",up); svg.removeEventListener("pointercancel",cancel); svg.removeEventListener("lostpointercapture",cancel); svg.removeEventListener("pointerleave",leave);
    window.removeEventListener("resize",resize); window.removeEventListener("blur",cancel);
    window.removeEventListener("scroll",scroll);
  };
}
