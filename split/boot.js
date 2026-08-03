/* Jump Juice Adventure — boot watchdog.
   MUST be loaded before jumpjuice.js. Catches a top-level throw in the
   game, shows it on the loading screen and offers a way through, so the
   spinner can never hang with no explanation. */
/* ══════ BOOT WATCHDOG ═════════════════════════════════════════════
   Deliberately a separate script that runs BEFORE the game, so it still
   works if the game script throws at top level. Without this, any such
   throw left the loading screen up forever with no explanation — which
   is exactly what happened when a browser returned null from
   getContext() (iOS can do this under canvas/memory pressure).

   The player is never trapped, and never dropped into a game that is not
   actually running. The old build showed one "Continue anyway" button that
   force-dismissed the overlay for BOTH failure kinds — so a fatal engine
   failure (null canvas) hid the explanation and left a frozen black screen.
   Recovery is now matched to how bad the failure was:
     recoverable  -> Retry · Reload · (Return to menu, only when the engine
                     reported itself initialised via __jjaEngineReady)
     fatal        -> Reload · Copy error details, and NO way to continue.
   __jjaFatal latches so a late bootDone() cannot silently wipe the error. */
(function(){
  var el=function(id){return document.getElementById(id);};
  var shown=false;
  function show(id,on){var n=el(id); if(n)n.style.display=on?"inline-flex":"none";}
  function reveal(msg,fatal){
    if(window.__jjaBooted||shown)return; shown=true;
    if(fatal)window.__jjaFatal=true;
    window.__jjaErrText=(fatal?"Fatal startup error":"Startup did not complete")+
      "\n"+String(msg||"")+"\n"+navigator.userAgent+"\n"+location.href;
    var t=el("bootTxt");
    if(t)t.textContent=fatal?"Startup problem":"Taking longer than expected";
    var e=el("bootErr"); if(e){e.textContent=msg;e.style.display="block";}
    var r=document.querySelector("#boot .ring"); if(r)r.style.display="none";
    var acts=el("bootActs"); if(acts)acts.style.display="flex";
    /* A fatal error means the engine is not running. Offer no route into it. */
    show("bootRetry",!fatal);
    show("bootReload",true);
    show("bootMenu",!fatal&&!!window.__jjaEngineReady);
    show("bootCopy",!!fatal);
  }
  function dismiss(){
    var b=el("boot"); if(!b)return;
    b.classList.add("gone");setTimeout(function(){b.style.display="none";},380);
  }
  window.__jjaBooted=false;
  window.__jjaFatal=false;
  window.__jjaEngineReady=false;
  window.__jjaReveal=reveal;
  window.__jjaDismissBoot=dismiss;
  addEventListener("error",function(ev){
    reveal(((ev&&ev.message)||"unknown error")+
      (ev&&ev.lineno?"  (line "+ev.lineno+")":""),true);
  });
  addEventListener("unhandledrejection",function(ev){
    var r=ev&&ev.reason;
    reveal("Unhandled rejection: "+((r&&r.message)||String(r||"unknown")),true);
  });
  /* last-resort: the spinner may never hang with no explanation */
  setTimeout(function(){
    var b=el("boot");
    if(!window.__jjaBooted&&b&&!b.classList.contains("gone"))
      reveal("The game did not finish starting. Retry, or reload the page.",false);
  },4000);
  document.addEventListener("click",function(ev){
    var id=ev.target&&ev.target.id;
    if(id==="bootReload"){location.reload();return;}
    if(id==="bootCopy"){
      var txt=window.__jjaErrText||"no details";
      var done=function(){var n=el("bootCopy");if(n)n.textContent="Copied";};
      try{
        if(navigator.clipboard&&navigator.clipboard.writeText)
          navigator.clipboard.writeText(txt).then(done,function(){fallback(txt,done);});
        else fallback(txt,done);
      }catch(e){fallback(txt,done);}
      return;
    }
    /* Retry re-runs the game's own startup in place when it exposed a hook,
       otherwise a reload is the only honest option. */
    if(id==="bootRetry"){
      if(typeof window.__jjaRetry==="function"){
        shown=false;
        var e2=el("bootErr"); if(e2)e2.style.display="none";
        var acts=el("bootActs"); if(acts)acts.style.display="none";
        var r=document.querySelector("#boot .ring"); if(r)r.style.display="block";
        var t=el("bootTxt"); if(t)t.textContent="Retrying";
        try{window.__jjaRetry();}catch(err){reveal("Retry failed: "+(err&&err.message||err),true);}
      } else location.reload();
      return;
    }
    /* Only reachable when the engine reported itself initialised. */
    if(id==="bootMenu"&&!window.__jjaFatal)dismiss();
  });
  function fallback(txt,done){
    try{
      var ta=document.createElement("textarea");
      ta.value=txt;ta.style.cssText="position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta);ta.focus();ta.select();
      document.execCommand("copy");ta.remove();done();
    }catch(e){
      var n=el("bootErr"); if(n)n.textContent=txt;   /* at least make it selectable */
    }
  }
})();
