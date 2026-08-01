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
   The player is never trapped: the error is shown on screen and a
   Continue button force-dismisses the overlay. */
(function(){
  var el=function(id){return document.getElementById(id);};
  var shown=false;
  function reveal(msg,fatal){
    if(window.__jjaBooted||shown)return; shown=true;
    var t=el("bootTxt"); if(t)t.textContent=fatal?"Startup problem":"Taking longer than expected";
    var e=el("bootErr"); if(e){e.textContent=msg;e.style.display="block";}
    var k=el("bootSkip"); if(k)k.style.display="inline-flex";
    var r=document.querySelector("#boot .ring"); if(r)r.style.display="none";
  }
  window.__jjaBooted=false;
  window.__jjaReveal=reveal;
  addEventListener("error",function(ev){
    reveal(((ev&&ev.message)||"unknown error")+
      (ev&&ev.lineno?"  (line "+ev.lineno+")":""),true);
  });
  addEventListener("unhandledrejection",function(ev){
    var r=ev&&ev.reason;
    reveal("Unhandled rejection: "+((r&&r.message)||String(r||"unknown")),true);
  });
  /* last-resort: if the game never signalled ready, let the player through */
  setTimeout(function(){
    var b=el("boot");
    if(!window.__jjaBooted&&b&&!b.classList.contains("gone"))
      reveal("The game did not finish starting. Tap Continue to try playing anyway.",false);
  },4000);
  document.addEventListener("click",function(ev){
    if(!ev.target||ev.target.id!=="bootSkip")return;
    var b=el("boot"); if(b){b.classList.add("gone");setTimeout(function(){b.style.display="none";},380);}
  });
})();
