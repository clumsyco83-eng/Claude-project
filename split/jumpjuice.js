/* Jump Juice Adventure — game.
   Expects boot.js to have run first, and the markup from index.html.
   Add ?debug=1 to the URL to expose window.JJA_DEBUG. */
(function(){
"use strict";

/* ══════════════════════════════════════════════════════════════════
   JUMP JUICE ADVENTURE — audited build
   Endless runner. Single file, zero runtime dependencies.
   ══════════════════════════════════════════════════════════════════ */

if(!CanvasRenderingContext2D.prototype.roundRect){
  CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){
    if(typeof r==="number")r=[r,r,r,r]; else if(!Array.isArray(r))r=[0,0,0,0];
    const m=Math.min(Math.abs(w),Math.abs(h))/2;
    const c=r.map(v=>Math.min(v,m));
    this.moveTo(x+c[0],y);
    this.lineTo(x+w-c[1],y); this.quadraticCurveTo(x+w,y,x+w,y+c[1]);
    this.lineTo(x+w,y+h-c[2]); this.quadraticCurveTo(x+w,y+h,x+w-c[2],y+h);
    this.lineTo(x+c[3],y+h); this.quadraticCurveTo(x,y+h,x,y+h-c[3]);
    this.lineTo(x,y+c[0]); this.quadraticCurveTo(x,y,x+c[0],y);
    return this;
  };
}

const $=id=>document.getElementById(id);
const cv=$("game");
const ctx=cv.getContext("2d",{alpha:false})||cv.getContext("2d");
if(!ctx){
  /* No 2D canvas at all — report it instead of hanging on the spinner */
  if(window.__jjaReveal)window.__jjaReveal(
    "This browser did not provide a 2D canvas, so the game cannot draw. "+
    "Close some tabs or other apps and reload.",true);
  return;
}
const clamp=(v,a,b)=>v<a?a:v>b?b:v;

/* device / capability probes done once */
const IOS=/iP(hone|ad|od)/.test(navigator.platform||"")||
          (/Mac/.test(navigator.platform||"")&&navigator.maxTouchPoints>1);
const IPHONE=/iPhone|iPod/.test(navigator.userAgent)||(IOS&&!/iPad/.test(navigator.userAgent)&&Math.min(screen.width,screen.height)<500);
const TOUCH=("ontouchstart" in window)||navigator.maxTouchPoints>0;
const CAN_FS=!!(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen);
let usedTouch=TOUCH&&!matchMedia("(pointer:fine)").matches;
/* Developer overlay. Off for every normal player: it is gated on the same
   ?debug=1 query flag as the test hook, so a shipped build never shows it
   and it costs nothing (the draw call is behind this constant). */
const DBG=/[?&]debug=1\b/.test(location.search);
let dbgFps=60,dbgLast=0,dbgAcc=0,dbgN=0;

/* ══════ OPTIONS ══════════════════════════════════════════════════
   Read from the DOM once per change, never inside the game loop.
   The original called getElementById up to ~20x per rendered frame. */
/* OPT_DEF is the single source of truth for every player setting: its
   defaults, and (via adopt()) how an old or malformed save is coerced.
   Settings used to live only in the DOM, so every one of them reset on
   reload — sound, volume, Calm Mode, Battery Saver, inverted steer and the
   daily-modifier toggle all forgot themselves between sessions. */
const OPT_DEF={snd:true,vib:true,calm:false,bat:false,inv:false,mod:true,vol:.42,scheme:"gesture"};
const SCHEMES=["gesture","buttons"];
const OPT={...OPT_DEF};
let reduced=matchMedia("(prefers-reduced-motion: reduce)").matches;
try{matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change",e=>{reduced=e.matches;});}catch(e){}
let autoLite=false;                       // set by the adaptive-quality watchdog
const calm =()=>OPT.calm||reduced;
const saver=()=>OPT.bat||autoLite;
/* DOM -> OPT -> SAVE. Persisting here means every settings change survives a
   reload, whichever control changed it. optsReady gates the write so the
   startup call (which runs before load()) cannot save defaults over a real
   save file. */
let optsReady=false;
function syncOpts(){
  OPT.snd=$("oSnd").checked; OPT.vib=$("oVib").checked; OPT.calm=$("oCalm").checked;
  OPT.bat=$("oBat").checked; OPT.inv=$("oInv").checked; OPT.mod=$("oMod").checked;
  OPT.vol=(+$("oVol").value||0)/100; $("volNum").textContent=Math.round(OPT.vol*100);
  if(!optsReady)return;
  SAVE.opt={snd:OPT.snd,vib:OPT.vib,calm:OPT.calm,bat:OPT.bat,
            inv:OPT.inv,mod:OPT.mod,vol:OPT.vol,scheme:OPT.scheme};
  save();
}
/* SAVE -> DOM -> OPT, run once after the save file is read. */
function applyOpts(){
  const o=SAVE.opt||OPT_DEF;
  $("oSnd").checked=!!o.snd; $("oVib").checked=!!o.vib; $("oCalm").checked=!!o.calm;
  $("oBat").checked=!!o.bat; $("oInv").checked=!!o.inv; $("oMod").checked=!!o.mod;
  $("oVol").value=Math.round(clamp(Number(o.vol),0,1)*100);
  OPT.scheme=SCHEMES.includes(o.scheme)?o.scheme:OPT_DEF.scheme;
  optsReady=true;
  syncOpts();
  setVol(OPT.vol);
  syncSchemeUI();
}

/* ══════ VIEWPORT ═════════════════════════════════════════════════
   WH is the playable band. The canvas may be taller than the band on
   tall phones; WY is the band's offset so the HUD can hug the action
   instead of drifting into the letterbox (the original bug). */
const WH=450;
let W=900,H=450,VS=1,WY=0,DPR=1;
function vpW(){const v=window.visualViewport;return Math.max(1,Math.round(v?v.width:innerWidth));}
function vpH(){const v=window.visualViewport;return Math.max(1,Math.round(v?v.height:innerHeight));}
let portrait=false;
let safeTop=0;                            /* notch inset, in canvas units */
function readSafeTop(){
  try{
    const probe=document.createElement("div");
    probe.style.cssText="position:fixed;top:0;left:0;height:env(safe-area-inset-top,0px);width:0";
    document.body.appendChild(probe);
    const px=parseFloat(getComputedStyle(probe).height)||0;
    probe.remove();
    return px;
  }catch(e){return 0;}
}
function resize(){
  const vw=vpW(),vh=vpH(),ar=vw/vh;
  portrait=ar<1.15;
  if(!portrait){ H=WH; W=Math.round(clamp(WH*ar,620,1400)); }
  else{
    /* narrower virtual width than the original 600 => the band renders
       ~12% larger on a phone held upright, without losing the read-ahead */
    W=540; H=Math.round(clamp(540/ar,WH*1.05,1500));
  }
  WY=(H-WH)/2;
  DPR=Math.min(devicePixelRatio||1,saver()?1:2);
  cv.width=Math.round(W*DPR);cv.height=Math.round(H*DPR);
  const s=Math.min(vw/W,vh/H);
  cv.style.width=(W*s)+"px";cv.style.height=(H*s)+"px";
  VS=s;
  /* HUD sits at the true top of the screen, so it must clear the notch.
     The canvas is not padded by safe-area insets, so convert the inset
     into canvas units. */
  safeTop=Math.min(60,(readSafeTop()||0)/Math.max(.0001,s));
  skyKey="";                              // invalidate cached gradient
  updateRot();
}
let rzT=0;
function resizeSoon(){clearTimeout(rzT);rzT=setTimeout(resize,60);}
addEventListener("resize",resizeSoon);
/* An orientation change resizes the canvas underneath a live run, and the
   viewport keeps moving for a few hundred ms afterwards. Pause the run,
   drop every held input, and only resume once the size has settled — so a
   rotation can never cost the player a heart. */
let rotating=0;
addEventListener("orientationchange",()=>{
  rotating=1;
  if(ST==="play"&&!paused)togglePause();
  setTimeout(resize,60);
  setTimeout(()=>{resize();rotating=0;},320);
});
if(window.visualViewport){
  visualViewport.addEventListener("resize",resizeSoon);
  visualViewport.addEventListener("scroll",resizeSoon);
}

/* portrait hint (the shipped #rot markup/CSS was never wired up) */
let rotDismissed=false;
function updateRot(){
  /* advice only, and only on the menu — never over live gameplay, and
     never in a position or z-order that can intercept a Start tap */
  const want=portrait&&usedTouch&&!rotDismissed&&vpW()<820&&ST!=="play";
  $("rot").classList.toggle("show",want);
}

/* ══════ SAVE ═════════════════════════════════════════════════════
   The original only spoke to window.storage (a sandbox-host API that
   does not exist in Safari or Chrome), so nothing was ever persisted
   in a real browser. localStorage is now the primary store. */
const DEF_SEL="OJ";
/* OPT_DEF is the single source of truth for every player setting: its
   defaults, and (via typeof) how adopt() coerces an old or malformed save.
   Settings used to live only in the DOM, so every one of them reset on
   reload — sound, volume, Calm Mode, Battery Saver, inverted steer and the
   daily-modifier toggle all forgot themselves between sessions. */
/* The six launch heroes are unlocked from the start: a new player should
   meet the whole cast — and the whole art identity — in the first minute,
   not after an hour of grinding. The 28-hero unlock ladder above them is
   untouched, so long-term progression is unchanged. */
const STARTERS=["OJ","Straw","Kiwi","Grape","Mango","Pine"];
const SAVE={best:0,coins:0,xp:0,unlocked:STARTERS.slice(),sel:DEF_SEL,msDate:"",msProg:[0,0,0,0],
            msDone:[0,0,0,0],ach:{},totalOrbs:0,juiceRuns:0,tut:0,bossKills:0,
            fruit:{straw:0,mango:0,lemon:0,kiwi:0},brew:"",
            streak:0,lastDay:"",maxCombo:0,opt:{...OPT_DEF}};
const KEY="jja2";
const LVXP=lv=>250+lv*180;
function level(){let lv=1,x=Math.max(0,SAVE.xp|0),n=0;
  while(x>=LVXP(lv)&&n++<400){x-=LVXP(lv);lv++;}
  return{lv,x,need:LVXP(lv)};}
const today=()=>{const d=new Date();return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate();};

function save(){
  const s=JSON.stringify(SAVE);
  try{localStorage.setItem(KEY,s);}catch(e){}
  try{if(window.storage&&window.storage.set)window.storage.set(KEY,s).catch(()=>{});}catch(e){}
}
/* Defensive: a corrupt or older save must not be able to inject NaN /
   wrong types / unknown runner ids into the running game. */
function adopt(raw){
  if(!raw||typeof raw!=="object")return;
  const num=(v,d,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?clamp(Math.floor(n),lo,hi):d;};
  SAVE.best=num(raw.best,0,0,9e6); SAVE.coins=num(raw.coins,0,0,9e9);
  SAVE.xp=num(raw.xp,0,0,9e9);     SAVE.totalOrbs=num(raw.totalOrbs,0,0,9e9);
  SAVE.juiceRuns=num(raw.juiceRuns,0,0,9e6); SAVE.bossKills=num(raw.bossKills,0,0,9e6);
  SAVE.tut=raw.tut?1:0;
  SAVE.fruit={straw:0,mango:0,lemon:0,kiwi:0};
  if(raw.fruit&&typeof raw.fruit==="object")
    for(const k in SAVE.fruit)SAVE.fruit[k]=num(raw.fruit[k],0,0,999999);
  SAVE.brew=BREWS[raw.brew]?raw.brew:"";
  SAVE.streak=num(raw.streak,0,0,99999);
  SAVE.lastDay=typeof raw.lastDay==="string"?raw.lastDay:"";
  SAVE.maxCombo=num(raw.maxCombo,0,0,999999);
  SAVE.fruitTotal=num(raw.fruitTotal,0,0,9999999);
  SAVE.skin=SKINS.some(k=>k.id===raw.skin)?raw.skin:"classic";
  SAVE.brewed={}; if(raw.brewed&&typeof raw.brewed==="object")
    for(const k in raw.brewed)if(BREWS[k]&&raw.brewed[k])SAVE.brewed[k]=1;
  SAVE.msDate=typeof raw.msDate==="string"?raw.msDate:"";
  for(let i=0;i<4;i++){
    SAVE.msProg[i]=num(raw.msProg&&raw.msProg[i],0,0,9e7);
    SAVE.msDone[i]=(raw.msDone&&raw.msDone[i])?1:0;
  }
  SAVE.ach={}; if(raw.ach&&typeof raw.ach==="object")
    for(const k in raw.ach)if(raw.ach[k])SAVE.ach[k]=1;
  /* Settings migration. A save from before settings were persisted has no
     `opt` block at all, and a corrupt one may have any type in any field —
     both must land on the validated defaults rather than poisoning OPT with
     NaN or a string. Progression above is untouched by this. */
  SAVE.opt={...OPT_DEF};
  const ro=raw.opt;
  if(ro&&typeof ro==="object"){
    for(const k in OPT_DEF){
      if(k==="vol"){
        const n=Number(ro.vol);
        SAVE.opt.vol=Number.isFinite(n)?clamp(n,0,1):OPT_DEF.vol;
      } else if(k==="scheme"){
        SAVE.opt.scheme=SCHEMES.includes(ro.scheme)?ro.scheme:OPT_DEF.scheme;
      } else if(ro[k]!==undefined){
        SAVE.opt[k]=!!ro[k];
      }
    }
  }
  /* ── ROSTER MIGRATION ───────────────────────────────────────────
     The cast was renamed in the visual redesign, so a save written by an
     earlier build lists hero ids that no longer exist and cannot be
     drawn. Dropping them silently would take heroes a player had already
     unlocked, so instead:
       1. keep every id that still exists
       2. always grant the six launch heroes
       3. top the roster back up to its original SIZE with the cheapest
          heroes the player does not already own
     A returning player therefore ends up with at least as many heroes as
     they had, and never fewer than a brand-new player. Coins, XP, awards,
     fruit, streak and best distance are untouched. */
  const ids=new Set(CHARS.map(c=>c.id));
  const rawUn=Array.isArray(raw.unlocked)?[...new Set(raw.unlocked)]:[];
  const kept=rawUn.filter(v=>ids.has(v));
  const owned=new Set(STARTERS.concat(kept));
  const want=Math.max(rawUn.length,owned.size);
  if(owned.size<want){
    const spare=CHARS.slice().sort((a,b)=>a.rar-b.rar).filter(c=>!owned.has(c.id));
    for(let i=0;i<spare.length&&owned.size<want;i++)owned.add(spare[i].id);
  }
  SAVE.unlocked=[...owned];
  SAVE.sel=ids.has(raw.sel)&&SAVE.unlocked.includes(raw.sel)?raw.sel:SAVE.unlocked[0];
}
function load(){
  const go=()=>{applyOpts();rollStreak();rollMissions();rollMod();paintAll();bootDone();};
  let got=null;
  try{const s=localStorage.getItem(KEY);if(s)got=JSON.parse(s);}catch(e){}
  if(got){adopt(got);go();return;}
  try{
    if(window.storage&&window.storage.get)
      window.storage.get(KEY).then(r=>{
        if(r&&r.value){try{adopt(JSON.parse(r.value));}catch(e){}}
        go();
      }).catch(go);
    else go();
  }catch(e){go();}
}
/* ══════ AUDIO ════════════════════════════════════════════════════
   Why there was no sound on mobile — five separate causes, all fixed:

   1. `new (AudioContext||webkitAudioContext)()` — a bare identifier.
      Under "use strict", if AudioContext is undefined this throws a
      ReferenceError before webkitAudioContext is ever consulted; the
      surrounding try/catch then set AC=null and the game went silent
      forever with no diagnostic. Now window-qualified.
   2. resume() was never called. iOS Safari and Android Chrome hand back
      a context in the "suspended" state; it only starts if resumed from
      inside a user gesture. Now resumed on every gesture and whenever
      the page becomes visible again.
   3. iOS routes bare WebAudio through the *ringer* channel, so the
      hardware Silent switch mutes it. Playing a silent looping
      HTMLAudioElement promotes the page to the media/playback session,
      which survives the switch on iOS 15+. Started on first gesture.
   4. iOS suspends (and on interruption "interrupts") the context when
      the app is backgrounded or a call arrives. There was no recovery
      path, so one app-switch silenced the rest of the session.
   5. The music scheduler was a bare setInterval catch-up loop. After a
      background/suspend, AC.currentTime jumps forward by seconds while
      mnext stays behind, so the while-loop scheduled thousands of
      oscillators in one tick — an audio-thread stall that also reads
      as "sound broke". The scheduler is now bounded and re-anchors. */

const ACtor=window.AudioContext||window.webkitAudioContext||null;
let AC=null,mst=null,mg=[],mstep=0,mnext=0,ambG=null,silentEl=null;
let audioState="idle";                     // idle | blocked | ready | error
let musicOn=false;

function silentWavURL(){
  /* 0.6 s of 8-bit silence, generated in-page: no external asset, so it
     also works offline and behind a strict CSP. */
  const sr=8000,n=Math.round(sr*.6),buf=new ArrayBuffer(44+n),v=new DataView(buf);
  const wr=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};
  wr(0,"RIFF");v.setUint32(4,36+n,true);wr(8,"WAVEfmt ");
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr,true);v.setUint16(32,1,true);v.setUint16(34,8,true);
  wr(36,"data");v.setUint32(40,n,true);
  for(let i=0;i<n;i++)v.setUint8(44+i,128);   // 128 == silence for unsigned 8-bit
  const b=new Uint8Array(buf);let s="";
  for(let i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);
  return "data:audio/wav;base64,"+btoa(s);
}
function startMediaSession(){
  if(silentEl)return;
  try{
    silentEl=new Audio(silentWavURL());
    silentEl.loop=true; silentEl.volume=0; silentEl.setAttribute("playsinline","");
    const p=silentEl.play(); if(p&&p.catch)p.catch(()=>{});
  }catch(e){}
}

function initAudio(){
  if(AC){resumeAudio();return;}
  if(!ACtor){audioState="error";return;}
  try{
    AC=new ACtor();
    mst=AC.createGain();mst.gain.value=OPT.vol;mst.connect(AC.destination);
    mg=[];
    for(let i=0;i<4;i++){const g=AC.createGain();g.gain.value=.0001;g.connect(mst);mg.push(g);}
    /* filtered noise bed */
    const L=Math.round(AC.sampleRate*2),b=AC.createBuffer(1,L,AC.sampleRate),d=b.getChannelData(0);
    let l=0;for(let i=0;i<L;i++){const w=Math.random()*2-1;l=(l+.02*w)/1.02;d[i]=l*3;}
    const s=AC.createBufferSource();s.buffer=b;s.loop=true;
    const lpf=AC.createBiquadFilter();lpf.type="lowpass";lpf.frequency.value=400;
    ambG=AC.createGain();ambG.gain.value=.0001;
    s.connect(lpf);lpf.connect(ambG);ambG.connect(mst);s.start();
    mnext=AC.currentTime+.08;
    /* an inaudible click through the graph: on some WebKit builds the
       context stays latched until at least one source has actually run */
    const kick0=AC.createBufferSource();
    kick0.buffer=AC.createBuffer(1,1,AC.sampleRate);kick0.connect(AC.destination);kick0.start(0);
  }catch(e){AC=null;audioState="error";return;}
  startMediaSession();
  resumeAudio(true);
}
function resumeAudio(announce){
  if(!AC){return;}
  const done=()=>{
    if(AC.state==="running"){
      const was=audioState; audioState="ready";
      if(announce&&was!=="ready")snack(IPHONE
        ? "Sound on — if silent, check the side Silent switch"
        : "Sound on");
    } else audioState="blocked";
    diag();
  };
  try{
    if(AC.state!=="running"){const p=AC.resume();p&&p.then?p.then(done,done):done();}
    else done();
  }catch(e){audioState="blocked";}
  if(silentEl&&silentEl.paused){try{const p=silentEl.play();p&&p.catch&&p.catch(()=>{});}catch(e){}}
}
const sndOk=()=>!!AC&&OPT.snd&&AC.state==="running";
function diag(){
  const el=$("audioDiag");if(!el)return;
  el.textContent="Audio: "+(AC?AC.state:audioState)+(AC?" · "+(OPT.snd?"on":"muted"):"");
}
/* Every plausible first-gesture surface unlocks audio. The original only
   hooked canvas pointerdown + the Start button, and on the menu the
   canvas is covered by an overlay, so several paths in reached gameplay
   with a still-suspended context. */
["pointerdown","touchend","mousedown","keydown","click"].forEach(ev=>
  addEventListener(ev,()=>{initAudio();},{passive:true,capture:true}));
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible"){resumeAudio();}
  else if(ST==="play"&&!paused){togglePause();}     // auto-pause on app switch
});
addEventListener("blur",()=>{steer=0;prime=null;jumpHeld=false;kbd.l=kbd.r=false;});
addEventListener("focus",()=>{resumeAudio();});

/* ── music: bounded scheduler, driven from the render loop ──
   Called once per rendered frame instead of setInterval, and it
   re-anchors if it has fallen behind, so a suspended tab can never
   trigger a thousand-note catch-up burst. */
const SC=[0,3,5,7,10,12];
function musicTick(){
  if(!sndOk()||!musicOn)return;
  const now=AC.currentTime;
  if(mnext<now-.25)mnext=now+.05;                     // fell behind: re-anchor
  const spb=60/(juice>0?150:128)/4;
  let guard=0;
  while(mnext<now+.14&&guard++<16){
    const s=mstep%16;
    if(s===0||s===6||s===10)tn(mg[0],110,mnext,.5,"triangle",.24);
    if(s%4===0)kick(mnext);
    if(s%2===0)tn(mg[2],220*Math.pow(2,SC[(mstep*3)%SC.length]/12),mnext,.15,"square",.085);
    if(s%2===1)tn(mg[3],880*Math.pow(2,SC[(mstep*5)%SC.length]/12),mnext,.09,"triangle",.05);
    mnext+=spb;mstep++;
  }
}
function tn(dest,f,t,dur,ty,v){
  if(!AC)return;
  const o=AC.createOscillator(),g=AC.createGain();
  o.type=ty;o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(.0001,t);
  g.gain.exponentialRampToValueAtTime(Math.max(.0002,v),t+.008);
  g.gain.exponentialRampToValueAtTime(.0001,t+dur);
  o.connect(g);g.connect(dest);o.start(t);o.stop(t+dur+.05);}
function kick(t){
  if(!AC)return;
  const o=AC.createOscillator(),g=AC.createGain();o.type="sine";
  o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(45,t+.11);
  g.gain.setValueAtTime(.8,t);g.gain.exponentialRampToValueAtTime(.0001,t+.19);
  o.connect(g);g.connect(mg[1]);o.start(t);o.stop(t+.22);}
function layers(n){
  musicOn=n>0;
  if(!AC)return;
  const on=OPT.snd&&musicOn;
  mg.forEach((g,i)=>g.gain.setTargetAtTime(on&&i<=n?(i===0?.8:.45):.0001,AC.currentTime,.35));
  if(ambG)ambG.gain.setTargetAtTime(on?.08:.0001,AC.currentTime,.5);}
function setVol(v){if(mst&&AC)mst.gain.setTargetAtTime(v,AC.currentTime,.05);}

/* ── one-shots ── */
function bl(f1,f2,d,ty,v){
  if(!sndOk())return;
  const t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();o.type=ty;
  o.frequency.setValueAtTime(f1,t);o.frequency.exponentialRampToValueAtTime(Math.max(1,f2),t+d*.8);
  g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(g);g.connect(mst);o.start(t);o.stop(t+d+.03);}
function nzs(d,v,f,q){
  if(!sndOk())return;
  const t=AC.currentTime,n=Math.max(1,(AC.sampleRate*d)|0);
  const b=AC.createBuffer(1,n,AC.sampleRate),a=b.getChannelData(0);
  for(let i=0;i<n;i++)a[i]=(Math.random()*2-1)*(1-i/n);
  const s=AC.createBufferSource();s.buffer=b;const bp=AC.createBiquadFilter();
  bp.type="bandpass";bp.frequency.value=f;if(q)bp.Q.value=q;
  const g=AC.createGain();g.gain.value=v;
  s.connect(bp);bp.connect(g);g.connect(mst);s.start(t);}
function arp(notes,root,step,dur,ty,v){
  if(!sndOk())return;
  notes.forEach((n,i)=>tn(mst,root*Math.pow(2,n/12),AC.currentTime+i*step,dur,ty,v));}

function sfx(k,x){
  if(!sndOk())return;
  switch(k){
  case"jump":     bl(300,760,.11,"triangle",.17);break;
  case"dbl":      bl(480,1020,.12,"square",.14);break;
  case"dash":     nzs(.14,.16,2200);bl(700,240,.14,"sawtooth",.12);break;
  case"land":     bl(190,70,.1,"sine",.1+.2*(x||0));nzs(.06,.05+.07*(x||0),900);break;
  case"step":     nzs(.045,.04,1600);break;
  case"orb":      bl(620+Math.min(x||0,18)*44,1180+Math.min(x||0,18)*44,.09,"square",.12);break;
  case"cry":      arp([0,7,12,19],660,.05,.3,"triangle",.15);break;
  case"hurt":     bl(260,80,.24,"sawtooth",.2);break;
  case"juice":    arp([0,4,7,12,16,19],440,.05,.4,"triangle",.16);
                  nzs(.5,.1,700,2);break;
  case"juiceEnd": arp([12,7,4,0],440,.06,.26,"triangle",.11);break;   /* new: audible wind-down */
  case"juiceExt": arp([0,7,12],880,.035,.2,"triangle",.13);break;     /* new: +0.5s extension  */
  case"juiceLast":bl(660,330,.18,"triangle",.12);break;               /* new: final-second cue */
  case"bossWeak": arp([0,5,12],520,.05,.26,"sine",.11);break;         /* new: weak point open  */
  case"bossFlee": bl(520,180,.5,"sine",.13);break;                    /* new: boss escaped     */
  case"stomp":    bl(420,160,.1,"square",.15);break;
  case"bossHit":  bl(300,120,.18,"square",.2);nzs(.18,.16,520,1.4);   /* new: heavier than a stomp */
                  bl(140,70,.24,"sine",.16);break;
  case"explode":  nzs(.75,.3,240,.7);bl(180,32,.8,"sawtooth",.22);    /* new */
                  bl(90,28,.9,"sine",.2);break;
  case"victory":  arp([0,4,7,12,16,19,24],523.25,.09,.55,"triangle",.17); /* new fanfare */
                  arp([0,7,12],261.63,.09,.9,"square",.09);break;
  case"siren":    bl(400,900,.35,"sawtooth",.12);bl(900,400,.35,"sawtooth",.1);break;
  case"dead":     bl(320,55,.55,"sawtooth",.19);break;
  case"click":    bl(500,660,.05,"square",.08);break;
  case"ding":     arp([0,7,12],660,.06,.28,"square",.12);break;
  case"unlock":   arp([0,5,9,14],440,.07,.32,"triangle",.14);break;
  case"nope":     bl(200,140,.13,"square",.1);break;}
}
function buzz(p){if(OPT.vib&&navigator.vibrate)try{navigator.vibrate(p);}catch(e){}}

/* transient toast, used for the audio confirmation and tutorial beats */
let snackT=0;
function snack(msg,ms){
  const el=$("snack");if(!el)return;
  el.textContent=msg;el.classList.add("show");
  clearTimeout(snackT);snackT=setTimeout(()=>el.classList.remove("show"),ms||2600);
}
/* ══════ JUICE LAB ════════════════════════════════════════════════
   Fruit drops during runs and from bosses. Spend it in the Lab to brew a
   juice that changes what Juice Mode does on your next run. One brew is
   equipped at a time and it is consumed when you use it, so there is a
   reason to keep collecting. */
const FRUIT={
  straw:{n:"Strawberry",icon:"🍓",col:"#FF5F7A"},
  mango:{n:"Mango",     icon:"🥭",col:"#FFAA3B"},
  lemon:{n:"Lemon",     icon:"🍋",col:"#FFE24A"},
  kiwi: {n:"Kiwi",      icon:"🥝",col:"#7BD86A"}};
const BREWS={
  lightning:{n:"Lightning Juice",icon:"⚡",col:"#FFE24A",
    cost:{lemon:3,kiwi:1},
    t:"Juice Mode also makes you 35% faster and zaps enemies you pass"},
  mega:{n:"Mega Juice",icon:"💪",col:"#FF7A3B",
    cost:{straw:3,mango:2},
    t:"Juice Mode makes you huge — wider shockwave, +25% meter gain"},
  rainbow:{n:"Rainbow Juice",icon:"🌈",col:"#FF8AD8",
    cost:{straw:2,mango:2,lemon:2,kiwi:2},
    t:"Juice Mode lasts 60% longer and juice drops are worth triple"}};
let BREW=null;                             /* brew active this run */
function fruitTotal(){let n=0;for(const k in SAVE.fruit)n+=SAVE.fruit[k]|0;return n;}
function canBrew(k){
  const c=BREWS[k].cost;
  for(const f in c)if((SAVE.fruit[f]|0)<c[f])return false;
  return true;}
function doBrew(k){
  if(!canBrew(k)){sfx("nope");snack("Not enough fruit for "+BREWS[k].n);return;}
  const c=BREWS[k].cost;
  for(const f in c)SAVE.fruit[f]-=c[f];
  SAVE.brew=k;sfx("unlock");save();paintAll();paintLab();
  snack(BREWS[k].icon+" "+BREWS[k].n+" ready — it applies to your next run");}

/* ══════ MISSIONS / AWARDS ═════════════════════════════════════════ */
const MPOOL=[
 {id:"jump",t:n=>"Jump "+n+" times in a run",amt:[40,60,90]},
 {id:"dist",t:n=>"Travel "+n+"m in a run",amt:[600,900,1200]},
 {id:"orbs",t:n=>"Collect "+n+" juice drops in a run",amt:[60,100,150]},
 {id:"perf",t:n=>"Perfect-land "+n+" times in a run",amt:[15,25,40]},
 {id:"cryst",t:n=>"Grab "+n+" juice gems in a run",amt:[3,6,10]},
 {id:"juice",t:n=>"Trigger Juice Mode "+n+"×",amt:[2,3,5]}];
let MS=[];
function seeded(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  return()=>{h^=h<<13;h^=h>>>17;h^=h<<5;return((h>>>0)/4294967296);};}
/* login streak, for the "7 days in a row" award */
function rollStreak(){
  const t=today();
  if(SAVE.lastDay===t)return;
  const y=new Date();y.setDate(y.getDate()-1);
  const yk=y.getFullYear()+"-"+(y.getMonth()+1)+"-"+y.getDate();
  SAVE.streak=(SAVE.lastDay===yk)?SAVE.streak+1:1;
  SAVE.lastDay=t;save();}
function rollMissions(){
  const r=seeded(today()),p=MPOOL.slice();MS=[];
  for(let i=0;i<4;i++){const m=p.splice(Math.floor(r()*p.length),1)[0];
    MS.push({...m,need:m.amt[Math.floor(r()*m.amt.length)]});}
  if(SAVE.msDate!==today()){SAVE.msDate=today();SAVE.msProg=[0,0,0,0];SAVE.msDone=[0,0,0,0];save();}}
/* "max" == best single run (the mission text now says so explicitly —
   the original read as cumulative but was scored per-run). */
function bumpMs(id,v,mode){
  MS.forEach((m,i)=>{
    if(m.id!==id||SAVE.msDone[i])return;
    SAVE.msProg[i]=mode==="max"?Math.max(SAVE.msProg[i],v):SAVE.msProg[i]+v;
    if(SAVE.msProg[i]>=m.need){SAVE.msDone[i]=1;SAVE.coins+=2600;SAVE.xp+=120;sfx("ding");}});}
const ACH=[
 {id:"a1",t:"Travel 500m in one run",chk:()=>SAVE.best>=500},
 {id:"a2",t:"Travel 1200m in one run",chk:()=>SAVE.best>=1200},
 {id:"a3",t:"Collect 500 juice drops total",chk:()=>SAVE.totalOrbs>=500},
 {id:"a4",t:"Trigger Juice Mode 10 times",chk:()=>SAVE.juiceRuns>=10},
 {id:"a5",t:"Reach level 5",chk:()=>level().lv>=5},
 /* was "Unlock every runner" but only checked 6 of 30 — text and test
    now agree, and the real completionist goal is its own award */
 {id:"a6",t:"Unlock 10 juice heroes",chk:()=>SAVE.unlocked.length>=10},
 {id:"a9",t:"Unlock all 34 juice heroes",chk:()=>SAVE.unlocked.length>=CHARS.length},
 {id:"a7",t:"Defeat the Watermelon King",chk:()=>SAVE.bossKills>=1},
 {id:"a8",t:"Defeat 10 bosses",chk:()=>SAVE.bossKills>=10},
 {id:"a10",t:"Run 1000m in one run",chk:()=>SAVE.best>=1000},
 {id:"a11",t:"Collect 2000 juice drops total",chk:()=>SAVE.totalOrbs>=2000},
 {id:"a12",t:"Play 7 days in a row",chk:()=>SAVE.streak>=7},
 {id:"a13",t:"Reach a ×25 combo",chk:()=>SAVE.maxCombo>=25},
 {id:"a14",t:"Brew every juice at least once",chk:()=>SAVE.brewed&&Object.keys(BREWS).every(k=>SAVE.brewed[k])},
 {id:"a15",t:"Harvest 50 fruit",chk:()=>(SAVE.fruitTotal|0)>=50}];
/* cosmetic rewards, unlocked by award count — these retint Juice Mode */
const SKINS=[
 {id:"classic",n:"Classic",need:0,hue:-1},
 {id:"citrus", n:"Citrus glow",need:3,hue:48},
 {id:"berry",  n:"Berry glow",need:6,hue:330},
 {id:"mint",   n:"Mint glow",need:9,hue:150},
 {id:"void",   n:"Void glow",need:12,hue:265}];
const achCount=()=>ACH.reduce((n,a)=>n+(SAVE.ach[a.id]?1:0),0);
function skinsOwned(){return SKINS.filter(k=>achCount()>=k.need);}
function checkAch(){ACH.forEach(a=>{if(!SAVE.ach[a.id]&&a.chk()){SAVE.ach[a.id]=1;SAVE.coins+=2500;sfx("unlock");}});}
/* ══════════════════════════════════════════════════════════════════
   JUMP JUICE — ART DIRECTION
   A single painter library shared by heroes, enemies, bosses, props
   and UI chrome, so everything on screen is unmistakably one cast.

   Rules of the style, encoded here rather than repeated per sprite:
     · one warm ink line (INK) — never cold black, never pure #000
     · rounded silhouettes, readable at 22x30 on a phone
     · soft dimensional shading: a darker rim, then a gloss highlight
     · large expressive eyes with a shine dot
     · fruit materials differ (smooth skin, fuzz, jelly, rind, liquid)

   Performance: no shadowBlur anywhere in the per-frame path (glow is
   pre-rendered into sprites by makeGlow), no clip() calls, and every
   helper is fill/stroke only so a frame stays inside budget on a
   low-end phone.
   ══════════════════════════════════════════════════════════════════ */
const INK="#41230F";                    /* the one outline colour */
const PAL={
  oj:"#FF9A2E",   ojD:"#D9600A",   ojL:"#FFC983",
  gold:"#FFC93C", goldD:"#D99508",
  berry:"#FF4D6D",berryD:"#C41B41",
  grape:"#9B54DC",grapeD:"#61269B",
  kiwi:"#9BD94F", kiwiD:"#4C8C22", fuzz:"#B08B5A", fuzzD:"#7C5C34",
  mango:"#FFB733",mangoD:"#E0790C",
  pine:"#FFD23B", pineD:"#C08608",
  leaf:"#54B84E", leafD:"#2C7430",
  cream:"#FFF6E4",
  melon:"#63C24A",melonD:"#2F7A2A",flesh:"#FF5A6E",
  soda:"#6B4326", sodaD:"#3A2210", foam:"#F5E7D2",
  rot:"#8FA65C",  rotD:"#5E7136"};

/* stroke the current path with the house ink line */
function ink(c,lw){c.strokeStyle=INK;c.lineWidth=lw===undefined?2.2:lw;
  c.lineJoin="round";c.lineCap="round";c.stroke();c.lineCap="butt";}

/* A shaded fruit body: darker rim underneath, lighter skin on top,
   then the ink line. Three fills and one stroke — no clipping. */
function body(c,x,y,rx,ry,col,dark,lw){
  if(dark){c.fillStyle=dark;c.beginPath();c.ellipse(x,y,rx,ry,0,0,7);c.fill();
    c.fillStyle=col;c.beginPath();c.ellipse(x-rx*.07,y-ry*.10,rx*.93,ry*.90,0,0,7);c.fill();}
  else{c.fillStyle=col;c.beginPath();c.ellipse(x,y,rx,ry,0,0,7);c.fill();}
  c.beginPath();c.ellipse(x,y,rx,ry,0,0,7);ink(c,lw);}

/* rounded-rect body, same shading contract (cartons, tanks, cans) */
function boxBody(c,x,y,w,h,r,col,dark,lw){
  if(dark){c.fillStyle=dark;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();
    c.fillStyle=col;c.beginPath();c.roundRect(x,y,w*.92,h*.94,r);c.fill();}
  else{c.fillStyle=col;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
  c.beginPath();c.roundRect(x,y,w,h,r);ink(c,lw);}

/* the gloss highlight that makes skin read as juicy rather than flat */
function shine(c,x,y,rx,ry,rot,a){
  c.fillStyle="rgba(255,255,255,"+(a===undefined?.55:a)+")";
  c.beginPath();c.ellipse(x,y,rx,ry,rot||0,0,7);c.fill();}

/* leaf — the recurring motif on almost every hero */
function leafAt(c,x,y,s,rot,col,lw){
  c.save();c.translate(x,y);c.rotate(rot||0);
  c.fillStyle=col||PAL.leaf;c.beginPath();
  c.moveTo(0,0);c.quadraticCurveTo(s*.75,-s*.62,s*1.7,0);
  c.quadraticCurveTo(s*.75,s*.62,0,0);c.fill();ink(c,lw===undefined?1.7:lw);
  c.strokeStyle=PAL.leafD;c.lineWidth=1;c.beginPath();
  c.moveTo(s*.18,0);c.lineTo(s*1.45,0);c.stroke();
  c.restore();}

function stem(c,x,y,h,w,col){
  c.strokeStyle=col||PAL.leafD;c.lineWidth=w||2.6;c.lineCap="round";
  c.beginPath();c.moveTo(x,y);c.lineTo(x,y-h);c.stroke();c.lineCap="butt";}

/* Large expressive eyes. `op` squashes them for a blink, `look` shifts
   the pupils so a character can glance where it is running. */
function eyes(c,cx,cy,sp,r,look,op){
  const o=op===undefined?1:Math.max(.06,op);
  for(let i=-1;i<=1;i+=2){
    const ex=cx+i*sp;
    c.fillStyle="#FFFFFF";c.beginPath();c.ellipse(ex,cy,r,r*o,0,0,7);c.fill();
    c.beginPath();c.ellipse(ex,cy,r,r*o,0,0,7);ink(c,1.5);
    if(o>.34){
      c.fillStyle=INK;c.beginPath();c.arc(ex+(look||0)*r*.3,cy,r*.46,0,7);c.fill();
      c.fillStyle="rgba(255,255,255,.92)";
      c.beginPath();c.arc(ex+(look||0)*r*.3-r*.17,cy-r*.21,r*.18,0,7);c.fill();}}}

/* one big eye — cyclops enemies and the Soda Monster */
function eye1(c,x,y,r,look,op){
  const o=op===undefined?1:Math.max(.06,op);
  c.fillStyle="#FFFFFF";c.beginPath();c.ellipse(x,y,r,r*o,0,0,7);c.fill();
  c.beginPath();c.ellipse(x,y,r,r*o,0,0,7);ink(c,1.8);
  if(o>.34){c.fillStyle=INK;c.beginPath();c.arc(x+(look||0)*r*.28,y,r*.44,0,7);c.fill();
    c.fillStyle="rgba(255,255,255,.9)";c.beginPath();c.arc(x+(look||0)*r*.28-r*.15,y-r*.2,r*.17,0,7);c.fill();}}

function smile(c,x,y,w,d){
  c.strokeStyle=INK;c.lineWidth=2;c.lineCap="round";c.beginPath();
  c.moveTo(x-w*.5,y);c.quadraticCurveTo(x,y+d,x+w*.5,y);c.stroke();c.lineCap="butt";}
function frown(c,x,y,w,d){
  c.strokeStyle=INK;c.lineWidth=2;c.lineCap="round";c.beginPath();
  c.moveTo(x-w*.5,y+d);c.quadraticCurveTo(x,y-d*.6,x+w*.5,y+d);c.stroke();c.lineCap="butt";}
/* open shouting mouth — the Spoiled Fruits' default expression */
function shout(c,x,y,w,h){
  c.fillStyle="#7A2338";c.beginPath();c.ellipse(x,y,w*.5,h*.5,0,0,7);c.fill();
  c.beginPath();c.ellipse(x,y,w*.5,h*.5,0,0,7);ink(c,1.6);
  c.fillStyle="#FFFFFF";
  c.beginPath();c.moveTo(x-w*.34,y-h*.5);c.lineTo(x-w*.16,y-h*.16);c.lineTo(x+w*.02,y-h*.5);
  c.lineTo(x+w*.2,y-h*.16);c.lineTo(x+w*.36,y-h*.5);c.closePath();c.fill();}
/* angry brows — the one line that turns a cute fruit into a villain */
function brows(c,cx,cy,sp,len,tilt){
  c.strokeStyle=INK;c.lineWidth=2.4;c.lineCap="round";
  c.beginPath();c.moveTo(cx-sp-len*.5,cy-tilt);c.lineTo(cx-sp+len*.5,cy+tilt);
  c.moveTo(cx+sp-len*.5,cy+tilt);c.lineTo(cx+sp+len*.5,cy-tilt);c.stroke();c.lineCap="butt";}

/* Shared chibi rig — two boots and two mitts, so every hero in the
   roster shares one set of proportions and one running cadence. */
function boots(c,w,h,t,run,col){
  const s=run?Math.sin(t/4.2)*h*.07:0;
  c.fillStyle=col||INK;
  c.beginPath();c.roundRect(w*.20,h*.84+s,w*.24,h*.16,w*.1);c.fill();ink(c,1.7);
  c.beginPath();c.roundRect(w*.56,h*.84-s,w*.24,h*.16,w*.1);c.fill();ink(c,1.7);}
function mitts(c,w,h,t,f,col,run){
  const s=run?Math.sin(t/4.2)*h*.06:Math.sin(t/24)*h*.012;
  c.fillStyle=col||PAL.cream;
  c.beginPath();c.arc(w*.06,h*.62-s,w*.14,0,7);c.fill();ink(c,1.7);
  c.beginPath();c.arc(w*.94,h*.62+s,w*.14,0,7);c.fill();ink(c,1.7);}

/* a bendy drinking straw — OJ's signature silhouette detail */
function straw(c,x,y,h,col){
  c.strokeStyle=col||"#FF6F8F";c.lineWidth=3.2;c.lineJoin="round";c.lineCap="round";
  c.beginPath();c.moveTo(x,y);c.lineTo(x,y-h*.62);c.lineTo(x+h*.34,y-h);c.stroke();
  c.strokeStyle=INK;c.lineWidth=1.1;c.stroke();c.lineCap="butt";}

/* a juice splash — used for pickups, impacts and the Juice Mode burst */
function splat(c,x,y,r,col,n,ph){
  c.fillStyle=col;c.beginPath();
  const k=n||7;
  for(let i=0;i<=k*2;i++){
    const a=i/(k*2)*Math.PI*2, rr=r*(i%2?.52:1)*(1+Math.sin(a*3+(ph||0))*.12);
    c[i?"lineTo":"moveTo"](x+Math.cos(a)*rr,y+Math.sin(a)*rr);}
  c.closePath();c.fill();}

/* one juice droplet — the game's core collectible shape */
function droplet(c,x,y,r,col,dark){
  c.fillStyle=dark||col;c.beginPath();
  c.moveTo(x,y-r*1.5);
  c.bezierCurveTo(x+r*1.15,y-r*.3,x+r,y+r,x,y+r);
  c.bezierCurveTo(x-r,y+r,x-r*1.15,y-r*.3,x,y-r*1.5);
  c.fill();
  if(dark){c.fillStyle=col;c.beginPath();
    c.moveTo(x-r*.06,y-r*1.34);
    c.bezierCurveTo(x+r*.98,y-r*.3,x+r*.86,y+r*.82,x-r*.06,y+r*.82);
    c.bezierCurveTo(x-r*.98,y+r*.82,x-r*1.06,y-r*.3,x-r*.06,y-r*1.34);
    c.fill();}
  c.beginPath();
  c.moveTo(x,y-r*1.5);
  c.bezierCurveTo(x+r*1.15,y-r*.3,x+r,y+r,x,y+r);
  c.bezierCurveTo(x-r,y+r,x-r*1.15,y-r*.3,x,y-r*1.5);
  ink(c,1.6);
  shine(c,x-r*.34,y-r*.1,r*.24,r*.36,-.3,.85);}

/* legacy tiny-dot helper, kept because the older painters still use it */
function ey(c,x,y,r,col){c.fillStyle=col;c.beginPath();c.arc(x,y,r,0,7);c.fill();}

/* ══════════════════════════════════════════════════════════════════
   THE JUICE HEROES
   34 original fruit-and-juice characters. The first six are the launch
   cast from the art bible — OJ, Straw, Kiwi, Grape, Mango and Pine —
   and they are free, so a new player meets the whole identity of the
   game in the first minute. The remaining 28 are the unlock ladder and
   share the same rig, palette rules and ink line.

   Every painter receives (ctx, w, h, face, kit, t):
     kit.b  body colour   — retinted while Juice Mode is active
     kit.s  shade colour  — the darker rim, retinted with the body
     kit.d  ink
     kit.e  eye accent
   so a single hero silhouette reads correctly in both its own colours
   and the Juice Mode glow without a second set of sprites.
   ══════════════════════════════════════════════════════════════════ */
const CHARS=[
/* ── 0 · OJ — THE ORANGE ────────────────────────────────────────────
   Balanced starter. A cheerful orange-juice cup with a bendy straw, an
   orange-slice badge and a confident grin. The most recognisable
   silhouette in the cast: it is the app icon and the mascot. */
{id:"OJ",hex:"#FF9A2E",dk:"#D9600A",eye:"#41230F",rar:0,pas:"none",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  straw(c,w*.66,h*.24,h*.34,"#FF6F8F");
  boxBody(c,w*.10,h*.20,w*.80,h*.68,w*.22,k.b,k.s,2.3);
  /* lid ring */
  c.fillStyle=k.s;c.beginPath();c.roundRect(w*.05,h*.16,w*.90,h*.12,w*.07);c.fill();ink(c,2);
  shine(c,w*.26,h*.42,w*.09,h*.13,-.28,.55);
  /* orange-slice badge */
  c.fillStyle=PAL.cream;c.beginPath();c.arc(w*.5,h*.76,w*.15,0,7);c.fill();ink(c,1.6);
  c.strokeStyle=PAL.ojD;c.lineWidth=1;
  for(let i=0;i<4;i++){const a=i*.785+.4;c.beginPath();c.moveTo(w*.5,h*.76);
    c.lineTo(w*.5+Math.cos(a)*w*.13,h*.76+Math.sin(a)*w*.13);c.stroke();}
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.46,w*.19,w*.135,f*.9,(t%190<7)?.12:1);
  smile(c,w*.5,h*.60,w*.26,h*.05);}},

/* ── 1 · STRAW — THE STRAWBERRY ─────────────────────────────────────
   Speed and agility. Seeded red body, leafy green hair, light frame —
   the fastest-reading silhouette on the roster. */
{id:"Straw",hex:"#FF4D6D",dk:"#C41B41",eye:"#41230F",rar:0,pas:"triplejump",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  /* leafy crown */
  for(let i=-1;i<=1;i++)leafAt(c,w*.5,h*.16,w*.24,-Math.PI/2+i*.72,PAL.leaf,1.6);
  /* tapered berry body */
  c.fillStyle=k.s;c.beginPath();
  c.moveTo(w*.5,h*.18);c.quadraticCurveTo(w*1.02,h*.36,w*.5,h*.94);
  c.quadraticCurveTo(-w*.02,h*.36,w*.5,h*.18);c.fill();
  c.fillStyle=k.b;c.beginPath();
  c.moveTo(w*.47,h*.20);c.quadraticCurveTo(w*.95,h*.36,w*.47,h*.88);
  c.quadraticCurveTo(w*.02,h*.36,w*.47,h*.20);c.fill();
  c.beginPath();
  c.moveTo(w*.5,h*.18);c.quadraticCurveTo(w*1.02,h*.36,w*.5,h*.94);
  c.quadraticCurveTo(-w*.02,h*.36,w*.5,h*.18);ink(c,2.3);
  /* seeds */
  c.fillStyle="#FFE9A0";
  for(let i=0;i<5;i++){const sx=w*(.28+(i%3)*.22),sy=h*(.46+Math.floor(i/3)*.18);
    c.beginPath();c.ellipse(sx,sy,w*.035,h*.026,.5,0,7);c.fill();}
  shine(c,w*.28,h*.40,w*.07,h*.10,-.3,.5);
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.48,h*.46,w*.17,w*.125,f*.95,(t%150<6)?.12:1);
  smile(c,w*.48,h*.60,w*.22,h*.05);}},

/* ── 2 · KIWI — THE KIWI ────────────────────────────────────────────
   Tank. Fuzzy brown rind outside, bright green core, and a round
   seed-pattern shield. Wide, low, unmistakably the defensive one. */
{id:"Kiwi",hex:"#B08B5A",dk:"#7C5C34",eye:"#41230F",rar:0,pas:"shield",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  body(c,w*.5,h*.56,w*.5,h*.40,k.b,k.s,2.3);
  /* fuzz */
  c.strokeStyle=k.s;c.lineWidth=1;
  for(let i=0;i<9;i++){const a=i*.7+.3,rx=w*.5,ry=h*.40;
    c.beginPath();c.moveTo(w*.5+Math.cos(a)*rx*.92,h*.56+Math.sin(a)*ry*.92);
    c.lineTo(w*.5+Math.cos(a)*rx*1.1,h*.56+Math.sin(a)*ry*1.1);c.stroke();}
  /* green core face plate */
  c.fillStyle="#B7E86A";c.beginPath();c.ellipse(w*.5,h*.54,w*.34,h*.28,0,0,7);c.fill();ink(c,1.7);
  c.fillStyle=PAL.cream;c.beginPath();c.ellipse(w*.5,h*.54,w*.08,h*.07,0,0,7);c.fill();
  c.fillStyle=INK;
  for(let i=0;i<7;i++){const a=i*.897;
    c.beginPath();c.ellipse(w*.5+Math.cos(a)*w*.21,h*.54+Math.sin(a)*h*.17,w*.024,h*.02,a,0,7);c.fill();}
  /* seed shield */
  c.fillStyle="#C79A55";c.beginPath();c.arc(w*.02,h*.62,w*.2,0,7);c.fill();ink(c,2);
  c.strokeStyle=PAL.fuzzD;c.lineWidth=1.4;c.beginPath();c.arc(w*.02,h*.62,w*.11,0,7);c.stroke();
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.50,w*.16,w*.115,f*.85,(t%210<7)?.12:1);
  smile(c,w*.5,h*.63,w*.2,h*.045);}},

/* ── 3 · GRAPE — THE GRAPE ──────────────────────────────────────────
   Ranged magic. A cluster body (drawn as overlapping berries, never a
   single blob), a small leaf cape and a glowing orb staff. */
{id:"Grape",hex:"#9B54DC",dk:"#61269B",eye:"#41230F",rar:0,pas:"blast",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  /* staff behind */
  c.strokeStyle="#7A4B2A";c.lineWidth=2.6;c.lineCap="round";
  c.beginPath();c.moveTo(w*.9,h*.9);c.lineTo(w*.84,h*.12);c.stroke();c.lineCap="butt";
  const gl=.6+Math.sin(t/10)*.4;
  c.fillStyle="rgba(215,150,255,"+(.35+gl*.4)+")";c.beginPath();c.arc(w*.84,h*.10,w*.19,0,7);c.fill();
  c.fillStyle="#D9A6FF";c.beginPath();c.arc(w*.84,h*.10,w*.11,0,7);c.fill();ink(c,1.6);
  /* leaf cape */
  leafAt(c,w*.16,h*.44,w*.3,2.5,PAL.leafD,1.6);
  /* cluster: seven berries */
  const B=[[.5,.30,.20],[.26,.46,.19],[.74,.46,.19],[.5,.52,.20],[.30,.70,.18],[.70,.70,.18],[.5,.80,.17]];
  for(const[bx,by,br]of B)body(c,w*bx,h*by*1.0,w*br,h*br*.78,k.b,k.s,1.8);
  shine(c,w*.42,h*.26,w*.05,h*.05,0,.6);
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.48,w*.16,w*.12,f*.9,(t%170<6)?.12:1);
  smile(c,w*.5,h*.62,w*.2,h*.045);}},

/* ── 4 · MANGO — THE MANGO ──────────────────────────────────────────
   Support. Golden, soft, wider at the base, warm eyes and a single
   leaf. Heart particles are emitted by the Restore ability, not drawn
   into the sprite, so the silhouette stays clean. */
{id:"Mango",hex:"#FFB733",dk:"#E0790C",eye:"#41230F",rar:0,pas:"heal",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  stem(c,w*.56,h*.22,h*.12,2.4);
  leafAt(c,w*.58,h*.12,w*.26,-.5,PAL.leaf,1.6);
  /* asymmetric mango body */
  c.fillStyle=k.s;c.beginPath();
  c.moveTo(w*.54,h*.20);c.bezierCurveTo(w*1.10,h*.34,w*1.00,h*.94,w*.44,h*.94);
  c.bezierCurveTo(w*-.04,h*.94,w*.06,h*.34,w*.54,h*.20);c.fill();
  c.fillStyle=k.b;c.beginPath();
  c.moveTo(w*.52,h*.23);c.bezierCurveTo(w*1.02,h*.36,w*.94,h*.88,w*.43,h*.88);
  c.bezierCurveTo(w*.02,h*.88,w*.10,h*.36,w*.52,h*.23);c.fill();
  c.beginPath();
  c.moveTo(w*.54,h*.20);c.bezierCurveTo(w*1.10,h*.34,w*1.00,h*.94,w*.44,h*.94);
  c.bezierCurveTo(w*-.04,h*.94,w*.06,h*.34,w*.54,h*.20);ink(c,2.3);
  /* the warm blush that reads as ripeness */
  c.fillStyle="rgba(255,110,80,.34)";c.beginPath();c.ellipse(w*.30,h*.44,w*.16,h*.14,-.4,0,7);c.fill();
  shine(c,w*.70,h*.42,w*.08,h*.11,.4,.5);
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.48,h*.52,w*.17,w*.13,f*.9,(t%160<6)?.12:1);
  smile(c,w*.48,h*.67,w*.24,h*.055);}},

/* ── 5 · PINE — THE PINEAPPLE ───────────────────────────────────────
   Heavy damage. Rind armour drawn as a real diamond lattice, a spiked
   leaf crown, and oversized fists — the widest hero silhouette. */
{id:"Pine",hex:"#FFD23B",dk:"#C08608",eye:"#41230F",rar:0,pas:"slam",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  /* leaf crown */
  for(let i=-2;i<=2;i++){
    c.fillStyle=i%2?PAL.leaf:PAL.leafD;c.beginPath();
    c.moveTo(w*.5,h*.30);c.lineTo(w*(.5+i*.17)-w*.05,h*(.02+Math.abs(i)*.05));
    c.lineTo(w*(.5+i*.17)+w*.05,h*(.05+Math.abs(i)*.05));c.closePath();c.fill();ink(c,1.5);}
  boxBody(c,w*.14,h*.28,w*.72,h*.60,w*.20,k.b,k.s,2.3);
  /* rind lattice */
  c.strokeStyle=k.s;c.lineWidth=1.1;
  for(let i=-2;i<=3;i++){
    c.beginPath();c.moveTo(w*.14,h*(.34+i*.13));c.lineTo(w*.86,h*(.34+i*.13+.16));c.stroke();
    c.beginPath();c.moveTo(w*.86,h*(.34+i*.13));c.lineTo(w*.14,h*(.34+i*.13+.16));c.stroke();}
  c.beginPath();c.roundRect(w*.14,h*.28,w*.72,h*.60,w*.20);ink(c,2.3);
  shine(c,w*.28,h*.42,w*.06,h*.09,-.3,.45);
  /* oversized fists */
  const s=Math.sin(t/4.2)*h*.05;
  c.fillStyle=PAL.cream;
  c.beginPath();c.arc(w*.03,h*.66-s,w*.17,0,7);c.fill();ink(c,1.9);
  c.beginPath();c.arc(w*.97,h*.66+s,w*.17,0,7);c.fill();ink(c,1.9);
  eyes(c,w*.5,h*.50,w*.17,w*.12,f*.9,(t%200<6)?.12:1);
  brows(c,w*.5,h*.40,w*.17,w*.16,h*.02);
  smile(c,w*.5,h*.66,w*.24,h*.05);}},

/* ── 6-11 · the UNCOMMON tier ─────────────────────────────────────── */
{id:"Lemon",hex:"#FFE24A",dk:"#D9A800",eye:"#41230F",rar:1,pas:"magnet",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  c.save();c.translate(w*.5,h*.56);c.rotate(Math.sin(t/30)*.05);
  c.fillStyle=k.s;c.beginPath();c.ellipse(0,0,w*.5,h*.38,0,0,7);c.fill();
  c.fillStyle=k.b;c.beginPath();c.ellipse(-w*.03,-h*.04,w*.47,h*.35,0,0,7);c.fill();
  /* the two nipples that make a lemon a lemon */
  c.fillStyle=k.b;c.beginPath();c.ellipse(-w*.5,0,w*.08,h*.07,0,0,7);c.fill();
  c.beginPath();c.ellipse(w*.5,0,w*.08,h*.07,0,0,7);c.fill();
  c.beginPath();c.ellipse(0,0,w*.5,h*.38,0,0,7);ink(c,2.3);
  c.restore();
  shine(c,w*.30,h*.42,w*.08,h*.10,-.3,.5);
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.52,w*.17,w*.125,f*.9,(t%180<6)?.12:1);
  smile(c,w*.5,h*.66,w*.2,h*.05);}},
{id:"Cherry",hex:"#E8425F",dk:"#A81536",eye:"#41230F",rar:1,pas:"dash",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  c.strokeStyle=PAL.leafD;c.lineWidth=2.2;c.lineCap="round";
  c.beginPath();c.moveTo(w*.4,h*.3);c.quadraticCurveTo(w*.5,h*.02,w*.72,h*.06);c.stroke();
  c.beginPath();c.moveTo(w*.62,h*.34);c.quadraticCurveTo(w*.62,h*.06,w*.72,h*.06);c.stroke();c.lineCap="butt";
  leafAt(c,w*.72,h*.05,w*.24,-.35,PAL.leaf,1.5);
  body(c,w*.66,h*.62,w*.30,h*.24,k.b,k.s,2);
  body(c,w*.36,h*.58,w*.36,h*.30,k.b,k.s,2.2);
  shine(c,w*.24,h*.48,w*.06,h*.07,-.3,.55);
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.36,h*.56,w*.13,w*.10,f*.9,(t%140<6)?.12:1);
  smile(c,w*.36,h*.68,w*.16,h*.04);}},
{id:"Melon",hex:"#63C24A",dk:"#2F7A2A",eye:"#41230F",rar:1,pas:"heart",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  body(c,w*.5,h*.56,w*.5,h*.42,k.b,k.s,2.3);
  c.strokeStyle=k.s;c.lineWidth=2;
  for(let i=-1;i<=1;i++){c.beginPath();
    c.moveTo(w*(.5+i*.26),h*.16);c.quadraticCurveTo(w*(.5+i*.34),h*.56,w*(.5+i*.26),h*.96);c.stroke();}
  /* a bite of pink flesh, so the tank reads as a watermelon wedge */
  c.fillStyle=PAL.flesh;c.beginPath();c.ellipse(w*.5,h*.60,w*.26,h*.22,0,0,7);c.fill();ink(c,1.6);
  c.fillStyle=INK;for(let i=0;i<3;i++)
    {c.beginPath();c.ellipse(w*(.38+i*.12),h*.66,w*.026,h*.022,.3,0,7);c.fill();}
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.46,w*.17,w*.125,f*.9,(t%175<6)?.12:1);}},
{id:"Peach",hex:"#FFA98A",dk:"#E06A50",eye:"#41230F",rar:1,pas:"perfect",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  stem(c,w*.5,h*.20,h*.11,2.2);leafAt(c,w*.52,h*.10,w*.24,-.55,PAL.leaf,1.5);
  body(c,w*.5,h*.58,w*.48,h*.40,k.b,k.s,2.3);
  c.strokeStyle=k.s;c.lineWidth=1.6;c.beginPath();
  c.moveTo(w*.5,h*.20);c.quadraticCurveTo(w*.44,h*.58,w*.5,h*.96);c.stroke();
  c.fillStyle="rgba(255,90,110,.28)";c.beginPath();c.ellipse(w*.68,h*.48,w*.15,h*.14,.3,0,7);c.fill();
  shine(c,w*.30,h*.44,w*.07,h*.10,-.3,.5);
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.52,w*.17,w*.13,f*.9,(t%165<6)?.12:1);
  smile(c,w*.5,h*.67,w*.22,h*.055);}},
{id:"Coco",hex:"#8C6239",dk:"#5A3A20",eye:"#41230F",rar:1,pas:"aircontrol",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  straw(c,w*.62,h*.26,h*.3,"#7FE0C0");
  body(c,w*.5,h*.58,w*.48,h*.40,k.b,k.s,2.3);
  c.strokeStyle=k.s;c.lineWidth=1;
  for(let i=0;i<6;i++){const a=i*1.05;
    c.beginPath();c.moveTo(w*.5+Math.cos(a)*w*.14,h*.58+Math.sin(a)*h*.12);
    c.lineTo(w*.5+Math.cos(a)*w*.42,h*.58+Math.sin(a)*h*.34);c.stroke();}
  c.fillStyle=PAL.cream;c.beginPath();c.ellipse(w*.5,h*.28,w*.22,h*.07,0,0,7);c.fill();ink(c,1.6);
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.55,w*.16,w*.12,f*.9,(t%190<6)?.12:1);
  smile(c,w*.5,h*.70,w*.2,h*.045);}},
{id:"Fig",hex:"#7A4B8C",dk:"#4C2A5C",eye:"#41230F",rar:1,pas:"walljump",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  stem(c,w*.5,h*.22,h*.12,2.4);
  c.fillStyle=k.s;c.beginPath();
  c.moveTo(w*.5,h*.20);c.bezierCurveTo(w*1.06,h*.46,w*.92,h*.96,w*.5,h*.96);
  c.bezierCurveTo(w*.08,h*.96,w*-.06,h*.46,w*.5,h*.20);c.fill();
  c.fillStyle=k.b;c.beginPath();
  c.moveTo(w*.47,h*.24);c.bezierCurveTo(w*.98,h*.48,w*.86,h*.90,w*.47,h*.90);
  c.bezierCurveTo(w*.12,h*.90,w*.0,h*.48,w*.47,h*.24);c.fill();
  c.beginPath();
  c.moveTo(w*.5,h*.20);c.bezierCurveTo(w*1.06,h*.46,w*.92,h*.96,w*.5,h*.96);
  c.bezierCurveTo(w*.08,h*.96,w*-.06,h*.46,w*.5,h*.20);ink(c,2.3);
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.56,w*.16,w*.12,f*.9,(t%200<6)?.12:1);
  smile(c,w*.5,h*.70,w*.18,h*.04);}},

/* ── 12-17 + 30 · the RARE tier ───────────────────────────────────── */
{id:"Banana",hex:"#FFD84D",dk:"#D9A216",eye:"#41230F",rar:2,pas:"combo",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  c.save();if(f<0){c.translate(w,0);c.scale(-1,1);}
  c.fillStyle=k.s;c.beginPath();
  c.moveTo(w*.14,h*.20);c.quadraticCurveTo(w*1.04,h*.42,w*.66,h*.96);
  c.quadraticCurveTo(w*.30,h*.80,w*.14,h*.20);c.fill();
  c.fillStyle=k.b;c.beginPath();
  c.moveTo(w*.18,h*.24);c.quadraticCurveTo(w*.96,h*.44,w*.62,h*.90);
  c.quadraticCurveTo(w*.32,h*.76,w*.18,h*.24);c.fill();
  c.beginPath();
  c.moveTo(w*.14,h*.20);c.quadraticCurveTo(w*1.04,h*.42,w*.66,h*.96);
  c.quadraticCurveTo(w*.30,h*.80,w*.14,h*.20);ink(c,2.3);
  c.fillStyle="#6B4A1E";c.beginPath();c.ellipse(w*.16,h*.18,w*.07,h*.05,-.4,0,7);c.fill();
  c.restore();
  eyes(c,w*.52,h*.56,w*.15,w*.11,f*.9,(t%155<6)?.12:1);
  smile(c,w*.52,h*.70,w*.18,h*.045);}},
{id:"Lime",hex:"#A8DC3C",dk:"#5F9410",eye:"#41230F",rar:2,pas:"icegrip",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  body(c,w*.5,h*.56,w*.48,h*.38,k.b,k.s,2.3);
  c.fillStyle="#DFF5A8";c.beginPath();c.ellipse(w*.5,h*.54,w*.28,h*.22,0,0,7);c.fill();
  c.strokeStyle=k.s;c.lineWidth=1;
  for(let i=0;i<6;i++){const a=i*1.05;c.beginPath();c.moveTo(w*.5,h*.54);
    c.lineTo(w*.5+Math.cos(a)*w*.26,h*.54+Math.sin(a)*h*.20);c.stroke();}
  shine(c,w*.28,h*.42,w*.07,h*.09,-.3,.5);
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.52,w*.15,w*.115,f*.9,(t%185<6)?.12:1);
  smile(c,w*.5,h*.66,w*.18,h*.04);}},
{id:"Papaya",hex:"#FF8A4C",dk:"#D1521C",eye:"#41230F",rar:2,pas:"startjuice",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  stem(c,w*.5,h*.18,h*.10,2.2);leafAt(c,w*.52,h*.09,w*.22,-.5,PAL.leaf,1.5);
  c.fillStyle=k.s;c.beginPath();c.ellipse(w*.5,h*.60,w*.42,h*.42,0,0,7);c.fill();
  c.fillStyle=k.b;c.beginPath();c.ellipse(w*.47,h*.56,w*.39,h*.39,0,0,7);c.fill();
  c.beginPath();c.ellipse(w*.5,h*.60,w*.42,h*.42,0,0,7);ink(c,2.3);
  c.fillStyle=INK;for(let i=0;i<4;i++){const a=i*1.57+t/90;
    c.beginPath();c.arc(w*.5+Math.cos(a)*w*.14,h*.68+Math.sin(a)*h*.09,w*.032,0,7);c.fill();}
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.50,w*.16,w*.12,f*.9,(t%170<6)?.12:1);}},
{id:"Blueb",hex:"#4C6FE0",dk:"#22399E",eye:"#FFFFFF",rar:2,pas:"juicelong",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  body(c,w*.5,h*.58,w*.46,h*.40,k.b,k.s,2.3);
  /* the five-point crown every blueberry has on top */
  c.strokeStyle=k.s;c.lineWidth=1.8;
  for(let i=0;i<5;i++){const a=-Math.PI/2+i*1.256;
    c.beginPath();c.moveTo(w*.5,h*.26);
    c.lineTo(w*.5+Math.cos(a)*w*.12,h*.26+Math.sin(a)*h*.09);c.stroke();}
  shine(c,w*.30,h*.44,w*.07,h*.09,-.3,.5);
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.54,w*.16,w*.12,f*.9,(t%195<6)?.12:1);
  smile(c,w*.5,h*.68,w*.18,h*.04);}},
{id:"Plum",hex:"#A85FD6",dk:"#6E2CA0",eye:"#41230F",rar:2,pas:"perfect",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  stem(c,w*.5,h*.20,h*.10,2.2);leafAt(c,w*.52,h*.11,w*.22,-.5,PAL.leaf,1.5);
  body(c,w*.5,h*.58,w*.46,h*.40,k.b,k.s,2.3);
  c.strokeStyle=k.s;c.lineWidth=1.6;c.beginPath();
  c.moveTo(w*.5,h*.20);c.quadraticCurveTo(w*.42,h*.58,w*.5,h*.97);c.stroke();
  shine(c,w*.30,h*.44,w*.07,h*.09,-.3,.5);
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.54,w*.16,w*.12,f*.9,(t%205<6)?.12:1);
  smile(c,w*.5,h*.68,w*.18,h*.04);}},
{id:"Guava",hex:"#F58AA0",dk:"#C6506C",eye:"#41230F",rar:2,pas:"fruity",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  leafAt(c,w*.5,h*.16,w*.24,-.9,PAL.leaf,1.5);
  leafAt(c,w*.5,h*.16,w*.24,-2.2,PAL.leafD,1.5);
  body(c,w*.5,h*.58,w*.46,h*.40,k.b,k.s,2.3);
  c.fillStyle="#FFD6DE";c.beginPath();c.ellipse(w*.5,h*.60,w*.24,h*.20,0,0,7);c.fill();
  c.fillStyle=INK;for(let i=0;i<5;i++){const a=i*1.256;
    c.beginPath();c.arc(w*.5+Math.cos(a)*w*.12,h*.60+Math.sin(a)*h*.10,w*.026,0,7);c.fill();}
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.48,w*.16,w*.12,f*.9,(t%160<6)?.12:1);}},

/* ── 18-22 + 31 + 33 · the EPIC tier ──────────────────────────────── */
{id:"Dragon",hex:"#FF5A9E",dk:"#C41F6A",eye:"#41230F",rar:3,pas:"slayer",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  /* dragonfruit: pink body with green scale flares */
  c.fillStyle=PAL.kiwi;
  for(let i=0;i<5;i++){const a=-1.9+i*.95;
    c.beginPath();c.moveTo(w*.5+Math.cos(a)*w*.3,h*.56+Math.sin(a)*h*.26);
    c.lineTo(w*.5+Math.cos(a-.2)*w*.62,h*.56+Math.sin(a-.2)*h*.5);
    c.lineTo(w*.5+Math.cos(a+.2)*w*.44,h*.56+Math.sin(a+.2)*h*.36);c.closePath();c.fill();ink(c,1.4);}
  body(c,w*.5,h*.56,w*.42,h*.38,k.b,k.s,2.3);
  c.fillStyle="#FFF0F5";c.beginPath();c.ellipse(w*.5,h*.58,w*.26,h*.24,0,0,7);c.fill();
  c.fillStyle=INK;for(let i=0;i<6;i++){const a=i*1.05+.4;
    c.beginPath();c.arc(w*.5+Math.cos(a)*w*.15,h*.58+Math.sin(a)*h*.13,w*.026,0,7);c.fill();}
  eyes(c,w*.5,h*.50,w*.15,w*.11,f*.9,(t%150<6)?.12:1);
  brows(c,w*.5,h*.41,w*.15,w*.14,h*.02);}},
{id:"Acai",hex:"#6B3FA0",dk:"#3E2166",eye:"#E7DBFF",rar:3,pas:"heal",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  body(c,w*.5,h*.56,w*.46,h*.40,k.b,k.s,2.3);
  c.fillStyle="rgba(220,190,255,.5)";
  for(let i=0;i<4;i++){const a=t/34+i*1.57;
    c.beginPath();c.arc(w*.5+Math.cos(a)*w*.3,h*.56+Math.sin(a)*h*.26,w*.05,0,7);c.fill();}
  shine(c,w*.30,h*.42,w*.07,h*.09,-.3,.45);
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.52,w*.16,w*.12,f*.9,(t%180<6)?.12:1);
  smile(c,w*.5,h*.66,w*.18,h*.04);}},
{id:"Elder",hex:"#4B5BD6",dk:"#2A3494",eye:"#FFD24A",rar:3,pas:"juicelong",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  /* berry wizard: pointed cap of stacked elderberries */
  c.fillStyle=k.s;c.beginPath();
  c.moveTo(w*.5,-h*.10);c.lineTo(w*1.0,h*.34);c.lineTo(w*.0,h*.34);c.closePath();c.fill();ink(c,2.2);
  c.fillStyle=PAL.gold;c.beginPath();c.arc(w*.5+Math.sin(t/16)*2,-h*.10,w*.08,0,7);c.fill();ink(c,1.4);
  c.fillStyle=k.b;c.beginPath();
  c.moveTo(w*.16,h*.40);c.lineTo(w*.84,h*.40);c.lineTo(w*.96,h*.96);c.lineTo(w*.04,h*.96);c.closePath();c.fill();ink(c,2.2);
  c.fillStyle=PAL.cream;c.beginPath();
  c.moveTo(w*.34,h*.42);c.quadraticCurveTo(w*.5,h*.92,w*.66,h*.42);c.closePath();c.fill();ink(c,1.5);
  eyes(c,w*.5,h*.34,w*.13,w*.09,f*.9,(t%210<6)?.12:1);}},
{id:"Mint",hex:"#3FBFA8",dk:"#1E7E70",eye:"#41230F",rar:3,pas:"icegrip",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  leafAt(c,w*.5,h*.18,w*.28,-1.0,PAL.kiwi,1.6);
  leafAt(c,w*.5,h*.18,w*.28,-2.1,PAL.leaf,1.6);
  body(c,w*.5,h*.60,w*.44,h*.38,k.b,k.s,2.3);
  c.strokeStyle="rgba(255,255,255,.7)";c.lineWidth=1.4;
  for(let i=0;i<3;i++){const a=t/60+i*2.09;
    c.beginPath();c.moveTo(w*.5,h*.60);
    c.lineTo(w*.5+Math.cos(a)*w*.3,h*.60+Math.sin(a)*h*.26);c.stroke();}
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.56,w*.16,w*.12,f*.9,(t%175<6)?.12:1);
  smile(c,w*.5,h*.70,w*.18,h*.04);}},
{id:"Feijoa",hex:"#2FB765",dk:"#177040",eye:"#FFE9A0",rar:3,pas:"rich",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  body(c,w*.5,h*.58,w*.46,h*.40,k.b,k.s,2.3);
  /* the coin sack that sells the "+50% coins" identity */
  c.fillStyle=PAL.gold;c.beginPath();c.arc(w*.9,h*.72,w*.15,0,7);c.fill();ink(c,1.7);
  c.strokeStyle=k.s;c.lineWidth=1.2;c.beginPath();c.arc(w*.9,h*.72,w*.07,0,7);c.stroke();
  c.fillStyle="#D9F5C0";c.beginPath();c.ellipse(w*.46,h*.60,w*.22,h*.19,0,0,7);c.fill();
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.46,h*.50,w*.15,w*.115,f*.9,(t%190<6)?.12:1);
  smile(c,w*.46,h*.64,w*.16,h*.04);}},
{id:"Sorbet",hex:"#A8ECFF",dk:"#5FA9C4",eye:"#1B4A66",rar:3,pas:"slow",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  /* three scoops */
  body(c,w*.5,h*.76,w*.44,h*.22,k.b,k.s,2);
  body(c,w*.5,h*.54,w*.38,h*.20,k.b,k.s,2);
  body(c,w*.5,h*.34,w*.32,h*.18,k.b,k.s,2);
  c.fillStyle=PAL.berry;c.beginPath();c.arc(w*.5,h*.18,w*.09,0,7);c.fill();ink(c,1.5);
  c.strokeStyle="rgba(255,255,255,.85)";c.lineWidth=1.4;
  for(let i=0;i<3;i++){const a=t/50+i*2.09;
    c.beginPath();c.moveTo(w*.5,h*.34);
    c.lineTo(w*.5+Math.cos(a)*w*.24,h*.34+Math.sin(a)*h*.14);c.stroke();}
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.56,w*.15,w*.11,f*.9,(t%200<6)?.12:1);
  smile(c,w*.5,h*.68,w*.16,h*.035);}},
{id:"Verdi",hex:"#7BD86A",dk:"#3F8F36",eye:"#22402A",rar:3,pas:"harvest",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  const sw=Math.sin(t/22)*.06;
  stem(c,w*.5,h*.24,h*.16,2.6);
  leafAt(c,w*(.52+sw),h*.10,w*.28,-.5,PAL.leaf,1.6);
  leafAt(c,w*(.48+sw),h*.14,w*.24,3.6,PAL.leafD,1.6);
  body(c,w*.5,h*.60,w*.46,h*.38,k.b,k.s,2.3);
  c.fillStyle="rgba(255,255,255,.24)";
  for(let i=0;i<3;i++){c.beginPath();
    c.ellipse(w*(.32+i*.19),h*(.50+(i%2)*.16),w*.06,h*.045,.4,0,7);c.fill();}
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.56,w*.17,w*.13,f*.9,(t%165<6)?.12:1);
  smile(c,w*.5,h*.70,w*.2,h*.045);}},

/* ── 23-26 + 32 · the LEGENDARY tier ──────────────────────────────── */
{id:"Durian",hex:"#C9C06A",dk:"#8F8630",eye:"#41230F",rar:4,pas:"slayer",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  /* spiked shell: the spikes ARE the silhouette */
  c.fillStyle=k.s;c.beginPath();
  for(let i=0;i<14;i++){const a=i/14*Math.PI*2,r=(i%2?.62:1);
    c[i?"lineTo":"moveTo"](w*.5+Math.cos(a)*w*.5*r,h*.58+Math.sin(a)*h*.42*r);}
  c.closePath();c.fill();ink(c,2.2);
  c.fillStyle=k.b;c.beginPath();c.ellipse(w*.5,h*.58,w*.3,h*.26,0,0,7);c.fill();
  eyes(c,w*.5,h*.54,w*.14,w*.10,f*.9,(t%200<6)?.12:1);
  brows(c,w*.5,h*.45,w*.14,w*.13,h*.02);
  smile(c,w*.5,h*.68,w*.16,h*.035);}},
{id:"Avo",hex:"#7FA05A",dk:"#4A6B30",eye:"#41230F",rar:4,pas:"heart",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  c.fillStyle=k.s;c.beginPath();
  c.moveTo(w*.5,h*.14);c.bezierCurveTo(w*1.02,h*.36,w*.98,h*.98,w*.5,h*.98);
  c.bezierCurveTo(w*.02,h*.98,w*-.02,h*.36,w*.5,h*.14);c.fill();ink(c,2.3);
  c.fillStyle="#D9E8A8";c.beginPath();c.ellipse(w*.5,h*.62,w*.32,h*.28,0,0,7);c.fill();
  c.fillStyle="#8C6239";c.beginPath();c.ellipse(w*.5,h*.64,w*.15,h*.13,0,0,7);c.fill();ink(c,1.6);
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.42,w*.14,w*.105,f*.9,(t%190<6)?.12:1);}},
{id:"Tangi",hex:"#FF8A3B",dk:"#D1550C",eye:"#41230F",rar:4,pas:"dash",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  c.save();if(f<0){c.translate(w,0);c.scale(-1,1);}
  /* speed fins */
  c.fillStyle="rgba(255,220,150,.6)";
  for(let i=0;i<3;i++){c.beginPath();
    c.moveTo(-w*.05,h*(.42+i*.14));c.lineTo(-w*.42,h*(.40+i*.14));
    c.lineTo(-w*.05,h*(.50+i*.14));c.closePath();c.fill();}
  c.restore();
  body(c,w*.5,h*.56,w*.46,h*.38,k.b,k.s,2.3);
  stem(c,w*.5,h*.20,h*.08,2.2);leafAt(c,w*.52,h*.13,w*.2,-.5,PAL.leaf,1.5);
  shine(c,w*.30,h*.42,w*.07,h*.09,-.3,.5);
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.52,w*.16,w*.12,f*1.1,(t%140<6)?.12:1);
  smile(c,w*.5,h*.66,w*.18,h*.04);}},
{id:"Lychee",hex:"#F0D8E8",dk:"#C09AB4",eye:"#B57BE0",rar:4,pas:"perfect",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  /* rough bumpy shell drawn as a ring of small lobes */
  c.fillStyle=k.s;
  for(let i=0;i<10;i++){const a=i/10*Math.PI*2;
    c.beginPath();c.arc(w*.5+Math.cos(a)*w*.38,h*.58+Math.sin(a)*h*.32,w*.11,0,7);c.fill();}
  body(c,w*.5,h*.58,w*.42,h*.36,k.b,k.s,2.2);
  shine(c,w*.32,h*.44,w*.07,h*.09,-.3,.6);
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.54,w*.16,w*.12,f*.9,(t%180<6)?.12:1);
  smile(c,w*.5,h*.68,w*.18,h*.04);}},
{id:"Chili",hex:"#FF5A2B",dk:"#C42A08",eye:"#FFE9A0",rar:4,pas:"firelord",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  const fl=Math.sin(t/3.4)*.16;
  c.fillStyle="rgba(255,190,80,.55)";
  c.beginPath();c.moveTo(w*.5,-h*.30-fl*h);
  c.quadraticCurveTo(w*1.0,h*.18,w*.5,h*.44);
  c.quadraticCurveTo(w*.0,h*.18,w*.5,-h*.30-fl*h);c.fill();
  c.fillStyle=k.s;c.beginPath();
  c.moveTo(w*.5,h*.18);c.quadraticCurveTo(w*.98,h*.44,w*.62,h*.96);
  c.quadraticCurveTo(w*.5,h*1.0,w*.38,h*.96);
  c.quadraticCurveTo(w*.02,h*.44,w*.5,h*.18);c.fill();
  c.fillStyle=k.b;c.beginPath();
  c.moveTo(w*.47,h*.22);c.quadraticCurveTo(w*.90,h*.46,w*.58,h*.90);
  c.quadraticCurveTo(w*.47,h*.94,w*.40,h*.90);
  c.quadraticCurveTo(w*.08,h*.46,w*.47,h*.22);c.fill();
  c.beginPath();
  c.moveTo(w*.5,h*.18);c.quadraticCurveTo(w*.98,h*.44,w*.62,h*.96);
  c.quadraticCurveTo(w*.5,h*1.0,w*.38,h*.96);
  c.quadraticCurveTo(w*.02,h*.44,w*.5,h*.18);ink(c,2.3);
  stem(c,w*.5,h*.20,h*.1,2.4);leafAt(c,w*.5,h*.12,w*.2,-1.0,PAL.leaf,1.4);
  eyes(c,w*.5,h*.48,w*.15,w*.11,f*.9,(t%150<6)?.12:1);
  brows(c,w*.5,h*.38,w*.15,w*.14,h*.02);}},
{id:"Zest",hex:"#FFE24A",dk:"#D9A800",eye:"#41230F",rar:2,pas:"speed",draw(c,w,h,f,k,t){
  const z=Math.sin(t/3)*.14;
  c.fillStyle="rgba(255,240,140,.45)";
  c.beginPath();c.moveTo(-w*.3,h*.5);c.lineTo(w*.1,h*.3);c.lineTo(w*.02,h*.52);c.lineTo(w*.34,h*.34);
  c.lineTo(w*.1,h*.72);c.closePath();c.fill();
  boots(c,w,h,t,1);
  body(c,w*.5,h*.56,w*.44,h*.36,k.b,k.s,2.3);
  /* the bolt is a citrus zest curl */
  c.fillStyle=PAL.ojD;c.beginPath();
  c.moveTo(w*.56,h*.34);c.lineTo(w*.34,h*.58);c.lineTo(w*.5,h*.58);
  c.lineTo(w*.42,h*.80);c.lineTo(w*.68,h*.52);c.lineTo(w*.52,h*.52);c.closePath();c.fill();ink(c,1.5);
  c.fillStyle="rgba(255,255,255,"+(.3+z)+")";
  c.beginPath();c.arc(w*.5,h*.56,w*.1,0,7);c.fill();
  eyes(c,w*.5,h*.42,w*.14,w*.10,f*1.2,(t%120<5)?.12:1);}},

/* ── 27-28 · RAINBOW tier ─────────────────────────────────────────── */
{id:"Starfruit",hex:"#FFE066",dk:"#D9A800",eye:"#41230F",rar:5,pas:"random",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  c.save();c.translate(w*.5,h*.54);c.rotate(Math.sin(t/28)*.14);
  c.fillStyle=k.s;c.beginPath();
  for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?w*.24:w*.56;
    c[i?"lineTo":"moveTo"](Math.cos(a)*r,Math.sin(a)*r*(h/w));}
  c.closePath();c.fill();ink(c,2.2);
  c.fillStyle=k.b;c.beginPath();
  for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?w*.2:w*.48;
    c[i?"lineTo":"moveTo"](Math.cos(a)*r,Math.sin(a)*r*(h/w));}
  c.closePath();c.fill();
  c.restore();
  eyes(c,w*.5,h*.50,w*.15,w*.11,f*.9,(t%170<6)?.12:1);
  smile(c,w*.5,h*.64,w*.18,h*.04);}},
{id:"Sherbet",hex:"rainbow",dk:"#B4530A",eye:"#FFFFFF",rar:5,pas:"random",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  /* stacked rainbow sorbet scoops in a cone */
  for(let i=0;i<3;i++){
    c.fillStyle="hsl("+((t*4+i*90)%360)+",92%,66%)";
    c.beginPath();c.ellipse(w*.5,h*(.30+i*.17),w*(.30+i*.06),h*.13,0,0,7);c.fill();ink(c,1.9);}
  c.fillStyle="#E8B878";c.beginPath();
  c.moveTo(w*.22,h*.66);c.lineTo(w*.78,h*.66);c.lineTo(w*.5,h*1.0);c.closePath();c.fill();ink(c,2);
  c.strokeStyle="rgba(120,70,20,.45)";c.lineWidth=1;
  c.beginPath();c.moveTo(w*.3,h*.72);c.lineTo(w*.66,h*.86);c.moveTo(w*.7,h*.72);c.lineTo(w*.34,h*.86);c.stroke();
  eyes(c,w*.5,h*.46,w*.14,w*.105,f*.9,(t%160<6)?.12:1);}},

/* ── 29 · MYTHIC ──────────────────────────────────────────────────── */
{id:"Cosmo",hex:"galaxy",dk:"#2A1550",eye:"#E7DBFF",rar:6,pas:"random",draw(c,w,h,f,k,t){
  boots(c,w,h,t,1);
  body(c,w*.5,h*.56,w*.48,h*.42,k.b,k.s,2.3);
  c.fillStyle="rgba(255,255,255,.85)";
  for(let i=0;i<7;i++){const a=t/40+i*.9,r=w*.3*(i%3+1)/3;
    c.beginPath();c.arc(w*.5+Math.cos(a)*r,h*.56+Math.sin(a)*r*.9,1.5,0,7);c.fill();}
  straw(c,w*.66,h*.22,h*.3,"#9BE8FF");
  mitts(c,w,h,t,f,PAL.cream,1);
  eyes(c,w*.5,h*.52,w*.16,w*.12,f*.9,(t%220<6)?.12:1);
  smile(c,w*.5,h*.68,w*.18,h*.04);}}
];

/* Hero prices, set from test/economy.mjs against MEASURED earning rates
   rather than intuition. The old curve was calibrated for an economy that
   no longer existed: an average player earned ~1600 coins/minute and could
   buy the first paid hero in under a minute, and the whole roster inside an
   hour — so nothing was ever a goal. The tier RATIOS are unchanged (the
   original progression shape was fine); only the scale moved, so an average
   player now reaches their first paid hero in ~11 minutes and the MYTHIC
   stays a multi-session target.

   NOTE: existing saves keep every coin, hero, achievement and unlock. What
   changes is purchasing power — a returning player's banked coins buy fewer
   new heroes than before. Heroes already unlocked are never taken away. */
const COST=[0,18000,44000,100000,220000,400000,720000];
const RAR=[{n:"FRESH",c:"#4FB250"},{n:"RIPE",c:"#8FD44A"},{n:"JUICY",c:"#2E9BD6"},
           {n:"EXOTIC",c:"#9B54DC"},{n:"GOLDEN",c:"#E09A08"},{n:"RAINBOW",c:"#FF4D6D"},{n:"COSMIC",c:"#6D2CA8"}];
/* Hero abilities. Every one is now a change you can feel within seconds,
   and the active one is named on the HUD. ABIL carries the short HUD
   label; PASS carries the roster description. */
const ABIL={
 none:      {short:"BALANCED"},
 speed:     {short:"+25% SPEED"},
 slow:      {short:"ENEMIES CHILLED"},
 power:     {short:"×2 DAMAGE"},
 harvest:   {short:"+60% JUICE"},
 dash:      {short:"LONG DASH"},
 heal:      {short:"REGEN"},
 magnet:    {short:"BIG MAGNET"},
 heart:     {short:"+1 HEART"},
 rich:      {short:"+50% COINS"},
 perfect:   {short:"PERFECT×3"},
 juicelong: {short:"LONG JUICE"},
 icegrip:   {short:"SLICK GRIP"},
 fireproof: {short:"FIREPROOF"},
 startjuice:{short:"HALF JUICE START"},
 slayer:    {short:"×2 DAMAGE"},
 firelord:  {short:"FIRE LORD"},
 aircontrol:{short:"AIR CONTROL"},
 shield:    {short:"1 SHIELD"},
 walljump:  {short:"WALL MASTER"},
 combo:     {short:"COMBO KEEPER"},
 fruity:    {short:"FRUIT FINDER"},
 random:    {short:"WILDCARD"},
 triplejump:{short:"TRIPLE JUMP"},
 blast:     {short:"GRAPE BLAST"},
 slam:      {short:"PINEAPPLE SLAM"}};
const PASS={
 none:{t:"balanced — no tricks"},
 speed:{t:"25% faster, Juice Mode 40% shorter"},
 slow:{t:"enemies move 45% slower · never slips"},
 power:{t:"double damage, but floatier to control"},
 harvest:{t:"+60% juice from everything you collect"},
 dash:{t:"dash is longer + recharges 40% faster"},
 heal:{t:"regain a heart every 400m"},
 magnet:{t:"triple orb magnet"},
 heart:{t:"start with +1 heart"},
 rich:{t:"+50% coins, -1 heart"},
 perfect:{t:"perfect landings give 3x juice"},
 juicelong:{t:"Juice Mode lasts 50% longer"},
 icegrip:{t:"never slips on syrup or slick ground"},
 fireproof:{t:"fireballs cannot hurt you"},
 startjuice:{t:"start each run at 50% juice"},
 slayer:{t:"double damage · +1 extra on a stunned boss"},
 firelord:{t:"immune to fire · every landing bursts into flame"},
 aircontrol:{t:"+35% steering control while airborne"},
 shield:{t:"a shield absorbs the first hit of every run"},
 walljump:{t:"wall jumps are higher and push further"},
 combo:{t:"combo decays 2.5x slower"},
 fruity:{t:"triple the fruit spawn rate"},
 random:{t:"random ability every run"},
 triplejump:{t:"a third mid-air jump · a speed burst on landing"},
 blast:{t:"fires bouncing juice-energy orbs that pierce enemies"},
 slam:{t:"landing hard sends out a damaging shockwave"}};
const RUN=CHARS.map(c=>({...c,cost:COST[c.rar]}));
const byId=id=>RUN.find(r=>r.id===id)||RUN[0];
const me=()=>byId(SAVE.sel);
function bodyOf(r,t){
  if(r.hex==="rainbow")return "hsl("+(t*7%360)+",95%,66%)";
  if(r.hex==="galaxy") return "hsl("+(250+Math.sin(t/40)*40)+",70%,"+(46+Math.sin(t/17)*12)+"%)";
  return r.hex;
}
/* the darker rim that gives a hero its dimensional shading */
function shadeOf(r,t){
  if(r.hex==="rainbow")return "hsl("+(t*7%360)+",90%,44%)";
  if(r.hex==="galaxy") return "hsl("+(250+Math.sin(t/40)*40)+",70%,"+(24+Math.sin(t/17)*8)+"%)";
  return r.dk||"#41230F";
}
/* One source of truth for the Juice Mode colour, so brews and cosmetics
   can retint the whole effect: body, aura, rings, vignette and HUD. */
function juiceHueBase(){
  if(BREW==="lightning")return 52;
  if(BREW==="mega")return 12;
  const sk=SKINS.find(k=>k.id===(SAVE.skin||"classic"));
  return sk?sk.hue:-1;                     /* -1 == full rainbow cycle */
}
function juiceCol(){
  const b=juiceHueBase();
  return b<0?"hsl("+(frame*7%360)+",95%,66%)":"hsl("+(b+Math.sin(frame/14)*14)+",95%,62%)";
}
/* kitFor supplies BOTH the body colour and its shade, so a hero keeps its
   dimensional shading while Juice Mode retints it — a single flat wash
   would have thrown away the modelling exactly when the game looks its
   most exciting. */
function kitFor(r,t,jm){
  if(jm){const b=juiceHueBase();
    return{b:b<0?"hsl("+(t*7%360)+",95%,68%)":"hsl("+(b+Math.sin(t/14)*14)+",95%,66%)",
           s:b<0?"hsl("+(t*7%360)+",92%,44%)":"hsl("+(b+Math.sin(t/14)*14)+",92%,42%)",
           d:INK,e:"#FFFFFF"};}
  return{b:bodyOf(r,t),s:shadeOf(r,t),d:INK,e:r.eye};
}
let activePass="none";
const has=p=>activePass===p;
/* ══════ WORLDS ═══════════════════════════════════════════════════
   rgb triples are pre-parsed: the original re-parsed three hex strings
   every rendered frame inside the background colour lerp. */
/* ══════════════════════════════════════════════════════════════════
   THE EIGHT JUICE WORLDS
   Each world owns a sky, three parallax ridge bands, a ground material,
   a prop set, a weather particle and one gameplay modifier. Bright,
   controlled colour: the sky always lightens toward the horizon so the
   characters — who carry the darkest ink line on screen — stay readable
   against it on a small phone.

   `mod` drives the generator, not just the look:
     gaps    wider voids           moving  drifting platforms
     spikes  hazard spikes         lowg    lighter gravity
     slick   low-friction ground   wind    a sideways push
   ══════════════════════════════════════════════════════════════════ */
const WORLDS=[
 {n:"ORANGE ORCHARD",short:"ORCHARD",
  a:"#4EC0F0",b:"#CDF2FF",r:["#9BD46E","#77B95A","#579B47"],
  p:"#A2683C",pt:"#6FC24A",e:"#B7E86A",acc:"#FF9A2E",
  wx:"leaf",mod:null,prop:"tree",ground:"grass"},
 {n:"BERRY FOREST",short:"BERRY",
  a:"#5C4BC4",b:"#C0A8F0",r:["#6E4FA8","#573C8C","#3F2A6B"],
  p:"#5C3E7A",pt:"#8F5FD0",e:"#D9B8FF",acc:"#9B54DC",
  sun:"rgba(230,210,255,.24)",sun2:"rgba(246,238,255,.5)",
  wx:"spark",mod:null,prop:"berrytree",ground:"moss"},
 {n:"WATERMELON BEACH",short:"BEACH",
  a:"#39C4E8",b:"#DFF7FF",r:["#6FD9C0","#49BFA8","#2E9E8C"],
  p:"#E8D9A8",pt:"#F5EAC6",e:"#FFF6DC",acc:"#FF5A6E",
  wx:"bubble",mod:"gaps",prop:"parasol",ground:"sand"},
 {n:"KIWI JUNGLE",short:"JUNGLE",
  a:"#2FA88C",b:"#B9F0D2",r:["#4E9E3E","#3A7F33","#2A6128"],
  p:"#7C5A32",pt:"#5FA83C",e:"#A8DC5A",acc:"#9BD94F",
  wx:"leaf",mod:"moving",prop:"vinetree",ground:"grass"},
 {n:"GRAPE CASTLE",short:"CASTLE",
  a:"#3B2A72",b:"#8F72D4",r:["#4C3390","#3C2775","#2C1B58"],
  p:"#6B5A96",pt:"#9B85C6",e:"#D6C6FF",acc:"#9B54DC",
  sun:"rgba(220,200,255,.22)",sun2:"rgba(244,238,255,.55)",
  wx:"spark",mod:"wind",prop:"tower",ground:"stone"},
 {n:"MANGO DESERT",short:"DESERT",
  a:"#FFB347",b:"#FFE9B0",r:["#E8A44C","#D18A34","#B06E22"],
  p:"#D9A055",pt:"#F0C070",e:"#FFE0A0",acc:"#FFB733",
  sun:"rgba(255,236,172,.34)",sun2:"rgba(255,248,214,.72)",
  wx:"sand",mod:"gaps",prop:"temple",ground:"sand"},
 {n:"PINEAPPLE VOLCANO",short:"VOLCANO",
  a:"#6B1E28",b:"#FF9A3B",r:["#4A1A18","#5F2119","#7C2C1C"],
  p:"#4A2A20",pt:"#FFB33B",e:"#FFD98A",acc:"#FFD23B",
  sun:"rgba(255,170,90,.24)",sun2:"rgba(255,214,150,.44)",
  wx:"ember",mod:"spikes",prop:"volcano",ground:"rock"},
 {n:"SODA FACTORY",short:"FACTORY",
  a:"#2C4A5E",b:"#7FC4D9",r:["#3A5F72","#2E4E5F","#24404E"],
  p:"#7C6B5A",pt:"#B0A08C",e:"#D9CFC0",acc:"#6B4326",
  sun:"rgba(200,230,245,.22)",sun2:"rgba(238,248,255,.6)",
  wx:"fizz",mod:"slick",prop:"pipes",ground:"metal"}];
const hx=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
WORLDS.forEach(w=>{w.A=hx(w.a);w.B=hx(w.b);w.P=hx(w.p);w.PT=hx(w.pt);});
const ZONE=280,worldAt=m=>WORLDS[Math.floor(Math.max(0,m)/ZONE)%WORLDS.length];

/* ══════ PHYSICS ══════════════════════════════════════════════════ */
const APEX=120,AT=21,G=(2*APEX)/(AT*AT),JV=-(2*APEX)/AT;
const FALL=2.2,MAXV=17,SPD=4.5,COY=5,BUF=8,DASH_V=13,DASH_T=10,DASH_CD=48;

/* ══════ RUN STATE ════════════════════════════════════════════════ */
let ST="menu",frame=0,camX=0,shake=0,hstop=0,flash=0,deadAt=0,paused=false;
let plats=[],orbs=[],foes=[],wx=[],clouds=[],shots=[];
let dist=0,orbs_=0,crys=0,combo=0,comboMax=1,comboT=0,jumps=0,perfect=0,edgeX=0;
let juice=0,juiceMax=480,meter=0,hp=3,hpMax=3,iFr=0,worldI=0;
let boss=null,nextBoss=350,evt=null,nextEvt=150,healT=0,elites=0,bossWins=0;
let RMOD=null;                    /* daily modifier snapshot, frozen per run */
let timeScale=1,slowT=0;
let doubleJumped=false,dashedOnce=false,bossSeen=0,runFruit=0;
let genPrevY=null;                 /* last generated lane height, for NODBL rise clamping */
let shieldUp=false;                /* Squid: absorbs the first hit of a run */
let kills=0,juiceUses=0,juiceExtRun=0;   /* run-over screen counters */
let magT=0;                             /* Coin Magnet pick-up, frames left */
const P={x:80,y:200,w:22,h:30,vx:0,vy:0,grd:false,lg:-999,sx:1,sy:1,face:1,rot:0,air:0,
         jumpsUsed:0,dash:0,dashCd:0,blastCd:0,wall:0,lastSafe:{x:80,y:200}};

/* ── particles: fixed-size ring buffer, zero allocation at runtime.
   The original pushed into an unbounded array and rebuilt it with
   .filter() every frame — one of the larger GC sources on mobile. ── */
const PMAX=380,PART=new Array(PMAX);
for(let i=0;i<PMAX;i++)PART[i]={x:0,y:0,vx:0,vy:0,life:0,r:1,gold:false};
let pIdx=0;
function spark(x,y,vx,vy,r,gold,life){
  const q=PART[pIdx];pIdx=(pIdx+1)%PMAX;
  q.x=x;q.y=y;q.vx=vx;q.vy=vy;q.r=r;q.gold=!!gold;q.life=life||1;return q;}
function burst(n,x,y,sp,r,gold){
  for(let i=0;i<n;i++)spark(x,y,(Math.random()-.5)*sp,(Math.random()-.5)*sp,r*(.6+Math.random()*.8),gold);}
function clearParts(){for(let i=0;i<PMAX;i++)PART[i].life=0;}

/* ── trail: ring buffer ── */
const TMAX=22,TRAIL=new Array(TMAX);
for(let i=0;i<TMAX;i++)TRAIL[i]={x:0,y:0,rot:0,life:0};
let tIdx=0;
function clearTrail(){for(let i=0;i<TMAX;i++)TRAIL[i].life=0;}

/* ── floating text popups (new: readable damage + pickup feedback) ── */
const POPMAX=24,POPS=new Array(POPMAX);
for(let i=0;i<POPMAX;i++)POPS[i]={x:0,y:0,txt:"",col:"#FFE9A0",s:13,life:0,vy:-1};
let popIdx=0;
function pop(x,y,txt,col,s){
  const q=POPS[popIdx];popIdx=(popIdx+1)%POPMAX;
  q.x=x;q.y=y;q.txt=txt;q.col=col||"#FFE9A0";q.s=s||13;q.life=1;q.vy=-1.05;return q;}
function clearPops(){for(let i=0;i<POPMAX;i++)POPS[i].life=0;}

/* ── in-place compaction: keeps the per-frame allocation count at zero
   where the original allocated 7 fresh arrays every frame ── */
function compact(a,keep){let j=0;for(let i=0;i<a.length;i++){const v=a[i];if(keep(v))a[j++]=v;}a.length=j;}

/* ══════ SPRITE CACHES ════════════════════════════════════════════
   ctx.shadowBlur is the single most expensive 2D-canvas property on
   mobile GPUs, and the original set it per orb (up to ~30 on screen),
   per glowing enemy, on the boss and on the player. Pre-rendered
   radial-gradient sprites do the same job for a drawImage each. */
function makeGlow(col,r){
  /* Returns null rather than throwing if the browser refuses another
     canvas context (iOS does this under canvas/memory pressure). Glows
     are decoration — losing them must never stop the game booting. */
  try{
    const c=document.createElement("canvas");c.width=c.height=r*2;
    const g=c.getContext("2d");
    if(!g)return null;
    const rg=g.createRadialGradient(r,r,0,r,r,r);
    /* The outer stop MUST be this colour at alpha 0, not transparent
       black: canvas gradients interpolate un-premultiplied, so fading to
       rgba(0,0,0,0) drags every glow through grey. On the old dark-navy
       backdrop that was invisible; on the bright fruit worlds it ringed
       every pickup with a muddy halo. */
    const clear=col.replace(/^rgba?\(([^)]+)\)$/,(m,p)=>{
      const q=p.split(",");return "rgba("+q[0]+","+q[1]+","+q[2]+",0)";});
    rg.addColorStop(0,col);rg.addColorStop(.35,col);
    rg.addColorStop(1,clear==col?"rgba(255,255,255,0)":clear);
    g.globalAlpha=1;g.fillStyle=rg;g.beginPath();g.arc(r,r,r,0,7);g.fill();
    return c;
  }catch(e){return null;}}
const GLOW_ORB=makeGlow("rgba(255,214,90,.62)",22);
const GLOW_CRY=makeGlow("rgba(140,235,255,.66)",30);
const GLOW_HOT=makeGlow("rgba(255,122,47,.7)",26);
const GLOW_RED=makeGlow("rgba(255,95,122,.6)",46);
const GLOW_GRN=makeGlow("rgba(111,231,140,.75)",54);
const GLOW_WHT=makeGlow("rgba(255,255,255,.5)",34);
const GLOW_PUR=makeGlow("rgba(190,120,255,.6)",46);
const GLOW_GRN2=makeGlow("rgba(140,220,90,.55)",46);
let GLOW_JUICE=makeGlow("hsla(0,95%,65%,.6)",40),juiceHue=-1;
function juiceGlow(){
  const h=(frame*7)%360|0, q=h-(h%18);
  if(q!==juiceHue){juiceHue=q;GLOW_JUICE=makeGlow("hsla("+q+",95%,65%,.6)",40);}
  return GLOW_JUICE;}

/* runner sprite: the trail used to re-run the full vector draw for each
   of ~18 ghosts every frame. Now the body is rasterised once per frame
   and the ghosts are drawImage blits. */
const RSPR=document.createElement("canvas");RSPR.width=88;RSPR.height=120;
const rsp=RSPR.getContext("2d");          /* may be null — bakeRunner guards */
let rsprKey="";
function bakeRunner(kit){
  if(!rsp)return;
  const key=me().id+"|"+kit.b+"|"+kit.e;
  if(key===rsprKey&&frame%2)return;              /* cheap: refresh every other frame */
  rsprKey=key;
  rsp.setTransform(1,0,0,1,0,0);rsp.clearRect(0,0,88,120);
  rsp.save();rsp.translate(22,30);rsp.scale(2,2);
  try{me().draw(rsp,P.w,P.h,P.face,kit,frame);}catch(e){}
  rsp.restore();}

/* ══════ INPUT ════════════════════════════════════════════════════ */
let steer=0, kbd={l:false,r:false}, bufAt=-999, jumpHeld=false, jumpFrame=-999;
function tryJump(){ bufAt=frame; if(ST==="dead"&&frame-deadAt>25) start(); }
/* Grape's GRAPE BLAST. It reuses the existing `shots` array with a
   `friendly` flag, so there is one projectile list, one compaction pass
   and one culling rule rather than a parallel system. Friendly shots are
   skipped by the player-damage test and collide with enemies instead. */
const BLAST_CD=26;
function fireBlast(){
  if(P.blastCd>0)return false;
  P.blastCd=BLAST_CD;
  shots.push({x:P.x+P.w/2+P.face*12,y:P.y+P.h*.45,vx:P.face*8.2,vy:-1.6,
              k:"blast",friendly:1,bounce:3,life:150});
  sfx("dash");buzz(8);
  for(let i=0;i<5;i++)spark(P.x+P.w/2+P.face*12,P.y+P.h*.45,P.face*2,(Math.random()-.5)*2,2,true);
  return true;
}
function tryDash(){
  /* Grape trades the dash for the blast — one button, one clear identity */
  if(has("blast")&&ST==="play"&&!paused){fireBlast();return;}
  if(ST!=="play"||paused||P.dashCd>0)return;
  P.dash=DASH_T*(has("dash")?1.6:1);                /* the `dash` passive was never implemented */
  P.dashCd=DASH_CD*(has("dash")?.6:1);
  P.vy=0;sfx("dash");buzz(14);dashedOnce=true;
  for(let i=0;i<10;i++)spark(P.x+P.w/2,P.y+P.h/2,-P.face*(2+Math.random()*4),(Math.random()-.5)*3,1.5+Math.random()*2.5,juice>0);
}
/* single keydown listener — the original registered two, so every key
   press ran the handler chain twice */
addEventListener("keydown",e=>{
  const c=e.code;
  if(c==="Space"||c==="ArrowUp"||c==="KeyW"){jumpHeld=true;e.preventDefault();}
  if(e.repeat)return;
  usedTouch=false;
  if(c==="ArrowLeft"||c==="KeyA")kbd.l=true;
  if(c==="ArrowRight"||c==="KeyD")kbd.r=true;
  if(c==="ShiftLeft"||c==="ShiftRight"||c==="KeyK")tryDash();
  if(c==="KeyP"||c==="Escape")togglePause();
  if(c==="Space"||c==="ArrowUp"||c==="KeyW")tryJump();
});
addEventListener("keyup",e=>{
  const c=e.code;
  if(c==="ArrowLeft"||c==="KeyA")kbd.l=false;
  if(c==="ArrowRight"||c==="KeyD")kbd.r=false;
  if(c==="Space"||c==="ArrowUp"||c==="KeyW")jumpHeld=false;});

/* ══════ TOUCH — SCHEME A (gestures) ══════════════════════════════
   tap = jump · slide = steer · hold = dash

   The old scheme fired dash on a downward *flick*, which shared its whole
   input space with steering: a fast diagonal steer read as a flick and
   dashed, and because the dash test ran on every move the same drag could
   trigger it after the player had already committed to steering. Dash is
   now a deliberate HOLD, and the three gestures are mutually exclusive:

     - a touch becomes a STEER once it moves past DEAD horizontally;
     - a touch becomes a DASH only after HOLD_MS of near-stillness;
     - moving past the steer threshold cancels the pending dash outright;
     - releasing before HOLD_MS cancels it too, so dash never fires on
       release (the old flick could land after the finger was already up).

   Hold progress is published as dashChg so the HUD can draw a charge ring —
   the player can see the dash arming instead of guessing. */
const DEAD=7, RANGE=58, HOLD_MS=170, HOLD_SLOP=16;
let prime=null, dashChg=0;
/* Multi-touch: only the first finger drives movement, but a second finger
   anywhere still counts as a jump, so two-thumb play works as expected. */
cv.addEventListener("pointerdown",e=>{
  e.preventDefault();
  if(e.pointerType!=="mouse")usedTouch=true;
  if(paused||ST==="menu"||rotating)return;
  if(OPT.scheme==="buttons"&&usedTouch)return;   /* pad owns input in scheme B */
  if(prime===null){
    try{cv.setPointerCapture(e.pointerId);}catch(_){}
    prime={id:e.pointerId,ax:e.clientX,x0:e.clientX,y0:e.clientY,
           t0:performance.now(),mode:"",fired:false};
  }
  tryJump();jumpHeld=true;
},{passive:false});
cv.addEventListener("pointermove",e=>{
  if(!prime||e.pointerId!==prime.id)return;
  e.preventDefault();
  let dx=(e.clientX-prime.ax)/VS;
  /* Past the steer threshold this is a steer, permanently — a pending dash
     is cancelled and cannot re-arm for the life of this touch. */
  if(prime.mode!=="steer"&&Math.abs(e.clientX-prime.x0)/VS>HOLD_SLOP)prime.mode="steer";
  if(dx>RANGE){prime.ax=e.clientX-RANGE*VS;dx=RANGE;}
  if(dx<-RANGE){prime.ax=e.clientX+RANGE*VS;dx=-RANGE;}
  steer=Math.abs(dx)<DEAD?0:clamp((dx-Math.sign(dx)*DEAD)/(RANGE-DEAD),-1,1);
  if(OPT.inv)steer*=-1;
},{passive:false});
/* Hold-to-dash is resolved on the frame clock, not on move events: a finger
   held perfectly still emits no pointermove at all, so a move-driven test
   could never have fired. Time-based, so it behaves the same at 60 and
   120 Hz. */
function touchTick(){
  if(!prime||OPT.scheme==="buttons"){dashChg=0;return;}
  if(prime.mode==="steer"||prime.fired){dashChg=0;return;}
  const held=performance.now()-prime.t0;
  dashChg=clamp(held/HOLD_MS,0,1);
  if(held>=HOLD_MS){prime.fired=true;prime.mode="dash";dashChg=0;tryDash();}
}
function endTouch(e){
  if(prime&&e.pointerId===prime.id){prime=null;steer=0;jumpHeld=false;dashChg=0;}
}
["pointerup","pointercancel","lostpointercapture"].forEach(v=>cv.addEventListener(v,endTouch));
/* Any focus/visibility/orientation change drops every held input. Without
   this a finger down when the app backgrounded left steer latched on. */
function clearInput(){
  prime=null;steer=0;jumpHeld=false;dashChg=0;
  kbd.l=false;kbd.r=false;padL=false;padR=false;
  document.querySelectorAll(".pbtn.hold").forEach(n=>n.classList.remove("hold"));
}
addEventListener("blur",clearInput);
addEventListener("orientationchange",clearInput);
document.addEventListener("visibilitychange",()=>{if(document.hidden)clearInput();});

/* ══════ TOUCH — SCHEME B (on-screen buttons) ═════════════════════
   Steering is held, jump and dash are discrete. Separate buttons mean the
   two can never be confused, which is the main complaint gestures attract. */
let padL=false,padR=false;
function bindHold(id,on,off){
  const n=$(id);
  n.addEventListener("pointerdown",e=>{
    e.preventDefault();e.stopPropagation();
    usedTouch=true;n.classList.add("hold");
    try{n.setPointerCapture(e.pointerId);}catch(_){}
    on();
  },{passive:false});
  const up=e=>{e.preventDefault();e.stopPropagation();n.classList.remove("hold");if(off)off();};
  ["pointerup","pointercancel","lostpointercapture"].forEach(v=>n.addEventListener(v,up,{passive:false}));
}
bindHold("pLeft", ()=>{padL=true;}, ()=>{padL=false;});
bindHold("pRight",()=>{padR=true;}, ()=>{padR=false;});
bindHold("pJump", ()=>{tryJump();jumpHeld=true;}, ()=>{jumpHeld=false;});
bindHold("pDash", ()=>{tryDash();});
function syncSchemeUI(){
  const on=OPT.scheme==="buttons";
  $("schGesture").classList.toggle("on",!on);
  $("schButtons").classList.toggle("on",on);
  $("pad").classList.toggle("show",on&&usedTouch&&ST==="play"&&!paused);
}
["schGesture","schButtons"].forEach(id=>$(id).addEventListener("click",()=>{
  OPT.scheme=$(id).dataset.scheme;
  clearInput();syncOpts();syncSchemeUI();sfx("click");
}));
/* iOS: block pinch-zoom, long-press menus and double-tap zoom outright */
["gesturestart","gesturechange","gestureend"].forEach(v=>
  document.addEventListener(v,e=>e.preventDefault(),{passive:false}));
document.addEventListener("contextmenu",e=>e.preventDefault());
document.addEventListener("dblclick",e=>e.preventDefault(),{passive:false});
/* ══════ WORLD GEN ════════════════════════════════════════════════ */
/* ══════ DIFFICULTY CURVE ═════════════════════════════════════════
   The old curve was one straight line, `min(dist/1600,1)`: it ramped hard
   from the very first metre and then stopped dead at 1600 m, so the opening
   punished new players and everything past 1600 m was flat.

   Five staged bands instead. Each band is interpolated internally, so the
   curve is continuous (no difficulty cliffs at a boundary), but the SLOPE
   differs per band: gentle to 400 m, normal to 1000 m, then progressively
   more demanding, and past 3500 m it keeps creeping without ever reaching
   a speed that outruns human reaction time.

     stage 1   0- 400m  d 0.00->0.10   beginner-safe, wide platforms
     stage 2 400-1000m  d 0.10->0.34   normal runner challenge
     stage 3 1000-2000m d 0.34->0.62   advanced combinations
     stage 4 2000-3500m d 0.62->0.86   dense, decision-heavy
     stage 5 3500m+     d 0.86->1.00   prestige, complexity not reflexes

   d is consumed by gen() for gap length, platform width and hazard rates.
   It is deliberately capped at 1 so no sequence can become ungeneratable. */
const STAGES=[
  {from:0,    to:400,  d0:0,   d1:.10, n:1},
  {from:400,  to:1000, d0:.10, d1:.34, n:2},
  {from:1000, to:2000, d0:.34, d1:.62, n:3},
  {from:2000, to:3500, d0:.62, d1:.86, n:4},
  {from:3500, to:6000, d0:.86, d1:1,   n:5}];
function stageOf(m){
  const x=Math.max(0,m||0);
  for(const s of STAGES)if(x<s.to)return s.n;
  return 5;
}
function diff(){
  const x=Math.max(0,dist);
  for(const s of STAGES){
    if(x>=s.to)continue;
    const t=(x-s.from)/(s.to-s.from);
    return s.d0+(s.d1-s.d0)*clamp(t,0,1);
  }
  return 1;
}
const ELITE_FROM=500;
/* Rot variants — a spoiled fruit can be mouldy, frozen, sour or shadowed.
   Each is a different material on the same silhouette, never a plain
   recolour: the tint pairs with a behaviour change in mkFoe(). */
const TINT={mould:["#8FA65C","#E8F0C0"],frost:["#9BDCE8","#EAFBFF"],sour:["#C6FF3B","#F0FFD0"],
            shadow:["#5A4670","#B8A8D4"],elite:["#B15FE0","#FFD24A"]};
/* ══════ THE SPOILED FRUITS ═══════════════════════════════════════
   Twelve enemies, funny rather than frightening, each with its own
   silhouette, material and danger level. Variants are meaningful
   gameplay changes (speed, hp, stomp rule, ranged vs melee), not palette
   swaps — `nostomp` means the top of it will hurt you, so the player has
   to read the shape before committing to a jump.

   Behaviour families (the step() switch keys off these):
     hop     ground bouncer      roll   spinning charger, unstompable
     float   drifting seeker     flap   flying diver
     walk    ground patroller    tank   3-hit heavy
     phase   translucent drifter, unstompable
     ambush  pops out of the ground with a visible wind-up
     leap    jumping attacker
     shoot   ranged, telegraphed shot
   ══════════════════════════════════════════════════════════════════ */
const MON={
 moldblob: {w:24,h:19,ground:1,hp:1,fam:"hop",  col:"#8FA65C",acc:"#D6E8A8",n:"MOLD BLOB"},
 chili:    {w:22,h:22,ground:1,hp:1,fam:"roll", col:"#E8402B",acc:"#FFC98A",nostomp:1,n:"FIRE CHILI"},
 blueberry:{w:24,h:24,air:1,   hp:1,fam:"float",col:"#5A63C4",acc:"#B8C0FF",n:"ROTTEN BLUEBERRY"},
 garlic:   {w:24,h:16,air:1,   hp:1,fam:"flap", col:"#EDE4D2",acc:"#B9A98C",n:"GARLIC BOMBER"},
 potato:   {w:22,h:22,ground:1,hp:1,fam:"walk", col:"#B08048",acc:"#7C5628",n:"EVIL POTATO"},
 broccoli: {w:26,h:26,ground:1,hp:3,fam:"tank", col:"#4E9E3E",acc:"#8FD44A",n:"MEAN BROCCOLI"},
 onion:    {w:24,h:22,air:1,   hp:1,fam:"phase",col:"#E8D4EE",acc:"#9B54DC",phase:1,nostomp:1,n:"CRY ONION"},
 lime:     {w:20,h:26,ground:1,hp:1,fam:"ambush",col:"#A8DC3C",acc:"#5F9410",trap:1,n:"LIME SNEAK"},
 tomato:   {w:20,h:24,ground:1,hp:1,fam:"leap", col:"#E8323C",acc:"#FF8A6E",n:"ANGRY TOMATO"},
 archer:   {w:26,h:22,air:1,   hp:1,fam:"shoot",col:"#D6304C",acc:"#FFD24A",n:"STRAWBERRY ARCHER"},
 lemon:    {w:23,h:20,ground:1,hp:2,fam:"hop",  col:"#D9CE4A",acc:"#F5EEA8",slow:1,n:"MOLDY LEMON"},
 guard:    {w:24,h:24,ground:1,hp:2,fam:"walk", col:"#E8B02B",acc:"#8F5A18",nostomp:1,n:"PINEAPPLE GUARD"}};
/* the behaviour family each type animates and steps as */
const FAM=t=>(MON[t]||MON.moldblob).fam;
const WORLDBAG={
 "ORANGE ORCHARD":  ["moldblob","tomato","potato","lime","blueberry"],
 "BERRY FOREST":    ["blueberry","onion","moldblob","archer","lime"],
 "WATERMELON BEACH":["tomato","garlic","moldblob","chili","archer"],
 "KIWI JUNGLE":     ["lime","broccoli","potato","blueberry","moldblob"],
 "GRAPE CASTLE":    ["onion","archer","blueberry","garlic","chili"],
 "MANGO DESERT":    ["chili","lemon","potato","garlic","tomato"],
 "PINEAPPLE VOLCANO":["chili","guard","tomato","archer","potato"],
 "SODA FACTORY":    ["guard","broccoli","garlic","onion","archer"]};
function mkFoe(t,x,y,pl){
  const m=MON[t],el=dist>ELITE_FROM&&Math.random()<(RMOD==="MADNESS"?.16:.08);
  let col=m.col,acc=m.acc,vk="";
  /* A rot variant is a different creature to fight, not a repaint: sour is
     quicker, frost is slower but tougher, shadow is quicker still. */
  if(t==="moldblob"&&Math.random()<.5){
    const ks=["mould","frost","sour","shadow"];vk=ks[Math.floor(Math.random()*ks.length)];
    col=TINT[vk][0];acc=TINT[vk][1];}
  if(el){col=TINT.elite[0];acc=TINT.elite[1];elites++;}
  const sc=el?1.32:1;
  let hp=m.hp+(el?1:0); if(vk==="frost")hp+=1;
  const vmul=vk==="sour"?1.5:vk==="shadow"?1.35:vk==="frost"?.6:1;
  return {t,x,y,w:m.w*sc,h:m.h*sc,hp,hpMax:hp,el,col,acc,vk,
          p:pl||null,base:y,dead:0,st:0,t0:0,rot:0,blink:0,beam:0,flashT:0,
          vx:(Math.random()<.5?-1:1)*(m.fam==="roll"?1.7:m.slow?.5:.75)*(el?1.4:1)*vmul,vy:0,
          cool:70+Math.random()*90,ph:Math.random()*6};
}
function spawnFoe(wl,pl,gap,y){
  const bag=WORLDBAG[wl.n]||["moldblob","blueberry"];
  const t=bag[Math.floor(Math.random()*bag.length)],m=MON[t];
  if(m.ground){ if(pl.w<66)return null; return mkFoe(t,pl.x+pl.w*.5-m.w/2,pl.y-m.h,pl); }
  return mkFoe(t,pl.x-gap*.5,y-90-Math.random()*50,null);
}
/* ══════ REACHABILITY BUDGET ══════════════════════════════════════
   Derived from the real physics constants above, not guessed:

     rise time      |JV|/G                    = 21 frames, apex 120px
     fall time      sqrt(2h/(G*FALL))
     horizontal     SPD per frame (4.5 — the SLOWEST hero; Bolt is faster,
                    so anything reachable at SPD is reachable by everyone)

   single jump  ~35 frames airtime -> ~158px of ground, apex 120px
   double jump  ~58 frames airtime -> ~262px of ground, apex 213px

   The generator could emit a 211px gap (gaps-world at full difficulty) and
   a 150px rise. With a double jump both are comfortable. With NODBL active
   both are flatly impossible — an unavoidable death with no route. The
   NODBL caps below sit under the single-jump budget with a safety margin
   for imperfect timing, and are asserted by test/genvalidate.mjs. */
const REACH={
  single:{gap:158,rise:120},
  double:{gap:262,rise:213},
  /* usable budget after a margin for human timing */
  nodblGap:120, nodblRise:88 };
function gen(x){
  let guard=0;
  const nodbl=RMOD==="NODBL";
  while(x<camX+W+600&&guard++<80){
    const m=Math.max(0,Math.floor(x/10)),wl=worldAt(m),d=diff();
    let gap=62+Math.random()*(70+d*44); if(wl.mod==="gaps")gap*=1.2;
    let w=Math.max(54,(108-d*34)+Math.random()*88),y=225+Math.random()*150;
    /* NODBL: clamp the void and the climb into single-jump range, and widen
       the landing so a slightly early jump still connects. */
    if(nodbl){
      gap=Math.min(gap,REACH.nodblGap);
      w=Math.max(w,72);
      const prevY=genPrevY===null?y:genPrevY;
      y=Math.max(y,prevY-REACH.nodblRise);   /* never climb more than one jump */
    }
    genPrevY=y;
    const pl={x:x+gap,y,w,h:18,type:"n",base:y,spike:false,life:0,gone:false,
              dir:Math.random()<.5?-1:1,mimic:0,high:false};
    const r=Math.random();
    if(r<.07)pl.type="b";
    else if(wl.mod==="ice"&&r<.5)pl.type="i";
    else if((wl.mod==="moving"||wl.mod==="lowg")&&r<.42)pl.type="m";
    else if(wl.n==="STORM"&&r<.3)pl.type="c";
    else if(d>.25&&r<.14)pl.type="v";                 // conveyor
    else if(d>.3&&r<.2&&w>66){pl.type="k";pl.mimic=1;} // mimic — now visibly cracked
    else if(wl.mod==="spikes"&&r<.26&&w>72)pl.spike=true;
    else if(d>.4&&r<.14)pl.type="m";
    plats.push(pl);

    if(Math.random()<.85){const n=2+Math.floor(Math.random()*3),sx=x+gap-gap*.72;
      for(let i=0;i<n;i++){const t=i/(n-1||1);
        orbs.push({x:sx+t*gap*.82,y:y-56-Math.sin(t*Math.PI)*42,ph:Math.random()*6,cry:false,got:false,fall:0});}}

    /* risk vs reward — a high road worth far more, over nothing.
       It sits 168-208px above the lane, which is past a single jump's 120px
       apex, so it is skipped entirely when double jump is disabled rather
       than dangling an unreachable reward. */
    if(d>.18&&Math.random()<.2&&!nodbl){
      const hy=y-168-Math.random()*40;
      for(let i=0;i<3;i++){
        const hx2=x+gap+i*54;
        plats.push({x:hx2,y:hy-i*6,w:34,h:12,type:"n",base:hy-i*6,spike:false,life:0,gone:false,
                    high:true,dir:1,mimic:0});
        orbs.push({x:hx2+17,y:hy-i*6-30,ph:Math.random()*6,cry:i===1,got:false,fall:0});
      }
    }
    /* floating crystal: 118-158px up. Under NODBL keep it inside the
       single-jump apex so the extension pickup stays collectable. */
    if(Math.random()<.08)orbs.push({x:pl.x+pl.w/2,
      y:y-(nodbl?70+Math.random()*30:118+Math.random()*40),
      ph:Math.random()*6,cry:true,got:false,fall:0});
    /* POWER-UPS — rare, one per ~30 platforms, and always on the main
       lane where they are reachable without the high road. Three kinds,
       three unmistakable shapes: bubble shield, horseshoe magnet, bomb. */
    if(Math.random()<.034){
      const ks=["shield","magnet","bomb"];
      orbs.push({x:pl.x+pl.w/2,y:y-74-Math.random()*30,ph:Math.random()*6,
                 cry:false,pu:ks[Math.floor(Math.random()*ks.length)],got:false,fall:0});}
    /* fruit for the Juice Lab — rarer than crystals, and visibly different */
    if(Math.random()<(has("fruity")?.165:.055)){
      const ks=Object.keys(FRUIT);
      orbs.push({x:pl.x+pl.w/2,y:y-84-Math.random()*46,ph:Math.random()*6,
                 cry:false,fruit:ks[Math.floor(Math.random()*ks.length)],got:false,fall:0});}

    const rate=(RMOD==="MADNESS"?.5:.26);
    if(d>.06&&Math.random()<rate){const f=spawnFoe(wl,pl,gap,y);if(f)foes.push(f);}
    x=x+gap+w;
  }
  return x;
}

/* ══════ DAILY MODIFIER ═══════════════════════════════════════════
   Daily modifiers silently rewrote core rules. They are now surfaced on
   the start screen and in the HUD, and can be switched off in pause.

   NOJUICE used to be in this list. It removed Juice Mode outright — the
   mechanic the game is named after and the thing the meter, the HUD, the
   tutorial and six runner passives are all built around — on roughly one
   day in six, announced only by 9px text that lands in the letterbox on
   a phone. That is why Juice Mode "appeared to be missing". It is
   replaced by JUICERUSH, which changes Juice Mode instead of deleting
   it: it triggers sooner but burns faster. No modifier can now switch a
   core verb off entirely. */
/* FAST was labelled "Double speed" while the code ran 1.34x — the label
   promised a modifier the game never implemented, and 1.34x still broke
   boss timing and moving-platform intercepts. It is now an honest 1.25x
   "Turbo Day", and it pays for itself with a +40% coin bonus so the extra
   risk buys something. (Reward applied in die(); see TURBO_COIN.) */
const MODS=[{k:"NODBL",t:"No double jump"},{k:"ONEHEART",t:"One heart"},
            {k:"FAST",t:"Turbo Day — +25% speed, +40% coins"},
            {k:"JUICERUSH",t:"Juice at 60%, burns faster"},
            {k:"MADNESS",t:"Monster madness"},{k:"DASHONLY",t:"Instant dash recharge"}];
const TURBO_SPD=1.25, TURBO_COIN=1.4;
let MOD=null;
function rollMod(){const r=seeded(today()+"m");MOD=MODS[Math.floor(r()*MODS.length)].k;}
const modText=k=>{const m=MODS.find(x=>x.k===(k||MOD));return m?m.t:"";};

function applyPassives(){
  const r=me(); activePass=r.pas;
  if(activePass==="random"){const ks=Object.keys(PASS).filter(k=>k!=="random"&&k!=="none");
    activePass=ks[Math.floor(Math.random()*ks.length)];}
  hpMax=3+(has("heart")?1:0)-(has("rich")?1:0);
  if(RMOD==="ONEHEART")hpMax=1;
  hpMax=Math.max(1,hpMax);
  hp=hpMax; meter=has("startjuice")?50:0; healT=0;
  shieldUp=has("shield");            /* one absorb per run, refreshed on start */
  P.blastCd=0;magT=0;
}
/* every juice gain routes through here so Nature's +60% and the Juice Lab
   brews apply uniformly instead of being sprinkled per call site */
function gainJuice(n){
  if(juice>0)return;                       /* frozen while active */
  let m=1;
  if(has("harvest"))m*=1.6;
  if(has("speed"))m*=1.3;                  /* Bolt: shorter Juice Mode, but he
                                              reaches it 30% sooner — the trade
                                              that stops his passive reading as
                                              a straight penalty */
  if(BREW==="mega")m*=1.25;
  meter+=n*m;
}
/* ══════ JUICE MODE DURATION ══════════════════════════════════════
   All durations are frames at the fixed 60 Hz sim. Named constants so the
   balance is readable and testable rather than scattered magic numbers.

   Base was 480f (8s) and Bolt multiplied it by 0.6 — a 40% cut that made
   the game's headline reward feel like a punishment for picking him. Base
   is now 12s, and Bolt keeps a genuine 9.75s while gaining a faster meter
   and a bigger score multiplier (see gainJuice / the scoring multiplier)
   so his shorter window is a trade, not a tax. */
const JUICE_BASE_F=720;   /* 12.0s — standard heroes                        */
const JUICE_BOLT_F=585;   /*  9.75s — Bolt, compensated elsewhere           */
const JUICE_CAP_F=900;    /* 15.0s — hard ceiling, extensions included      */
const JUICE_EXT_F=30;     /*  +0.5s per crystal collected while juiced      */
let juiceExt=0;           /* frames added this activation, for the HUD      */
function juiceLen(){
  let n=has("speed")?JUICE_BOLT_F:JUICE_BASE_F;
  if(has("juicelong"))n=Math.round(n*1.5);
  if(BREW==="rainbow")n=Math.round(n*1.6);
  if(RMOD==="JUICERUSH")n=Math.round(n*.6);
  return Math.min(n,JUICE_CAP_F);           /* the cap is absolute */
}
/* Skill-based extension: crystals only, and only while already juiced.
   Crystals are rare enough that this cannot loop forever, and the 15s cap
   is enforced here as well as in juiceLen() so no path can exceed it. */
function extendJuice(x,y){
  if(juice<=0)return false;
  if(juiceMax>=JUICE_CAP_F&&juice>=JUICE_CAP_F)return false;
  const before=juice;
  juiceMax=Math.min(JUICE_CAP_F,juiceMax+JUICE_EXT_F);
  juice=Math.min(JUICE_CAP_F,juice+JUICE_EXT_F);
  if(juice===before)return false;
  juiceExt+=juice-before;juiceExtRun+=juice-before;
  sfx("juiceExt");buzz(12);
  pop(x,y-30,"+0.5s","#9BEFFF",15);
  ring(P.x+P.w/2,P.y+P.h/2,"#9BEFFF",4);
  return true;
}
const juiceThresh=()=>RMOD==="JUICERUSH"?60:100;

/* ══════ TUTORIAL (new) ═══════════════════════════════════════════ */
let steerUsed=false,tutI=0,tutHold=0;
const TUT=[
 {t:()=>usedTouch?"TAP ANYWHERE TO JUMP":"SPACE / W TO JUMP",             ok:()=>jumps>=1},
 {t:()=>usedTouch?"TAP AGAIN MID-AIR FOR A DOUBLE JUMP":"PRESS IT AGAIN MID-AIR",
  ok:()=>doubleJumped, skip:()=>RMOD==="NODBL"},   /* else this step is unsatisfiable and the coach soft-locks */
 {t:()=>usedTouch?"SLIDE YOUR FINGER TO STEER":"A / D TO STEER",          ok:()=>steerUsed},
 {t:()=>usedTouch?"SWIPE DOWN TO DASH THROUGH ENEMIES":"SHIFT TO DASH THROUGH ENEMIES",ok:()=>dashedOnce},
 {t:()=>"GRAB ORBS TO FILL THE JUICE METER",                              ok:()=>juice>0||meter>=45}
];
function tutStep(){
  if(SAVE.tut||ST!=="play")return;
  while(tutI<TUT.length&&TUT[tutI].skip&&TUT[tutI].skip())tutI++;
  if(tutI>=TUT.length){SAVE.tut=1;save();return;}
  if(TUT[tutI].ok()){tutI++;tutHold=48;sfx("ding");}
  if(tutHold>0)tutHold--;
}

/* ══════ RUN LIFECYCLE ════════════════════════════════════════════ */
function start(){
  RMOD=OPT.mod?MOD:null;
  plats=[{x:0,y:330,w:320,h:18,type:"n",base:330,spike:false,life:0,gone:false,dir:1,mimic:0,high:false}];
  orbs.length=0;foes.length=0;wx.length=0;shots.length=0;clouds.length=0;
  clearParts();clearTrail();clearPops();
  for(let i=0;i<9;i++)clouds.push({x:Math.random()*2600,y:40+Math.random()*140,s:.4+Math.random()*.7,w:70+Math.random()*90});
  camX=0;
  edgeX=gen(320);
  Object.assign(P,{x:80,y:260,vx:0,vy:0,grd:false,sx:1,sy:1,rot:0,air:0,jumpsUsed:0,dash:0,dashCd:0,wall:0,lg:-999});
  P.lastSafe={x:80,y:260};
  dist=0;orbs_=0;crys=0;combo=0;comboMax=1;comboT=0;jumps=0;perfect=0;
  juice=0;juiceMax=juiceLen();iFr=0;worldI=0;boss=null;evt=null;
  nextBoss=350;nextEvt=150;elites=0;bossWins=0;
  doubleJumped=false;dashedOnce=false;steerUsed=false;tutI=0;tutHold=0;runFruit=0;
  genPrevY=null;juiceExt=0;kills=0;juiceUses=0;juiceExtRun=0;bossSeen=0;
  /* consume the equipped brew for this run */
  BREW=SAVE.brew||null;
  if(BREW){SAVE.brewed=SAVE.brewed||{};SAVE.brewed[BREW]=1;SAVE.brew="";save();}
  timeScale=1;slowT=0;
  applyPassives();
  shake=0;hstop=0;flash=0;ST="play";paused=false;steer=0;prime=null;
  show(null);updateRot();
  $("pauseBtn").classList.add("show");syncSchemeUI();
  initAudio();layers(1);
}
/* One collision costs exactly one heart. iFr is set BEFORE anything else so
   a second overlapping hazard in the same frame cannot re-enter, and the
   remaining hearts are announced so the player is never guessing. */
function hurt(reason){
  if(iFr>0||juice>0||P.dash>0)return false;
  /* Shield absorbs the hit entirely: no heart lost, but the same i-frames
     so the player still gets a safe window to recover. */
  if(shieldUp){
    shieldUp=false;iFr=80;combo=0;
    sfx("nope");buzz(20);flash=.5;if(!calm())shake=6;
    pop(P.x+P.w/2,P.y-14,"SHIELD BROKEN","#9BEFFF",15);
    ring(P.x+P.w/2,P.y+P.h/2,"#9BEFFF",6);
    for(let i=0;i<16;i++)spark(P.x+P.w/2,P.y+P.h/2,(Math.random()-.5)*6,(Math.random()-.5)*6,2,true);
    P.vy=JV*.5;
    return false;
  }
  hp--;iFr=95;
  sfx("hurt");buzz([0,45,40,45]);flash=.8;if(!calm())shake=9;combo=0;
  hstop=3;                                   /* brief hitstop: the hit reads */
  P.sx=1.34;P.sy=.72;                        /* squash so the body reacts    */
  pop(P.x+P.w/2,P.y-8,"-1 ♥","#FF6B7A",15);
  if(hp>0)pop(P.x+P.w/2,P.y-28,hp+(hp===1?" HEART LEFT":" HEARTS LEFT"),"#FFE9A0",12);
  for(let i=0;i<14;i++)
    spark(P.x+P.w/2,P.y+P.h/2,(Math.random()-.5)*6,(Math.random()-.5)*6,2,false);
  ring(P.x+P.w/2,P.y+P.h/2,"#FF5F7A",5);
  if(hp<=0){die(reason);return true;}
  P.vy=JV*.7;P.vx=-P.face*5;return false;
}
/* The original teleported the player to lastSafe even when that platform
   had already been culled behind the camera, dropping them straight back
   into the void — a fall could eat every heart in about two seconds.
   Now we always land them on a real platform that still exists ahead. */
function respawn(){
  let best=null;
  for(const pl of plats){
    if(pl.gone||pl.high||pl.spike)continue;
    if(pl.x+pl.w<camX+30)continue;
    if(!best||pl.x<best.x)best=pl;
  }
  if(best){P.x=best.x+best.w/2-P.w/2;P.y=best.y-P.h-46;}
  else{P.x=camX+90;P.y=200;
       plats.push({x:camX+40,y:330,w:220,h:18,type:"n",base:330,spike:false,life:0,gone:false,dir:1,mimic:0,high:false});}
  P.vx=0;P.vy=0;P.jumpsUsed=0;P.dash=0;P.grd=false;
  iFr=110;flash=.6;
}
function die(reason){
  if(ST!=="play")return;
  ST="dead";deadAt=frame;sfx("dead");buzz([40,50,80]);flash=1;steer=0;prime=null;
  burst(26,P.x+P.w/2,P.y+P.h/2,7,2.6,false);
  bumpMs("dist",dist,"max");bumpMs("orbs",orbs_,"max");bumpMs("jump",jumps,"max");
  bumpMs("perf",perfect,"max");bumpMs("cryst",crys,"max");
  const rec=dist>SAVE.best;if(rec)SAVE.best=dist;
  let earn=orbs_+crys*10; if(has("rich"))earn=Math.round(earn*1.5);
  if(dist>=500)earn+=150;
  const turbo=RMOD==="FAST"?Math.round(earn*(TURBO_COIN-1)):0;
  earn+=turbo;                              /* Turbo Day pays for its risk */
  const xpG=Math.floor(dist/2)+earn;
  SAVE.coins+=earn;SAVE.totalOrbs+=orbs_;SAVE.xp+=xpG;
  if(comboMax>(SAVE.maxCombo|0))SAVE.maxCombo=comboMax;
  SAVE.fruitTotal=(SAVE.fruitTotal|0)+runFruit;
  checkAch();save();paintAll();
  $("dTitle").textContent=reason;$("dDist").textContent=dist;
  /* The run-over screen used to be one dense line. It is now an itemised
     breakdown, because "why did I earn that?" and "how close am I to the
     next hero?" are the two questions that actually keep a runner playing. */
  const rows=[];
  rows.push(["Distance",dist+" m  (best "+Math.max(dist,SAVE.best|0)+"m)"]);
  rows.push(["Juice drops collected","💧 "+(earn-turbo-(dist>=500?150:0))]);
  if(dist>=500)rows.push(["Distance bonus","💧 +150"]);
  if(turbo)rows.push(["Turbo Day bonus","💧 +"+turbo]);
  rows.push(["Total earned","💧 "+earn]);
  rows.push(["XP earned","+"+xpG]);
  rows.push(["Max combo","×"+comboMax]);
  if(juiceUses)rows.push(["Juice Modes",juiceUses+
    (juiceExtRun>0?"  (+"+(juiceExtRun/60).toFixed(1)+"s earned)":"")]);
  if(kills)rows.push(["Enemies defeated",String(kills)]);
  if(elites)rows.push(["Elites defeated",String(elites)]);
  rows.push(["Boss",bossWins?bossWins+" defeated":(bossSeen?"escaped / survived":"none met")]);
  if(runFruit)rows.push(["Fruit found",String(runFruit)]);
  /* progress toward the cheapest hero the player cannot yet afford */
  const next=RUN.filter(r=>!SAVE.unlocked.includes(r.id)&&r.cost>0)
                .sort((a,b)=>a.cost-b.cost)[0];
  if(next){
    const pc=Math.min(100,Math.floor((SAVE.coins/next.cost)*100));
    rows.push(["Next hero",next.id+"  "+pc+"%  ("+SAVE.coins.toLocaleString()+" / "+next.cost.toLocaleString()+")"]);
  }
  $("dStats").innerHTML=rows.map(r=>
    '<span class="drow"><i>'+r[0]+'</i><b>'+r[1]+'</b></span>').join("");
  $("dRec").style.display=rec?"block":"none";
  show("ovDead");updateRot();$("pauseBtn").classList.remove("show");syncSchemeUI();
  layers(0);
}
function togglePause(){
  if(ST!=="play")return;
  paused=!paused;$("ovPause").classList.toggle("show",paused);
  clearInput();sfx("click");diag();syncSchemeUI();
  layers(paused?0:Math.min(1+Math.floor(dist/500),3));
}
function damageFoe(f){
  const dmg=(has("slayer")?2:1)*(juice>0?2:1);      /* Juice Mode now boosts damage */
  f.hp-=dmg;f.flashT=8;
  sfx("stomp");buzz(12);combo++;comboT=frame;gainJuice(f.el?18:6);kills++;
  if(f.hpMax>1)pop(f.x+f.w/2,f.y-6,"-"+dmg,"#FFFFFF",12);
  burst(f.el?18:10,f.x+f.w/2,f.y+f.h/2,5,2,f.el);
  if(f.hp<=0){
    f.dead=14;
    burst(10,f.x+f.w/2,f.y+f.h/2,6,2.2,true);
    if(f.el){orbs_+=40;gainJuice(24);flash=.6;sfx("cry");pop(f.x+f.w/2,f.y-18,"+40","#FFD24A",14);}
  }
}
/* ══════ STEP ═════════════════════════════════════════════════════ */
function stepParticles(){
  for(let i=0;i<PMAX;i++){const q=PART[i];if(q.life<=0)continue;
    q.x+=q.vx;q.y+=q.vy;q.vy+=.16;q.vx*=.96;q.life-=.035;}
  for(let i=0;i<POPMAX;i++){const q=POPS[i];if(q.life<=0)continue;
    q.y+=q.vy;q.vy*=.94;q.life-=.018;}
}
function step(){
  frame++;
  if(ST!=="play"||paused){
    for(let i=0;i<PMAX;i++){const q=PART[i];if(q.life<=0)continue;
      q.x+=q.vx;q.y+=q.vy;q.vy+=.2;q.life-=.02;}
    shake*=.88;flash*=.9;return;}
  if(hstop>0){hstop--;return;}

  const wl=worldAt(dist),d=diff();
  const wi=Math.floor(dist/ZONE)%WORLDS.length;
  if(wi!==worldI){worldI=wi;layers(Math.min(1+Math.floor(dist/500),3));
    pop(P.x+P.w/2,P.y-34,wl.n,"#FFE9A0",15);}

  /* ── Juice Mode timer ──
     The meter used to keep climbing during Juice Mode, so the instant it
     expired it was already ≥100 and re-triggered immediately — Juice Mode
     never actually ended while orbs kept coming. It is now frozen while
     active, and the last 1.5 s warns audibly and visually instead of
     just stopping dead. */
  if(juice>0){
    juice--;
    /* wind-down: a 3s warning, then a distinct final-second cue, so the end
       is read rather than discovered. The bar also pulses (see the HUD). */
    if(juice===180){sfx("juiceEnd");pop(P.x+P.w/2,P.y-30,"JUICE ENDING","#FFFFFF",12);}
    if(juice===60)sfx("juiceLast");
    if(juice===0){
      layers(Math.min(1+Math.floor(dist/500),3));
      burst(14,P.x+P.w/2,P.y+P.h/2,5,2,true);
      meter=0;
    }
  }
  if(has("heal")){healT++;if(healT>=400*6&&hp<hpMax){hp++;healT=0;sfx("ding");flash=.3;
    pop(P.x+P.w/2,P.y-10,"+1 ♥","#6FCF7F",14);}}

  /* ── movement ── */
  touchTick();                       /* resolve hold-to-dash on the frame clock */
  const padDir=(padR?1:0)-(padL?1:0);
  const dir=kbd.l||kbd.r?((kbd.r?1:0)-(kbd.l?1:0))
           :padDir?(OPT.inv?-padDir:padDir)
           :steer;
  if(Math.abs(dir)>.5)steerUsed=true;
  const spd=SPD*(RMOD==="FAST"?TURBO_SPD:1)*(has("speed")?1.25:1)
            *(juice>0&&BREW==="lightning"?1.35:1);
  if(P.dash>0){
    P.dash--;P.vx=P.face*DASH_V;P.vy=0;
    if(frame%2===0)spark(P.x+P.w/2,P.y+P.h/2,-P.face*2,(Math.random()-.5)*2,2.4,true);
  } else {
    /* Reads the platform recorded at landing instead of re-scanning the
       whole platform list twice per frame for ice and conveyors. */
    const on=P.grd?P.onPl:null;
    const ice=!!on&&on.type==="i"&&!has("icegrip")&&!has("slow");
    /* aircontrol: more steering authority in the air only, so it is felt
       exactly where a runner needs it (mid-jump correction) without making
       ground movement twitchy. */
    const air=!P.grd&&has("aircontrol")?1.35:1;
    P.vx+=(dir*spd*air-P.vx)*(ice?.06:.55);
    if(wl.mod==="wind")P.vx+=Math.sin(frame/90)*.4;
    if(evt&&evt.k==="tornado")P.vx+=.85;
    if(on&&on.type==="v")P.vx+=on.dir*.9;
  }
  if(Math.abs(dir)>.25)P.face=dir>0?1:-1;
  if(P.dashCd>0)P.dashCd-=(RMOD==="DASHONLY"?4:1);
  if(P.blastCd>0)P.blastCd-=(RMOD==="DASHONLY"?4:1);

  P.x+=P.vx;
  P.wall=0;
  for(const pl of plats){
    if(pl.gone||pl.high)continue;
    if(pl.x-camX>W+60||pl.x+pl.w-camX<-60)continue;
    if(P.x+P.w>pl.x&&P.x<pl.x+pl.w&&P.y+P.h>pl.y+4&&P.y<pl.y+pl.h){
      if(P.vx>0){P.x=pl.x-P.w;P.wall=1;}else if(P.vx<0){P.x=pl.x+pl.w;P.wall=-1;}
      P.vx=0;}}

  /* ── jump ── */
  const grace=(frame-P.lg)<=COY,wants=(frame-bufAt)<=BUF;
  /* Straw's TRIPLE JUMP. NODBL still clamps to one, so the daily modifier
     is never silently overridden and the generator's reachability budget
     (which assumes at most a double jump) stays honest. */
  const maxJ=juice>0?99:(RMOD==="NODBL"?1:(has("triplejump")?3:2));
  if(wants){
    if(grace&&P.vy>=0){
      P.vy=JV;P.grd=false;P.lg=-999;bufAt=-999;jumpFrame=frame;P.jumpsUsed=1;
      P.sx=.76;P.sy=1.28;sfx("jump");jumps++;
      for(let i=0;i<5;i++)spark(P.x+P.w/2,P.y+P.h,(Math.random()-.5)*3,Math.random()*1.4,1.5+Math.random()*2);
    } else if(P.wall&&!P.grd){
      P.vy=JV*(has("walljump")?1.12:.95);
      P.vx=-P.wall*(has("walljump")?9:6.5);
      P.face=-P.wall;bufAt=-999;jumpFrame=frame;P.jumpsUsed=has("walljump")?0:1;sfx("dbl");jumps++;
      for(let i=0;i<6;i++)spark(P.x+(P.wall>0?P.w:0),P.y+P.h/2,-P.wall*2,(Math.random()-.5)*3,1.8);
    } else if(P.jumpsUsed<maxJ&&!P.grd){
      P.vy=JV*.88;bufAt=-999;jumpFrame=frame;P.jumpsUsed++;P.sx=.8;P.sy=1.24;sfx("dbl");jumps++;
      P.rot+=P.face*.5;doubleJumped=true;
      for(let i=0;i<8;i++)spark(P.x+P.w/2,P.y+P.h,(Math.random()-.5)*4,Math.random()*2,1.6,juice>0);}}
  if(!jumpHeld&&frame-jumpFrame>6&&P.vy<JV*.55)P.vy=JV*.55;

  if(P.dash<=0){
    const gm=(wl.mod==="lowg"?.72:1);
    P.vy+=(P.vy>0?G*FALL:G)*gm;
    if(P.wall&&P.vy>2.2&&!P.grd)P.vy=2.2;
    if(P.vy>MAXV)P.vy=MAXV;}
  const prevB=P.y+P.h;P.y+=P.vy;
  P.air=P.grd?0:P.air+1;

  for(const pl of plats){
    if(pl.type==="m")pl.y=pl.base+Math.sin((frame+pl.x)/62)*40;
    if(pl.life>0){pl.life--;if(pl.life===0)pl.gone=true;}}

  /* ── landing ── */
  const wasG=P.grd;P.grd=false;P.onPl=null;
  if(P.vy>=0&&P.dash<=0){
    for(const pl of plats){
      if(pl.gone)continue;
      if(pl.x-camX>W+60||pl.x+pl.w-camX<-60)continue;
      if(P.x+P.w>pl.x+2&&P.x<pl.x+pl.w-2&&prevB<=pl.y+2&&P.y+P.h>=pl.y){
        if(pl.spike){if(!hurt("SPIKED")){P.vy=JV*.8;}else return;break;}
        P.y=pl.y-P.h;
        if(!wasG){
          const imp=Math.min(P.vy/MAXV,1);
          P.sx=1+.36*imp;P.sy=1-.32*imp;
          if(!calm())shake=7*imp;
          if(imp>.5&&!calm())hstop=2+Math.round(imp*2);
          sfx("land",imp);if(imp>.5)buzz(11);
          for(let i=0;i<8;i++)spark(P.x+P.w/2,pl.y,(Math.random()-.5)*3.4,-Math.random()*1.9,1.6+Math.random()*2.6);
          combo++;comboT=frame;if(combo>comboMax)comboMax=combo;
          const off=Math.abs((P.x+P.w/2)-(pl.x+pl.w/2))/(pl.w/2);
          if(off<.3){
            perfect++;gainJuice(has("perfect")?12:4);flash=Math.min(flash+.12,.4);
            pop(P.x+P.w/2,pl.y-26,"PERFECT","#FFE9A0",12);
            for(let i=0;i<6;i++)spark(P.x+P.w/2,pl.y,(Math.random()-.5)*3,-Math.random()*2.5,2,true);}
          /* Inferno: every landing detonates a small flame burst. Smaller
             radius than the Juice Mode shockwave and it does not touch the
             boss, so it is a distinct identity rather than a weaker copy. */
          /* Pine's PINEAPPLE SLAM: a hard landing only (imp > .45), so it
             rewards committing to a fall rather than firing on every hop.
             Radius sits between Inferno's flame burst and the Juice Mode
             shockwave, and it does not reach the boss. */
          if(has("slam")&&imp>.45){
            ring(P.x+P.w/2,pl.y,"#FFD23B",6);
            sfx("stomp");buzz(18);
            if(!calm())shake=Math.max(shake,9);
            pop(P.x+P.w/2,pl.y-26,"SLAM!","#FFD23B",14);
            for(let i=0;i<12;i++)
              spark(P.x+P.w/2,pl.y,(Math.random()-.5)*7,-Math.random()*2.8,2.4,true);
            const SR=86;
            for(const f of foes){
              if(f.dead)continue;
              const fx=f.x+f.w/2-(P.x+P.w/2),fy=f.y+f.h/2-pl.y;
              if(fx*fx+fy*fy<SR*SR)damageFoe(f);}
          }
          if(has("firelord")){
            ring(P.x+P.w/2,pl.y,"#FF7A2F",5);
            sfx("stomp");
            for(let i=0;i<10;i++)
              spark(P.x+P.w/2,pl.y,(Math.random()-.5)*6,-Math.random()*2.6,2.2,true);
            const FR=70;
            for(const f of foes){
              if(f.dead)continue;
              const fx=f.x+f.w/2-(P.x+P.w/2),fy=f.y+f.h/2-pl.y;
              if(fx*fx+fy*fy<FR*FR)damageFoe(f);}
          }
          /* Juice Mode special: every landing sends out a shockwave that
             clears nearby enemies. This is what makes Juice Mode feel like
             a power rather than just a speed buff. */
          if(juice>0){
            ring(P.x+P.w/2,pl.y,juiceCol(),7);
            if(!calm())shake=Math.max(shake,8);
            sfx("stomp");
            const R=BREW==="mega"?128:92;
            for(const f of foes){
              if(f.dead)continue;
              const fx=f.x+f.w/2-(P.x+P.w/2),fy=f.y+f.h/2-pl.y;
              if(fx*fx+fy*fy<R*R)damageFoe(f);}
            if(boss&&boss.st!=="warn"&&boss.st!=="dead"&&boss.hurt<=0){
              const bd=Math.hypot(boss.x-(P.x+P.w/2),boss.y-pl.y);
              if(bd<R)bossDamage(1);}
          }
          if(pl.type==="b"){P.vy=JV*1.7;P.jumpsUsed=0;sfx("dbl");buzz(16);}
          if(pl.type==="c"&&!pl.life)pl.life=26;
          if(pl.type==="k"&&!pl.life){pl.life=9;sfx("nope");buzz(20);}
          if(!pl.high)P.lastSafe={x:pl.x+pl.w/2,y:pl.y-40};
        }
        if(pl.type!=="b"){P.vy=0;P.grd=true;P.onPl=pl;P.lg=frame;P.jumpsUsed=0;P.dashCd=Math.min(P.dashCd,10);}
        break;}}}
  if(P.grd)P.lg=frame;
  if(P.grd&&Math.abs(P.vx)>1.2&&frame%12===0)sfx("step");
  P.sx+=(1-P.sx)*.19;P.sy+=(1-P.sy)*.19;
  P.rot=P.grd?P.rot*.7:clamp(P.rot+P.vx*.004+(P.air>34?P.face*.04:0),-.9,.9);
  if(iFr>0)iFr--;
  const cdec=has("combo")?325:130;   /* Combo Keeper: 2.5x slower decay */
  if(frame-comboT>cdec&&combo>0){combo=Math.max(0,combo-1);comboT=frame-(cdec-20);}

  /* ── orbs ── */
  if(magT>0)magT--;
  const mag=(has("magnet")?72:24)*(juice>0?4.2:1)*(magT>0?3:1);
  for(const o of orbs){
    if(o.got)continue;
    if(o.x-camX>W+60||o.x-camX<-60)continue;
    if(o.fall)o.y+=o.fall;
    const dx=(P.x+P.w/2)-o.x,dy=(P.y+P.h/2)-o.y,dd=dx*dx+dy*dy;
    if(juice>0&&dd<(mag*3)*(mag*3)){o.x+=dx*.14;o.y+=dy*.14;}
    if(dd<mag*mag){
      o.got=true;
      /* Bolt trades duration for intensity: +1 on the juiced multiplier. */
      const jm=juice>0?(has("speed")?3:2):0;
      const mult=(1+Math.floor(combo/8)+jm)*(juice>0&&BREW==="rainbow"?3:1);
      if(o.pu){
        if(o.pu==="shield"){
          shieldUp=true;sfx("unlock");buzz(20);flash=.45;
          ring(o.x,o.y,"#5FC8FF",5);
          pop(o.x,o.y-14,"SHIELD UP","#5FC8FF",15);}
        else if(o.pu==="magnet"){
          magT=460;sfx("ding");buzz(16);flash=.35;
          ring(o.x,o.y,"#FF6A8A",5);
          pop(o.x,o.y-14,"MAGNET","#FF6A8A",15);}
        else{
          /* JUICE BOMB — clears the screen, and chips a boss once */
          sfx("explode");buzz([0,50,40,60]);flash=.75;
          if(!calm())shake=Math.max(shake,13);
          ring(o.x,o.y,"#FFD24A",9);ring(o.x,o.y,"#FF6A2E",5.5);
          burst(30,o.x,o.y,10,3,true);
          pop(o.x,o.y-14,"JUICE BOMB!","#FFD24A",17);
          for(const f of foes){
            if(f.dead)continue;
            if(f.x-camX>-60&&f.x-camX<W+60)damageFoe(f);}
          if(boss&&boss.st!=="warn"&&boss.st!=="dead"&&boss.hurt<=0)bossDamage(1);}
        for(let i=0;i<16;i++)
          spark(o.x,o.y,(Math.random()-.5)*7,(Math.random()-.5)*7,2.2,true);
      } else if(o.fruit){
        SAVE.fruit[o.fruit]=(SAVE.fruit[o.fruit]|0)+1;runFruit++;
        sfx("cry");buzz(18);gainJuice(14);flash=.35;
        pop(o.x,o.y-12,FRUIT[o.fruit].icon+" "+FRUIT[o.fruit].n.toUpperCase(),FRUIT[o.fruit].col,13);
        for(let i=0;i<12;i++)spark(o.x,o.y,(Math.random()-.5)*5,(Math.random()-.5)*5,2,true);
      } else if(o.cry){crys++;orbs_+=10*mult;sfx("cry");buzz(20);flash=.5;
        /* juiced: the crystal buys time instead of meter (the meter is
           frozen during Juice Mode anyway, so it was pure waste before) */
        if(juice<=0)gainJuice(26); else extendJuice(o.x,o.y);
        pop(o.x,o.y-12,"+"+(10*mult),"#9BEFFF",14);}
      else{orbs_+=mult;sfx("orb",combo);buzz(6);if(juice<=0)gainJuice(3.4);
        if(mult>1)pop(o.x,o.y-10,"+"+mult,"#FFE9A0",11);}
      combo++;comboT=frame;if(combo>comboMax)comboMax=combo;
      for(let i=0;i<(o.cry?14:7);i++)
        spark(o.x,o.y,(Math.random()-.5)*(o.cry?6:4),(Math.random()-.5)*(o.cry?6:4),1.4+Math.random()*2,true);}}

  /* ── Juice Mode trigger ── */
  if(juice>0)meter=0;
  else if(meter>=juiceThresh()){
    juiceMax=juiceLen();juice=juiceMax;meter=0;juiceExt=0;
    sfx("juice");buzz([0,30,30,30,30,60]);flash=1;layers(3);
    slowT=48;hstop=6;                           /* cinematic entrance */
    SAVE.juiceRuns++;juiceUses++;bumpMs("juice",1,"add");save();
    pop(P.x+P.w/2,P.y-46,"JUICE MODE!",juiceCol(),27);
    pop(P.x+P.w/2,P.y-24,"DOUBLE POINTS · INVINCIBLE","#FFFFFF",12);
    burst(46,P.x+P.w/2,P.y+P.h/2,11,3,true);
    ring(P.x+P.w/2,P.y+P.h/2,"#FFE9A0",3.2);
    ring(P.x+P.w/2,P.y+P.h/2,juiceCol(),6.5);
  }

  /* ── monsters ── */
  const eSlow=has("slow")?.55:1;           /* Frost */
  for(const f of foes){
    if(f.dead){f.dead--;continue;}
    if(f.flashT>0)f.flashT--;
    const m=MON[f.t];
    const pdx=(P.x+P.w/2)-(f.x+f.w/2), pdy=(P.y+P.h/2)-(f.y+f.h/2);
    f.ph+=.05;
    switch(FAM(f.t)){
      case"hop": case"roll": case"walk": case"tank":{
        const fam=FAM(f.t);
        const sp=(fam==="roll"?1:fam==="walk"?.8:fam==="tank"?.34:1)*eSlow;
        f.x+=f.vx*sp;
        if(fam==="roll")f.rot+=f.vx*.09;
        if(f.p){f.y=f.p.y-f.h; if(f.p.gone)f.dead=1;
          if(f.x<f.p.x||f.x+f.w>f.p.x+f.p.w)f.vx*=-1;}
        break;}
      case"float":
        f.x+=Math.sign(pdx)*(f.el?1.15:.8)*eSlow;
        f.y+=(Math.sign(pdy)*.45+Math.sin(f.ph)*.5)*eSlow;
        if(--f.blink<-140)f.blink=8;
        break;
      case"flap":
        f.x-=1.5*(f.el?1.4:1)*eSlow;
        f.y=f.base+Math.sin(f.ph*1.6)*40;
        break;
      case"phase":
        f.x+=Math.sign(pdx)*(f.el?1.2:.85)*eSlow;
        f.y+=(Math.sign(pdy)*.6+Math.sin(f.ph)*.3)*eSlow;
        break;
      case"ambush":
        /* was: instantly lethal the frame the player came within 74px.
           Now there is a 20-frame rise where it is visible but harmless. */
        if(f.p){f.y=f.p.y-(f.st?f.h:4); if(f.p.gone)f.dead=1;}
        if(f.st===0){ if(Math.abs(pdx)<92){f.st=1;f.t0=frame;sfx("nope");} }
        else if(frame-f.t0>130)f.st=0;
        break;
      case"leap":
        if(f.st===0){ if(f.p){f.y=f.p.y-f.h; if(f.p.gone)f.dead=1;}
          if(--f.cool<=0){f.cool=110;f.st=1;f.vy=-9;f.vx=Math.sign(pdx)*2.1;} }
        else { f.vy+=.5; f.y+=f.vy; f.x+=f.vx;
          for(const pl of plats) if(!pl.gone&&f.vy>0&&f.x+f.w>pl.x&&f.x<pl.x+pl.w&&
            f.y+f.h>pl.y&&f.y+f.h<pl.y+22){f.y=pl.y-f.h;f.p=pl;f.st=0;f.vy=0;}
          if(f.y>WH+140)f.dead=1; }
        break;
      case"shoot":
        f.y=f.base+Math.sin(f.ph*.8)*22; f.x-=.5;
        if(f.beam>0){f.beam--;}
        else if(--f.cool<=0){ f.cool=f.el?110:170; f.st=1; }
        if(f.st===1&&++f.t0>52){f.st=0;f.t0=0;f.beam=26;sfx("dash");}
        break;
    }
    /* ── contact ──
       Culling first: contact tests used to run for every monster in the
       list, including ones far off screen. */
    if(f.x-camX>W+90||f.x-camX<-90)continue;
    let hit = P.x+P.w>f.x&&P.x<f.x+f.w&&P.y+P.h>f.y&&P.y<f.y+f.h;
    if(FAM(f.t)==="ambush"&&(f.st===0||frame-f.t0<20))hit=false;  /* rise is safe */
    /* The beam hitbox now matches the 8px sliver that is actually drawn.
       It used to be the full 22px body height, so players took hits from
       empty space above and below the visible beam. */
    if(FAM(f.t)==="shoot"&&f.beam>0){
      const by=f.y+f.h/2;
      if(P.y+P.h>by-5&&P.y<by+5&&P.x<f.x+6&&P.x+P.w>camX-70)hit=true;
    }
    if(hit){
      const stomp=P.vy>1.5&&prevB<=f.y+8&&!m.nostomp&&!(FAM(f.t)==="shoot"&&f.beam>0);
      if(stomp||juice>0||P.dash>0){
        damageFoe(f);
        if(stomp)P.vy=f.dead?JV*.72:JV*.6;
        if(stomp&&f.dead)P.jumpsUsed=Math.max(0,P.jumpsUsed-1);
      } else if(hurt(f.el?"AN ELITE GOT YOU":"KNOCKED OUT"))return;}
  }
  compact(foes,f=>f.x>camX-400&&f.dead!==1);

  /* ── projectiles ── */
  for(const sh of shots){
    sh.x+=sh.vx;sh.y+=sh.vy;
    if(sh.k==="meteor")sh.vy+=.06;
    if(sh.friendly){
      sh.vy+=.22;
      /* bounce off ground so the blast sweeps a lane instead of sailing
         over every enemy standing on a platform */
      for(const pl of plats){
        if(pl.gone||sh.vy<=0)continue;
        if(sh.x>pl.x&&sh.x<pl.x+pl.w&&sh.y>pl.y-4&&sh.y<pl.y+10){
          sh.y=pl.y-4;sh.vy=-6.2;
          if(--sh.bounce<0)sh.life=0;
          spark(sh.x,sh.y,0,-1,2.4,true);break;}}
      let hitAny=false;
      for(const f of foes){
        if(f.dead)continue;
        if(sh.x>f.x-4&&sh.x<f.x+f.w+4&&sh.y>f.y-4&&sh.y<f.y+f.h+4){
          damageFoe(f);hitAny=true;break;}}
      if(hitAny){burst(9,sh.x,sh.y,4,2.2,true);
        if(--sh.bounce<0)sh.life=0;}
      if(boss&&boss.st!=="warn"&&boss.st!=="dead"&&boss.hurt<=0&&
         Math.hypot(boss.x-sh.x,boss.y-sh.y)<38){sh.life=0;bossDamage(1);}
      sh.life--;
      if(frame%2===0)spark(sh.x,sh.y,0,0,2.2,true,.6);
      continue;
    }
    sh.life--;
    if(frame%3===0)spark(sh.x,sh.y,0,0,2.4,true,.7);
    if(P.x+P.w>sh.x-6&&P.x<sh.x+6&&P.y+P.h>sh.y-6&&P.y<sh.y+6){
      sh.life=0;burst(8,sh.x,sh.y,4,2,true);
      const fireSafe=(has("fireproof")||has("firelord"))&&sh.k==="fire";
      if(!fireSafe&&juice<=0&&P.dash<=0){ if(hurt("BURNED"))return; }
    }}
  compact(shots,sh=>sh.life>0&&sh.x>camX-100&&sh.y<WH+140);

  bossStep();
  eventStep();

  /* ── camera / world ── */
  const tgt=Math.max(0,P.x-W*.31+P.face*Math.min(90,W*.1));
  camX+=(tgt-camX)*.075;
  if(P.x<camX-30){P.x=camX-30;P.vx=Math.max(0,P.vx);}
  edgeX=gen(edgeX);
  compact(plats,p=>p.x+p.w>camX-400);
  compact(orbs,o=>o.x>camX-400&&!o.got&&o.y<WH+200);

  /* Falling out is the most common damage source in the game, but it used
     to decrement hp inline — bypassing hurt() and therefore the shield, the
     i-frames and the remaining-hearts readout. It now honours exactly the
     same contract as every other hit; only the recovery differs (respawn on
     a real platform rather than knockback). */
  if(P.y>WH+170){
    if(shieldUp){
      shieldUp=false;combo=0;
      sfx("nope");buzz(20);flash=.5;
      pop(P.x+P.w/2,WH-40,"SHIELD BROKEN","#9BEFFF",15);
      respawn();
    }
    else if(hp>1){
      hp--;combo=0;sfx("hurt");buzz([0,45,40,45]);
      pop(P.x+P.w/2,WH-40,"-1 ♥","#FF6B7A",15);
      pop(P.x+P.w/2,WH-60,hp+(hp===1?" HEART LEFT":" HEARTS LEFT"),"#FFE9A0",12);
      respawn();
    }
    else{die("FELL");return;}}
  dist=Math.max(dist,Math.floor(P.x/10));

  stepParticles();
  if(!saver()){
    const k=wl.wx,cap=autoLite?18:(k==="rain"?70:k==="snow"?55:k==="star"?16:34);
    if(wx.length<cap&&frame%2===0)
      wx.push({x:camX+Math.random()*(W+200)-100,y:-20-WY,k,
        vx:k==="rain"?-1.6:k==="leaf"?-.9:k==="ember"?(Math.random()-.5)*.6:-.5,
        vy:k==="rain"?11:k==="snow"?1.5:k==="ember"?-1.4:k==="star"?5:1.1,
        r:Math.random()*6,ph:Math.random()*6});
    for(const q of wx){q.x+=q.vx;q.y+=q.vy;if(q.k==="leaf")q.x+=Math.sin((frame+q.ph*30)/28)*.7;}
    compact(wx,q=>q.y<(H-WY)+40&&q.y>-60-WY&&q.x>camX-200);
  } else wx.length=0;
  for(const c of clouds){c.x-=.22*c.s;if(c.x<camX*.35-280)c.x=camX*.35+W+260;}

  /* trail ring buffer */
  const tq=TRAIL[tIdx];tIdx=(tIdx+1)%TMAX;
  tq.x=P.x;tq.y=P.y;tq.rot=P.rot;tq.life=1;
  for(let i=0;i<TMAX;i++){const t=TRAIL[i];if(t.life>0)t.life-=juice>0?.055:.09;}

  for(let i=0;i<RMAX;i++){const r=RINGS[i];if(r.life<=0)continue;r.r+=r.sp;r.life-=.045;}

  tutStep();
  shake*=.86;flash*=.9;
}

/* ══════ SHOCKWAVE RINGS (new polish primitive) ══════════════════ */
const RMAX=8,RINGS=new Array(RMAX);
for(let i=0;i<RMAX;i++)RINGS[i]={x:0,y:0,r:0,sp:4,life:0,col:"#FFF"};
let rIdx=0;
function ring(x,y,col,sp){
  const q=RINGS[rIdx];rIdx=(rIdx+1)%RMAX;
  q.x=x;q.y=y;q.r=6;q.sp=sp||4.4;q.life=1;q.col=col||"#FFFFFF";return q;}
function clearRings(){for(let i=0;i<RMAX;i++)RINGS[i].life=0;}

/* ══════ BOSS — SKY TYRANT ════════════════════════════════════════

   The original fight was, in practice, unwinnable-by-discovery:

   • In `hover` the boss held a fixed screen offset (camX + 0.74·W),
     i.e. ~380px ahead of the player, forever out of reach. The only
     damage window was the brief `swoop`, and nothing said so.
   • `boss.t` was reset on every state transition, so the despawn test
     `boss.t > 1900` could never fire. The boss therefore never left:
     it shadowed the player indefinitely, lobbing fireballs.
   • `boss.hurt = 42` gave it 0.7 s of invulnerability per hit on top of
     a ~2.3 s attack cycle, so even a player who understood the trick
     needed a very long time to land 3 hits.
   • On death the draw call skipped `st === "dead"`, so the boss simply
     blinked out of existence — no death animation, no explosion.
   • The health bar was pinned to canvas-bottom, which on a phone in
     portrait is hundreds of pixels below the action.

   Redesign — every cycle now contains one guaranteed, clearly signposted
   damage window:

     warn ─▶ hover ─▶ aim ─▶ (fire) ─▶ hover ─▶ aim ─▶ charge
                                                         │
              stun ◀───────────── swoop ◀────────────────┘
               │
               └─▶ hover …

   `stun`: after each dive the Tyrant crashes to a reachable height right
   beside the player, its core glows green, an arrow pulses over it and
   the word STOMP appears. Any contact damages it, and the 26-frame hit
   gate lets a confident player land up to five hits in one window.
   `charge` telegraphs the dive with a flashing lane at the player's
   height, so dodging is a read, not a guess.                          */

/* ══════ BOSS ROSTER ═════════════════════════════════════════════
   Four bosses, each with its own silhouette, palette, projectile and
   minion, rotating by world so a run does not repeat the same fight.
   Every one runs the same readable 3-phase structure:
     phase 1  throw obstacles
     phase 2  spawn minions between attacks
     phase 3  rage — faster, relentless
   and the same dodge→punish loop: telegraphed dive, then a stunned
   window where the glowing core can be stomped.                      */
/* Four launch bosses, fought in order. Each has its own silhouette,
   palette, projectile, minion and arena tint, and the Soda Monster is
   deliberately last: it is the only non-fruit boss in the game, the thing
   the Spoiled Fruits are working for, and the visual payoff of a run. */
const BOSSES={
  melon:{ name:"WATERMELON KING", tag:"IT ROLLS AND IT CRUSHES",
          col:"#63C24A", col2:"#FF5A6E", shot:"seed",   minion:"tomato" },
  grape:{ name:"GRAPE WIZARD",    tag:"IT SHOOTS JUICY MAGIC",
          col:"#9B54DC", col2:"#D9A6FF", shot:"orb",    minion:"onion" },
  pine:{  name:"PINEAPPLE TANK",  tag:"IT CHARGES AND IT STOMPS",
          col:"#E8A82B", col2:"#FFE08A", shot:"spike",  minion:"guard" },
  soda:{  name:"SODA MONSTER",    tag:"IT EXPLODES IN BUBBLES",
          col:"#6B4326", col2:"#F5E7D2", shot:"bubble", minion:"moldblob" }};
const BOSS_ORDER=["melon","grape","pine","soda"];
/* Repeat encounters add pattern variation (phase thresholds, volley spread
   and minion cadence already scale) rather than only stacking HP, so a
   later boss is not just a longer version of the first. HP growth is capped
   so a fight can never become a damage sponge. */
const BOSS_HP=b=>Math.min(6+b*2,18);
const BOSS_MAX_F=3900;          /* ~65s hard ceiling on one encounter */
/* One definition of the vulnerable window, used by BOTH the state machine
   and the HUD bar. They were two separate expressions and had drifted: the
   bar assumed 155 frames in phase 3 while the window actually closed at 95,
   so the countdown that tells the player how long they have to land a hit
   was wrong in the hardest phase. */
const stunLen=b=>b.phase>=3?95:b.phase>=2?110:155;
function bossSpawn(){
  evt=null;nextEvt=dist+240;
  /* the first boss of a run is always the Watermelon King — the
     introductory fight the tutorial text points at; after that the four
     rotate so a long run is not the same encounter repeatedly */
  const k=bossWins===0?"melon":BOSS_ORDER[(Math.floor(dist/ZONE)+bossWins)%BOSS_ORDER.length];
  boss={k,x:camX+W+150,y:110,vy:0,hp:BOSS_HP(bossWins),max:BOSS_HP(bossWins),
        st:"warn",t:0,life:0,hurt:0,cool:80,phase:1,ty:P.y,volley:0,
        gift:null,drop:null,hits:0,spawned:0};
  sfx("siren");buzz([0,70,60,70]);bossSeen++;
  if(!calm())shake=6;
}
function bossHitBox(){return{w:64,h:44};}
function bossDamage(mult){
  /* Slayer is the damage hero: x2 everywhere, and +1 more into a stunned
     boss so its identity is "boss killer" rather than a flat stat share
     with Inferno (which is now fire, not damage). */
  let dmg=(has("slayer")?2:1)*(juice>0?2:1)*(mult||1);
  if(has("slayer")&&boss.st==="stun")dmg+=1;
  boss.hp-=dmg;boss.hurt=26;boss.hits++;
  sfx("bossHit");buzz(24);
  if(!calm())shake=11;
  flash=.55;hstop=3;
  pop(boss.x,boss.y-30,"-"+dmg,"#FFFFFF",20);
  burst(20,boss.x,boss.y,7,2.6,true);
  ring(boss.x,boss.y,"#FF5F7A",5);
  /* phase thresholds: 2/3 and 1/3 of health */
  const frac=boss.hp/boss.max;
  if(boss.hp>0&&boss.phase===1&&frac<=.67){
    boss.phase=2;pop(boss.x,boss.y-56,"PHASE 2 · MINIONS","#FFD24A",16);sfx("siren");
    boss.mcool=1;                          /* one arrives immediately */
    if(!calm())shake=12;}
  else if(boss.hp>0&&boss.phase===2&&frac<=.34){
    boss.phase=3;pop(boss.x,boss.y-56,"PHASE 3 · RAGE","#FF3D5F",18);sfx("siren");
    boss.mcool=1;
    flash=.7;if(!calm())shake=16;}
  if(boss.hp<=0)bossDie();
}
function bossDie(){
  boss.hp=0;boss.st="dead";boss.t=0;
  /* Was 600+250n, which made bosses 45-69% of a run's entire income and
     turned boss-farming into the only rational strategy. Now a strong bonus
     (~25%) on top of collecting, not a replacement for it. */
  const rw=300+bossWins*90;
  orbs_+=rw;bossWins++;SAVE.bossKills++;
  flash=1;hstop=8;slowT=54;
  if(!calm())shake=16;
  sfx("explode");buzz([0,60,40,60,40,90]);
  const locked=RUN.filter(r=>!SAVE.unlocked.includes(r.id));
  if(locked.length){
    const g=locked[Math.floor(Math.random()*locked.length)];
    SAVE.unlocked.push(g.id);boss.gift=g.id;}
  boss.reward=rw;
  {const ks=Object.keys(FRUIT),k=ks[Math.floor(Math.random()*ks.length)],n=2+Math.floor(Math.random()*3);
   SAVE.fruit[k]=(SAVE.fruit[k]|0)+n;boss.drop={k,n};}
  checkAch();save();                       /* persist immediately — the
                                              original could lose the
                                              unlock if the tab closed */
  burst(46,boss.x,boss.y,12,3.2,true);
  ring(boss.x,boss.y,"#FFE9A0",7);
}
function bossStep(){
  if(!boss){ if(dist>=nextBoss)bossSpawn(); return; }
  boss.t++;boss.life++;
  const B=bossHitBox();

  if(boss.st==="dead"){
    if(boss.t===26||boss.t===52){sfx("explode");burst(30,boss.x+(Math.random()-.5)*50,boss.y+(Math.random()-.5)*40,10,3,true);
      ring(boss.x,boss.y,"#FFB870",6);if(!calm())shake=10;}
    if(boss.t===64){sfx("victory");flash=.8;}
    boss.y+=1.6;boss.x-=1.1;
    if(boss.t>170){boss=null;nextBoss=dist+550;}
    return;
  }
  if(boss.st==="retreat"){
    boss.y-=4.2;boss.x+=2.4;
    if(boss.t>110){boss=null;nextBoss=dist+550;}
    return;
  }
  /* hard despawn guard that actually works: `life` is never reset by a
     state change, unlike the original `t` */
  /* Lifetime guard. The old build silently removed the boss with an
     unexplained "TYRANT RETREATS" and no reward, so a long fight just
     evaporated. Now it says what happened, what the player keeps, and that
     the boss will come back — and it pays out proportionally to the damage
     actually dealt, so a near-win is not worth nothing. */
  if(boss.life>BOSS_MAX_F){
    boss.st="retreat";boss.t=0;
    const done=clamp(1-boss.hp/boss.max,0,1);
    const part=Math.round((300+bossWins*120)*done);
    orbs_+=part;boss.reward=part;boss.escaped=true;
    sfx("bossFlee");
    pop(boss.x,boss.y-56,"BOSS ESCAPED","#A8B8D8",17);
    pop(boss.x,boss.y-34,"+"+part+" for "+Math.round(done*100)+"% damage","#FFE9A0",13);
    snack("Boss escaped — it returns later. Attack during the stun window.",3600);
    return;}

  if(boss.hurt>0)boss.hurt--;
  const BD=BOSSES[boss.k]||BOSSES.melon;
  const p2=boss.phase>=2, p3=boss.phase>=3;
  /* phase 2 onward it seeds its own minions between attacks. Driven by the
     boss's own countdown rather than a global frame modulo, so the cadence
     is deterministic and cannot be skipped by a short phase. */
  if(boss.mcool===undefined)boss.mcool=90;
  if(p2&&boss.st!=="warn"&&boss.mcool>0)boss.mcool--;
  if(p2&&boss.st!=="warn"&&boss.mcool<=0&&foes.length<14){
    boss.mcool=p3?130:200;
    const mk=mkFoe(BD.minion,camX+W-40,150+Math.random()*90,null);
    mk.vx=-Math.abs(mk.vx||1)*1.1;foes.push(mk);boss.spawned=(boss.spawned|0)+1;
    pop(camX+W-40,140,"MINION!",BD.col2,12);sfx("nope");}

  switch(boss.st){
    case"warn":
      boss.x=camX+W+150;boss.y=110;
      if(boss.t>100){boss.st="hover";boss.t=0;boss.cool=70;}
      break;
    case"hover":
      boss.x+=((camX+W*.72)-boss.x)*.06;
      boss.y+=((110+Math.sin(frame/34)*26)-boss.y)*.1;
      if(--boss.cool<=0){
        if(boss.volley>=(p3?1:2)){boss.st="charge";boss.t=0;boss.ty=P.y;sfx("siren");}
        else{boss.st="aim";boss.t=0;}
      }
      break;
    case"aim":
      boss.x+=((camX+W*.74)-boss.x)*.05;
      boss.y+=((110+Math.sin(frame/34)*26)-boss.y)*.1;
      if(boss.t>(p3?26:p2?32:44)){
        const L=Math.hypot(P.x-boss.x,P.y-boss.y)||1;
        const ux=(P.x-boss.x)/L,uy=(P.y-boss.y)/L,sp=p3?4.8:p2?4.2:3.6;
        const spread=p3?[-.34,-.11,.11,.34]:p2?[-.22,0,.22]:[0];
        spread.forEach(a=>{
          const cs=Math.cos(a),sn=Math.sin(a);
          shots.push({x:boss.x,y:boss.y+20,vx:(ux*cs-uy*sn)*sp,vy:(ux*sn+uy*cs)*sp,
                      k:BD.shot==="spike"?"meteor":"fire",bk:BD.shot,life:220});});
        sfx("dash");boss.volley++;boss.st="hover";boss.t=0;boss.cool=p3?34:p2?52:78;
      }
      break;
    case"charge":
      boss.x+=((camX+W+70)-boss.x)*.12;
      boss.y+=((boss.ty+P.h/2-B.h/2)-boss.y)*.09;
      if(boss.t>(p3?32:p2?42:56)){boss.st="swoop";boss.t=0;sfx("hurt");if(!calm())shake=7;}
      break;
    case"swoop":
      boss.x-=p3?12.5:p2?10.5:8.5;
      boss.y+=((boss.ty+P.h/2-B.h/2)-boss.y)*.12;
      if(frame%3===0)spark(boss.x+30,boss.y,3,(Math.random()-.5)*2,2.4,false);
      if(boss.x<camX-110){
        boss.st="stun";boss.t=0;boss.volley=0;
        /* The stun IS the weak-point window. Announce it with its own cue
           and prompt instead of the generic "nope" blip, so the player is
           never left guessing when (or where) the boss can be hurt. */
        sfx("bossWeak");
        pop(P.x+P.w/2,P.y-52,"WEAK POINT OPEN","#6FCF7F",16);
        buzz(18);
        /* Snap, don't ease. Easing in from where the dive ended (off-screen
           left) spent the first ~25 frames of the vulnerable window with the
           boss invisible, which wasted the one guaranteed damage window. */
        boss.x=clamp(P.x+P.w/2+96,camX+90,camX+W-90);
        boss.y=clamp(P.y-58,90,WH-150);
        ring(boss.x,boss.y,"#6FCF7F",5);
      }
      break;
    case"stun":{
      /* parked within jump range of the player, on purpose */
      /* stays on screen even if the player runs past it */
      const wantX=clamp(P.x+P.w/2+96,camX+90,camX+W-90),wantY=clamp(P.y-58,90,WH-150);
      boss.x+=(wantX-boss.x)*.16;
      boss.y+=(wantY-boss.y)*.16;
      if(frame%5===0)spark(boss.x+(Math.random()-.5)*50,boss.y+16,0,-.7,2,true);
      if(boss.t>stunLen(boss)){boss.st="hover";boss.t=0;boss.cool=60;}
      break;}
  }

  /* ── contact ── */
  if(boss.st==="warn")return;
  const stunned=boss.st==="stun";
  if(P.x+P.w>boss.x-B.w/2&&P.x<boss.x+B.w/2&&P.y+P.h>boss.y-B.h/2&&P.y<boss.y+B.h/2){
    const stomp=P.vy>1&&(P.y+P.h-P.vy)<=boss.y-B.h/2+14;
    const canHit=stunned||stomp||P.dash>0||juice>0;
    if(canHit&&boss.hurt<=0){
      bossDamage(stomp&&stunned?2:1);        /* stomping a stunned Tyrant is the optimal play */
      if(stomp&&boss)P.vy=JV*.85;
      else if(boss)P.vx=-P.face*4;
      if(boss)P.jumpsUsed=Math.max(0,P.jumpsUsed-1);
    } else if(boss.hurt<=0&&(boss.st==="swoop"||boss.st==="charge")){
      if(hurt("THE SKY TYRANT GOT YOU"))return;
    }
  }
}

/* ══════ RARE EVENTS ══════════════════════════════════════════════ */
function eventStep(){
  if(!evt&&!boss&&dist>=nextEvt){
    const kinds=["crystal","meteor","ufo","tornado","dragon","rainbow"];
    evt={k:kinds[Math.floor(Math.random()*kinds.length)],t:640,t0:frame};
    sfx("ding");flash=.5;
    if(evt.k==="rainbow"){
      const rx=P.x+320;
      for(let i=0;i<9;i++){
        plats.push({x:rx+i*76,y:250-Math.sin(i/8*Math.PI)*60,w:60,h:12,type:"n",
                    base:250-Math.sin(i/8*Math.PI)*60,spike:false,life:0,gone:false,
                    rain:1,dir:1,mimic:0,high:false});
        orbs.push({x:rx+i*76+30,y:222-Math.sin(i/8*Math.PI)*60,ph:i,cry:i%4===0,got:false,fall:0});}}
  }
  if(!evt)return;
  evt.t--;
  if(evt.k==="crystal"&&frame%16===0)
    orbs.push({x:camX+Math.random()*W,y:-40,ph:0,cry:true,fall:1.8,got:false});
  if(evt.k==="ufo"&&frame%14===0)
    orbs.push({x:camX+W*.5+Math.sin(frame/40)*160,y:60,ph:0,cry:Math.random()<.2,fall:1.5,got:false});
  if(evt.k==="meteor"&&frame%26===0)
    shots.push({x:camX+W+40,y:-30,vx:-5.2,vy:2.6,k:"meteor",life:260});
  if(evt.t<=0){evt=null;nextEvt=dist+220+Math.random()*160;}
}
/* ══════ DRAW ═════════════════════════════════════════════════════ */
const cur={a:[11,18,38],b:[27,42,74],p:[78,95,128]};
const rs=c=>"rgb("+(c[0]|0)+","+(c[1]|0)+","+(c[2]|0)+")";
function lpc(c,t,k){for(let i=0;i<3;i++)c[i]+=(t[i]-c[i])*k;}
let skyKey="",skyGrad=null;
/* Canvas type. One display face for everything on the play field, so
   the HUD, the popups and the boss banners all speak with the same
   voice as the logo. Baloo 2 is SIL OFL; the fallback stack is rounded
   system faces so the design survives an offline first launch. */
const F_FACE="'Baloo 2',Chalkboard,'Comic Sans MS',system-ui,sans-serif";
const F_HUD="800 16px "+F_FACE;
const F_MONO="800 12px "+F_FACE;
const F_SM="800 10px "+F_FACE;
const F_TAG="800 12px "+F_FACE;

function ridge(off,base,amp,st,col){
  ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(-40,H-WY+60);
  const s=Math.floor((off-60)/st)*st;
  for(let x=s;x<off+W+st;x+=st){
    const n=Math.sin(x*.0021)+Math.sin(x*.0071)*.55+Math.sin(x*.017)*.22;
    ctx.lineTo(x-off,base+n*amp);}
  ctx.lineTo(W+40,H-WY+60);ctx.closePath();ctx.fill();}

const OUT=(c,lw)=>{c.strokeStyle=INK;c.lineWidth=lw||2.2;c.stroke();};
function EYE(c,x,y,r,op,pup){
  c.beginPath();c.ellipse(x,y,r,r*(op===undefined?1:Math.max(.06,op)),0,0,7);
  c.fillStyle="#FFFFFF";c.fill();OUT(c,1.5);
  if(op===undefined||op>.35){
    c.beginPath();c.arc(x+(pup||0),y,r*.45,0,7);c.fillStyle=INK;c.fill();
    c.beginPath();c.arc(x+(pup||0)-r*.16,y-r*.2,r*.17,0,7);c.fillStyle="rgba(255,255,255,.9)";c.fill();}}
const glow=(g,x,y,sc)=>{if(!g)return;const r=g.width/2*(sc||1);ctx.drawImage(g,x-r,y-r,r*2,r*2);};

/* ══════ WORLD PROPS ══════════════════════════════════════════════
   The near-background layer: the fruit trees, parasols, castle towers,
   temples, volcano cones and factory pipes that tell you which world
   you are in without reading the HUD. Everything here is drawn in the
   world's darkest ridge colour plus one accent, so props stay behind
   the play layer and characters never lose their silhouette.
   Spacing is deterministic from world position, so the layer is stable
   between frames without storing any state. */
function worldProps(wl){
  const par=camX*.66, step=230, base=372;
  const s0=Math.floor((par-step)/step)*step;
  ctx.save();
  for(let wxp=s0;wxp<par+W+step;wxp+=step){
    const x=wxp-par, seed=((wxp/step)|0);
    const jig=((seed*2654435761)>>>0)%70;      /* stable pseudo-jitter */
    const px=x+jig, py=base-(jig%18);
    switch(wl.prop){
      case"tree":{                                   /* orange orchard */
        ctx.fillStyle="#6B4A24";ctx.fillRect(px-5,py-40,10,42);
        ctx.fillStyle=wl.r[1];ctx.beginPath();ctx.arc(px,py-52,26,0,7);
        ctx.arc(px-19,py-42,18,0,7);ctx.arc(px+19,py-42,18,0,7);ctx.fill();
        ctx.fillStyle=wl.acc;
        for(let i=0;i<4;i++){const a=i*1.57+seed;
          ctx.beginPath();ctx.arc(px+Math.cos(a)*20,py-50+Math.sin(a)*14,4.2,0,7);ctx.fill();}
        break;}
      case"berrytree":{                              /* berry forest */
        ctx.fillStyle="#4A2F6B";ctx.fillRect(px-5,py-46,10,48);
        ctx.fillStyle=wl.r[0];ctx.beginPath();
        ctx.moveTo(px-30,py-46);ctx.lineTo(px,py-92);ctx.lineTo(px+30,py-46);ctx.closePath();ctx.fill();
        ctx.fillStyle=wl.acc;
        for(let i=0;i<5;i++){const a=i*1.25+seed;
          ctx.beginPath();ctx.arc(px+Math.cos(a)*17,py-58+Math.sin(a)*12,3.6,0,7);ctx.fill();}
        break;}
      case"parasol":{                                /* watermelon beach */
        ctx.fillStyle="#C9B48A";ctx.fillRect(px-2,py-46,4,48);
        ctx.fillStyle="#FF5A6E";ctx.beginPath();ctx.arc(px,py-46,30,Math.PI,0);ctx.fill();
        ctx.fillStyle="#63C24A";ctx.beginPath();ctx.arc(px,py-46,30,Math.PI,Math.PI*1.28);ctx.fill();
        ctx.beginPath();ctx.arc(px,py-46,30,Math.PI*1.56,Math.PI*1.84);ctx.fill();
        ctx.fillStyle="#2F7A2A";ctx.fillRect(px-30,py-48,60,4);
        break;}
      case"vinetree":{                               /* kiwi jungle */
        ctx.fillStyle="#5C4020";ctx.fillRect(px-7,py-74,14,76);
        ctx.fillStyle=wl.r[0];
        for(let i=-1;i<=1;i+=2){ctx.beginPath();
          ctx.moveTo(px,py-70);ctx.quadraticCurveTo(px+i*46,py-96,px+i*10,py-104);
          ctx.quadraticCurveTo(px+i*8,py-80,px,py-70);ctx.fill();}
        ctx.strokeStyle=wl.r[1];ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(px-24,py-72);
        ctx.quadraticCurveTo(px-30,py-46,px-20,py-26);ctx.stroke();
        break;}
      case"tower":{                                  /* grape castle */
        ctx.fillStyle=wl.r[0];ctx.fillRect(px-20,py-96,40,98);
        ctx.fillStyle=wl.r[1];
        for(let i=0;i<4;i++)ctx.fillRect(px-20+i*11,py-106,7,12);
        ctx.fillStyle="#4C2A78";ctx.beginPath();
        ctx.moveTo(px-26,py-106);ctx.lineTo(px,py-148);ctx.lineTo(px+26,py-106);ctx.closePath();ctx.fill();
        ctx.fillStyle=wl.acc;
        ctx.fillRect(px-6,py-70,12,16);
        ctx.beginPath();ctx.arc(px,py-70,6,Math.PI,0);ctx.fill();
        break;}
      case"temple":{                                 /* mango desert */
        ctx.fillStyle=wl.r[0];
        ctx.beginPath();ctx.moveTo(px-44,py+2);ctx.lineTo(px-30,py-64);
        ctx.lineTo(px+30,py-64);ctx.lineTo(px+44,py+2);ctx.closePath();ctx.fill();
        ctx.fillStyle=wl.r[1];ctx.fillRect(px-34,py-78,68,16);
        ctx.fillStyle=wl.acc;ctx.beginPath();ctx.arc(px,py-86,10,0,7);ctx.fill();
        ctx.fillStyle="rgba(65,35,15,.28)";ctx.fillRect(px-9,py-40,18,42);
        break;}
      case"volcano":{                                /* pineapple volcano */
        ctx.fillStyle=wl.r[0];
        ctx.beginPath();ctx.moveTo(px-62,py+2);ctx.lineTo(px-18,py-84);
        ctx.lineTo(px+18,py-84);ctx.lineTo(px+62,py+2);ctx.closePath();ctx.fill();
        ctx.fillStyle="#FF7A2E";ctx.fillRect(px-18,py-88,36,8);
        ctx.fillStyle="rgba(255,150,50,.5)";
        for(let i=0;i<3;i++){const t2=(frame*.6+i*40)%120;
          ctx.beginPath();ctx.arc(px+(i-1)*11,py-88-t2*.5,3.4,0,7);ctx.fill();}
        ctx.fillStyle="#FFB33B";
        ctx.beginPath();ctx.moveTo(px-6,py-84);ctx.lineTo(px-2,py-40);
        ctx.lineTo(px+6,py-84);ctx.closePath();ctx.fill();
        break;}
      default:{                                      /* soda factory */
        ctx.fillStyle=wl.r[0];ctx.fillRect(px-40,py-76,80,78);
        ctx.fillStyle=wl.r[1];
        ctx.fillRect(px-30,py-114,16,40);ctx.fillRect(px+8,py-100,16,26);
        ctx.fillStyle="rgba(255,255,255,.22)";
        for(let i=0;i<3;i++){const t2=(frame*.8+i*50)%150;
          ctx.beginPath();ctx.arc(px-22,py-118-t2*.34,5+t2*.05,0,7);ctx.fill();}
        ctx.strokeStyle=wl.r[1];ctx.lineWidth=7;
        ctx.beginPath();ctx.moveTo(px-40,py-30);ctx.lineTo(px+40,py-30);ctx.stroke();
        ctx.fillStyle=wl.acc;
        for(let i=0;i<3;i++)ctx.fillRect(px-26+i*24,py-58,14,20);
        break;}
    }
  }
  ctx.restore();
}

function draw(){
  const kx=shake?(Math.random()-.5)*shake:0,ky=shake?(Math.random()-.5)*shake:0;
  ctx.setTransform(DPR,0,0,DPR,kx*DPR,ky*DPR);
  const wl=worldAt(dist);
  lpc(cur.a,wl.A,.035);lpc(cur.b,wl.B,.035);lpc(cur.p,wl.P,.035);

  /* sky gradient cached: rebuilt only when the colour actually moves a
     visible step, instead of a fresh gradient object every frame */
  const key=((cur.a[0]|0)>>2)+","+((cur.a[1]|0)>>2)+","+((cur.a[2]|0)>>2)+"|"+
            ((cur.b[0]|0)>>2)+","+((cur.b[1]|0)>>2)+","+((cur.b[2]|0)>>2)+"|"+H;
  if(key!==skyKey||!skyGrad){
    skyKey=key;skyGrad=ctx.createLinearGradient(0,0,0,H);
    skyGrad.addColorStop(0,rs(cur.a));skyGrad.addColorStop(1,rs(cur.b));}
  ctx.fillStyle=skyGrad;ctx.fillRect(-20,-20,W+40,H+40);
  ctx.save();ctx.translate(0,WY);

  const lite=saver()||autoLite;

  /* ── FAR LAYER: sun disc and soft light shafts ──────────────────
     One warm disc per world, parked in the sky at a very slow parallax
     so the world feels like a place rather than a scrolling texture. */
  if(!lite){
    const sx=((-camX*.02)%(W+520)+W+520)%(W+520)-160, sy=54;
    ctx.fillStyle=wl.sun||"rgba(255,246,210,.26)";ctx.beginPath();ctx.arc(sx,sy,54,0,7);ctx.fill();
    ctx.fillStyle=wl.sun2||"rgba(255,250,225,.5)";ctx.beginPath();ctx.arc(sx,sy,32,0,7);ctx.fill();
  }

  /* twinkling sparkles: berry motes, desert grit, factory fizz */
  ctx.fillStyle="rgba(255,255,255,.42)";
  for(let i=0,n=lite?12:34;i<n;i++){
    const px=((i*137.5-camX*.06)%(W+60)+W+60)%(W+60)-30;
    ctx.fillRect(px,(i*57.3)%150,1.6,1.6);}

  /* ── clouds: fat rounded cartoon puffs with an ink line ── */
  if(!lite)for(const c of clouds){
    const x=c.x-camX*.35;if(x<-280||x>W+280)continue;
    ctx.globalAlpha=.5*c.s;
    ctx.fillStyle="#FFFFFF";
    /* one sub-path per puff: a single path across three ellipses makes
       the fill bridge between them and grows a spike off the cloud */
    ctx.beginPath();ctx.ellipse(x,c.y,c.w*.52,c.w*.24,0,0,7);ctx.fill();
    ctx.beginPath();ctx.ellipse(x+c.w*.28,c.y-c.w*.11,c.w*.36,c.w*.22,0,0,7);ctx.fill();
    ctx.beginPath();ctx.ellipse(x-c.w*.30,c.y+c.w*.03,c.w*.32,c.w*.18,0,0,7);ctx.fill();
    ctx.globalAlpha=1;}

  /* ── MID LAYER: three parallax ridge bands ── */
  if(!lite){ridge(camX*.10,250,46,26,wl.r[0]);ridge(camX*.28,300,40,22,wl.r[1]);}
  ridge(camX*.52,355,30,18,wl.r[2]);

  /* ── NEAR LAYER: the world's own props ──────────────────────────
     Silhouetted against the last ridge at 0.66 parallax, tinted toward
     the ridge colour so they sit behind the gameplay layer and never
     compete with a character for attention. */
  if(!lite)worldProps(wl,lite);

  /* ── weather / ambient particles ── */
  for(const p of wx){
    const x=p.x-camX;if(x<-30||x>W+30)continue;
    if(p.k==="sand"){ctx.strokeStyle="rgba(255,226,170,.5)";ctx.lineWidth=1.2;
      ctx.beginPath();ctx.moveTo(x,p.y);ctx.lineTo(x-9,p.y+2);ctx.stroke();}
    else if(p.k==="bubble"){ctx.strokeStyle="rgba(255,255,255,.6)";ctx.lineWidth=1.2;
      ctx.beginPath();ctx.arc(x,p.y,1.6+(p.r%3),0,7);ctx.stroke();}
    else if(p.k==="fizz"){ctx.fillStyle="rgba(255,255,255,.6)";
      ctx.beginPath();ctx.arc(x,p.y,1.4,0,7);ctx.fill();}
    else if(p.k==="leaf"){ctx.fillStyle="rgba(120,190,80,.75)";
      ctx.save();ctx.translate(x,p.y);ctx.rotate(p.ph+frame/30);
      ctx.beginPath();ctx.ellipse(0,0,3.4,1.7,0,0,7);ctx.fill();ctx.restore();}
    else if(p.k==="ember"){ctx.fillStyle="rgba(255,180,90,.85)";
      ctx.beginPath();ctx.arc(x,p.y,1.8,0,7);ctx.fill();}
    else if(p.k==="spark"){ctx.fillStyle="rgba(230,200,255,.85)";
      const r=1.2+Math.sin(frame/9+p.ph)*.8;
      ctx.beginPath();ctx.arc(x,p.y,r,0,7);ctx.fill();}
    else{ctx.fillStyle="rgba(255,255,255,.35)";ctx.fillRect(x,p.y,8,1.4);}}

  /* ── PLATFORMS ───────────────────────────────────────────────────
     Every world has its own ground material — grass over earth, sand,
     mossy stone, jungle earth, castle masonry, volcanic rock, factory
     metal — drawn as one rounded ink-outlined block with a bright cap
     and a soft drop shadow. Special types keep a distinct, colour-
     independent marker so a player who cannot separate the hues still
     reads bouncy / crumbling / moving / conveyor / mimic correctly. */
  for(const pl of plats){
    if(pl.gone)continue;
    const x=pl.x-camX;if(x>W+40||x+pl.w<-40)continue;
    const sh=pl.life>0?(Math.random()-.5)*2.6:0;
    const px=x+sh, r=Math.min(7,pl.h*.42);
    /* SKIRT: the block is drawn taller than its collision box so ground
       has real visual mass, exactly as in the art bible. Collision is
       still the top `pl.h` band — nothing below the surface is solid. */
    const skirt=pl.high?0:16, bh=pl.h+skirt;
    /* drop shadow */
    ctx.fillStyle="rgba(65,35,15,.20)";
    ctx.beginPath();ctx.roundRect(px+3,pl.y+5,pl.w,bh,r);ctx.fill();
    /* body: earth / rock / metal */
    let earth=rs(cur.p), cap=wl.pt;
    if(pl.type==="i"){earth="#B99A6A";cap="#F5D98A";}       /* slick syrup   */
    else if(pl.type==="b"){earth="#2F7A2A";cap="#8FD44A";}  /* bouncy leaf   */
    else if(pl.life>0){earth="#9E4A3A";cap="#FF8A6E";}      /* crumbling     */
    ctx.fillStyle=earth;
    ctx.beginPath();ctx.roundRect(px,pl.y,pl.w,bh,r);ctx.fill();
    /* the bright cap that reads as the standable surface */
    ctx.fillStyle=cap;
    ctx.beginPath();ctx.roundRect(px,pl.y,pl.w,Math.max(7,pl.h*.55),r);ctx.fill();
    /* material detail */
    if(wl.ground==="grass"){
      /* blades grow UP out of the cap — grass hanging into the soil was
         the giveaway that this was a rectangle with decoration on it */
      ctx.fillStyle=cap;
      for(let i=2;i<pl.w-13;i+=21){
        ctx.beginPath();ctx.moveTo(px+i,pl.y+4);
        ctx.quadraticCurveTo(px+i+6,pl.y-11,px+i+13,pl.y+4);ctx.closePath();ctx.fill();}
    } else if(wl.ground==="metal"){
      ctx.fillStyle="rgba(65,35,15,.35)";
      for(let i=6;i<pl.w-4;i+=16){ctx.beginPath();ctx.arc(px+i,pl.y+pl.h*.86,1.6,0,7);ctx.fill();}
    } else if(wl.ground==="sand"){
      ctx.fillStyle="rgba(255,255,255,.28)";
      for(let i=7;i<pl.w-5;i+=19)ctx.fillRect(px+i,pl.y+pl.h*.9,5,1.6);
    } else if(wl.ground==="stone"||wl.ground==="rock"){
      ctx.strokeStyle="rgba(65,35,15,.32)";ctx.lineWidth=1.2;
      for(let i=14;i<pl.w-6;i+=22){
        ctx.beginPath();ctx.moveTo(px+i,pl.y+pl.h*.6);ctx.lineTo(px+i,pl.y+bh-2);ctx.stroke();}
    }
    /* slick surface gets a wet sheen AND a syrup drip, so "slippery" is
       readable without relying on colour alone */
    if(pl.type==="i"){
      ctx.fillStyle="rgba(255,255,255,.55)";
      ctx.beginPath();ctx.roundRect(px+4,pl.y+2,pl.w-8,3,2);ctx.fill();
      ctx.fillStyle="#C9822E";
      for(let i=10;i<pl.w-6;i+=26){
        ctx.beginPath();ctx.ellipse(px+i,pl.y+bh+2,2.4,3.6,0,0,7);ctx.fill();}}
    ctx.beginPath();ctx.roundRect(px,pl.y,pl.w,bh,r);ink(ctx,2.2);

    /* moving platform: a grab handle */
    if(pl.type==="m"){ctx.fillStyle="rgba(255,255,255,.55)";
      ctx.beginPath();ctx.roundRect(px+pl.w/2-9,pl.y+pl.h*.62,18,3,2);ctx.fill();}
    /* conveyor: arrows that show which way it pushes */
    if(pl.type==="v"){
      ctx.fillStyle="rgba(255,255,255,.7)";
      for(let i=0;i<3;i++){const ax=px+pl.w*.5+(i-1)*13+((frame*pl.dir*.7)%13);
        ctx.beginPath();ctx.moveTo(ax-4,pl.y+pl.h*.5-4);ctx.lineTo(ax+4*pl.dir,pl.y+pl.h*.5);
        ctx.lineTo(ax-4,pl.y+pl.h*.5+4);ctx.closePath();ctx.fill();}}
    /* mimic: a visible crack, never pixel-identical to safe ground */
    if(pl.mimic&&!pl.life){ctx.strokeStyle="rgba(65,35,15,.5)";ctx.lineWidth=1.4;
      ctx.beginPath();ctx.moveTo(px+pl.w*.3,pl.y+3);ctx.lineTo(px+pl.w*.42,pl.y+pl.h);
      ctx.moveTo(px+pl.w*.62,pl.y+3);ctx.lineTo(px+pl.w*.54,pl.y+pl.h);ctx.stroke();}
    /* bouncy: a spring chevron */
    if(pl.type==="b"){ctx.fillStyle="#FFF6E4";ctx.beginPath();
      ctx.moveTo(px+pl.w/2-8,pl.y+pl.h*.62);ctx.lineTo(px+pl.w/2,pl.y+pl.h*.2);
      ctx.lineTo(px+pl.w/2+8,pl.y+pl.h*.62);ctx.closePath();ctx.fill();ink(ctx,1.5);}
    /* hazard spikes: rind thorns, with a warning stripe at the base */
    if(pl.spike){
      ctx.fillStyle="rgba(255,80,60,.22)";ctx.fillRect(px,pl.y-13,pl.w,13);
      for(let sp=0;sp<Math.floor(pl.w/14);sp++){const sx=px+8+sp*14;
        ctx.fillStyle="#FF6A3B";ctx.beginPath();
        ctx.moveTo(sx,pl.y);ctx.lineTo(sx+6,pl.y-12);ctx.lineTo(sx+12,pl.y);ctx.closePath();ctx.fill();ink(ctx,1.5);}}}


  /* ── THE SPOILED FRUITS ──────────────────────────────────────────
     One painter per enemy. Every one shares the house ink line and the
     big-eye rig, so they read as one faction, but no two share a
     silhouette — which is what lets a player identify a threat from the
     shape alone on a 5-inch screen. */
  for(const f of foes){
    const x=f.x-camX;if(x<-70||x>W+70)continue;
    if(f.dead)ctx.globalAlpha=f.dead/14;
    const pk=Math.sign(f.vx)||1, hw=f.w/2, hh=f.h/2, cx=x+hw, cy=f.y+hh;
    if(f.el&&!lite)glow(GLOW_HOT,cx,cy,1.5);
    if(f.el){
      ctx.strokeStyle="rgba(255,210,74,"+(.45+Math.sin(frame/8)*.3)+")";ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(cx,cy,f.w*.85,0,7);ctx.stroke();}
    const col=f.flashT>0?"#FFFFFF":f.col, dk=f.flashT>0?"#D8D8D8":f.acc;
    switch(f.t){
      /* Mold Blob — a wobbling drip of spoiled pulp with one eye and a
         dribbling underside. Splits visually into lobes when it lands. */
      case"moldblob":{const sq=1+Math.sin(f.ph*2)*.12;
        ctx.fillStyle=dk;
        ctx.beginPath();ctx.roundRect(x,f.y+f.h*(1-sq)+2,f.w,f.h*sq,f.w*.34);ctx.fill();
        ctx.fillStyle=col;
        ctx.beginPath();ctx.roundRect(x,f.y+f.h*(1-sq),f.w,f.h*sq-2,f.w*.34);ctx.fill();
        ctx.beginPath();ctx.roundRect(x,f.y+f.h*(1-sq),f.w,f.h*sq,f.w*.34);ink(ctx,2.1);
        /* drips */
        ctx.fillStyle=col;
        for(let i=0;i<3;i++){const dx=x+f.w*(.24+i*.26);
          ctx.beginPath();ctx.arc(dx,f.y+f.h*sq+f.h*(1-sq)-1+Math.sin(f.ph*2+i)*1.5,2.1,0,7);ctx.fill();}
        eyes(ctx,cx,f.y+f.h*.42,f.w*.2,3.6,pk*.9);
        brows(ctx,cx,f.y+f.h*.24,f.w*.2,f.w*.18,2);break;}
      /* Fire Chili — spins into a burning wheel. Unstompable: the flame
         crown is drawn OUTSIDE the body so the danger reads before contact. */
      case"chili":{
        const fl=Math.sin(frame/3)*2;
        ctx.fillStyle="rgba(255,170,60,.6)";
        ctx.beginPath();ctx.arc(cx,cy,hw*1.35+fl,0,7);ctx.fill();
        ctx.save();ctx.translate(cx,cy);ctx.rotate(f.rot);
        ctx.fillStyle=dk;ctx.beginPath();ctx.ellipse(1,1,hw*.95,hh*.95,0,0,7);ctx.fill();
        ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(0,0,hw*.92,hh*.92,0,0,7);ctx.fill();
        ctx.beginPath();ctx.ellipse(0,0,hw*.95,hh*.95,0,0,7);ink(ctx,2.1);
        /* spikes of flame around the rim */
        ctx.fillStyle="#FFB33B";
        for(let a=0;a<8;a++){const g=a*Math.PI/4;
          ctx.beginPath();ctx.moveTo(Math.cos(g)*hw*.9,Math.sin(g)*hh*.9);
          ctx.lineTo(Math.cos(g+.18)*hw*1.4,Math.sin(g+.18)*hh*1.4);
          ctx.lineTo(Math.cos(g+.36)*hw*.9,Math.sin(g+.36)*hh*.9);ctx.closePath();ctx.fill();}
        ctx.restore();
        eyes(ctx,cx,cy,f.w*.19,3,0);
        brows(ctx,cx,cy-f.h*.2,f.w*.19,f.w*.17,2);break;}
      /* Rotten Blueberry — a bruised floating berry with its five-point
         crown gone limp. */
      case"blueberry":{
        ctx.fillStyle=dk;ctx.beginPath();ctx.arc(cx+1,cy+1,hw,0,7);ctx.fill();
        ctx.fillStyle=col;ctx.beginPath();ctx.arc(cx,cy,hw*.94,0,7);ctx.fill();
        ctx.beginPath();ctx.arc(cx,cy,hw,0,7);ink(ctx,2.1);
        ctx.strokeStyle=INK;ctx.lineWidth=1.6;ctx.lineCap="round";
        for(let i=0;i<5;i++){const a=-Math.PI/2+i*1.256;
          ctx.beginPath();ctx.moveTo(cx,f.y+2);
          ctx.lineTo(cx+Math.cos(a)*hw*.4,f.y+2+Math.sin(a)*hh*.28);ctx.stroke();}
        ctx.lineCap="butt";
        const op=f.blink>0?1-f.blink/8:1;
        eyes(ctx,cx,cy+2,hw*.36,hw*.3,pk*.9,op);
        brows(ctx,cx,cy-hh*.34,hw*.36,hw*.32,2.4);break;}
      /* Garlic Bomber — a flying bulb with papery wings and a lit fuse. */
      case"garlic":{const fl=Math.sin(frame/3.2)*hh;
        ctx.fillStyle="rgba(240,232,214,.9)";
        ctx.beginPath();ctx.ellipse(x-hw*.55,cy+fl,hw*.95,hh*.42,-.4,0,7);ctx.fill();ink(ctx,1.7);
        ctx.beginPath();ctx.ellipse(x+f.w+hw*.55,cy+fl,hw*.95,hh*.42,.4,0,7);ctx.fill();ink(ctx,1.7);
        ctx.fillStyle=dk;ctx.beginPath();ctx.ellipse(cx,cy+1,hw*.92,hh*1.05,0,0,7);ctx.fill();
        ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(cx-1,cy-1,hw*.86,hh*.98,0,0,7);ctx.fill();
        ctx.beginPath();ctx.ellipse(cx,cy,hw*.92,hh*1.05,0,0,7);ink(ctx,2.1);
        ctx.strokeStyle=dk;ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(cx-hw*.3,f.y+2);ctx.lineTo(cx-hw*.3,f.y+f.h-2);
        ctx.moveTo(cx+hw*.3,f.y+2);ctx.lineTo(cx+hw*.3,f.y+f.h-2);ctx.stroke();
        /* fuse: the telegraph that it is a bomb */
        ctx.strokeStyle="#7C5628";ctx.lineWidth=1.6;
        ctx.beginPath();ctx.moveTo(cx,f.y-1);ctx.lineTo(cx+2,f.y-7);ctx.stroke();
        ctx.fillStyle=frame%8<4?"#FFD23B":"#FF6A2E";
        ctx.beginPath();ctx.arc(cx+2,f.y-8,2.4,0,7);ctx.fill();
        eyes(ctx,cx,cy,f.w*.2,3.2,pk);break;}
      /* Evil Potato — a lumpy tuber with sprouting eyes and stubby legs. */
      case"potato":{const st=Math.sin(frame/6)*3;
        ctx.fillStyle=dk;
        ctx.beginPath();ctx.roundRect(x+f.w*.14,f.y+f.h*.76,f.w*.24,f.h*.28+st,3);ctx.fill();ink(ctx,1.6);
        ctx.beginPath();ctx.roundRect(x+f.w*.62,f.y+f.h*.76,f.w*.24,f.h*.28-st,3);ctx.fill();ink(ctx,1.6);
        ctx.fillStyle=dk;ctx.beginPath();ctx.ellipse(cx+1,f.y+f.h*.42,hw*1.02,hh*.86,.1,0,7);ctx.fill();
        ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(cx-1,f.y+f.h*.39,hw*.96,hh*.8,.1,0,7);ctx.fill();
        ctx.beginPath();ctx.ellipse(cx,f.y+f.h*.42,hw*1.02,hh*.86,.1,0,7);ink(ctx,2.1);
        /* eyes of the potato — the little pits, drawn as sprouts */
        ctx.strokeStyle="#5FA83C";ctx.lineWidth=1.6;ctx.lineCap="round";
        ctx.beginPath();ctx.moveTo(cx-hw*.5,f.y+2);ctx.lineTo(cx-hw*.66,f.y-5);ctx.stroke();
        ctx.beginPath();ctx.moveTo(cx+hw*.4,f.y+1);ctx.lineTo(cx+hw*.58,f.y-6);ctx.stroke();ctx.lineCap="butt";
        ctx.fillStyle="#7C5628";
        for(let i=0;i<3;i++){const a=i*2.1+.6;
          ctx.beginPath();ctx.ellipse(cx+Math.cos(a)*hw*.5,f.y+f.h*.42+Math.sin(a)*hh*.4,1.7,1.2,a,0,7);ctx.fill();}
        eyes(ctx,cx,f.y+f.h*.36,f.w*.2,3.4,pk*1.2);
        brows(ctx,cx,f.y+f.h*.2,f.w*.2,f.w*.19,2.2);break;}
      /* Mean Broccoli — a three-hit heavy. The florets ARE the health bar
         visually; a numeric bar sits above it for exactness. */
      case"broccoli":{
        ctx.fillStyle=dk;
        ctx.beginPath();ctx.roundRect(cx-f.w*.14,f.y+f.h*.44,f.w*.28,f.h*.56,f.w*.1);ctx.fill();ink(ctx,2);
        ctx.fillStyle=col;
        const lob=[[0,.24,.34],[-.3,.34,.28],[.3,.34,.28],[-.15,.14,.24],[.15,.14,.24]];
        for(const[ox,oy,r]of lob){
          ctx.beginPath();ctx.arc(cx+f.w*ox,f.y+f.h*oy,f.w*r,0,7);ctx.fill();}
        for(const[ox,oy,r]of lob){
          ctx.beginPath();ctx.arc(cx+f.w*ox,f.y+f.h*oy,f.w*r,0,7);ink(ctx,1.8);}
        eyes(ctx,cx,f.y+f.h*.3,f.w*.2,3.4,pk);
        brows(ctx,cx,f.y+f.h*.14,f.w*.2,f.w*.19,2.4);
        if(f.hpMax>1){
          ctx.fillStyle="rgba(65,35,15,.5)";ctx.fillRect(x-1,f.y-15,f.w+2,6);
          ctx.fillStyle="#8FD44A";ctx.fillRect(x,f.y-14,f.w*(f.hp/f.hpMax),4);}
        break;}
      /* Cry Onion — translucent, weeping, unstompable. Tear-gas haze. */
      case"onion":{ctx.globalAlpha*=.62+Math.sin(f.ph)*.22;
        ctx.fillStyle=dk;
        ctx.beginPath();ctx.ellipse(cx+1,cy+1,hw,hh*1.02,0,0,7);ctx.fill();
        ctx.fillStyle=col;
        ctx.beginPath();ctx.ellipse(cx,cy,hw*.94,hh*.96,0,0,7);ctx.fill();
        ctx.beginPath();ctx.ellipse(cx,cy,hw,hh*1.02,0,0,7);ink(ctx,2);
        ctx.strokeStyle=dk;ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(cx-hw*.4,f.y+3);ctx.quadraticCurveTo(cx,cy,cx-hw*.4,f.y+f.h-3);
        ctx.moveTo(cx+hw*.4,f.y+3);ctx.quadraticCurveTo(cx,cy,cx+hw*.4,f.y+f.h-3);ctx.stroke();
        ctx.strokeStyle="#9B7A3C";ctx.lineWidth=1.5;ctx.lineCap="round";
        ctx.beginPath();ctx.moveTo(cx,f.y+1);ctx.lineTo(cx-3,f.y-7);
        ctx.moveTo(cx,f.y+1);ctx.lineTo(cx+4,f.y-6);ctx.stroke();ctx.lineCap="butt";
        eyes(ctx,cx,cy-1,f.w*.19,3.4,pk);
        /* tears */
        ctx.fillStyle="#9BDCFF";
        for(let i=0;i<2;i++){const ty=cy+4+((frame*.7+i*14)%14);
          droplet(ctx,cx+(i?5:-5),ty,2.1,"#BDEBFF","#6FB8E0");}
        break;}
      /* Lime Sneak — buried, then springs up on a stalk. The rise is drawn
         small and pale so the ambush is legible before it can bite. */
      case"lime":{
        const rise=f.st?Math.min(1,(frame-f.t0)/20):0;
        ctx.strokeStyle="#3E7A46";ctx.lineWidth=5;
        ctx.beginPath();ctx.moveTo(cx,f.y+f.h);ctx.lineTo(cx,f.y+f.h*(1-rise*.98)+(f.st?0:f.h*-.14));ctx.stroke();
        if(f.st){
          const sc=.35+rise*.65;
          ctx.globalAlpha*=(.5+rise*.5);
          ctx.fillStyle=dk;ctx.beginPath();ctx.arc(cx+1,f.y+hh*.75+1,hw*.95*sc,0,7);ctx.fill();
          ctx.fillStyle=col;ctx.beginPath();ctx.arc(cx,f.y+hh*.75,hw*.9*sc,0,7);ctx.fill();
          ctx.beginPath();ctx.arc(cx,f.y+hh*.75,hw*.95*sc,0,7);ink(ctx,2);
          ctx.strokeStyle=dk;ctx.lineWidth=1;
          for(let a=0;a<6;a++){const g=a*1.05;
            ctx.beginPath();ctx.moveTo(cx,f.y+hh*.75);
            ctx.lineTo(cx+Math.cos(g)*hw*.8*sc,f.y+hh*.75+Math.sin(g)*hw*.8*sc);ctx.stroke();}
          if(rise>=1){eyes(ctx,cx,f.y+hh*.7,4.6,3.2,pk);
            brows(ctx,cx,f.y+hh*.7-6,4.6,4.4,2);}
          ctx.globalAlpha=f.dead?f.dead/14:1;}
        break;}
      /* Angry Tomato — leaps at the player, splitting its own skin. */
      case"tomato":{const sq=f.st?1.12:1;
        ctx.fillStyle=dk;ctx.beginPath();ctx.ellipse(cx+1,cy+1,hw*1.02,hh*.92*sq,0,0,7);ctx.fill();
        ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(cx-1,cy-1,hw*.96,hh*.86*sq,0,0,7);ctx.fill();
        ctx.beginPath();ctx.ellipse(cx,cy,hw*1.02,hh*.92*sq,0,0,7);ink(ctx,2.1);
        /* the green calyx */
        ctx.fillStyle="#4E9E3E";
        for(let i=0;i<5;i++){const a=-Math.PI/2+i*1.256;
          ctx.beginPath();ctx.moveTo(cx,f.y+1);
          ctx.lineTo(cx+Math.cos(a-.2)*hw*.62,f.y+1+Math.sin(a-.2)*hh*.34);
          ctx.lineTo(cx+Math.cos(a+.2)*hw*.5,f.y+1+Math.sin(a+.2)*hh*.3);ctx.closePath();ctx.fill();}
        eyes(ctx,cx,cy-1,f.w*.2,3.2,pk);
        brows(ctx,cx,cy-hh*.42,f.w*.2,f.w*.19,2.4);
        shout(ctx,cx,cy+hh*.42,f.w*.34,f.h*.22);break;}
      /* Strawberry Archer — hangs back and fires a telegraphed seed bolt. */
      case"archer":{
        const by=cy;
        if(f.beam>0){
          ctx.fillStyle="rgba(255,95,122,"+(.5+Math.random()*.4)+")";
          ctx.fillRect(-70,by-5,x+6+70,10);
          ctx.fillStyle="rgba(255,255,255,.85)";ctx.fillRect(-70,by-1.5,x+6+70,3);}
        ctx.fillStyle=dk;ctx.beginPath();
        ctx.moveTo(cx,f.y-1);ctx.quadraticCurveTo(x+f.w+2,cy,cx,f.y+f.h+1);
        ctx.quadraticCurveTo(x-2,cy,cx,f.y-1);ctx.fill();
        ctx.fillStyle=col;ctx.beginPath();
        ctx.moveTo(cx-1,f.y+1);ctx.quadraticCurveTo(x+f.w-1,cy,cx-1,f.y+f.h-1);
        ctx.quadraticCurveTo(x+1,cy,cx-1,f.y+1);ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx,f.y-1);ctx.quadraticCurveTo(x+f.w+2,cy,cx,f.y+f.h+1);
        ctx.quadraticCurveTo(x-2,cy,cx,f.y-1);ink(ctx,2.1);
        ctx.fillStyle="#FFE9A0";
        for(let i=0;i<4;i++)
          {ctx.beginPath();ctx.ellipse(cx+(i%2?4:-5),cy+(i<2?-4:5),1.5,1.1,.4,0,7);ctx.fill();}
        for(let i=-1;i<=1;i+=2)leafAt(ctx,cx,f.y,3.2,-Math.PI/2+i*.7,"#4E9E3E",1.3);
        const ch=f.st===1?Math.min(1,f.t0/52):0;
        ctx.fillStyle=f.beam>0?"#FFFFFF":f.acc;
        ctx.beginPath();ctx.arc(cx,by,2.6+3.4*ch,0,7);ctx.fill();
        eyes(ctx,cx,cy-2,f.w*.16,2.8,pk);
        if(ch>0){ctx.strokeStyle="rgba(255,95,122,"+(.25+ch*.6)+")";ctx.lineWidth=1.6;
          ctx.setLineDash([6,6]);ctx.lineDashOffset=-frame*1.5;ctx.beginPath();
          ctx.moveTo(x,by);ctx.lineTo(-70,by);ctx.stroke();ctx.setLineDash([]);ctx.lineDashOffset=0;}
        break;}
      /* Moldy Lemon — slow, two hits, furred with mould spots. */
      case"lemon":{const sq=1+Math.sin(f.ph*1.6)*.07;
        ctx.fillStyle=dk;ctx.beginPath();ctx.ellipse(cx+1,cy+1,hw*1.04,hh*sq,0,0,7);ctx.fill();
        ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(cx-1,cy-1,hw*.98,hh*.94*sq,0,0,7);ctx.fill();
        ctx.fillStyle=col;
        ctx.beginPath();ctx.ellipse(x-1,cy,hw*.18,hh*.24,0,0,7);ctx.fill();
        ctx.beginPath();ctx.ellipse(x+f.w+1,cy,hw*.18,hh*.24,0,0,7);ctx.fill();
        ctx.beginPath();ctx.ellipse(cx,cy,hw*1.04,hh*sq,0,0,7);ink(ctx,2.1);
        ctx.fillStyle="rgba(120,150,80,.72)";
        for(let i=0;i<4;i++){const a=i*1.7+f.ph*.1;
          ctx.beginPath();ctx.arc(cx+Math.cos(a)*hw*.55,cy+Math.sin(a)*hh*.5,2.4,0,7);ctx.fill();}
        eyes(ctx,cx,cy-1,f.w*.19,3.2,pk);
        frown(ctx,cx,cy+hh*.5,f.w*.3,2.6);
        if(f.hpMax>1){
          ctx.fillStyle="rgba(65,35,15,.5)";ctx.fillRect(x-1,f.y-14,f.w+2,6);
          ctx.fillStyle="#F5EEA8";ctx.fillRect(x,f.y-13,f.w*(f.hp/f.hpMax),4);}
        break;}
      /* Pineapple Guard — armoured, unstompable, blocks from above. */
      case"guard":{const st=Math.sin(frame/7)*2;
        ctx.fillStyle=dk;
        ctx.beginPath();ctx.roundRect(x+f.w*.16,f.y+f.h*.8,f.w*.22,f.h*.24+st,3);ctx.fill();ink(ctx,1.6);
        ctx.beginPath();ctx.roundRect(x+f.w*.62,f.y+f.h*.8,f.w*.22,f.h*.24-st,3);ctx.fill();ink(ctx,1.6);
        /* leaf helm — spiky, and it is what makes the top of it hurt */
        ctx.fillStyle="#3E7A46";
        for(let i=-1;i<=1;i++){
          ctx.beginPath();ctx.moveTo(cx,f.y+f.h*.22);
          ctx.lineTo(cx+i*hw*.62-2,f.y-hh*.5);
          ctx.lineTo(cx+i*hw*.62+3,f.y-hh*.34);ctx.closePath();ctx.fill();ink(ctx,1.4);}
        ctx.fillStyle=dk;
        ctx.beginPath();ctx.roundRect(x+1,f.y+f.h*.18,f.w-2,f.h*.68,f.w*.22);ctx.fill();
        ctx.fillStyle=col;
        ctx.beginPath();ctx.roundRect(x+2,f.y+f.h*.19,f.w-5,f.h*.63,f.w*.2);ctx.fill();
        ctx.strokeStyle=dk;ctx.lineWidth=1;
        for(let i=-1;i<=2;i++){
          ctx.beginPath();ctx.moveTo(x+2,f.y+f.h*(.3+i*.18));ctx.lineTo(x+f.w-2,f.y+f.h*(.3+i*.18+.16));ctx.stroke();
          ctx.beginPath();ctx.moveTo(x+f.w-2,f.y+f.h*(.3+i*.18));ctx.lineTo(x+2,f.y+f.h*(.3+i*.18+.16));ctx.stroke();}
        ctx.beginPath();ctx.roundRect(x+1,f.y+f.h*.18,f.w-2,f.h*.68,f.w*.22);ink(ctx,2.1);
        /* shield */
        ctx.fillStyle="#B0793C";ctx.beginPath();ctx.arc(x-1,cy+2,hw*.42,0,7);ctx.fill();ink(ctx,1.8);
        eyes(ctx,cx,f.y+f.h*.42,f.w*.19,3.2,pk);
        brows(ctx,cx,f.y+f.h*.28,f.w*.19,f.w*.18,2.4);
        if(f.hpMax>1){
          ctx.fillStyle="rgba(65,35,15,.5)";ctx.fillRect(x-1,f.y-19,f.w+2,6);
          ctx.fillStyle="#FFD23B";ctx.fillRect(x,f.y-18,f.w*(f.hp/f.hpMax),4);}
        break;}
    }
    ctx.globalAlpha=1;}

  /* ── projectiles ── */
  for(const sh of shots){
    const x=sh.x-camX;if(x<-60||x>W+60)continue;
    if(sh.friendly){
      if(!lite)glow(GLOW_CRY,x,sh.y,.8);
      ctx.fillStyle="#C88CF0";ctx.beginPath();ctx.arc(x,sh.y,7,0,7);ctx.fill();ink(ctx,1.8);
      ctx.fillStyle="#F0DCFF";ctx.beginPath();ctx.arc(x-1.6,sh.y-1.6,2.8,0,7);ctx.fill();
      continue;}
    if(!lite)glow(GLOW_HOT,x,sh.y,sh.k==="meteor"?1.1:.8);
    if(sh.k==="meteor"){
      ctx.strokeStyle="rgba(255,180,110,.55)";ctx.lineWidth=4;
      ctx.beginPath();ctx.moveTo(x,sh.y);ctx.lineTo(x-sh.vx*5,sh.y-sh.vy*5);ctx.stroke();
      ctx.fillStyle="#FFB870";ctx.beginPath();ctx.arc(x,sh.y,8,0,7);ctx.fill();
      ctx.fillStyle="#FFE9C0";ctx.beginPath();ctx.arc(x,sh.y,4,0,7);ctx.fill();
    } else {
      ctx.fillStyle="#FF7A2F";ctx.beginPath();ctx.arc(x,sh.y,6,0,7);ctx.fill();
      ctx.fillStyle="#FFE0B8";ctx.beginPath();ctx.arc(x,sh.y,2.8,0,7);ctx.fill();}}

  /* ── boss ── */
  if(boss)drawBoss(lite);

  /* background dragon event */
  if(evt&&evt.k==="dragon"){
    const et=frame-evt.t0,dx=W+140-et*1.7,dy=100+Math.sin(et/40)*34;
    ctx.globalAlpha=.32;ctx.fillStyle="#2A1533";
    const fl=Math.sin(frame/8)*24;
    ctx.beginPath();ctx.moveTo(dx,dy);ctx.quadraticCurveTo(dx-34,dy-fl-34,dx-78,dy);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(dx,dy);ctx.quadraticCurveTo(dx+34,dy-fl-34,dx+78,dy);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.ellipse(dx,dy,50,15,0,0,7);ctx.fill();
    ctx.globalAlpha=1;}

  /* ── COLLECTIBLES ────────────────────────────────────────────────
     Three readable shapes, never three colours of the same shape:
       droplet  JUICE DROP  — the meter resource, a golden teardrop
       gem      JUICE GEM   — extends Juice Mode, a faceted cyan crystal
       fruit    LAB FRUIT   — a whole fruit with stem and leaf
     Each idles with its own bob so a still screen still has life. */
  for(const o of orbs){
    const x=o.x-camX;if(x<-30||x>W+30||o.got)continue;
    const b=.6+Math.sin(frame/13+o.ph)*.4;
    const bob=Math.sin(frame/16+o.ph)*2;
    if(o.pu){
      /* POWER-UPS. Each sits inside a cream capsule so it reads as a
         pick-up rather than scenery, and each has a distinct outline
         shape — a player never has to tell them apart by colour. */
      if(!lite)glow(o.pu==="shield"?GLOW_CRY:GLOW_ORB,x,o.y,.9+b*.25);
      ctx.save();ctx.translate(x,o.y+bob);
      ctx.fillStyle="rgba(255,246,228,.95)";
      ctx.beginPath();ctx.arc(0,0,11,0,7);ctx.fill();ink(ctx,2.2);
      if(o.pu==="shield"){
        ctx.fillStyle="#4FA8E8";ctx.beginPath();
        ctx.moveTo(0,-7);ctx.lineTo(6.5,-4);ctx.lineTo(6.5,2.5);
        ctx.quadraticCurveTo(0,8.5,-6.5,2.5);ctx.lineTo(-6.5,-4);ctx.closePath();ctx.fill();ink(ctx,1.6);
        ctx.fillStyle="rgba(255,255,255,.75)";
        ctx.beginPath();ctx.ellipse(-2.4,-2.4,1.8,2.4,-.4,0,7);ctx.fill();
      } else if(o.pu==="magnet"){
        ctx.strokeStyle="#E8324C";ctx.lineWidth=4;ctx.lineCap="butt";
        ctx.beginPath();ctx.arc(0,1,5,Math.PI,0);ctx.stroke();
        ctx.strokeStyle=INK;ctx.lineWidth=1.4;
        ctx.beginPath();ctx.arc(0,1,5,Math.PI,0);ctx.stroke();
        ctx.fillStyle="#DDE4EC";ctx.fillRect(-7,1,4,4.6);ctx.fillRect(3,1,4,4.6);
        ctx.strokeStyle=INK;ctx.lineWidth=1.3;
        ctx.strokeRect(-7,1,4,4.6);ctx.strokeRect(3,1,4,4.6);
      } else {
        ctx.fillStyle="#6B4326";ctx.beginPath();ctx.arc(0,1.4,6,0,7);ctx.fill();ink(ctx,1.6);
        ctx.strokeStyle="#9B7A3C";ctx.lineWidth=1.6;
        ctx.beginPath();ctx.moveTo(2.5,-4);ctx.lineTo(5,-8);ctx.stroke();
        ctx.fillStyle=frame%8<4?"#FFD23B":"#FF6A2E";
        ctx.beginPath();ctx.arc(5.6,-8.6,2.2,0,7);ctx.fill();
        ctx.fillStyle="rgba(255,255,255,.5)";
        ctx.beginPath();ctx.arc(-2,-1,1.6,0,7);ctx.fill();}
      ctx.restore();
    } else if(o.fruit){
      const F=FRUIT[o.fruit];
      if(!lite)glow(GLOW_ORB,x,o.y,.6+b*.25);
      ctx.save();ctx.translate(x,o.y+bob);
      ctx.fillStyle=F.col;ctx.beginPath();ctx.arc(1,1,7.4,0,7);ctx.fill();
      ctx.fillStyle=F.col;ctx.beginPath();ctx.arc(0,0,7,0,7);ctx.fill();
      ctx.beginPath();ctx.arc(0,0,7,0,7);ink(ctx,1.7);
      stem(ctx,0,-6,5,2.2);
      leafAt(ctx,1,-11,4,-.5,PAL.leaf,1.3);
      shine(ctx,-2.6,-2.6,2.2,1.6,-.4,.8);
      ctx.restore();
    } else if(o.cry){
      /* JUICE GEM — spins on its axis so it catches the eye across the
         screen; the facet split is what separates it from a droplet. */
      if(!lite)glow(GLOW_CRY,x,o.y,.7+b*.2);
      ctx.save();ctx.translate(x,o.y+bob);
      const sq=Math.abs(Math.cos(frame/34));
      ctx.fillStyle="#3FA8CC";ctx.beginPath();
      ctx.moveTo(0,-10);ctx.lineTo(7*sq+1.5,0);ctx.lineTo(0,10);ctx.lineTo(-7*sq-1.5,0);ctx.closePath();ctx.fill();
      ctx.fillStyle="#9BEFFF";ctx.beginPath();
      ctx.moveTo(0,-10);ctx.lineTo(7*sq,0);ctx.lineTo(0,10);ctx.lineTo(-7*sq,0);ctx.closePath();ctx.fill();
      ctx.fillStyle="rgba(255,255,255,.8)";ctx.beginPath();
      ctx.moveTo(0,-10);ctx.lineTo(7*sq,0);ctx.lineTo(0,0);ctx.closePath();ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0,-10);ctx.lineTo(7*sq,0);ctx.lineTo(0,10);ctx.lineTo(-7*sq,0);ctx.closePath();ink(ctx,1.7);
      ctx.restore();
    } else {
      /* JUICE DROP — the core resource of the whole game */
      if(!lite)glow(GLOW_ORB,x,o.y,.45+b*.2);
      droplet(ctx,x,o.y+bob,4.4,"#FFD24A","#E2830A");}}

  /* ── shockwave rings ── */
  for(let i=0;i<RMAX;i++){const r=RINGS[i];if(r.life<=0)continue;
    ctx.globalAlpha=r.life*.6;ctx.strokeStyle=r.col;ctx.lineWidth=2+r.life*3;
    ctx.beginPath();ctx.arc(r.x-camX,r.y,r.r,0,7);ctx.stroke();}
  ctx.globalAlpha=1;

  /* ── trail: blits of a once-per-frame raster, not 18 vector redraws ── */
  if(!lite&&rsp&&ST==="play"){
    const kit=kitFor(me(),frame,juice>0);
    bakeRunner(kit);
    for(let i=0;i<TMAX;i++){
      const t=TRAIL[i];if(t.life<=.25)continue;
      ctx.save();ctx.globalAlpha=t.life*(juice>0?.4:.2);
      ctx.translate(t.x-camX+P.w/2,t.y+P.h/2);ctx.rotate(t.rot);
      ctx.drawImage(RSPR,-11-P.w/2,-15-P.h/2,44,60);
      ctx.restore();}
    ctx.globalAlpha=1;}

  /* ── particles ── */
  for(let i=0;i<PMAX;i++){const q=PART[i];if(q.life<=0)continue;
    ctx.globalAlpha=q.life*.75;ctx.fillStyle=q.gold?"#FFE9A0":"#A8B8D8";
    ctx.fillRect(q.x-camX-q.r/2,q.y-q.r/2,q.r,q.r);}
  ctx.globalAlpha=1;

  /* ── player ── */
  if(ST==="play"){
    const bob=P.grd&&Math.abs(P.vx)>.6?Math.sin(frame/5)*1.4:(P.grd?Math.sin(frame/38)*.9:0);
    const grow=juice>0?1.24:1;             /* transformation while juiced */
    const pw=P.w*P.sx*grow,ph=P.h*P.sy*grow;
    let gy=null;
    for(const pl of plats){
      if(pl.gone)continue;
      if(P.x+P.w>pl.x&&P.x<pl.x+pl.w&&pl.y>=P.y+P.h-2&&(gy===null||pl.y<gy))gy=pl.y;}
    if(gy!==null){const dd=Math.min((gy-(P.y+P.h))/220,1);
      ctx.globalAlpha=.3*(1-dd);ctx.fillStyle="#000";ctx.beginPath();
      ctx.ellipse(P.x-camX+P.w/2,gy+2,12*(1-dd*.5),3.6*(1-dd*.4),0,0,7);ctx.fill();ctx.globalAlpha=1;}
    if(juice>0&&!lite)glow(juiceGlow(),P.x-camX+P.w/2,P.y+P.h/2,1);
    const vis=iFr>0&&frame%8<4?.35:1;
    const kit=kitFor(me(),frame,juice>0);
    ctx.save();ctx.globalAlpha=vis;
    ctx.translate(P.x-camX+(P.w-pw)/2+pw/2,P.y+(P.h-ph)+bob+ph/2);ctx.rotate(P.rot);
    ctx.translate(-pw/2,-ph/2);
    me().draw(ctx,pw,ph,P.face,kit,frame);
    ctx.restore();
    if(juice>0){
      /* JUICE MODE AURA — two counter-rotating rings and four orbiting
         droplets. The droplets (not dots) are what make the effect read
         as juice rather than as a generic power-up glow. */
      const cx=P.x-camX+P.w/2,cy=P.y+P.h/2+bob,jc=juiceCol();
      ctx.strokeStyle=jc;ctx.lineWidth=2.6;
      ctx.globalAlpha=.6+.25*Math.sin(frame/7);
      ctx.beginPath();ctx.arc(cx,cy,P.w*1.18,0,7);ctx.stroke();
      ctx.globalAlpha=.32+.2*Math.sin(frame/11+1);
      ctx.lineWidth=1.8;
      ctx.beginPath();ctx.arc(cx,cy,P.w*1.55,0,7);ctx.stroke();
      ctx.globalAlpha=1;
      for(let i=0;i<4;i++){const a=frame/9+i*1.57;
        droplet(ctx,cx+Math.cos(a)*P.w*1.18,cy+Math.sin(a)*P.w*1.18,3.2,jc,jc);}}
    ctx.globalAlpha=1;}

  /* ── floating text (drawn in world space, above everything) ── */
  ctx.textAlign="center";
  for(let i=0;i<POPMAX;i++){const q=POPS[i];if(q.life<=0)continue;
    ctx.globalAlpha=Math.min(1,q.life*1.6);
    ctx.font="800 "+q.s+"px "+F_FACE;
    ctx.lineWidth=3;ctx.strokeStyle=INK;
    ctx.strokeText(q.txt,q.x-camX,q.y);
    ctx.fillStyle=q.col;ctx.fillText(q.txt,q.x-camX,q.y);}
  ctx.globalAlpha=1;ctx.textAlign="left";

  ctx.restore();

  /* ── JUICE MODE SCREEN TREATMENT ────────────────────────────────
     Speed lines plus a coloured rim glow. Deliberately NOT a full-screen
     wash: a wash flattened the world into mud exactly when the game is
     supposed to look its best, and it hid enemies. Everything here is
     skipped in Calm Mode and Battery Saver, and nothing strobes faster
     than ~7Hz, well inside safe flashing limits. */
  if(juice>0&&!lite){
    if(!calm()){
      const jc=juiceCol();
      ctx.strokeStyle=jc;ctx.lineWidth=2.4;ctx.lineCap="round";
      for(let i=0;i<7;i++){
        const ly=((i*97+frame*13)%(H+80))-40;
        const lx=((i*211-frame*26)%(W+300))-150;
        ctx.globalAlpha=.13+.09*Math.sin(frame/6+i);
        ctx.beginPath();ctx.moveTo(lx,ly);ctx.lineTo(lx+66,ly);ctx.stroke();}
      ctx.lineCap="butt";ctx.globalAlpha=1;}
    const h=(frame*7%360)|0,q=h-(h%20),k=q+"|"+H;
    if(k!==vigKey){vigKey=k;
      vig=ctx.createRadialGradient(W/2,H/2,H*.44,W/2,H/2,H*.92);
      vig.addColorStop(0,"hsla("+q+",90%,60%,0)");
      vig.addColorStop(1,"hsla("+q+",92%,60%,.34)");}
    ctx.fillStyle=vig;ctx.fillRect(-20,-20,W+40,H+40);}
  if(flash>.01&&!calm()){ctx.fillStyle="rgba(255,240,190,"+(flash*.34)+")";ctx.fillRect(-20,-20,W+40,H+40);}

  if(ST==="play")drawHUD();
  if(DBG)drawDebug();
}
let vigKey="",vig=null;

/* ══════ BOSS RENDER ══════════════════════════════════════════════ */
function drawBoss(lite){
  const B=bossHitBox(),bx=boss.x-camX,by=boss.y;

  /* off-screen approach marker during the warning */
  if(boss.st==="warn"){
    const ax=W-30,ay=110;
    ctx.globalAlpha=.5+.5*Math.sin(frame/5);
    ctx.fillStyle="#FF5F7A";ctx.beginPath();
    ctx.moveTo(ax+14,ay);ctx.lineTo(ax-12,ay-14);ctx.lineTo(ax-12,ay+14);ctx.closePath();ctx.fill();
    ctx.globalAlpha=1;return;
  }
  if(boss.st==="dead"){
    /* death animation: the original drew nothing at all here, so the
       boss vanished mid-air with no feedback */
    const k=boss.t/170;
    ctx.globalAlpha=Math.max(0,1-k*1.2);
    if(!lite)glow(GLOW_RED,bx,by,1.6+k*2);
    ctx.save();ctx.translate(bx,by);ctx.rotate(boss.t*.06);
    ctx.fillStyle=(BOSSES[boss.k]||BOSSES.melon).col;
    splat(ctx,0,0,30*(1-k*.5),(BOSSES[boss.k]||BOSSES.melon).col,8,boss.t*.1);
    ctx.restore();ctx.globalAlpha=1;
    return;
  }
  if(boss.st==="retreat"){
    ctx.globalAlpha=Math.max(0,1-boss.t/110);
  }

  const stunned=boss.st==="stun";

  /* attack telegraphs */
  if(boss.st==="aim"){
    const k=Math.min(1,boss.t/(boss.phase===2?32:44));
    ctx.save();ctx.strokeStyle="rgba(255,95,122,"+(.2+k*.55)+")";ctx.lineWidth=1.6;
    ctx.setLineDash([7,7]);ctx.lineDashOffset=-frame*2;
    ctx.beginPath();ctx.moveTo(bx,by+20);
    ctx.lineTo(P.x-camX+P.w/2,P.y+P.h/2);ctx.stroke();ctx.restore();
    if(!lite)glow(GLOW_HOT,bx,by+20,.5+k*.6);
  }
  if(boss.st==="charge"){
    const k=Math.min(1,boss.t/(boss.phase===2?42:56)),ly=boss.ty+P.h/2;
    ctx.fillStyle="rgba(255,95,122,"+(.08+k*.22)+")";
    ctx.fillRect(0,ly-B.h/2,W,B.h);
    ctx.strokeStyle="rgba(255,255,255,"+(.25+k*.5)+")";ctx.lineWidth=2;
    ctx.setLineDash([12,10]);ctx.lineDashOffset=frame*3;
    ctx.beginPath();ctx.moveTo(0,ly);ctx.lineTo(W,ly);ctx.stroke();ctx.setLineDash([]);
    ctx.textAlign="center";ctx.font="800 16px "+F_FACE;
    ctx.fillStyle="rgba(255,233,160,"+(.5+.5*Math.sin(frame/4))+")";
    ctx.fillText("DODGE",W*.5,ly-B.h/2-10);ctx.textAlign="left";
  }

  ctx.save();
  if(boss.hurt>0&&frame%6<3)ctx.globalAlpha*=.45;
  if(!lite)glow(stunned?GLOW_GRN:(boss.k==="pine"?GLOW_HOT:boss.k==="grape"?GLOW_PUR:
    boss.k==="soda"?GLOW_WHT:GLOW_GRN2),bx,by,stunned?1.15:1.05);

  const flap=Math.sin(frame/(boss.st==="swoop"?3:stunned?16:9))*16;
  const hit=boss.hurt>20;
  const BD=BOSSES[boss.k]||BOSSES.melon;
  /* Keep each boss's own colour while stunned — the green core, ring and
     arrow already carry "hittable", and washing the body out was hiding
     the per-boss identity at the moment the player looks closest. */
  const body=hit?"#FFFFFF":BD.col;
  const trim=hit?"#FFFFFF":BD.col2;
  bossBody(boss.k,bx,by,body,trim,flap,stunned);

  /* the weak point — the whole point of the redesign is that the player
     can see where and when to hit */
  /* the Soda Monster is the one-eyed boss; the rest have a pair */
  const oneEye=boss.k==="soda";
  if(stunned){
    const pu=.7+.3*Math.sin(frame/4);
    /* an expanding outer ring on top of the pulsing core: readable even on a
       small phone screen and against a bright biome */
    const ex=(frame%36)/36;
    ctx.strokeStyle="rgba(111,231,140,"+(1-ex).toFixed(3)+")";ctx.lineWidth=2.5;
    ctx.beginPath();ctx.arc(bx,by-2,14+ex*26,0,7);ctx.stroke();
    ctx.fillStyle="rgba(111,231,140,"+pu+")";
    ctx.beginPath();ctx.arc(bx,by-2,10,0,7);ctx.fill();
    ctx.strokeStyle="#EAFFE9";ctx.lineWidth=2;ctx.beginPath();ctx.arc(bx,by-2,13+pu*3,0,7);ctx.stroke();
    if(oneEye)EYE(ctx,bx,by-6,5,.22,0);
    else{EYE(ctx,bx-9,by-5,4,.25,0);EYE(ctx,bx+9,by-5,4,.25,0);}
  } else if(oneEye){
    EYE(ctx,bx,by-2,12,1,-2.4);
  } else {
    EYE(ctx,bx-10,by-7,6,1,-1.8);EYE(ctx,bx+10,by-7,6,1,-1.8);
    brows(ctx,bx,by-16,10,11,2.6);
  }
  ctx.restore();

  if(stunned){
    /* bouncing arrow + prompt, plus a remaining-window bar */
    const bo=Math.sin(frame/6)*5,ay=by-46+bo;
    ctx.fillStyle="#6FCF7F";ctx.beginPath();
    ctx.moveTo(bx,ay+16);ctx.lineTo(bx-11,ay);ctx.lineTo(bx+11,ay);ctx.closePath();ctx.fill();
    ctx.textAlign="center";ctx.font="800 15px "+F_FACE;
    ctx.lineWidth=3.5;ctx.strokeStyle=INK;ctx.lineJoin="round";
    ctx.strokeText("STOMP!",bx,ay-6);ctx.fillStyle="#EAFFE9";ctx.fillText("STOMP!",bx,ay-6);
    const full=stunLen(boss),left=Math.max(0,1-boss.t/full);
    ctx.fillStyle="rgba(0,0,0,.4)";ctx.fillRect(bx-26,by+28,52,4);
    ctx.fillStyle="#6FCF7F";ctx.fillRect(bx-26,by+28,52*left,4);
    ctx.textAlign="left";
  }
  ctx.globalAlpha=1;
}
/* ══════ BOSS BODIES ══════════════════════════════════════════════
   One painter per boss so each reads as a completely different
   creature at a glance. Silhouette first: a round rolling king, a
   robed caster, a squat armoured tank, and an unstable bottle of
   liquid. Nothing here uses shadowBlur — the aura comes from the
   pre-rendered glow sprites in drawBoss. */
function bossBody(k,bx,by,body,trim,flap,stunned){
  if(!BOSSES[k])k="melon";
  ctx.fillStyle=body;
  if(k==="melon"){
    /* WATERMELON KING — a huge striped rind with a cracked front, a
       golden rind crown, and a mouth full of seeds. */
    ctx.fillStyle=trim;ctx.beginPath();ctx.ellipse(bx+2,by+3,36,29,0,0,7);ctx.fill();
    ctx.fillStyle=body;ctx.beginPath();ctx.ellipse(bx,by,35,28,0,0,7);ctx.fill();
    /* stripes */
    ctx.strokeStyle="#2F7A2A";ctx.lineWidth=4;
    for(let i=-2;i<=2;i++){ctx.beginPath();
      ctx.moveTo(bx+i*13,by-27);ctx.quadraticCurveTo(bx+i*17,by,bx+i*13,by+27);ctx.stroke();}
    ctx.beginPath();ctx.ellipse(bx,by,35,28,0,0,7);ink(ctx,2.6);
    /* cracked rind armour on the shoulders */
    ctx.strokeStyle="rgba(65,35,15,.5)";ctx.lineWidth=1.6;
    ctx.beginPath();ctx.moveTo(bx-26,by-14);ctx.lineTo(bx-16,by-6);ctx.lineTo(bx-24,by+2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(bx+27,by-12);ctx.lineTo(bx+17,by-4);ctx.lineTo(bx+25,by+4);ctx.stroke();
    /* crown of golden rind */
    ctx.fillStyle="#FFC93C";ctx.beginPath();
    ctx.moveTo(bx-20,by-26);ctx.lineTo(bx-16,by-42);ctx.lineTo(bx-8,by-32);
    ctx.lineTo(bx,by-46);ctx.lineTo(bx+8,by-32);ctx.lineTo(bx+16,by-42);
    ctx.lineTo(bx+20,by-26);ctx.closePath();ctx.fill();ink(ctx,2.2);
    /* pink flesh mouth + seeds */
    ctx.fillStyle="#FF5A6E";ctx.beginPath();ctx.ellipse(bx,by+11,19,10,0,0,7);ctx.fill();ink(ctx,2);
    ctx.fillStyle="#FFFFFF";
    for(let i=0;i<5;i++){const tx=bx-16+i*8;
      ctx.beginPath();ctx.moveTo(tx,by+3);ctx.lineTo(tx+4,by+11);ctx.lineTo(tx+8,by+3);ctx.closePath();ctx.fill();}
    ctx.fillStyle=INK;
    for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(bx-8+i*8,by+16,2.2,1.6,.3,0,7);ctx.fill();}
  } else if(k==="grape"){
    /* GRAPE WIZARD — a cluster head under a pointed hat, a robe, and a
       floating juice orb that telegraphs the next spell. */
    ctx.fillStyle=trim;
    ctx.beginPath();ctx.moveTo(bx-26,by+30);ctx.lineTo(bx-16,by-6);
    ctx.lineTo(bx+16,by-6);ctx.lineTo(bx+26,by+30);ctx.closePath();ctx.fill();ink(ctx,2.4);
    /* the cluster head */
    const cl=[[0,-16,11],[-13,-10,9],[13,-10,9],[-7,-1,9],[7,-1,9],[0,-8,10]];
    for(const[ox,oy,r]of cl){ctx.fillStyle=body;
      ctx.beginPath();ctx.arc(bx+ox,by+oy,r,0,7);ctx.fill();}
    for(const[ox,oy,r]of cl){ctx.beginPath();ctx.arc(bx+ox,by+oy,r,0,7);ink(ctx,1.9);}
    /* pointed hat */
    ctx.fillStyle="#4C2A78";ctx.beginPath();
    ctx.moveTo(bx-2+Math.sin(frame/22)*5,by-56);ctx.lineTo(bx+24,by-20);ctx.lineTo(bx-24,by-20);
    ctx.closePath();ctx.fill();ink(ctx,2.4);
    ctx.fillStyle="#FFC93C";ctx.beginPath();ctx.arc(bx-2+Math.sin(frame/22)*5,by-56,4.5,0,7);ctx.fill();ink(ctx,1.6);
    /* floating orb */
    const gl=.55+Math.sin(frame/8)*.45;
    ctx.fillStyle="rgba(217,166,255,"+(.3+gl*.4)+")";
    ctx.beginPath();ctx.arc(bx+34,by-6+Math.sin(frame/16)*5,13,0,7);ctx.fill();
    ctx.fillStyle=trim;ctx.beginPath();ctx.arc(bx+34,by-6+Math.sin(frame/16)*5,8,0,7);ctx.fill();ink(ctx,1.8);
  } else if(k==="pine"){
    /* PINEAPPLE TANK — squat, armoured, riveted. Wide low silhouette
       and heavy stomping legs: it reads as the thing that charges. */
    ctx.fillStyle=INK;
    ctx.beginPath();ctx.roundRect(bx-28,by+18,16,16,5);ctx.fill();
    ctx.beginPath();ctx.roundRect(bx+12,by+18,16,16,5);ctx.fill();
    ctx.fillStyle=trim;ctx.beginPath();ctx.roundRect(bx-33,by-19,66,44,14);ctx.fill();
    ctx.fillStyle=body;ctx.beginPath();ctx.roundRect(bx-31,by-18,62,41,13);ctx.fill();
    ctx.strokeStyle="#B07A0C";ctx.lineWidth=1.6;
    for(let i=-2;i<=2;i++){
      ctx.beginPath();ctx.moveTo(bx-31,by-12+i*11);ctx.lineTo(bx+31,by-12+i*11+11);ctx.stroke();
      ctx.beginPath();ctx.moveTo(bx+31,by-12+i*11);ctx.lineTo(bx-31,by-12+i*11+11);ctx.stroke();}
    ctx.beginPath();ctx.roundRect(bx-33,by-19,66,44,14);ink(ctx,2.6);
    /* spiked leaf crown */
    for(let i=-2;i<=2;i++){
      ctx.fillStyle=i%2?"#4E9E3E":"#2F7A2A";ctx.beginPath();
      ctx.moveTo(bx+i*10,by-19);ctx.lineTo(bx+i*13-4,by-19-24-Math.abs(i)*-6);
      ctx.lineTo(bx+i*13+5,by-19-16);ctx.closePath();ctx.fill();ink(ctx,1.8);}
    /* rivets */
    ctx.fillStyle="#8A6410";
    for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(bx-24+i*16,by+18,2.4,0,7);ctx.fill();}
  } else {
    /* SODA MONSTER — dark liquid inside a cracked bottle, foam boiling
       over the neck and sticky syrup running down. The only boss whose
       body changes shape frame to frame. */
    const wob=Math.sin(frame/9)*3;
    /* bottle */
    ctx.fillStyle="rgba(210,235,225,.34)";ctx.beginPath();
    ctx.moveTo(bx-24,by-14);ctx.lineTo(bx-13,by-34);ctx.lineTo(bx+13,by-34);ctx.lineTo(bx+24,by-14);
    ctx.quadraticCurveTo(bx+30,by+26,bx,by+30);
    ctx.quadraticCurveTo(bx-30,by+26,bx-24,by-14);ctx.closePath();ctx.fill();
    /* liquid */
    ctx.fillStyle=body;ctx.beginPath();
    ctx.moveTo(bx-22,by-6+wob);
    ctx.quadraticCurveTo(bx-11,by-12-wob,bx,by-6+wob);
    ctx.quadraticCurveTo(bx+11,by,bx+22,by-6-wob);
    ctx.quadraticCurveTo(bx+28,by+24,bx,by+27);
    ctx.quadraticCurveTo(bx-28,by+24,bx-22,by-6+wob);ctx.closePath();ctx.fill();
    /* bubbles inside */
    ctx.fillStyle="rgba(255,255,255,.5)";
    for(let i=0;i<6;i++){const a=frame/22+i*1.05;
      ctx.beginPath();ctx.arc(bx+Math.cos(a)*15,by+10+Math.sin(a*1.4)*10,2.2+((i+frame/30)%3),0,7);ctx.fill();}
    /* foam over the neck */
    ctx.fillStyle=trim;
    for(let i=-3;i<=3;i++){
      ctx.beginPath();ctx.arc(bx+i*7,by-32+Math.sin(frame/7+i)*3,6.5,0,7);ctx.fill();}
    for(let i=-3;i<=3;i++){
      ctx.beginPath();ctx.arc(bx+i*7,by-32+Math.sin(frame/7+i)*3,6.5,0,7);ink(ctx,1.5);}
    /* bottle outline last, over everything */
    ctx.beginPath();
    ctx.moveTo(bx-24,by-14);ctx.lineTo(bx-13,by-34);ctx.lineTo(bx+13,by-34);ctx.lineTo(bx+24,by-14);
    ctx.quadraticCurveTo(bx+30,by+26,bx,by+30);
    ctx.quadraticCurveTo(bx-30,by+26,bx-24,by-14);ctx.closePath();ink(ctx,2.6);
    /* the crack that says "damaged bottle" */
    ctx.strokeStyle="rgba(255,255,255,.65)";ctx.lineWidth=1.6;
    ctx.beginPath();ctx.moveTo(bx+16,by-12);ctx.lineTo(bx+9,by-2);ctx.lineTo(bx+17,by+6);ctx.stroke();
    /* sticky syrup drips */
    ctx.fillStyle="rgba(90,55,25,.7)";
    for(let i=0;i<3;i++){const dx=bx-14+i*14,dy=by+28+((frame*.6+i*20)%12);
      ctx.beginPath();ctx.ellipse(dx,dy,2.6,4.2,0,0,7);ctx.fill();}
  }
}

/* ══════ DEBUG OVERLAY ════════════════════════════════════════════
   Gated behind ?debug=1 (DBG), so normal players never see it and the
   shipped build pays nothing for it. Shows the numbers you actually need
   when a death feels unfair: which difficulty stage produced the terrain,
   the seed-independent speed multiplier, and every collision box. */
function drawDebug(){
  const now=performance.now();
  if(dbgLast){dbgAcc+=now-dbgLast;dbgN++;
    if(dbgAcc>=250){dbgFps=Math.round(1000/(dbgAcc/dbgN));dbgAcc=0;dbgN=0;}}
  dbgLast=now;

  ctx.save();
  /* hitboxes — player, platforms, enemies, boss weak point */
  ctx.lineWidth=1;
  ctx.strokeStyle="rgba(111,231,140,.9)";
  ctx.strokeRect(P.x-camX,P.y,P.w,P.h);
  ctx.strokeStyle="rgba(168,184,216,.55)";
  for(const pl of plats){
    if(pl.gone)continue;
    const x=pl.x-camX; if(x>W+60||x+pl.w<-60)continue;
    ctx.strokeRect(x,pl.y,pl.w,pl.h);
  }
  ctx.strokeStyle="rgba(255,95,122,.9)";
  for(const f of foes){
    if(f.dead)continue;
    const x=f.x-camX; if(x>W+60||x+f.w<-60)continue;
    ctx.strokeRect(x,f.y,f.w,f.h);
  }
  if(boss&&boss.st!=="warn"){
    const B=bossHitBox();
    ctx.strokeStyle=boss.st==="stun"?"rgba(111,231,140,1)":"rgba(255,201,74,.9)";
    ctx.lineWidth=2;
    ctx.strokeRect(boss.x-camX-B.w/2,boss.y-B.h/2,B.w,B.h);
    if(boss.st==="stun"){                   /* the weak point, explicitly */
      ctx.beginPath();ctx.arc(boss.x-camX,boss.y+10,14,0,7);ctx.stroke();
    }
  }

  /* readout */
  const lines=[
    "fps "+dbgFps+"   objs "+(plats.length+orbs.length+foes.length+shots.length),
    "dist "+Math.round(dist)+"m   stage "+stageOf(dist)+"   d "+diff().toFixed(3),
    "spd x"+(((RMOD==="FAST"?TURBO_SPD:1)*(has("speed")?1.25:1))).toFixed(2)+
      "   mod "+(RMOD||"none"),
    "vel "+P.vx.toFixed(2)+" / "+P.vy.toFixed(2)+"   dashCd "+Math.max(0,Math.round(P.dashCd)),
    "juice "+(juice/60).toFixed(2)+"s / "+(juiceMax/60).toFixed(2)+"s  (+"+(juiceExt/60).toFixed(1)+"s)",
    "meter "+Math.round(meter)+"/"+juiceThresh()+"   hp "+hp+"/"+hpMax,
    "hero "+SAVE.sel+" ["+activePass+"]   scheme "+OPT.scheme,
    "boss "+(boss?boss.k+" "+boss.st+" p"+boss.phase+" hp"+boss.hp+"/"+boss.max+" life"+boss.life:"none"),
  ];
  ctx.font=F_SM;ctx.textAlign="left";ctx.textBaseline="top";
  const bw=232,bh=lines.length*12+10;
  ctx.fillStyle="rgba(40,22,10,.8)";
  ctx.fillRect(6,WY+6,bw,bh);
  ctx.strokeStyle="rgba(143,212,74,.6)";ctx.lineWidth=1;
  ctx.strokeRect(6,WY+6,bw,bh);
  ctx.fillStyle="#8FD44A";
  lines.forEach((t,i)=>ctx.fillText(t,12,WY+11+i*12));
  ctx.restore();
}

/* ══════ HUD ══════════════════════════════════════════════════════
   Anchored to the TOP OF THE SCREEN, per the brief. (An earlier pass
   pinned it to the play band instead, which on a tall phone parked the
   whole cluster in the middle of empty sky.) safeTop keeps it clear of
   the notch. Coach text and the steer indicator stay near the band,
   where the player is actually looking. */
/* ══════ HUD PRIMITIVES ═══════════════════════════════════════════
   The gameplay HUD sits over a bright, busy, constantly changing
   background, so every element is drawn on its own ink-outlined chip
   rather than as bare text. That is the only way small type stays
   legible over a yellow desert AND a purple castle without the HUD
   itself becoming a wall of panels. */
function chip(x,y,w,h,fill){
  ctx.fillStyle="rgba(65,35,15,.30)";
  ctx.beginPath();ctx.roundRect(x+2,y+3,w,h,h*.42);ctx.fill();
  ctx.fillStyle=fill||"rgba(255,246,228,.94)";
  ctx.beginPath();ctx.roundRect(x,y,w,h,h*.42);ctx.fill();
  ctx.strokeStyle=INK;ctx.lineWidth=2;ctx.lineJoin="round";
  ctx.beginPath();ctx.roundRect(x,y,w,h,h*.42);ctx.stroke();}
/* text with an ink halo — readable on any world without a backing plate */
function outText(txt,x,y,font,fill,lw){
  ctx.font=font;ctx.lineJoin="round";ctx.lineWidth=lw||4;
  ctx.strokeStyle=INK;ctx.strokeText(txt,x,y);
  ctx.fillStyle=fill;ctx.fillText(txt,x,y);}
/* a juicy heart — full, cracked or spent */
function heart(x,y,s,state){
  const col=state===2?"#FF4D6D":state===1?"#FF9AAE":"rgba(255,246,228,.30)";
  ctx.fillStyle=col;ctx.beginPath();
  ctx.moveTo(x,y+s*.92);
  ctx.bezierCurveTo(x-s*.98,y+s*.24,x-s*.62,y-s*.44,x,y+s*.10);
  ctx.bezierCurveTo(x+s*.62,y-s*.44,x+s*.98,y+s*.24,x,y+s*.92);
  ctx.closePath();ctx.fill();ink(ctx,2);
  if(state===2){ctx.fillStyle="rgba(255,255,255,.7)";
    ctx.beginPath();ctx.ellipse(x-s*.34,y+s*.06,s*.16,s*.24,-.4,0,7);ctx.fill();}
  if(state===1){                       /* the crack that reads as damaged */
    ctx.strokeStyle=INK;ctx.lineWidth=1.6;
    ctx.beginPath();ctx.moveTo(x,y-s*.1);ctx.lineTo(x-s*.2,y+s*.24);
    ctx.lineTo(x+s*.14,y+s*.44);ctx.lineTo(x-s*.06,y+s*.8);ctx.stroke();}}

function drawHUD(){
  const T=safeTop+4, Bm=WY+WH, wl=worldAt(dist);

  /* ── LIVES: three juicy hearts, always legible ──
     A lost heart keeps its outline so the total is still countable, and
     the last remaining heart pulses — health is never communicated by
     colour alone. */
  for(let i=0;i<hpMax;i++){
    const lowPulse=(hp===1&&i===0)?1+Math.sin(frame/7)*.10:1;
    heart(20+i*24,T+16,9*lowPulse,i<hp?2:0);}
  if(hp===1){
    outText("!",20+hpMax*24+2,T+22,"800 17px "+F_FACE,"#FF4D6D",4);}

  /* ── distance ── */
  ctx.textAlign="left";
  outText(dist+"m",18,T+52,"800 22px "+F_FACE,"#FFF6E4",5);

  /* ── coins / gems / world / modifiers, stacked from a running cursor
        so an absent line never leaves a hole ── */
  let ry=T+74;
  droplet(ctx,25,ry-4,5,"#FFD24A","#E2830A");
  outText(String(orbs_),35,ry+1,"800 15px "+F_FACE,"#FFE9A0",4);
  if(crys){
    ctx.fillStyle="#9BEFFF";ctx.beginPath();
    ctx.moveTo(78,ry-10);ctx.lineTo(85,ry-3);ctx.lineTo(78,ry+4);ctx.lineTo(71,ry-3);ctx.closePath();
    ctx.fill();ink(ctx,1.6);
    outText(String(crys),90,ry+1,"800 15px "+F_FACE,"#9BEFFF",4);}
  ry+=19;
  outText(wl.short,18,ry,"800 11px "+F_FACE,"#FFF6E4",3.5);ry+=17;
  if(runFruit){outText("FRUIT "+runFruit,18,ry,"800 10px "+F_FACE,"#B7F0FF",3.5);ry+=15;}
  if(BREW){outText(BREWS[BREW].icon+" "+BREWS[BREW].n.toUpperCase(),18,ry,"800 10px "+F_FACE,BREWS[BREW].col,3.5);ry+=15;}
  if(RMOD){outText("DAILY · "+modText().toUpperCase(),18,ry,"800 10px "+F_FACE,"#FFD24A",3.5);ry+=15;}

  /* ── JUICE METER ──────────────────────────────────────────────────
     The single most important readout in the game, so it gets the most
     structure: an ink-outlined tube, a rounded fill, a droplet cap and
     a cap tick showing the 15s ceiling. */
  const bw=Math.min(212,Math.max(140,W*.26)),bx=W/2-bw/2,by=T+12,bh=15;
  chip(bx-4,by-3,bw+8,bh+6,"rgba(80,44,18,.46)");
  ctx.fillStyle="rgba(255,246,228,.22)";
  ctx.beginPath();ctx.roundRect(bx,by,bw,bh,bh*.5);ctx.fill();
  ctx.textAlign="center";
  if(juice>0){
    const k=clamp(juice/juiceMax,0,1);
    /* a 3s warning and a faster final-second flash, so the end of Juice
       Mode is read ahead of time instead of noticed after the fact */
    const warn=juice<=180, last=juice<=60;
    ctx.fillStyle=last?(frame%4<2?"#FFFFFF":"#FF4D6D")
                 :warn?(frame%10<5?"#FFFFFF":juiceCol())
                 :juiceCol();
    if(k>.02){ctx.beginPath();ctx.roundRect(bx+2,by+2,(bw-4)*k,bh-4,(bh-4)*.5);ctx.fill();}
    if(juiceMax<JUICE_CAP_F){
      const cx2=bx+bw*(juiceMax/JUICE_CAP_F);
      ctx.fillStyle="rgba(255,255,255,.5)";ctx.fillRect(cx2-1,by-2,2,bh+4);}
    ctx.strokeStyle=INK;ctx.lineWidth=2;
    ctx.beginPath();ctx.roundRect(bx,by,bw,bh,bh*.5);ctx.stroke();
    outText("JUICE MODE  "+(juice/60).toFixed(1)+"s"+
      (juiceExt>0?"  (+"+(juiceExt/60).toFixed(1)+"s)":""),W/2,by+bh+17,
      "800 14px "+F_FACE,last?"#FFB0BE":"#FFF6E4",4.5);
    outText(juice>=JUICE_CAP_F?"MAX JUICE · GEM CANNOT EXTEND FURTHER"
                :"×2 DAMAGE · INVINCIBLE · GEM = +0.5s",W/2,by+bh+32,
      "800 10px "+F_FACE,"rgba(255,246,228,.9)",3.5);
  } else {
    const th=juiceThresh(),pc=clamp(meter/th,0,1);
    const grd=pc>=.88;
    ctx.fillStyle=grd?(frame%8<4?"#FFFFFF":"#FFC93C"):"#FFC93C";
    if(pc>.02){ctx.beginPath();ctx.roundRect(bx+2,by+2,(bw-4)*pc,bh-4,(bh-4)*.5);ctx.fill();}
    ctx.strokeStyle=INK;ctx.lineWidth=2;
    ctx.beginPath();ctx.roundRect(bx,by,bw,bh,bh*.5);ctx.stroke();
    /* droplet head rides the fill so the meter reads as filling with juice */
    if(pc>.06)droplet(ctx,bx+2+(bw-4)*pc,by+bh*.5,5.5,"#FFD24A","#E2830A");
    outText("JUICE "+Math.floor(pc*100)+"%"+(th!==100?"  · RUSH":""),W/2,by+bh+16,
      "800 12px "+F_FACE,grd?"#FFFFFF":"rgba(255,246,228,.95)",4);}
  ctx.textAlign="left";

  /* Dash, ability and combo live at the bottom-right of the band. They were
     briefly moved to the top, where they collided with the pause button and
     drifted away from the player's eyeline. */
  const dr=P.dashCd>0?1-P.dashCd/(DASH_CD*(has("dash")?.6:1)):1;
  const dw=64;
  chip(W-18-dw,Bm-26,dw,9,"rgba(65,35,15,.5)");
  ctx.fillStyle=P.dashCd>0?"rgba(255,246,228,.42)":"#8FD44A";
  ctx.beginPath();ctx.roundRect(W-16-dw,Bm-24,(dw-4)*clamp(dr,0,1),5,2.5);ctx.fill();
  ctx.textAlign="right";
  outText(P.dashCd>0?"DASH":(dashChg>0?"CHARGING":"DASH READY"),W-18,Bm-31,
    "800 11px "+F_FACE,P.dashCd>0?"rgba(255,246,228,.75)":"#B7F0A0",3.5);
  /* hold-to-dash charge ring: the player can see the dash arming, which is
     what makes a hold gesture legible instead of guesswork */
  if(dashChg>0&&P.dashCd<=0){
    ctx.save();
    ctx.translate(W-46,Bm-60);
    ctx.strokeStyle="rgba(65,35,15,.45)";ctx.lineWidth=4;
    ctx.beginPath();ctx.arc(0,0,14,0,7);ctx.stroke();
    ctx.strokeStyle="#9BEFFF";ctx.lineWidth=4;ctx.lineCap="round";
    ctx.beginPath();ctx.arc(0,0,14,-Math.PI/2,-Math.PI/2+dashChg*Math.PI*2);ctx.stroke();
    ctx.lineCap="butt";
    ctx.restore();
  }

  /* ── active power-up indicators ──
     Bottom-left of the band, out of the way of the action but inside the
     player's eyeline, with the remaining time drawn as a shrinking bar
     so "about to run out" is visible rather than a surprise. */
  {
    let px2=18;
    if(shieldUp){
      chip(px2,Bm-40,30,26);
      ctx.fillStyle="#4FA8E8";ctx.beginPath();
      ctx.moveTo(px2+15,Bm-35);ctx.lineTo(px2+23,Bm-31);ctx.lineTo(px2+23,Bm-24);
      ctx.quadraticCurveTo(px2+15,Bm-17,px2+7,Bm-24);ctx.lineTo(px2+7,Bm-31);
      ctx.closePath();ctx.fill();ink(ctx,1.6);
      px2+=36;}
    if(magT>0){
      chip(px2,Bm-40,30,26);
      ctx.strokeStyle="#E8324C";ctx.lineWidth=4;
      ctx.beginPath();ctx.arc(px2+15,Bm-26,6,Math.PI,0);ctx.stroke();
      ctx.strokeStyle=INK;ctx.lineWidth=1.4;
      ctx.beginPath();ctx.arc(px2+15,Bm-26,6,Math.PI,0);ctx.stroke();
      ctx.fillStyle="rgba(65,35,15,.35)";ctx.fillRect(px2+4,Bm-16,22,4);
      ctx.fillStyle="#FF6A8A";ctx.fillRect(px2+4,Bm-16,22*(magT/460),4);}
  }

  /* the equipped hero ability, named so it is felt rather than buried */
  if(ABIL[activePass])
    outText(me().id.toUpperCase()+" · "+ABIL[activePass].short,W-18,Bm-46,
      "800 11px "+F_FACE,"rgba(255,246,228,.9)",3.5);
  ctx.textAlign="left";

  if(combo>1){
    const c=Math.min(combo,30)/30;ctx.textAlign="right";
    outText("×"+combo,W-18,Bm-66,"800 26px "+F_FACE,
      "rgb(255,"+(180+c*60)+","+(60+c*100)+")",5);
    ctx.textAlign="left";}

  /* ── boss HUD — hearts + bar at the TOP, per the brief ── */
  if(boss){
    const BC=WY+WH*.42;                  /* banners stay on the band, at eye level */
    ctx.textAlign="center";
    if(boss.st==="warn"){
      ctx.fillStyle="rgba(255,95,122,"+(.12+.14*Math.sin(frame/4))+")";ctx.fillRect(0,WY,W,WH);
      outText("⚠  "+(BOSSES[boss.k]||BOSSES.melon).name+" INCOMING",W/2,BC,
        "800 clamp(19px,4.6vw,32px) "+F_FACE,"#FFE9A0",6);
      outText((BOSSES[boss.k]||BOSSES.melon).tag,W/2,BC+26,F_MONO,"#FFF6E4",4);
      if(SAVE.bossKills<1)
        outText("DODGE THE DIVE — THEN STOMP THE GLOWING CORE",W/2,BC+46,F_MONO,"#8FD44A",4);
    } else if(boss.st==="dead"){
      if(boss.t>60){
        outText((BOSSES[boss.k]||BOSSES.melon).name+" DEFEATED",W/2,BC,
          "800 clamp(18px,4.2vw,28px) "+F_FACE,"#FFE9A0",6);
        outText("+"+(boss.reward||0)+" JUICE DROPS",W/2,BC+24,F_MONO,"#FFF6E4",4);
        if(boss.gift)outText("HERO UNLOCKED · "+boss.gift.toUpperCase(),W/2,BC+42,F_MONO,"#8FD44A",4);
        if(boss.drop)outText("+"+boss.drop.n+" "+FRUIT[boss.drop.k].icon+" "+FRUIT[boss.drop.k].n.toUpperCase(),
          W/2,BC+60,F_MONO,"#9BEFFF",4);}
    } else if(boss.st!=="retreat"){
      const BH=BOSSES[boss.k]||BOSSES.melon;
      /* health as hearts, exactly as sketched, with a bar behind for
         partial damage; both at the top of the screen */
      /* Boss health as a run of pips on an ink-outlined plate, with the
         boss's own colour: the player reads how much is left AND which
         boss it is from one glance at the top of the screen. */
      const n=boss.max,per=Math.min(20,Math.max(10,(W*.46)/n));
      const tw=n*per, tx=W/2-tw/2, hy=T+78;
      outText(BH.name+"   PHASE "+boss.phase+"/3",W/2,hy-9,"800 13px "+F_FACE,"#FFF6E4",4.5);
      chip(tx-6,hy-4,tw+12,per*.74+8,"rgba(65,35,15,.55)");
      for(let i=0;i<n;i++){
        const full=i<boss.hp, hx0=tx+i*per, cy2=hy+per*.34;
        ctx.fillStyle=full?(boss.phase===3?"#FF3D5F":BH.col):"rgba(255,246,228,.22)";
        if(full&&boss.hurt>0&&frame%6<3)ctx.fillStyle="#FFFFFF";
        ctx.beginPath();ctx.roundRect(hx0+2,hy+1,per-4,per*.66,per*.2);ctx.fill();
        ctx.strokeStyle=INK;ctx.lineWidth=1.5;
        ctx.beginPath();ctx.roundRect(hx0+2,hy+1,per-4,per*.66,per*.2);ctx.stroke();}
      if(boss.phase===3)
        outText("RAGE",W/2,hy+per*.66+22,"800 14px "+F_FACE,
          "rgba(255,61,95,"+(.65+.35*Math.sin(frame/5))+")",4);
      if(boss.st==="stun"&&SAVE.bossKills<1)
        outText("NOW! JUMP ON IT",W/2,WY+WH*.24,"800 14px "+F_FACE,"#8FD44A",4.5);
    }
    ctx.textAlign="left";}

  if(evt&&frame-evt.t0<150){
    ctx.textAlign="center";
    ctx.globalAlpha=Math.min(1,(150-(frame-evt.t0))/60);
    outText(({crystal:"JUICE GEM RAIN",meteor:"SEED STORM",ufo:"FLYING SAUCER",
      tornado:"SMOOTHIE TWISTER",dragon:"SKY SERPENT",rainbow:"RAINBOW BRIDGE"})[evt.k],
      W/2,WY+64,F_HUD,"#FFE9A0",5);
    ctx.globalAlpha=1;ctx.textAlign="left";}

  /* tutorial coach (new) */
  if(!SAVE.tut&&tutI<TUT.length&&!boss){
    ctx.textAlign="center";
    const done=tutHold>0;
    outText(done?"NICE!":TUT[tutI].t(),W/2,Bm-56,"800 14px "+F_FACE,
      done?"#8FD44A":"rgba(255,233,160,"+(.75+.25*Math.sin(frame/12))+")",4.5);
    outText((tutI+1)+" / "+TUT.length,W/2,Bm-42,F_SM,"rgba(255,246,228,.8)",3.5);
    ctx.textAlign="left";}

  if(prime&&Math.abs(steer)>.02){
    ctx.fillStyle="rgba(65,35,15,.4)";
    ctx.beginPath();ctx.roundRect(W/2-42,Bm-16,84,6,3);ctx.fill();
    ctx.fillStyle="#FFC93C";
    ctx.beginPath();ctx.roundRect(W/2-6+steer*38,Bm-20,12,14,4);ctx.fill();ink(ctx,1.6);}
}

/* ══════ LOOP ═════════════════════════════════════════════════════
   Fixed 60Hz simulation with a smooth time scale. The original faked
   bullet-time by skipping every third step() while airborne in Juice
   Mode, which made the game visibly stutter exactly when it was meant
   to feel best. */
let acc=0,prev=performance.now(),skip=0,fpsAcc=0,fpsN=0,slowFrames=0;
function frameLoop(now){
  requestAnimationFrame(frameLoop);
  let dt=(now-prev)/1000;prev=now;
  if(!(dt>0))dt=1/60;
  if(dt>.1)dt=.1;

  /* adaptive quality: if the device cannot hold ~50fps for a second and
     a half, drop the expensive layers automatically */
  fpsAcc+=dt;fpsN++;
  if(fpsAcc>=1){
    const fps=fpsN/fpsAcc;
    if(fps<50){if(++slowFrames>=2&&!autoLite){autoLite=true;DPR=Math.min(DPR,1.5);resize();}}
    else slowFrames=0;
    fpsAcc=0;fpsN=0;}

  if(slowT>0){slowT--;timeScale+=(.45-timeScale)*.25;}
  else timeScale+=(1-timeScale)*.12;

  acc+=dt*timeScale;
  let n=0;
  while(acc>=1/60&&n++<5){step();acc-=1/60;}
  if(acc>1/6)acc=0;

  musicTick();
  if(saver()&&(++skip&1))return;
  draw();
}
requestAnimationFrame(frameLoop);

/* ══════ UI ═══════════════════════════════════════════════════════ */
function paintMissions(){
  [$("msStart"),$("msDead")].forEach(box=>{
    box.innerHTML="";
    MS.forEach((m,i)=>{
      const done=SAVE.msDone[i],p=Math.min(SAVE.msProg[i]/m.need,1);
      const el=document.createElement("div");el.className="it"+(done?" done":"");
      el.innerHTML='<span></span><span class="v"></span><span class="track"><span class="fill"></span></span>';
      el.children[0].textContent=m.t(m.need);
      el.children[1].textContent=done?"✔ +2600":Math.min(SAVE.msProg[i],m.need)+"/"+m.need;
      el.querySelector(".fill").style.width=(p*100)+"%";
      box.appendChild(el);});});}
function paintAch(){
  const box=$("achList");box.innerHTML="";
  ACH.forEach(a=>{const d=SAVE.ach[a.id];
    const el=document.createElement("div");el.className="it"+(d?" done":"");
    el.innerHTML='<span></span><span class="v"></span>';
    el.children[0].textContent=a.t;el.children[1].textContent=d?"★ +2500":"—";
    box.appendChild(el);});}
/* roster is heavy (30 vector portraits) so it is only rebuilt when the
   screen is actually opened, not on every death */
let rosterDirty=true;
function paintRoster(){
  const r=$("roster");r.innerHTML="";
  RUN.slice().sort((a,b)=>a.rar-b.rar||a.id.localeCompare(b.id)).forEach(c=>{
    const un=SAVE.unlocked.includes(c.id);
    const d=document.createElement("div");
    d.className="card"+(SAVE.sel===c.id?" sel":"")+(un?"":" lock");
    d.style.borderColor=un?RAR[c.rar].c:"rgba(168,184,216,.2)";
    d.innerHTML='<canvas width="56" height="70"></canvas><div class="n"></div>'+
                '<div class="'+(un?"s":"c")+'"></div><div class="rr"></div>';
    d.querySelector(".n").textContent=c.id;
    d.querySelector(un?".s":".c").textContent=un?PASS[c.pas].t:("💧 "+c.cost.toLocaleString());
    const rr=d.querySelector(".rr");rr.textContent=RAR[c.rar].n;rr.style.color=RAR[c.rar].c;
    const g=d.querySelector("canvas").getContext("2d");
    if(g){                                  /* portrait is optional chrome */
      g.save();g.translate(6,7);
      try{c.draw(g,44,56,1,un?kitFor(c,40,false):{b:"#C9B79E",s:"#8E7A63",d:INK,e:"#6B5843"},40);}catch(e){}
      g.restore();
    }
    d.onclick=()=>{
      if(un){SAVE.sel=c.id;sfx("click");}
      else if(SAVE.coins>=c.cost){SAVE.coins-=c.cost;SAVE.unlocked.push(c.id);SAVE.sel=c.id;sfx("unlock");checkAch();}
      else{sfx("nope");snack("Need "+(c.cost-SAVE.coins).toLocaleString()+" more juice drops");return;}
      save();rosterDirty=true;paintAll();};
    r.appendChild(d);});
  rosterDirty=false;}
function paintLab(){
  $("labFruit").textContent=Object.keys(FRUIT)
    .map(k=>FRUIT[k].icon+" "+(SAVE.fruit[k]|0)).join("   ");
  const box=$("labList");box.innerHTML="";
  Object.keys(BREWS).forEach(k=>{
    const B=BREWS[k],ok=canBrew(k),eq=SAVE.brew===k;
    const el=document.createElement("div");
    el.className="it"+(eq?" done":"");
    el.style.cursor="pointer";
    el.innerHTML='<span></span><span class="v"></span><span class="desc"><span></span></span>';
    el.children[0].textContent=B.icon+"  "+B.n;
    el.children[1].textContent=eq?"EQUIPPED":Object.keys(B.cost).map(f=>FRUIT[f].icon+B.cost[f]).join(" ");
    el.children[2].firstChild.textContent=B.t;
    if(!ok&&!eq)el.style.opacity=".55";
    el.onclick=()=>{if(eq){sfx("nope");return;}doBrew(k);};
    box.appendChild(el);});
  $("labEquip").textContent=SAVE.brew
    ? "NEXT RUN: "+BREWS[SAVE.brew].icon+" "+BREWS[SAVE.brew].n.toUpperCase()
    : "No juice brewed — Juice Mode runs standard";
  const sk=$("labSkins");sk.innerHTML="";
  SKINS.forEach(k=>{
    const owned=achCount()>=k.need, on=(SAVE.skin||"classic")===k.id;
    const l=document.createElement("label");
    l.className="chip";l.style.cursor="pointer";
    if(on){l.style.background="linear-gradient(180deg,#FFF0B0,#FFD05A)";}
    if(!owned)l.style.opacity=".45";
    const dot=document.createElement("span");dot.className="dot";
    if(k.hue>=0){dot.style.background="hsl("+k.hue+",95%,62%)";dot.style.borderColor="transparent";}
    else dot.style.background="linear-gradient(90deg,#FF5F7A,#FFE24A,#6FCF7F,#5FA8FF)";
    l.appendChild(dot);
    l.appendChild(document.createTextNode(owned?k.n:k.n+" · "+k.need+" awards"));
    l.onclick=()=>{
      if(!owned){sfx("nope");snack("Earn "+k.need+" awards to unlock "+k.n);return;}
      SAVE.skin=k.id;sfx("click");save();paintLab();};
    sk.appendChild(l);});
}
function paintAll(){
  const L=level();
  [["xpTxt","xpFill"],["xpTxt2","xpFill2"]].forEach(([t,f])=>{
    $(t).textContent="💧 "+SAVE.coins+" · LV"+L.lv+" · "+L.x+"/"+L.need+" XP · BEST "+SAVE.best+"m"
      +" · "+SAVE.unlocked.length+"/"+RUN.length+" HEROES";
    $(f).style.width=(L.x/L.need*100)+"%";});
  const ml=$("modLine");
  if(OPT.mod&&MOD){ml.style.display="block";ml.textContent="⚑ TODAY: "+modText()+" — toggle in pause menu";}
  else ml.style.display="none";
  paintMissions();paintAch();
  const lb=$("labBtnNote");
  if(lb)lb.textContent="";
  if($("ovLab").classList.contains("show"))paintLab();
  if(rosterDirty&&$("ovChars").classList.contains("show"))paintRoster();}
function show(id){
  ["ovStart","ovDead","ovChars","ovAch","ovLab","ovPause"].forEach(o=>$(o).classList.remove("show"));
  if(id)$(id).classList.add("show");}

function guideText(){
  const t=usedTouch;
  const a=t?"<div><b>TAP</b> anywhere to jump · <b>TAP AGAIN</b> in the air to double jump</div>"
           :"<div><b>SPACE / W / ↑</b> to jump · press again in the air to double jump</div>";
  /* Scheme-aware: telling a player to slide when they chose buttons is
     worse than no help at all. */
  /* read the SELECTED hero, not the live run state — the menu shows this
     before a run has ever set activePass */
  const abil=me().pas==="blast"?"blast":"dash";
  const b=!t?"<div><b>A / D</b> or <b>← →</b> to steer · <b>SHIFT</b> to "+abil+" · <b>P</b> to pause</div>"
          :OPT.scheme==="buttons"
           ?"<div><b>◀ ▶</b> to steer · <b>▲</b> to jump · <b>»</b> to "+abil+"</div>"
           :"<div><b>SLIDE</b> your finger to steer · <b>HOLD STILL</b> to charge a "+abil+"</div>";
  const c="<div>Collect <b>JUICE DROPS</b> · land dead-centre for <b>PERFECT</b> juice · at 100% you go <b>JUICE MODE</b></div>";
  /* Hearts are health within one run, not three separate attempts — say so
     plainly rather than letting players read "lives" into it. */
  const e="<div>You have <b>3 HEARTS</b> of health per run · a <b>JUICE GEM</b> in Juice Mode adds <b>+0.5s</b></div>";
  const d="<div>Boss: <b>DODGE</b> the flashing dive lane, then <b>STOMP</b> the green core while it is stunned</div>";
  return a+b+c+e+d;}
function refreshGuides(){$("gStart").innerHTML=guideText();$("gPause").innerHTML=guideText();}

$("bPlay").onclick=()=>{initAudio();sfx("click");start();};
$("bAgain").onclick=()=>{sfx("click");start();};
$("bChars").onclick=()=>{sfx("click");show("ovChars");paintRoster();};
$("bChars2").onclick=()=>{sfx("click");show("ovChars");paintRoster();};
$("bAch").onclick=()=>{sfx("click");show("ovAch");};
$("bLab").onclick=()=>{sfx("click");show("ovLab");paintLab();};
$("bBack3").onclick=()=>{sfx("click");show(ST==="dead"?"ovDead":"ovStart");};
$("bBack").onclick=()=>{sfx("click");show(ST==="dead"?"ovDead":"ovStart");};
$("bBack2").onclick=()=>{sfx("click");show(ST==="dead"?"ovDead":"ovStart");};
$("bResume").onclick=()=>togglePause();
$("bQuit").onclick=()=>{paused=false;$("ovPause").classList.remove("show");die("ENDED");};
$("pauseBtn").onclick=()=>togglePause();
$("bRotOk").onclick=()=>{rotDismissed=true;updateRot();sfx("click");};
/* "Tap to run again" is now literally true — tapping the run-over screen
   anywhere but a button restarts. The original wired restart only to the
   canvas, which is covered by the overlay, so it never fired on touch. */
$("ovDead").addEventListener("pointerdown",e=>{
  if(e.target.closest(".btn"))return;
  if(frame-deadAt>25){sfx("click");start();}});

$("bFull").onclick=async()=>{
  sfx("click");
  if(!CAN_FS){
    snack(IOS?"iOS Safari has no fullscreen — use Share ▸ Add to Home Screen":"Fullscreen unavailable",4200);
    return;}
  try{
    const el=document.documentElement;
    if(!document.fullscreenElement&&!document.webkitFullscreenElement){
      const r=el.requestFullscreen?el.requestFullscreen():el.webkitRequestFullscreen();
      if(r&&r.then)await r;
    } else {
      const x=document.exitFullscreen?document.exitFullscreen():document.webkitExitFullscreen();
      if(x&&x.then)await x;}
    if(screen.orientation&&screen.orientation.lock)
      try{await screen.orientation.lock("landscape");}catch(e){}
  }catch(e){}
  setTimeout(resize,220);setTimeout(resize,600);
};
["oSnd","oVib","oCalm","oBat","oInv","oMod"].forEach(id=>$(id).onchange=()=>{
  syncOpts();
  if(id==="oBat")resize();
  if(id==="oSnd"){initAudio();layers(ST==="play"&&!paused?Math.min(1+Math.floor(dist/500),3):0);diag();}
  if(id==="oMod")paintAll();
  sfx("click");
});
$("oVol").oninput=()=>{syncOpts();setVol(OPT.vol);};
$("oVol").onchange=()=>{sfx("click");};

/* ══════ BOOT ═════════════════════════════════════════════════════ */
function bootDone(){
  /* A fatal error already told the player the engine is not running.
     Tearing the overlay down here would replace that explanation with a
     frozen black screen — the exact trap this build removes. */
  if(window.__jjaFatal)return;
  window.__jjaBooted=true;                  /* stand the watchdog down */
  refreshGuides();
  if(IPHONE)$("iosNote").style.display="block";
  if(!CAN_FS&&IOS)$("bFull").textContent="How to fullscreen";
  diag();
  const b=$("boot");
  b.classList.add("gone");
  setTimeout(()=>{b.style.display="none";},380);
}
/* ══════ TEST HOOK ════════════════════════════════════════════════
   Opt-in read-mostly surface for the headless QA harness. Gated behind
   ?debug=1 so a normal player never gets it and nothing can be poked
   from the console in a shipped build. */
if(/[?&]debug=1\b/.test(location.search)){
  window.JJA_DEBUG={
    get state(){return{
      ST,paused,frame,dist,camX,hp,hpMax,juice,juiceMax,meter,juiceThresh:juiceThresh(),
      orbs_,crys,combo,perfect,jumps,
      elites,bossWins,RMOD,activePass,autoLite,timeScale,
      plats:plats.length,orbs:orbs.length,foes:foes.length,shots:shots.length,
      px:P.x,py:P.y,pvx:P.vx,pvy:P.vy,grd:P.grd,dashCd:P.dashCd,
      boss:boss?{k:boss.k,st:boss.st,hp:boss.hp,max:boss.max,phase:boss.phase,x:boss.x,y:boss.y,
                 life:boss.life,hits:boss.hits,gift:boss.gift,drop:boss.drop,spawned:boss.spawned}:null,
      BREW,runFruit,bosses:Object.keys(BOSSES),brews:Object.keys(BREWS),fruits:Object.keys(FRUIT),
      abil:ABIL[activePass]?ABIL[activePass].short:"?",
      safeTop,WY,WH,
      audio:AC?AC.state:"none", tut:{i:tutI,done:SAVE.tut},
      opt:{...OPT}, dashChg, stage:stageOf(dist), diff:diff(),
      juiceExt:juiceExt, juiceCapF:JUICE_CAP_F,
      input:{steer,padL,padR,prime:prime?prime.mode||"pending":null},
      save:JSON.parse(JSON.stringify(SAVE))
    };},
    setScheme(s){OPT.scheme=s;syncOpts();syncSchemeUI();},
    REACH,STAGES,
    stageAt(m){return stageOf(m);},
    /* Force a daily modifier (or none) for deterministic balance tests —
       otherwise the value under test depends on what day it is. */
    setMod(k){MOD=k;OPT.mod=!!k;$("oMod").checked=!!k;RMOD=k||null;},
    turbo(){return{spd:TURBO_SPD,coin:TURBO_COIN};},
    /* Live economy constants, so test/economy.mjs models the real values
       instead of a copy that can silently drift out of date. */
    economy(){
      const perTier=[0,0,0,0,0,0,0];
      RUN.forEach(r=>perTier[r.rar]++);
      return{cost:COST,rarity:RAR.map(r=>r.n),perTier,
             distBonus:150,bossBase:300,bossStep:90,
             firstBoss:350,bossGap:550,achReward:2500,missionReward:2600,
             heroes:RUN.map(r=>({id:r.id,rar:r.rar,cost:r.cost,pas:r.pas}))};},
    /* Measured pickup density from the REAL generator over a stretch of
       world, so the economy model rests on the game's actual orb/crystal
       output rather than a guess. Returns counts per 100 metres. */
    density(startM,sweeps){
      plats.length=0;orbs.length=0;foes.length=0;genPrevY=null;
      const d0=startM|0;dist=d0;camX=dist*10;
      let x=camX;
      for(let i=0;i<(sweeps||6);i++){x=gen(x);camX+=700;dist=Math.floor(camX/10);}
      const metres=(camX-d0*10)/10;
      let orb=0,cry=0,fru=0;
      for(const o of orbs){if(o.pu)continue;else if(o.fruit)fru++;else if(o.cry)cry++;else orb++;}
      plats.length=0;orbs.length=0;foes.length=0;
      return{metres:Math.round(metres),
             orbPer100:+(orb/metres*100).toFixed(3),
             cryPer100:+(cry/metres*100).toFixed(3),
             fruPer100:+(fru/metres*100).toFixed(3)};},
    extend(){return extendJuice(P.x,P.y);},
    sfx(k){sfx(k);return true;},          /* audio-cue smoke probe */
    sfxKeys(){return ["jump","dbl","dash","land","step","orb","cry","hurt","juice",
      "juiceEnd","juiceExt","juiceLast","bossWeak","bossFlee","stomp","bossHit",
      "explode","victory","siren","dead","click","ding","unlock","nope"];},
    juiceLenOf(hero){const o=SAVE.sel;SAVE.sel=hero;const r=me();
      const prev=activePass;activePass=r.pas;const v=juiceLen();
      activePass=prev;SAVE.sel=o;return v;},
    diffAt(m){const o=dist;dist=m;const v=diff();dist=o;return v;},
    /* Drive the REAL generator over a stretch of world and hand back the
       platforms it produced. The validator seeds Math.random before calling
       this, so a failing run is reproducible from its seed alone. Testing
       the shipped gen() rather than a reimplementation is the whole point —
       a copy could drift from the code that actually runs. */
    genSeq(mod,startM,sweeps){
      const oldMod=RMOD;
      RMOD=mod||null;
      plats.length=0;orbs.length=0;foes.length=0;shots.length=0;
      genPrevY=null;
      dist=startM|0;camX=dist*10;
      let x=camX;
      for(let i=0;i<(sweeps||1);i++){
        x=gen(x);
        camX+=700;dist=Math.floor(camX/10);
      }
      const out=plats.map(p=>({x:p.x,y:p.y,w:p.w,high:!!p.high,spike:!!p.spike,type:p.type}));
      RMOD=oldMod;
      plats.length=0;orbs.length=0;foes.length=0;
      return out;
    },
    holdDash(ms){                       /* simulate a stationary hold */
      prime={id:-1,ax:0,x0:0,y0:0,t0:performance.now()-ms,mode:"",fired:false};
      touchTick();const f=!!(prime&&prime.fired);prime=null;return f;},
    steerThenHold(px,ms){               /* a steer must cancel a pending dash */
      prime={id:-1,ax:0,x0:0,y0:0,t0:performance.now()-ms,mode:"",fired:false};
      if(Math.abs(px)/VS>HOLD_SLOP)prime.mode="steer";
      touchTick();const f=!!(prime&&prime.fired);prime=null;return f;},
    fillJuice(){meter=100;},
    forceBoss(){nextBoss=0;boss=null;},
    restart(){start();},
    setHero(id){if(!SAVE.unlocked.includes(id))SAVE.unlocked.push(id);SAVE.sel=id;start();},
    giveFruit(n){for(const k in SAVE.fruit)SAVE.fruit[k]=n;save();},
    brew(k){doBrew(k);},
    bossTo(hp){if(boss){boss.hp=hp;boss.hurt=0;bossDamage(0.0001);}},
    setBossKind(k){if(boss)boss.k=k;},
    spawnKind(k){nextBoss=0;boss=null;bossStep();if(boss&&BOSSES[k])boss.k=k;},
    probeGain(n){const b=meter;meter=0;gainJuice(n);const d=meter;meter=b;return +d.toFixed(3);},
    probeDamage(){return (has("slayer")?2:1)*(juice>0?2:1);},
    keepAlive(){hp=hpMax;iFr=Math.max(iFr,4);},   /* heal only — never restarts */
    setDist(m){P.x=m*10;camX=P.x-W*.31;dist=m;edgeX=gen(camX+W);},
    hitBoss(){if(boss&&boss.st!=="dead"&&boss.st!=="warn"){boss.hurt=0;bossDamage(1);}},
    voidPlayer(){P.y=WH+200;},
    reachableBoss(){                     /* is the weak point inside jump range? */
      if(!boss)return null;
      const apexTop=P.y-APEX-30;
      return{st:boss.st,dy:(P.y-boss.y),inRange:boss.y>=apexTop&&Math.abs(boss.x-(P.x+P.w/2))<200};}
  };
}

/* The failsafe is armed BEFORE any work that could throw. Previously it
   was registered after load(), so a synchronous throw in startup meant
   it never got registered at all and the spinner ran forever. */
setTimeout(()=>{try{if(!$("boot").classList.contains("gone"))bootDone();}catch(e){}},2500);
/* Startup is a named, re-runnable step so the failure screen's Retry can
   genuinely try again in place instead of only offering a page reload. */
function startup(){
  $("bootTxt").textContent="Loading";
  syncOpts();
  resize();
  /* Reaching here means the canvas, context and viewport are all real, so
     the engine is safe to return to. The watchdog uses this to decide
     whether "Return to menu" is an honest offer. */
  window.__jjaEngineReady=true;
  load();
}
window.__jjaRetry=function(){
  window.__jjaFatal=false;
  startup();
};
try{ startup(); }
catch(e){
  /* Do NOT bootDone() here: that hid the message and dropped the player into
     a game that had not initialised. Show it and let them retry or reload. */
  if(window.__jjaReveal)window.__jjaReveal("Startup: "+(e&&e.message||e),true);
}
})();
