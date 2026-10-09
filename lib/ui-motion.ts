let current:Animation[]=[];
let revision=0;

/** Animate the workspace, not document snapshots that can stall the live capsule. */
export function transitionView(update:()=>void,direction:"forward"|"back"="forward") {
  const request=++revision;
  let applied=false;
  const apply=()=>{if(applied||request!==revision)return;applied=true;update();};
  const stage=typeof document!=="undefined"?document.querySelector<HTMLElement>(".view-stage"):null;
  const painted=stage && typeof window!=="undefined"?window.getComputedStyle(stage):null;
  const from=painted?{opacity:painted.opacity,transform:painted.transform}:null;
  current.forEach(animation=>animation.cancel()); current=[];
  const clear=()=>{
    if(request!==revision)return;
    current.forEach(animation=>animation.cancel());current=[];
    delete document.documentElement.dataset.motionTransition;
  };
  if(!stage?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    if(typeof document!=="undefined")delete document.documentElement.dataset.motionTransition;
    apply();return;
  }
  const sign=direction==="back"?-1:1;
  // Avoid moving a tall ledger layer across the mobile viewport; keep a quiet crossfade.
  const mobile=window.matchMedia("(max-width: 768px)").matches;
  document.documentElement.dataset.motionTransition="active";
  const enter=()=>{
    if(request!==revision)return;
    try {
      current.forEach(animation=>animation.cancel());current=[];
      apply();
      const next=document.querySelector<HTMLElement>(".view-stage");
      if(!next?.animate){clear();return;}
      const incoming=next.animate(mobile?[{opacity:0},{opacity:1}]:[{opacity:0,transform:`translate3d(${sign*12}px,4px,0)`},{opacity:1,transform:"translate3d(0,0,0)"}],{duration:320,easing:"cubic-bezier(.22,1,.36,1)",fill:"both"});
      current=[incoming];
      void incoming.finished.catch(()=>{}).finally(clear);
    } catch {clear();apply();}
  };
  try {
    const outgoing=stage.animate(mobile?[{opacity:painted?.opacity??1},{opacity:0}]:[from??{opacity:1,transform:"none"},{opacity:0,transform:`translate3d(${-sign*8}px,0,0)`}],{duration:100,easing:"ease-out",fill:"both"});
    current=[outgoing];
    void outgoing.finished.then(enter,enter);
  } catch {clear();apply();}
}
