"use client";

import React, { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createCapsuleMotion, createNavigationFollow } from "../lib/capsule-motion";

type NavPointer = Pick<PointerEvent,"type"|"target"|"isPrimary"|"button"|"pointerId"|"pointerType"|"clientX"|"clientY"|"preventDefault">;

// Native strip momentum; only the selected capsule and mouse drag need scripted movement.
export function installCapsuleDrag(viewport: HTMLElement, track: HTMLElement, preview: (id: string | null) => void, commit: (id: string) => void, interrupt:(scrub:boolean)=>void=()=>{}) {
  let gesture: { pointer: number; touch: boolean; owner: HTMLElement; mode: "scrub" | "scroll"; x: number; y: number; currentX: number; scroll: number; left: number; width: number; moved: boolean; target: string; rect:DOMRect; maxScroll:number; items:Array<{node:HTMLButtonElement;left:number;width:number}> } | null = null;
  let frame = 0, previousFrame = 0, suppressUntil = 0;
  const doc = viewport.ownerDocument, view = doc?.defaultView;
  const buttons = () => [...track.querySelectorAll<HTMLButtonElement>("button[data-nav-id]")];
  const clear = () => {
    cancelAnimationFrame(frame); frame = 0; previousFrame = 0;
    viewport.removeEventListener("touchmove",touch);
    delete track.dataset.scrubbing; delete viewport.dataset.dragging;
    track.style.removeProperty("--capsule-light");
    const old = gesture; gesture = null;
    if (old && !old.touch && old.owner.hasPointerCapture(old.pointer)) old.owner.releasePointerCapture(old.pointer);
  };
  const render = (at: number) => {
    frame = 0;
    const g = gesture; if (!g || !g.moved) return;
    if (g.mode === "scroll") {
      viewport.scrollLeft = Math.max(0,Math.min(g.maxScroll,g.scroll+g.x-g.currentX));
      return;
    }
    const before = viewport.scrollLeft;
    const proposed=g.left+g.currentX-g.x+before-g.scroll;
    const visualLeft=proposed-before+g.rect.left;
    const edge = g.currentX<g.x && visualLeft<g.rect.left+24 ? -1 : g.currentX>g.x && visualLeft+g.width>g.rect.right-24 ? 1 : 0;
    const dt = previousFrame ? Math.min(32,at-previousFrame) : 16; previousFrame = at;
    viewport.scrollLeft = Math.max(0,Math.min(g.maxScroll,before+edge*dt*.65));
    const items = g.items; if (!items.length) return;
    const last = items.at(-1)!;
    const left = Math.max(items[0].left,Math.min(last.left+last.width-g.width,g.left+g.currentX-g.x+viewport.scrollLeft-g.scroll));
    track.style.setProperty("--capsule-x",`${left}px`);
    const nearest = items.reduce((best,button) => Math.abs(button.left+button.width/2-left-g.width/2)<Math.abs(best.left+best.width/2-left-g.width/2) ? button : best);
    const id = nearest.node.dataset.navId!;
    if (g.target !== id) { g.target = id; preview(id); }
    if (edge && before !== viewport.scrollLeft) frame = requestAnimationFrame(render);
  };
  const down = (e: NavPointer) => {
    // A second finger belongs to browser zoom, not to this one-finger drag.
    if (!e.isPrimary && gesture) { clear(); preview(null); return; }
    if (!e.isPrimary || e.button !== 0 || gesture) return;
    suppressUntil = 0;
    const owner = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-nav-id]") ?? viewport;
    const selected = owner.getAttribute("aria-current") === "page";
    if (!selected && viewport.scrollWidth <= viewport.clientWidth) return;
    interrupt(selected);
    // Let Safari own strip browsing, including momentum. Only the selected capsule is custom-dragged.
    if(e.pointerType==="touch" && !selected)return;
    let left = owner.offsetLeft, width = owner.offsetWidth;
    // Pick up the glass where it is painted, even midway through a transition.
    const thumb = track.querySelector<HTMLElement>(".glass-nav-thumb");
    if (selected && thumb && view) {
      const style = view.getComputedStyle(thumb);
      try { if (style.transform !== "none") left = new view.DOMMatrixReadOnly(style.transform).m41; } catch { /* Keep measured button geometry on older browsers. */ }
      let scale=1;try {scale=new view.DOMMatrixReadOnly(style.transform).m11 || 1;}catch { /* Older browser fallback. */ }
      width = (Number.parseFloat(style.width) || width)*scale;
    }
    gesture = {pointer:e.pointerId,touch:e.pointerType==="touch",owner,mode:selected?"scrub":"scroll",x:e.clientX,y:e.clientY,currentX:e.clientX,scroll:viewport.scrollLeft,left,width,moved:false,target:owner.dataset.navId??"",rect:viewport.getBoundingClientRect(),maxScroll:Math.max(0,viewport.scrollWidth-viewport.clientWidth),items:buttons().map(node=>({node,left:node.offsetLeft,width:node.offsetWidth}))};
    if(gesture.touch)viewport.addEventListener("touchmove",touch,{passive:false});
    if (!gesture.touch) owner.setPointerCapture(e.pointerId);
  };
  const move = (e: NavPointer) => {
    const g = gesture; if (!g || e.pointerId !== g.pointer) return;
    const dx=e.clientX-g.x,dy=e.clientY-g.y;
    if (!g.moved && Math.abs(dy)>8 && Math.abs(dy)>Math.abs(dx)) { clear(); preview(null); return; }
    if (!g.moved && (Math.abs(dx)<6 || Math.abs(dy)>Math.abs(dx))) return;
    // On the end tab an outward swipe browses the strip instead of feeling stuck.
    if (!g.moved && g.touch && g.mode === "scrub" && viewport.scrollWidth>viewport.clientWidth) {
      const items=buttons();
      if ((g.owner===items[0] && dx<0) || (g.owner===items.at(-1) && dx>0)) g.mode="scroll";
    }
    g.moved = true; g.currentX = e.clientX; e.preventDefault();
    viewport.dataset.dragging = "true";
    if (g.mode === "scrub") {
      track.dataset.scrubbing = "true";
      track.style.setProperty("--capsule-width",`${g.width}px`);
    }
    if (!frame) frame = requestAnimationFrame(render);
  };
  const finish = (e: NavPointer) => {
    if (!gesture || e.pointerId !== gesture.pointer) return;
    if (frame) { cancelAnimationFrame(frame); render(performance.now()); }
    const g=gesture; clear();
    if (g.moved) suppressUntil=performance.now()+400;
    if (e.type === "pointerup" && g.moved && g.mode === "scrub") commit(g.target);
    else preview(null);
  };
  const click = (e: MouseEvent) => {
    if (e.detail && performance.now()<suppressUntil) { e.preventDefault(); e.stopPropagation(); }
  };
  const cancel = () => {
    if (!gesture) return;
    if (gesture.moved) suppressUntil = performance.now()+400;
    clear(); preview(null);
  };
  const visibility = () => { if (doc.hidden) cancel(); };
  // iOS touch events retain their original target while the finger leaves it.
  // Handle fingers here, not twice via compatibility PointerEvents; no fake capture.
  const touch = (event: TouchEvent) => {
    if (event.touches.length>1) { cancel(); return; }
    const point=Array.from(event.changedTouches).find(point=>!gesture || point.identifier===gesture.pointer);
    if (!point) return;
    const normalized:NavPointer={type:event.type==="touchend"?"pointerup":event.type,target:event.target,isPrimary:true,button:0,pointerId:point.identifier,pointerType:"touch",clientX:point.clientX,clientY:point.clientY,preventDefault:()=>{if(event.cancelable)event.preventDefault();}};
    if (event.type==="touchstart") down(normalized);
    else if (event.type==="touchmove") move(normalized);
    else finish(normalized);
  };
  const pointer = (event: PointerEvent) => {
    if(event.pointerType==="touch" || gesture?.touch)return;
    if(event.type==="pointerdown")down(event);
    else if(event.type==="pointermove")move(event);
    else finish(event);
  };
  view?.addEventListener("blur",cancel);
  view?.addEventListener("resize",cancel);
  doc?.addEventListener("visibilitychange",visibility);
  viewport.addEventListener("touchstart",touch,{passive:true});
  viewport.addEventListener("touchend",touch);
  viewport.addEventListener("touchcancel",touch);
  viewport.addEventListener("pointerdown",pointer);
  viewport.addEventListener("pointermove",pointer,{passive:false});
  viewport.addEventListener("pointerup",pointer);
  viewport.addEventListener("pointercancel",pointer);
  viewport.addEventListener("lostpointercapture",pointer);
  viewport.addEventListener("click",click,true);
  return () => {
    clear();
    view?.removeEventListener("blur",cancel); view?.removeEventListener("resize",cancel);
    doc?.removeEventListener("visibilitychange",visibility);
    viewport.removeEventListener("touchstart",touch); viewport.removeEventListener("touchmove",touch);
    viewport.removeEventListener("touchend",touch); viewport.removeEventListener("touchcancel",touch);
    viewport.removeEventListener("pointerdown",pointer); viewport.removeEventListener("pointermove",pointer);
    viewport.removeEventListener("pointerup",pointer); viewport.removeEventListener("pointercancel",pointer);
    viewport.removeEventListener("lostpointercapture",pointer); viewport.removeEventListener("click",click,true);
  };
}

export function GlassNavigation({ items, value, onSelect, label, language }: {
  items: Array<{id:string;label:string;short:string;icon:ReactNode}>;
  value: string; onSelect: (id:string) => boolean; label:string; language: "zh" | "en";
}) {
  const viewport=useRef<HTMLDivElement>(null),track=useRef<HTMLDivElement>(null);
  const motion=useRef<ReturnType<typeof createCapsuleMotion>|null>(null);
  const follow=useRef<ReturnType<typeof createNavigationFollow>|null>(null);
  const [preview,setPreview]=useState<{id:string;value:string;language:string}|null>(null);
  const validPreview=preview?.value===value && preview.language===language;
  if (preview && !validPreview) setPreview(null);
  const selected=validPreview?preview.id:value;
  const measure=(id:string,animate=false) => {
    const node=track.current?.querySelector<HTMLButtonElement>(`button[data-nav-id="${id}"]`);
    if (!node || !track.current) return null;
    return motion.current?.move(node.offsetLeft,node.offsetWidth,animate)??null;
  };
  const commit=(id:string) => {
    if (!onSelect(id)) { setPreview(null); reveal(value,measure(value,true)); return; }
    setPreview({id,value,language}); reveal(id,measure(id,true));
    track.current?.querySelector<HTMLButtonElement>(`button[data-nav-id="${id}"]`)?.focus({preventScroll:true});
  };
  const reveal=(id:string,driver:Animation|null=null) => {
    const root=viewport.current,button=track.current?.querySelector<HTMLButtonElement>(`button[data-nav-id="${id}"]`);
    if (!root || !button) return;
    follow.current?.move(button,driver);
  };
  const latest=useRef({commit,measure,reveal,value,language,selected});
  useLayoutEffect(()=>{latest.current={commit,measure,reveal,value,language,selected};});
  useLayoutEffect(()=>{
    if(!track.current || !viewport.current)return;
    const animator=createCapsuleMotion(track.current);motion.current=animator;
    const follower=createNavigationFollow(viewport.current);follow.current=follower;
    return ()=>{follower.stop();animator.stop(false);motion.current=null;follow.current=null;};
  },[]);
  useLayoutEffect(() => {
    if(track.current?.dataset.scrubbing)return;
    const driver=measure(selected,viewport.current?.parentElement?.dataset.ready==="true");
    if(viewport.current?.parentElement)viewport.current.parentElement.dataset.ready="true";
    reveal(selected,driver);
  },[selected,language]);
  useEffect(() => {
    const root=viewport.current,content=track.current; if (!root || !content) return;
    const edges=()=>{
      if (!root.parentElement) return;
      const start=String(root.scrollLeft>2),end=String(root.scrollLeft+root.clientWidth<root.scrollWidth-2);
      if(root.parentElement.dataset.scrollStart!==start)root.parentElement.dataset.scrollStart=start;
      if(root.parentElement.dataset.scrollEnd!==end)root.parentElement.dataset.scrollEnd=end;
    };
    let geometry=`${root.clientWidth}:${content.offsetWidth}`;
    const resize=new ResizeObserver(()=>{const next=`${root.clientWidth}:${content.offsetWidth}`;if(next!==geometry && !root.dataset.dragging){geometry=next;follow.current?.stop();motion.current?.stop(false);latest.current.measure(latest.current.selected);latest.current.reveal(latest.current.selected);}edges();});
    resize.observe(root); resize.observe(content);
    root.addEventListener("scroll",edges,{passive:true}); edges();
    const remove=installCapsuleDrag(root,content,(id)=>{setPreview(id===null?null:{id,value:latest.current.value,language:latest.current.language});if(id===null)latest.current.measure(latest.current.value,true);},id=>latest.current.commit(id),(scrub)=>{follow.current?.stop();if(scrub)motion.current?.stop();});
    const pause=()=>{if(document.hidden)follow.current?.stop();};document.addEventListener("visibilitychange",pause);
    const stopFollow=()=>follow.current?.stop();window.addEventListener("blur",stopFollow);
    root.addEventListener("wheel",stopFollow,{passive:true});
    return ()=>{resize.disconnect();root.removeEventListener("scroll",edges);root.removeEventListener("wheel",stopFollow);document.removeEventListener("visibilitychange",pause);window.removeEventListener("blur",stopFollow);remove();};
  },[]);
  return <nav className="primary-nav liquid-capsule" aria-label={label} data-ready="false" data-no-translate>
    <span className="sr-only" id="capsule-help">{language==="en"?"Swipe to browse. Drag the selected capsule to switch. Arrow keys, Home and End also navigate.":"横向滑动浏览；拖动选中胶囊切换。也可使用方向键、Home 和 End。"}</span>
    <span className="glass-nav-edge glass-nav-edge-start" aria-hidden="true" />
    <span className="glass-nav-edge glass-nav-edge-end" aria-hidden="true" />
    <div className="glass-nav-viewport" ref={viewport} aria-describedby="capsule-help">
      <div className="glass-nav-track" ref={track} lang={language}>
        <span className="glass-nav-thumb" aria-hidden="true" />
        {items.map((item,index)=><button key={item.id} type="button" data-nav-id={item.id} aria-current={value===item.id?"page":undefined} aria-label={item.label} title={item.label} className={selected===item.id?"active":""} style={{"--nav-color":`var(--pride-${index%6+1})`} as React.CSSProperties}
          onClick={()=>commit(item.id)} onKeyDown={event=>{
            if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
            const next=event.key==="Home"?0:event.key==="End"?items.length-1:event.key==="ArrowRight"?(index+1)%items.length:event.key==="ArrowLeft"?(index+items.length-1)%items.length:null;
            if(next===null)return;event.preventDefault();commit(items[next].id);
          }}><span className="glass-nav-icon">{item.icon}</span><span>{item.short}</span></button>)}
      </div>
    </div>
  </nav>;
}
