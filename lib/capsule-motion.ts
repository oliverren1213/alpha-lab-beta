/** Explicit, interruptible glass movement; independent of page rendering. */
export function createCapsuleMotion(track: HTMLElement) {
  const thumb=track.querySelector<HTMLElement>(".glass-nav-thumb");
  const view=track.ownerDocument.defaultView;
  let running:Animation|null=null, target="";
  const stop=(freeze=true) => {
    if (!running || !thumb) {target="";return;}
    if (freeze && view) {
      const painted=view.getComputedStyle(thumb);
      try { track.style.setProperty("--capsule-x",`${new view.DOMMatrixReadOnly(painted.transform).m41}px`); } catch { /* CSS target remains a safe fallback. */ }
      let scale=1;
      try { scale=new view.DOMMatrixReadOnly(painted.transform).m11 || 1; } catch { /* Untransformed width is the fallback. */ }
      track.style.setProperty("--capsule-width",`${Number.parseFloat(painted.width)*scale}px`);
    }
    const old=running; running=null; old.cancel();
    delete track.dataset.settling; target="";
  };
  const move=(x:number,width:number,animate=false) => {
    const next=`${x}:${width}`;
    // React commit and ResizeObserver may repeat the same destination. Do not restart it.
    if (next===target) return running;
    const painted=thumb && view?view.getComputedStyle(thumb):null;
    let from: {transform:string}|null=null;
    if(painted && view) {
      try {
        const matrix=new view.DOMMatrixReadOnly(painted.transform==="none"?undefined:painted.transform);
        from={transform:`translate3d(${matrix.m41}px,0,0) scaleX(${Number.parseFloat(painted.width)*(matrix.m11 || 1)/width})`};
      } catch { from={transform:`translate3d(${x}px,0,0)`}; }
    }
    stop(false); target=next;
    track.style.setProperty("--capsule-x",`${x}px`);
    track.style.setProperty("--capsule-width",`${width}px`);
    if (!animate || !thumb?.animate || !from || view?.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
    try {
      const animation=thumb.animate([from,{transform:`translate3d(${x}px,0,0) scaleX(1)`}],{duration:440,easing:"cubic-bezier(.22,1,.36,1)",fill:"both"});
      running=animation;track.dataset.settling="true";
      void animation.finished.catch(()=>{}).finally(()=>{
        if(running!==animation)return;
        running=null; animation.cancel(); delete track.dataset.settling;
      });
      return animation;
    } catch { /* Older browsers still get usable, correctly positioned navigation. */ }
    return null;
  };
  return {move,stop};
}

/** The strip follows the capsule's native clock, rather than a second smooth-scroll animation. */
export function createNavigationFollow(viewport:HTMLElement) {
  let frame=0,target:number|null=null;
  const stop=()=>{cancelAnimationFrame(frame);frame=0;target=null;};
  const move=(button:HTMLElement,driver:Animation|null=null)=>{
    const next=Math.max(0,Math.min(viewport.scrollWidth-viewport.clientWidth,button.offsetLeft+button.offsetWidth/2-viewport.clientWidth/2));
    if(next===target)return;
    stop();target=next;
    const from=viewport.scrollLeft;
    if(!driver || Math.abs(next-from)<.5){viewport.scrollLeft=next;return;}
    const tick=()=>{
      const progress=driver.effect?.getComputedTiming().progress;
      if(driver.playState==="idle" || driver.playState==="finished" || progress===1){viewport.scrollLeft=next;frame=0;return;}
      viewport.scrollLeft=from+(next-from)*Math.max(0,Math.min(1,progress??0));
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
  };
  return {move,stop};
}
