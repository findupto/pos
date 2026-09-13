function boot(){
  const R=window.SpeechRecognition||window.webkitSpeechRecognition;
  let listening=false,rec=null;
  const start=()=>{
    const input=document.getElementById('posAiInput');
    const status=document.getElementById('posAiStatus');
    const mic=document.getElementById('posAiMic');
    if(!R){
      if(status)status.textContent='Standalone voice unavailable in this Electron build';
      if(mic)mic.textContent='🎙';
      return;
    }
    if(listening)return;
    rec=new R();
    rec.lang='en-US';
    rec.interimResults=false;
    rec.continuous=false;
    listening=true;
    if(status)status.textContent='Standalone voice · listening…';
    if(mic)mic.textContent='⏹';
    rec.onresult=e=>{
      const text=e.results?.[0]?.[0]?.transcript||'';
      if(input&&text){
        input.value=text;
        document.getElementById('posAiSend')?.click();
      }
    };
    rec.onerror=e=>{
      if(status)status.textContent=e.error==='not-allowed'?'Microphone permission denied':`Standalone voice error: ${e.error||'unknown'}`;
    };
    rec.onend=()=>{
      listening=false;
      if(mic)mic.textContent='🎙';
    };
    try{rec.start()}catch(e){
      listening=false;
      if(mic)mic.textContent='🎙';
      if(status)status.textContent=e.message||'Could not start microphone';
    }
  };
  window.posStandaloneVoiceStart=start;
  document.addEventListener('click',e=>{
    const mic=e.target?.closest?.('#posAiMic');
    if(!mic)return;
    if(window.posDesktop?.aiKeyStatus){
      window.posDesktop.aiKeyStatus().then(ok=>{
        if(!ok){e.preventDefault();e.stopImmediatePropagation();start();}
      }).catch(()=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        start();
      });
    }else{
      e.preventDefault();
      e.stopImmediatePropagation();
      start();
    }
  },true);
  const timer=setInterval(()=>{
    const setup=document.getElementById('posAiSetup');
    const status=document.getElementById('posAiStatus');
    if(setup&&status){
      const promise=window.posDesktop?.aiKeyStatus?.();
      if(promise&&typeof promise.then==='function'){
        promise.then(ok=>{
          if(!ok){
            setup.hidden=true;
            status.textContent=R?'Standalone mode · no API key required':'Standalone voice unavailable in this Electron build';
          }
        }).catch(()=>{
          setup.hidden=true;
          status.textContent=R?'Standalone mode · no API key required':'Standalone voice unavailable in this Electron build';
        });
      }else{
        setup.hidden=true;
        status.textContent=R?'Standalone mode · no API key required':'Standalone voice unavailable in this Electron build';
      }
    }
    if(document.getElementById('posAiMic'))clearInterval(timer);
  },300);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
