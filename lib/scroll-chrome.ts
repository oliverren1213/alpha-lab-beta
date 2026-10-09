/** Mobile chrome follows reading direction without React updates on every scroll tick. */
export function installScrollChrome(app:HTMLElement) {
  const doc=app.ownerDocument,view=doc.defaultView;
  if(!view)return ()=>{};
  const mobile=view.matchMedia("(max-width: 768px)");
  const chrome=[...app.querySelectorAll<HTMLElement>(".app-topbar,.primary-nav")];
  let last=Math.max(0,view.scrollY),travel=0,direction=0,frame=0,hidden=false,keyboard=false;
  let threshold=0,viewportWidth=view.innerWidth;
  const setHidden=(next:boolean)=>{
    if(next===hidden)return;
    hidden=next;app.dataset.chromeHidden=String(next);
    chrome.forEach(element=>{element.inert=next;});
  };
  const reset=()=>{
    threshold=chrome.reduce((height,element)=>height+element.offsetHeight,16);
    last=Math.max(0,view.scrollY);travel=0;direction=0;setHidden(false);
  };
  const show=()=>{travel=0;direction=0;last=Math.max(0,view.scrollY);setHidden(false);};
  const update=()=>{
    frame=0;
    if(!mobile.matches){show();return;}
    const raw=view.scrollY,max=Math.max(0,doc.documentElement.scrollHeight-view.innerHeight);
    // Safari rubber-band motion is not a new reading direction.
    if(raw<0 || raw>max)return;
    const delta=raw-last;last=raw;
    if(raw<=16){show();return;}
    if(keyboard && chrome.some(element=>element.contains(doc.activeElement))){show();return;}
    if(!delta)return;
    const nextDirection=Math.sign(delta);
    travel=nextDirection===direction?travel+Math.abs(delta):Math.abs(delta);direction=nextDirection;
    if(travel>=(direction>0?20:10)){
      setHidden(direction>0 && raw>threshold);travel=0;
    }
  };
  const scroll=()=>{if(!frame)frame=view.requestAnimationFrame(update);};
  const key=(event:KeyboardEvent)=>{if(event.key==="Tab"){keyboard=true;show();}};
  const pointer=()=>{keyboard=false;};
  const focus=(event:FocusEvent)=>{if(chrome.some(element=>element.contains(event.target as Node)))show();};
  // Safari's address bar changes viewport height while scrolling; that must not flash the menu back.
  const resize=()=>{if(view.innerWidth!==viewportWidth){viewportWidth=view.innerWidth;reset();}};
  view.addEventListener("scroll",scroll,{passive:true});view.addEventListener("resize",resize);
  doc.addEventListener("keydown",key,true);doc.addEventListener("pointerdown",pointer,{passive:true});doc.addEventListener("focusin",focus);
  mobile.addEventListener("change",reset);reset();
  return ()=>{
    view.cancelAnimationFrame(frame);setHidden(false);delete app.dataset.chromeHidden;
    view.removeEventListener("scroll",scroll);view.removeEventListener("resize",resize);
    doc.removeEventListener("keydown",key,true);doc.removeEventListener("pointerdown",pointer);doc.removeEventListener("focusin",focus);
    mobile.removeEventListener("change",reset);
  };
}
