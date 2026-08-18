export function createH3OutputPlayer({mk,C,tx,previewBox,vidEl,imgEl,isVideo,getItems,getCurrent,showItem,getMode}){
  const settingsKey="one_node_minimax_h3_output_player";
  let saved={};
  try{ saved=JSON.parse(localStorage.getItem(settingsKey)||"{}"); }catch(e){ saved={}; }
  const save=()=>{ try{ localStorage.setItem(settingsKey,JSON.stringify({muted,rateIndex,loop:vidEl.loop,globalLoop})); }catch(e){} };
  const playerControls=mk("div",{display:"none",alignItems:"center",gap:"5px",flexWrap:"wrap",padding:"2px 0"});
  const playerBtn=(label,title)=>{
    const b=mk("button",{height:"26px",minWidth:"28px",padding:"0 8px",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:"4px",border:`1px solid ${C.border}`,borderRadius:"7px",background:C.bg1,color:C.muted,fontSize:"11px",fontWeight:"700",cursor:"pointer",outline:"none"},{type:"button",title});
    b._lbl=mk("span",{}, {textContent:label});
    b.appendChild(b._lbl);
    b.onmouseenter=()=>{b.style.borderColor=C.lime;b.style.color=C.lime;};
    b.onmouseleave=()=>{b.style.borderColor=C.border;b.style.color=C.muted;};
    return b;
  };
  const playerPrevBtn=playerBtn("◀","Previous output (B)");
  const playerPlayBtn=playerBtn("▶","Play or pause (Space)");
  const playerNextBtn=playerBtn("▶","Next output (N)");
  const playerMuteBtn=playerBtn("🔊","Mute or unmute (M)");
  const playerSpeedBtn=playerBtn("1×","Playback speed (+ / -)");
  const playerLoopBtn=playerBtn("↻","Loop this video (L)");
  const playerAllLoopBtn=playerBtn("All ↻","Auto-advance through the selected outputs (A)");
  const playerFullBtn=playerBtn("⛶","Fullscreen (F)");
  const playerHelpBtn=playerBtn("?","Show player shortcuts (O)");
  const playerModeLbl=mk("span",{fontSize:"9px",color:C.muted,marginLeft:"2px",fontWeight:"700"},{textContent:"All outputs"});
  const playerHelp=mk("div",{position:"absolute",left:"10px",right:"10px",bottom:"10px",display:"none",padding:"8px 10px",borderRadius:"7px",background:"rgba(0,0,0,.86)",color:C.text,fontSize:"10px",lineHeight:"1.6",zIndex:"5",pointerEvents:"none"});
  tx(playerHelp,"Space play/pause · ←/→ seek 10s · ↑/↓ volume · N/B next/previous · A auto-advance · L loop · M mute · +/- speed · F fullscreen · Z zoom · 0 reset zoom");
  playerControls.append(playerPrevBtn,playerPlayBtn,playerNextBtn,playerMuteBtn,playerSpeedBtn,playerLoopBtn,playerAllLoopBtn,playerFullBtn,playerHelpBtn,playerModeLbl);
  previewBox.appendChild(playerHelp);

  let muted=true;
  let globalLoop=saved.globalLoop===true;
  let zoom=1;
  const rates=[0.25,0.5,0.75,1,1.25,1.5,2];
  let rateIndex=Math.max(0,Math.min(rates.length-1,Number.isInteger(saved.rateIndex)?saved.rateIndex:rates.indexOf(1)));
  const applySettings=()=>{
    muted=true;
    vidEl.muted=muted;
    vidEl.playbackRate=rates[rateIndex];
    vidEl.loop=saved.loop!==false;
  };
  const applyZoom=()=>{
    const transform=zoom===1?"":"scale("+zoom+")";
    vidEl.style.transform=transform;
    imgEl.style.transform=transform;
  };
  const sync=()=>{
    const active=isVideo(getCurrent())&&vidEl.style.display!=="none";
    playerControls.style.display=active?"flex":"none";
    playerModeLbl.textContent=(getMode()?"Favorites":"All outputs")+" · "+getItems().length;
    playerPlayBtn._lbl.textContent=vidEl.paused?"▶":"Ⅱ";
    playerMuteBtn._lbl.textContent=vidEl.muted?"🔇":"🔊";
    playerSpeedBtn._lbl.textContent=rates[rateIndex]+"×";
    playerLoopBtn.classList.toggle("on",!!vidEl.loop);
    playerAllLoopBtn.classList.toggle("on",globalLoop);
    playerLoopBtn.title=vidEl.loop?"Stop looping this video (L)":"Loop this video (L)";
    playerAllLoopBtn.title=globalLoop?"Stop auto-advance through the selected outputs (A)":"Auto-advance through the selected outputs (A)";
  };
  const cycle=(direction)=>{
    const items=getItems();
    if(!items.length) return;
    let index=items.findIndex(item=>{
      const current=getCurrent();
      return current&&item.filename===current.filename&&(item.subfolder||"")==(current.subfolder||"");
    });
    if(index<0) index=direction>0?-1:0;
    showItem(items[(index+direction+items.length)%items.length]);
  };
  const toggleFullscreen=()=>{
    if(document.fullscreenElement){
      const result=document.exitFullscreen();
      result?.catch(()=>{});
    }else{
      const result=previewBox.requestFullscreen?.();
      result?.catch(()=>{});
    }
  };
  const toggleHelp=()=>{ playerHelp.style.display=playerHelp.style.display==="none"?"block":"none"; };

  playerPrevBtn.onclick=()=>cycle(-1);
  playerPlayBtn.onclick=()=>{ if(vidEl.paused) vidEl.play().catch(()=>{}); else vidEl.pause(); };
  playerNextBtn.onclick=()=>cycle(1);
  playerMuteBtn.onclick=()=>{ muted=!vidEl.muted; vidEl.muted=muted; save(); sync(); };
  playerSpeedBtn.onclick=()=>{
    rateIndex=(rateIndex+1)%rates.length;
    vidEl.playbackRate=rates[rateIndex];
    save();
    sync();
  };
  playerLoopBtn.onclick=()=>{ vidEl.loop=!vidEl.loop; save(); sync(); };
  playerAllLoopBtn.onclick=()=>{ globalLoop=!globalLoop; save(); sync(); };
  playerFullBtn.onclick=toggleFullscreen;
  playerHelpBtn.onclick=toggleHelp;
  vidEl.addEventListener("play",sync);
  vidEl.addEventListener("pause",sync);
  vidEl.addEventListener("volumechange",()=>{ muted=vidEl.muted;save();sync(); });
  vidEl.addEventListener("ratechange",sync);
  vidEl.addEventListener("ended",()=>{ if(globalLoop&&!vidEl.loop) cycle(1); });

  const handleKey=(e)=>{
    if(e.ctrlKey||e.metaKey||e.altKey||!isVideo(getCurrent())||vidEl.style.display==="none") return false;
    const key=e.key;
    if(key===" "||e.code==="Space"){
      e.preventDefault();
      if(vidEl.paused) vidEl.play().catch(()=>{}); else vidEl.pause();
    }else if(key==="ArrowRight"||key==="ArrowLeft"){
      e.preventDefault();
      const delta=key==="ArrowRight"?10:-10;
      vidEl.currentTime=Math.max(0,Math.min(vidEl.duration||Infinity,vidEl.currentTime+delta));
    }else if(key==="ArrowUp"||key==="ArrowDown"){
      e.preventDefault();
      muted=false;vidEl.muted=false;save();
      vidEl.volume=Math.max(0,Math.min(1,vidEl.volume+(key==="ArrowUp"?.1:-.1)));
    }else if(key==="n"||key==="N"){
      e.preventDefault();cycle(1);
    }else if(key==="b"||key==="B"){
      e.preventDefault();cycle(-1);
    }else if(key==="a"||key==="A"){
      e.preventDefault();globalLoop=!globalLoop;save();sync();
    }else if(key==="l"||key==="L"){
      e.preventDefault();vidEl.loop=!vidEl.loop;save();sync();
    }else if(key==="m"||key==="M"){
      e.preventDefault();muted=!vidEl.muted;vidEl.muted=muted;save();sync();
    }else if(key==="+"||key==="="){
      e.preventDefault();
      rateIndex=Math.min(rates.length-1,rateIndex+1);
      vidEl.playbackRate=rates[rateIndex];save();sync();
    }else if(key==="-"){
      e.preventDefault();
      rateIndex=Math.max(0,rateIndex-1);
      vidEl.playbackRate=rates[rateIndex];save();sync();
    }else if(key==="z"){
      e.preventDefault();zoom=Math.min(3,zoom+.25);applyZoom();
    }else if(key==="Z"){
      e.preventDefault();zoom=Math.max(1,zoom-.25);applyZoom();
    }else if(key==="0"){
      e.preventDefault();zoom=1;applyZoom();
    }else if(key==="f"||key==="F"){
      e.preventDefault();toggleFullscreen();
    }else if(key==="o"||key==="O"){
      e.preventDefault();toggleHelp();
    }else if(key==="Escape"){
      playerHelp.style.display="none";
      if(document.fullscreenElement) toggleFullscreen();
    }else{
      return false;
    }
    return true;
  };

  return {controls:playerControls,sync,applySettings,setLoop:value=>{vidEl.loop=!!value;save();sync();},resetZoom:()=>{zoom=1;applyZoom();},handleKey};
}
