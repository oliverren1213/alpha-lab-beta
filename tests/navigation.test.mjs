import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
const vite=await createServer({configFile:false,appType:"custom",logLevel:"silent",server:{middlewareMode:true}});
after(()=>vite.close());
const {installCapsuleDrag,GlassNavigation}=await vite.ssrLoadModule("/app/glass-navigation.tsx");
const {createCapsuleMotion,createNavigationFollow}=await vite.ssrLoadModule("/lib/capsule-motion.ts");
const {installScrollChrome}=await vite.ssrLoadModule("/lib/scroll-chrome.ts");

test("glass navigation renders usable buttons before hydration, with explicit language and accessible selection",()=>{
  const html=renderToStaticMarkup(React.createElement(GlassNavigation,{value:"portfolio",label:"Primary navigation",language:"en",onSelect:()=>true,items:[{id:"portfolio",label:"Portfolio overview",short:"Portfolio",icon:null},{id:"ledger",label:"Transaction ledger",short:"Ledger",icon:null}]}));
  assert.match(html,/aria-label="Primary navigation"/);assert.match(html,/lang="en"/);
  assert.equal((html.match(/aria-current="page"/g)||[]).length,1);assert.equal((html.match(/<button/g)||[]).length,2);
  assert.match(html,/Swipe to browse/);assert.match(html,/data-ready="false"/);
});

test("capsule reserves selected-tab dragging while leaving the underlying touch strip native",()=>{
  const originalRaf=globalThis.requestAnimationFrame,originalCancel=globalThis.cancelAnimationFrame;
  const frames=new Map();let frameId=0;
  globalThis.requestAnimationFrame=callback=>{frames.set(++frameId,callback);return frameId;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  const captures=new Set(),listeners=new Map(),options=new Map(),preview=[],committed=[];
  const buttons=Array.from({length:6},(_,i)=>({dataset:{navId:`v${i}`},offsetLeft:6+i*116,offsetWidth:112,closest(){return this;},getAttribute(){return i===0?"page":null;},setPointerCapture(id){captures.add(id);},hasPointerCapture(id){return captures.has(id);},releasePointerCapture(id){captures.delete(id);}}));
  const windowListeners=new Map(),documentListeners=new Map();let painted=null;
  const view={addEventListener:(type,handler)=>windowListeners.set(type,handler),removeEventListener:type=>windowListeners.delete(type),getComputedStyle:()=>painted,DOMMatrixReadOnly:class {constructor(transform){this.m41=Number(transform.match(/matrix\(1, 0, 0, 1, ([\d.]+), 0\)/)[1]);}}};
  const doc={defaultView:view,hidden:false,addEventListener:(type,handler)=>documentListeners.set(type,handler),removeEventListener:type=>documentListeners.delete(type)};
  let rectReads=0,itemReads=0;
  const properties=new Map(),track={dataset:{},style:{setProperty:(key,value)=>properties.set(key,value),removeProperty:key=>properties.delete(key)},querySelectorAll:()=>{itemReads++;return buttons;},querySelector:()=>painted?{}:null};
  const viewport={ownerDocument:doc,dataset:{},offsetLeft:0,offsetWidth:336,getAttribute:()=>null,setPointerCapture:buttons[0].setPointerCapture,hasPointerCapture:buttons[0].hasPointerCapture,releasePointerCapture:buttons[0].releasePointerCapture,scrollLeft:0,scrollWidth:708,clientWidth:336,getBoundingClientRect:()=>{rectReads++;return {left:0,right:336};},addEventListener:(type,handler,config)=>{listeners.set(type,handler);options.set(type,config);},removeEventListener:type=>listeners.delete(type)};
  const fire=(type,button,x=56,extra={})=>{
    const event={type,target:button,isPrimary:true,button:0,pointerId:1,pointerType:"touch",clientX:x,clientY:10,cancelable:true,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra};
    if(type.startsWith("pointer") && event.pointerType==="touch") {
      // Exercise real TouchEvent routing; compatibility PointerEvents must be ignored.
      const phase={pointerdown:"touchstart",pointermove:"touchmove",pointerup:"touchend",pointercancel:"touchcancel"}[type];
      const point={identifier:event.pointerId,clientX:event.clientX,clientY:event.clientY};
      event.type=phase;event.changedTouches=[point];event.touches=phase==="touchend"||phase==="touchcancel"?[]:event.isPrimary?[point]:[point,{identifier:1}];
      listeners.get(phase)?.(event);
    } else listeners.get(type)?.(event);
    return event;
  };
  const tick=()=>{const batch=[...frames.values()];frames.clear();batch.forEach(callback=>callback(performance.now()));};
  let remove;
  try {
    remove=installCapsuleDrag(viewport,track,id=>preview.push(id),id=>committed.push(id));
    assert.equal(listeners.has("touchmove"),false);assert.equal(options.get("touchstart").passive,true);
    listeners.get("pointerdown")({isPrimary:true,button:0,target:buttons[0],pointerType:"touch",pointerId:90,clientX:56,clientY:10});
    assert.equal(captures.size,0); // iOS compatibility events cannot create a second gesture.
    fire("pointerdown",buttons[0]);assert.equal(options.get("touchmove").passive,false);fire("pointermove",buttons[0],300);tick();
    listeners.get("pointercancel")({pointerType:"touch",pointerId:1});
    assert.equal(track.dataset.scrubbing,"true"); // Compatibility cancellation cannot steal a TouchEvent drag.
    assert.deepEqual(committed,[]);assert.equal(preview.at(-1),"v2");assert.equal(track.dataset.scrubbing,"true");
    assert.ok(viewport.scrollLeft>0); // Thumb approaches the edge before the finger reaches it.
    assert.equal(rectReads,1);assert.equal(itemReads,2); // Geometry is cached on down/intent, not each frame.
    tick();assert.equal(rectReads,1);assert.equal(itemReads,2);
    fire("pointerup",buttons[0],300);assert.deepEqual(committed,["v2"]);assert.equal(captures.size,0);assert.equal(frames.size,0);
    assert.equal(fire("click",buttons[0],300,{detail:1}).prevented,true);
    assert.notEqual(fire("click",buttons[1],170,{detail:0}).prevented,true);
    const oldScroll=viewport.scrollLeft;
    fire("pointerdown",buttons[1],170);const scroll=fire("pointermove",buttons[1],90);tick();
    assert.notEqual(scroll.prevented,true);assert.equal(viewport.scrollLeft,oldScroll);assert.equal(listeners.has("touchmove"),false);
    fire("pointerup",buttons[1],90);assert.equal(captures.size,0);assert.deepEqual(committed,["v2"]);
    // Browser owns momentum and suppression of clicks after a native pan; JS adds neither.
    fire("pointerdown",buttons[0]);fire("pointermove",buttons[0],190);tick();fire("pointercancel",buttons[0],190);
    assert.deepEqual(committed,["v2"]);assert.equal(preview.at(-1),null);assert.equal(frames.size,0);
    fire("pointerdown",buttons[1],170,{pointerType:"mouse"});fire("pointermove",buttons[1],90,{pointerType:"mouse"});
    tick();assert.ok(viewport.scrollLeft>oldScroll);fire("pointerup",buttons[1],90,{pointerType:"mouse"});assert.deepEqual(committed,["v2"]);
    fire("pointerdown",buttons[0]);fire("pointermove",buttons[0],58);fire("pointerup",buttons[0],58);
    assert.notEqual(fire("click",buttons[0],58,{detail:1}).prevented,true);

    // Once vertical intent wins, subsequent diagonal movement cannot switch pages.
    fire("pointerdown",buttons[0]);const vertical=fire("pointermove",buttons[0],60,{clientY:35});
    assert.notEqual(vertical.prevented,true);assert.equal(captures.size,0);
    fire("pointermove",buttons[0],220);fire("pointerup",buttons[0],220);assert.deepEqual(committed,["v2"]);

    // Left swipe from the first selected tab browses instead of clamping the thumb.
    viewport.scrollLeft=0;
    fire("pointerdown",buttons[0],100);fire("pointermove",buttons[0],20);tick();
    assert.equal(viewport.scrollLeft,80);assert.equal(track.dataset.scrubbing,undefined);
    fire("pointerup",buttons[0],20);assert.deepEqual(committed,["v2"]);
    // Padding/gaps also drag; a short touch on an inactive tab still clicks normally.
    const gap={closest:()=>null};fire("pointerdown",gap,160);fire("pointermove",gap,100);tick();
    assert.equal(viewport.scrollLeft,80);assert.equal(listeners.has("touchmove"),false);fire("pointerup",gap,100);
    fire("pointerdown",buttons[1],170);fire("pointermove",buttons[1],172);fire("pointerup",buttons[1],172);
    assert.notEqual(fire("click",buttons[1],172,{detail:1}).prevented,true);
    // Zoom takes ownership on a second finger and never commits a destination.
    fire("pointerdown",buttons[0]);fire("pointermove",buttons[0],190);
    fire("pointerdown",buttons[0],190,{isPrimary:false,pointerId:2});
    assert.equal(captures.size,0);assert.equal(frames.size,0);assert.deepEqual(committed,["v2"]);

    // Interrupted animation starts from the actual painted position, not the tab destination.
    viewport.scrollLeft=0;painted={transform:"matrix(1, 0, 0, 1, 38, 0)",width:"110px"};
    fire("pointerdown",buttons[0]);fire("pointermove",buttons[0],76);tick();
    assert.equal(properties.get("--capsule-x"),"58px");assert.equal(properties.get("--capsule-width"),"110px");
    assert.equal(properties.has("--capsule-light"),false); // No per-frame gradient repaint.
    fire("pointercancel",buttons[0]);assert.equal(properties.has("--capsule-light"),false);
    painted={transform:"unsupported",width:"112px"};
    fire("pointerdown",buttons[0]);fire("pointermove",buttons[0],76);tick();
    assert.equal(properties.get("--capsule-x"),"26px");fire("pointercancel",buttons[0]);

    for (const reason of ["blur","resize","visibilitychange"]) {
      fire("pointerdown",buttons[0]);fire("pointermove",buttons[0],190);
      if(reason==="visibilitychange"){doc.hidden=true;documentListeners.get(reason)();doc.hidden=false;}
      else windowListeners.get(reason)();
      assert.equal(preview.at(-1),null);assert.equal(captures.size,0);assert.equal(frames.size,0);
      assert.deepEqual(committed,["v2"]);
    }
  } finally {
    remove?.();assert.equal(listeners.size,0);assert.equal(captures.size,0);assert.equal(frames.size,0);
    assert.equal(windowListeners.size,0);assert.equal(documentListeners.size,0);
    if(originalRaf)globalThis.requestAnimationFrame=originalRaf;else delete globalThis.requestAnimationFrame;
    if(originalCancel)globalThis.cancelAnimationFrame=originalCancel;else delete globalThis.cancelAnimationFrame;
  }
});

test("CSS enables native strip scrolling and restricts only selected-capsule horizontal gestures",()=>{
  const css=readFileSync(new URL("../app/motion.css",import.meta.url),"utf8");
  assert.match(css,/\.glass-nav-viewport \{[^}]*touch-action: pan-x pan-y pinch-zoom/);
  assert.match(css,/\.primary-nav\.liquid-capsule \.glass-nav-track,\.primary-nav\.liquid-capsule button \{ touch-action: pan-x pan-y pinch-zoom/);
  assert.match(css,/button\[aria-current="page"\] \{ touch-action: pan-y pinch-zoom/);
  assert.match(css,/\.view-stage \{ animation: none; \}/); // Removing the transition marker must not restart an old CSS entrance.
});

test("mobile chrome hides down, reveals up, ignores jitter/bounce and toolbar height changes, and remains keyboard-accessible",()=>{
  const frames=new Map(),listeners=new Map(),docListeners=new Map(),mediaListeners=new Map();let id=0;
  const media={matches:true,addEventListener:(name,handler)=>mediaListeners.set(name,handler),removeEventListener:name=>mediaListeners.delete(name)};
  const chrome=[{offsetHeight:64,inert:false,contains:node=>node==="nav-focus"},{offsetHeight:60,inert:false,contains:()=>false}];
  const view={scrollY:0,innerHeight:800,innerWidth:390,matchMedia:()=>media,requestAnimationFrame:callback=>{frames.set(++id,callback);return id;},cancelAnimationFrame:id=>frames.delete(id),addEventListener:(name,handler)=>listeners.set(name,handler),removeEventListener:name=>listeners.delete(name)};
  const doc={defaultView:view,documentElement:{scrollHeight:2000},activeElement:null,addEventListener:(name,handler)=>docListeners.set(name,handler),removeEventListener:name=>docListeners.delete(name)};
  const app={ownerDocument:doc,dataset:{},querySelectorAll:()=>chrome};
  const remove=installScrollChrome(app);
  const tick=()=>{const batch=[...frames.values()];frames.clear();batch.forEach(callback=>callback());};
  const scroll=y=>{view.scrollY=y;listeners.get("scroll")();tick();};
  try {
    scroll(100);assert.notEqual(app.dataset.chromeHidden,"true"); // Before the chrome has naturally cleared.
    scroll(160);assert.equal(app.dataset.chromeHidden,"true");assert.ok(chrome.every(element=>element.inert));
    scroll(155);scroll(158);scroll(154);assert.equal(app.dataset.chromeHidden,"true"); // Tiny reversals must not flicker.
    scroll(142);assert.equal(app.dataset.chromeHidden,"false");assert.ok(chrome.every(element=>!element.inert));
    scroll(200);assert.equal(app.dataset.chromeHidden,"true");
    view.innerHeight=850;listeners.get("resize")();assert.equal(app.dataset.chromeHidden,"true");
    scroll(1400);assert.equal(app.dataset.chromeHidden,"true"); // Bottom rubber band ignored.
    scroll(8);assert.equal(app.dataset.chromeHidden,"false");
    scroll(180);docListeners.get("keydown")({key:"Tab"});assert.equal(app.dataset.chromeHidden,"false");
    doc.activeElement="nav-focus";scroll(260);assert.equal(app.dataset.chromeHidden,"false");
    docListeners.get("pointerdown")();scroll(290);assert.equal(app.dataset.chromeHidden,"true");
    docListeners.get("focusin")({target:"nav-focus"});assert.equal(app.dataset.chromeHidden,"false");
    scroll(350);view.innerWidth=844;media.matches=false;mediaListeners.get("change")();assert.equal(app.dataset.chromeHidden,"false");
    scroll(500);assert.equal(app.dataset.chromeHidden,"false");
    view.innerWidth=390;media.matches=true;mediaListeners.get("change")();scroll(550);assert.equal(app.dataset.chromeHidden,"true");
    scroll(-20);assert.equal(app.dataset.chromeHidden,"true"); // Top rubber band ignored until a real in-bounds scroll.
    scroll(0);assert.equal(app.dataset.chromeHidden,"false");
    view.scrollY=200;listeners.get("scroll")();listeners.get("scroll")();assert.equal(frames.size,1);
  } finally {
    remove();assert.equal(frames.size,0);assert.equal(listeners.size,0);assert.equal(docListeners.size,0);assert.equal(mediaListeners.size,0);
    assert.equal(app.dataset.chromeHidden,undefined);assert.ok(chrome.every(element=>!element.inert));
  }
});

test("clicked capsules animate from the painted position, retarget without restarting, and yield safely to dragging",async()=>{
  let reduced=false,painted={transform:"matrix(1, 0, 0, 1, 6, 0)",width:"112px"};
  const animations=[],properties=new Map();
  const thumb={animate:(frames,options)=>{
    let resolve,reject;const finished=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const animation={frames,options,finished,finish:()=>resolve(),cancel(){this.cancelled=true;reject(new Error("cancelled"));}};
    animations.push(animation);return animation;
  }};
  const view={getComputedStyle:()=>painted,matchMedia:()=>({matches:reduced}),DOMMatrixReadOnly:class{constructor(transform){const fields=transform.match(/matrix\(([\d.]+), 0, 0, 1, ([\d.]+), 0\)/);this.m11=Number(fields[1]);this.m41=Number(fields[2]);}}};
  const track={dataset:{},ownerDocument:{defaultView:view},querySelector:()=>thumb,style:{setProperty:(key,value)=>properties.set(key,value)}};
  const motion=createCapsuleMotion(track);
  const tick=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
  motion.move(6,112);assert.equal(animations.length,0);
  motion.move(238,124,true);assert.equal(animations[0].options.duration,440);
  assert.deepEqual(animations[0].frames[0],{transform:`translate3d(6px,0,0) scaleX(${112/124})`});assert.equal(track.dataset.settling,"true");
  assert.ok(animations[0].frames.every(frame=>!Object.hasOwn(frame,"width"))); // No width layout on each animation frame.
  motion.move(238,124);assert.equal(animations.length,1); // Resize/React must not snap or restart.
  painted={transform:"matrix(0.95, 0, 0, 1, 95, 0)",width:"118px"};
  motion.move(470,124,true);assert.equal(animations[0].cancelled,true);
  assert.deepEqual(animations[1].frames[0],{transform:`translate3d(95px,0,0) scaleX(${118*.95/124})`});
  motion.stop();assert.equal(properties.get("--capsule-x"),"95px");assert.equal(properties.get("--capsule-width"),`${118*.95}px`);
  assert.equal(animations[1].cancelled,true);await tick();assert.equal(track.dataset.settling,undefined);
  motion.move(470,124,true);animations.at(-1).finish();await tick();assert.equal(track.dataset.settling,undefined);
  // A subsequent drag also invalidates a completed target, so releasing on it still settles.
  motion.stop();motion.move(470,124,true);assert.equal(animations.length,4);
  reduced=true;motion.move(6,112,true);assert.equal(animations.length,4);assert.equal(properties.get("--capsule-x"),"6px");
  await tick();motion.stop(false);
});

test("menu centers selected tabs on the capsule clock, retargets from current scroll and yields to input",()=>{
  const originalRaf=globalThis.requestAnimationFrame,originalCancel=globalThis.cancelAnimationFrame;
  const frames=new Map();let id=0,progress=0;
  globalThis.requestAnimationFrame=callback=>{frames.set(++id,callback);return id;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  const viewport={scrollLeft:0,scrollWidth:708,clientWidth:336};
  const driver={playState:"running",effect:{getComputedTiming:()=>({progress})}};
  const follow=createNavigationFollow(viewport);
  const tick=()=>{const batch=[...frames.values()];frames.clear();batch.forEach(callback=>callback());};
  try {
    follow.move({offsetLeft:354,offsetWidth:112},driver);
    progress=.5;tick();assert.equal(viewport.scrollLeft,121);
    follow.move({offsetLeft:354,offsetWidth:112},driver); // Repeated measurement does not restart.
    progress=.75;tick();assert.equal(viewport.scrollLeft,181.5);
    progress=0;follow.move({offsetLeft:586,offsetWidth:112},driver);
    progress=.5;tick();assert.equal(viewport.scrollLeft,(181.5+372)/2);
    progress=1;tick();assert.equal(viewport.scrollLeft,372);assert.equal(frames.size,0);
    follow.move({offsetLeft:6,offsetWidth:112});assert.equal(viewport.scrollLeft,0);
    progress=0;follow.move({offsetLeft:354,offsetWidth:112},driver);follow.stop();
    assert.equal(frames.size,0);assert.equal(viewport.scrollLeft,0);
    viewport.scrollWidth=300;follow.move({offsetLeft:238,offsetWidth:112});assert.equal(viewport.scrollLeft,0);
  } finally {
    follow.stop();
    if(originalRaf)globalThis.requestAnimationFrame=originalRaf;else delete globalThis.requestAnimationFrame;
    if(originalCancel)globalThis.cancelAnimationFrame=originalCancel;else delete globalThis.cancelAnimationFrame;
  }
});
