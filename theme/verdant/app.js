/* verdant/app.js -- panel state, layout, paint dispatch, input, and foobar callbacks
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* ------------------------- state ------------------------- */
var W=window.Width, H=window.Height, R={}, NP=null, npTitleStr='', npArtistStr='';
// Repaint scope flags. dirtyAll (sticky) forces a full paint; partial flags accumulate.
// A full window.Repaint() MUST set dirtyAll (use repaintAll) so a paint serviced while a
// partial flag is pending can't blank the rest of the window.
var dirtyAll=true, dirtyBar=false, dirtyQueue=false, dirtySearch=false, dirtyMain=false, dirtyNav=false, dirtyTitle=false;
function clearDirty(){ dirtyAll=dirtyBar=dirtyQueue=dirtySearch=dirtyMain=dirtyNav=dirtyTitle=false; }
function repaintAll(){ dirtyAll=true; window.Repaint(); }
/* Main's views draw the row/card straddling their crop line at full height and mask only the
   10px gutter below it (see the FillSolidRect(r.x,cropY,...) in each), so the remainder lands on
   the player bar. drawBar runs after main in the partial path, so pairing them covers it -- and
   it is far cheaper than the full-window repaint that used to hide this. */
function repaintMain(){ dirtyMain=true; window.RepaintRect(R.main.x,R.main.y,R.main.w,R.main.h); repaintBar(); }
function repaintNav(){ dirtyNav=true; window.RepaintRect(R.navLib.x,R.navLib.y,R.navLib.w,R.navLib.h); }
// drawNav paints both nav cards, so a hover crossing between them must invalidate their union
function repaintNavAll(){ dirtyNav=true; window.RepaintRect(R.navTop.x,R.navTop.y,R.navTop.w,(R.navLib.y+R.navLib.h)-R.navTop.y); }
function repaintQueue(){ dirtyQueue=true; window.RepaintRect(R.queue.x,R.queue.y,R.queue.w,R.queue.h); }
function repaintTitle(){ dirtyTitle=true; window.RepaintRect(0,0,W,TBH); }
/* A hover only changes one panel's appearance, so repaint that panel rather than the whole
   window. Hitbox ownership is cleanly panel-aligned (HB_PL/HB_HOME/SBN -> nav, HB_CARD/HB_TR/
   SB/SBH -> main, HB_Q/HB_TABS -> queue, HB_CTRL -> bar, HB_MENU/HB_CAP -> title), so the
   cursor position alone picks the right one. */
function hoverZone(x,y){
  if(y<TBH) return 'title';
  if(R.barY!==undefined && y>=R.barY) return 'bar';
  if(R.queue && x>=R.queue.x) return 'queue';
  if(R.main && x>=R.main.x) return 'main';
  return 'nav';
}
function repaintZone(z){
  if(z==='main') repaintMain();
  else if(z==='nav') repaintNavAll();
  else if(z==='queue') repaintQueue();
  else if(z==='bar') repaintBar();
  else if(z==='title') repaintTitle();
}
var firstRow=0, hoverKey='', scrollKey='', hoverZoneKey='', mx=-1, my=-1, drag=null, dragFrac=0;   // WHEEL_PX: core/props.js
// eased scrolling: animate each rendered position toward its target, repainting only the moving region
var firstRowT=0, navScrollT=0, homeScrollT=0, PL_MAXPX=0, scrollTimer=null;
function scrollTick(){
  var mm=false, nm=false, d1=firstRowT-firstRow, d2=navScrollT-navScroll, d3=homeScrollT-homeScroll, d4=songsScrollT-songsScroll, d5=searchScrollT-searchScroll, d6=plScrollT-plScroll;
  if(Math.abs(d1)>=0.5){ firstRow+=d1*0.25; mm=true; } else firstRow=firstRowT;
  if(Math.abs(d3)>=0.5){ homeScroll+=d3*0.25; mm=true; } else homeScroll=homeScrollT;
  if(Math.abs(d4)>=0.5){ songsScroll+=d4*0.25; mm=true; } else songsScroll=songsScrollT;
  if(Math.abs(d5)>=0.5){ searchScroll+=d5*0.25; mm=true; } else searchScroll=searchScrollT;
  if(Math.abs(d6)>=0.5){ plScroll+=d6*0.25; mm=true; } else plScroll=plScrollT;
  if(Math.abs(d2)>=0.5){ navScroll+=d2*0.25; nm=true; } else navScroll=navScrollT;
  if(mm) repaintMain();
  if(nm) repaintNav();
  // one more frame after the scroll settles, so shimSettle can restart the sweep it suppressed
  if(!mm && !nm){ stopScrollAnim(); if(shimCount>0) repaintMain(); }
}
function startScrollAnim(){ if(!scrollTimer) scrollTimer=window.SetInterval(scrollTick,16); }
function stopScrollAnim(){ if(scrollTimer){ window.ClearInterval(scrollTimer); scrollTimer=null; } }

function hv(x0,y0,x1,y1){ return mx>=x0 && mx<x1 && my>=y0 && my<y1; }
var HB_PL=[], HB_TR=[], HB_CTRL=[], HB_TABS=[], HB_SEEK=null, HB_VOL=null, HB_Q=[];
var HB_CARD=[], HB_HOME=null, HB_CAP=null, HB_MENU=[], SB=null;
var navScroll=0, NAV_MAX=0, SBN=null, HB_ADDPL=null, navDropHover=false;
// deferred "scroll this playlist into view" -- only drawNav knows the row geometry, so it consumes this
var navRevealPl=-1;
function revealPlaylist(i){ navRevealPl=i; }
var plDropHover=false, HB_PLADD_FILES=null, HB_PLADD_FOLDER=null;   // empty-playlist "add songs" zone
// playlist edit: context menu, inline rename, delete confirm
var HB_DOTS=[], ctxMenu=null, CTX_HB=[], renameEdit=null, confirmDel=null, CONF_HB=null, RENAME_HB=null;

var rightTab='queue';
var view='home', viewArtist='', artistAlbums=[], homeScroll=0, artScroll=0;
// Fullscreen "chill" mode + its sub-view (default now-playing / lyrics / visualizer)
var fsMode=false, fsView='default', HB_FS=[], vizTimer=null, vizBars=[];
// Re-asserted every full paint + on_size: JSplitter can reset window.DlgCode on resize/reload.
function applyKeyMode(){ try{ window.DlgCode=(view==='search'||renameEdit)?DLGC_WANTALLKEYS:0; }catch(e){} }

var searchQuery='', searchScroll=0, searchScrollT=0, searchIdx=null, searchQ2=null, searchArts=[], searchTrks=[], HB_SEARCH=null;
var HOME_MAXROW=0, ART_MAXBLOCK=0, SEARCH_MAXPX=0;
// Home "Your Playlists" horizontal shelf: pixel scroll offset + eased target, max, wheel hit-band, h-scrollbar.
var plScroll=0, plScrollT=0, HOME_PLMAX=0, HOME_SHELF_Y0=0, HOME_SHELF_Y1=0, SBH=null;
// The shelf glides freely but always *targets* a card boundary, so the leftmost card keeps its
// rounded edge instead of being cut mid-body (COL.elev against COL.base reads as a seam).
// HOME_STRIDE is published by drawHome, which is the only place the card pitch is known.
var HOME_STRIDE=0;
function snapShelf(px){ var st=HOME_STRIDE||1; return clampPx(Math.round(px/st)*st,HOME_PLMAX); }


function layout(){
  var g=M.gap, top0=TBH+g;   // one uniform gap on every side, incl. below the title bar and above the bar
  R.barY=H-M.barH;
  R.top={x:g,y:top0,bottom:R.barY-g};
  R.navX=g; R.navW=M.navW;
  R.queueW=M.queueW; R.queueX=W-g-R.queueW;
  R.mainX=R.navX+R.navW+g; R.mainW=R.queueX-g-R.mainX;
  var topH=R.top.bottom-R.top.y;
  R.navTop={x:R.navX,y:top0,w:R.navW,h:M.navTopH};
  R.navLib={x:R.navX,y:top0+M.navTopH+g*2,w:R.navW,h:topH-M.navTopH-g*2};   // wider gap to the library card
  R.main={x:R.mainX,y:top0,w:R.mainW,h:topH};
  R.queue={x:R.queueX,y:top0,w:R.queueW,h:topH};
  // frameless; the title-bar strip minus our 3 buttons becomes an OS caption (drag/dbl-click)
  if(UIWizard){ try{ UIWizard.FrameStyle=3; UIWizard.MoveStyle=0; UIWizard.DisableWindowSizing=false; }catch(e){} }
  capW=-1; applyCaption();
  applyKeyMode();
}
function on_size(w,h){ W=w; H=h; layout(); plCardCache={}; artCardCache={}; artCardN=0; skelImgs={}; }   // bitmaps are keyed by geometry

// name/count come from the per-playlist caches, not fresh interop: this runs on every paint of the playlist view
function activePl(){ var i=plman.ActivePlaylist; return {i:i, name:i>=0?plName(i):'', count:i>=0?plCount(i):0}; }
function updateNP(){
  var m=(fb.IsPlaying||fb.IsPaused)?fb.GetNowPlaying():null;
  NP=m;
  npTitleStr=m?TF.npTitle.EvalWithMetadb(m):'';
  npArtistStr=m?TF.npArtist.EvalWithMetadb(m):'';
}
function repaintBar(){ if(fsMode){ repaintAll(); return; } dirtyBar=true; window.RepaintRect(0,R.barY,W,M.barH); }

/* Only frames that actually redraw main may settle the shimmer -- a bar-only repaint (the 1Hz
   clock) would otherwise count zero skeletons and stop the animation while one is on screen. */
function drawMainCounted(gr){
  shimCount=0; gateWaiting=0;
  drawMain(gr); roundTop(gr,R.main.x,R.main.y,R.main.w);
  shimSettle();
}
function on_paint(gr){
  visPlCache=null;   // one playlist scan per frame, shared by drawNav and drawHome
  gr.SetSmoothingMode(2);
  gr.SetInterpolationMode(5);   // NearestNeighbor: every DrawImage here is 1:1, so filtering is pure cost
  if(fsMode){ clearDirty(); HB_DOTS=[]; drawFullscreen(gr); return; }
  var anyPartial=dirtyBar||dirtyQueue||dirtySearch||dirtyMain||dirtyNav||dirtyTitle;
  // A partial paint skips drawOverlays, so a modal's dim backdrop would not be reapplied over the
  // region it redraws (the bar's 1 Hz repaint would flash back to full brightness). While an
  // overlay owns the screen, every paint takes the full path.
  var modal=renameEdit||ctxMenu||confirmDel||dupPrompt||rgPrompt;
  if(dirtyAll || !anyPartial || modal){ // full paint, or an OS/stale paint we can't scope
    clearDirty();
    HB_DOTS=[];
    gr.FillSolidRect(0,0,W,H,COL.black);   // black canvas -> panels read as separated cards (Spotify look)
    drawTitleBar(gr);
    // main before nav: the home shelf's leftmost card is drawn partly outside the panel
    // (continuous scroll), so nav must repaint over that bleed -- same reason queue follows main
    drawMainCounted(gr);
    drawNav(gr);
    drawQueue(gr);
    drawBar(gr);
    drawOverlays(gr);
    return;
  }
  // partial composite: only the regions actually flagged (each drawn over live content)
  if(dirtyTitle){ dirtyTitle=false; drawTitleBar(gr); }
  if(dirtyMain||dirtyNav) HB_DOTS=[];   // these rebuild their hover targets
  if(dirtyMain){ dirtyMain=false; drawMainCounted(gr); }
  if(dirtyNav){ dirtyNav=false; drawNav(gr); }
  if(dirtyQueue){ dirtyQueue=false; drawQueue(gr); }
  if(dirtySearch){ dirtySearch=false; if(view==='search') drawSearchBox(gr,R.main); }
  if(dirtyBar){ dirtyBar=false; drawBar(gr); }
}

function drawMain(gr){
  HB_CARD=[]; HB_TR=[]; SB=null; SBH=null;   // clear stale click targets from the previous view
  if(view!=='songs'){ HB_SG=null; SG_HB=[]; HB_RGNORM=null; }
  if(view!=='playlist'){ HB_PLSORT=null; HB_PLSORTDIR=null; PL_SORT_HB=[]; }
  applyKeyMode();
  if(view==='search') startCaret(); else stopCaret();
  var r=R.main; panelBg(gr,r,COL.base);
  if(view==='home'){ drawHome(gr,r); return; }
  if(view==='search'){ drawSearch(gr,r); return; }
  if(view==='artist'){ drawArtist(gr,r); return; }
  if(view==='songs'){ drawSongs(gr,r); return; }
  drawPlaylist(gr,r);
}

/* ------------------------- input ------------------------- */
function seekFrac(x){ return HB_SEEK?clamp01((x-HB_SEEK.x)/HB_SEEK.w):0; }
function applyVol(x){ if(HB_VOL){ fb.Volume=pos2vol(clamp01((x-HB_VOL.x)/HB_VOL.w)); repaintBar(); } }
function on_mouse_lbtn_down(x,y){
  if(ctxMenu||confirmDel||renameEdit||sgMenuOpen||plSortMenuOpen||dupPrompt||rgPrompt) return;   // overlays are modal; dismissal/actions handled on button-up
  if(HB_SEEK && inRect(x,y,HB_SEEK)){ drag='seek'; dragFrac=seekFrac(x); repaintBar(); return; }
  if(HB_VOL && inRect(x,y,HB_VOL)){ drag='vol'; applyVol(x); return; }
  if(SBH && inRect(x,y,SBH)){ drag='scrollh'; setScrollH(x); return; }
  if(SBN && inRect(x,y,SBN)){ drag='scrolln'; setScrollN(y); return; }
  if(SB && inRect(x,y,SB)){ drag='scroll'; setScroll(y); return; }
}
function on_mouse_rbtn_up(x,y){
  if(ctxMenu||confirmDel||renameEdit||dupPrompt||rgPrompt) return true;   // a modal is open: swallow
  var i;
  // playlist-view track rows carry {pl,item}; rows in All Songs / artist / search views don't
  if(view==='playlist'){ for(i=0;i<HB_TR.length;i++){ if(HB_TR[i].pl!==undefined && inRect(x,y,HB_TR[i])){ return openTrackMenu(HB_TR[i].pl,HB_TR[i].item,x,y); } } }
  for(i=0;i<HB_PL.length;i++){ if(inRect(x,y,HB_PL[i])){ openPlaylistMenu(HB_PL[i].i,x,y); return true; } }
  for(i=0;i<HB_CARD.length;i++){ if(inRect(x,y,HB_CARD[i]) && HB_CARD[i].kind==='pl'){ openPlaylistMenu(HB_CARD[i].id,x,y); return true; } }
  return false;   // elsewhere: let JSplitter's own panel menu through (Reload / Configure / Properties)
}
function playHandleList(handles,idx){
  var arr=[]; for(var i=0;i<handles.length;i++) arr.push(handles[i]);
  var start=arr[idx];
  if(pbShuffle){ shuffleArr(arr); var ci=indexOfHandle(arr,start); if(ci>=0) arr.splice(ci,1); arr.unshift(start); shufSrcName=ROUTE; idx=0; }
  var hl=fb.CreateHandleList();
  for(i=0;i<arr.length;i++) hl.Add(arr[i]);
  var pi=plman.FindOrCreatePlaylist(ROUTE,true);
  try{ plman.ClearPlaylist(pi); }catch(e){}
  plman.InsertPlaylistItems(pi,0,hl,false);
  plman.ActivePlaylist=pi; invalidateItems();
  plman.ExecutePlaylistDefaultAction(pi,idx);
}
function playArtistTrack(block,idx){
  var al=artistAlbums[block]; if(!al) return;
  var hs=[]; for(var i=0;i<al.tracks.length;i++) hs.push(al.tracks[i].handle);
  playHandleList(hs,idx);
}
function getSearchIdx(){
  if(searchIdx) return searchIdx;
  var lib=libItems();
  var out=[];
  if(lib && lib.Count){
    var t=libTF('title'), a=libTF('artist'), al=libTF('album'), l=libTF('len');
    for(var i=0;i<t.length;i++) out.push({h:lib[i],title:t[i],artist:a[i],album:al[i],len:l[i],key:(t[i]+' '+a[i]+' '+al[i]).toLowerCase()});
  }
  searchIdx=out; return out;
}
function computeSearch(){
  var q=searchQuery.trim().toLowerCase();
  if(q===searchQ2) return;
  searchQ2=q; searchArts=[]; searchTrks=[];
  if(!q) return;
  var arts=getArtistList(), i;
  for(i=0;i<arts.length && searchArts.length<24;i++){ if(arts[i].name.toLowerCase().indexOf(q)>=0) searchArts.push(arts[i]); }
  var idx=getSearchIdx(), cnt=0;
  for(i=0;i<idx.length && cnt<150;i++){ if(idx[i].key.indexOf(q)>=0){ searchTrks.push(idx[i]); cnt++; } }
}
function doCtrl(act){
  if(act==='play') fb.PlayOrPause();
  else if(act==='next') fb.Next();
  else if(act==='prev') fb.Prev();
  else if(act==='shuffle') toggleShuffle();
  else if(act==='repeat') cycleRepeat();
  else if(act==='fullscreen'){ enterFullscreen(); return; }
  repaintAll();
}
function on_mouse_lbtn_up(x,y){
  var t;
  // ---- modal overlays first ----
  if(dupPrompt){
    if(DUP_HB && inRect(x,y,DUP_HB.skip)) dupSkip(); else dupKeep();   // "Add anyway"/outside: leave as-is
    return;
  }
  if(rgPrompt){
    if(RG_HB && inRect(x,y,RG_HB.scan)){ rgConfirmScan(); return; }
    rgPrompt=null; repaintAll(); return;      // cancel / click outside
  }
  if(confirmDel){
    if(CONF_HB && inRect(x,y,CONF_HB.del)){ doDeletePlaylist(confirmDel.pl); return; }
    confirmDel=null; repaintAll(); return;   // cancel / click outside
  }
  if(ctxMenu){
    t=hit(CTX_HB,x,y);
    if(t){
      var act=t.act, pl=ctxMenu.pl, nm=ctxMenu.name, itm=ctxMenu.item;
      if(act==='trkremove'){ ctxMenu=null; removeTrackFromPl(pl,itm); return; }
      // navigate to the target first, so the tracks land somewhere the user can see
      if(act==='addfiles'||act==='addfolder'){
        ctxMenu=null; firstRow=firstRowT=0; view='playlist'; repaintAll();
        if(act==='addfiles') addFilesToPl(pl); else addFolderToPl(pl);
      }
      else if(act==='rename'){ startRename(pl); }
      else { confirmDel={pl:pl,name:nm}; ctxMenu=null; repaintAll(); }
      return;
    }
    ctxMenu=null; repaintAll(); return;      // click outside menu -> close
  }
  if(renameEdit){
    if(RENAME_HB){
      if(inRect(x,y,RENAME_HB.save)){ if(RENAME_HB.canSave) commitRename(); return; }
      if(inRect(x,y,RENAME_HB.cancel)){ cancelRename(); return; }
      if(inRect(x,y,RENAME_HB.panel)) return;     // click inside the dialog: keep it open
    }
    cancelRename(); return;                        // click on backdrop: dismiss
  }
  if((t=hit(HB_DOTS,x,y))){ openPlaylistMenu(t.pl,t.mx,t.my); return; }
  if(drag==='seek'){ if(fb.PlaybackLength>0) fb.PlaybackTime=fb.PlaybackLength*dragFrac; drag=null; repaintAll(); return; }
  if(drag==='vol'){ drag=null; return; }
  if(drag==='scroll'||drag==='scrollh'||drag==='scrolln'){
    var wasH=(drag==='scrollh'); drag=null;
    if(wasH){ plScrollT=snapShelf(plScroll); startScrollAnim(); }   // release the thumb -> settle on a boundary
    repaintAll(); return;
  }
  // an open dropdown is modal-ish: any click either picks an item or closes it
  if(sgMenuOpen){
    if((t=hit(SG_HB,x,y))){ setSongsGroup(t.v); return; }
    sgMenuOpen=false; repaintAll(); return;
  }
  if(HB_SG && inRect(x,y,HB_SG)){ sgMenuOpen=true; repaintAll(); return; }
  if(HB_RGNORM && inRect(x,y,HB_RGNORM)){ rgToggle(); return; }
  if(plSortMenuOpen){
    if((t=hit(PL_SORT_HB,x,y))){ setPlSort(t.v); return; }
    plSortMenuOpen=false; repaintAll(); return;
  }
  if(HB_PLSORT && inRect(x,y,HB_PLSORT)){ plSortMenuOpen=true; repaintAll(); return; }
  if(HB_PLSORTDIR && inRect(x,y,HB_PLSORTDIR)){ togglePlSortDir(); return; }
  if(fsMode){
    if((t=hit(HB_FS,x,y))){ doFsAct(t.act); return; }
    if((t=hit(HB_CTRL,x,y))){ doCtrl(t.act); return; }
    return;
  }
  if(y<TBH){
    if((t=hit(HB_MENU,x,y))){ openMenu(t.root,t.mx,TBH); return; }
    if(HB_CAP){
      if(x>=HB_CAP.closeX){ fb.Exit(); return; }
      if(x>=HB_CAP.maxX){ if(UIWizard){ try{ UIWizard.ToggleMaximize(); }catch(e){} } repaintAll(); return; }
      if(x>=HB_CAP.minX){ if(UIWizard){ try{ UIWizard.WindowMinimize(); }catch(e){} } return; }
    }
    return;
  }
  if((t=hit(HB_TABS,x,y))){ rightTab=t.tab; if(rightTab==='lyrics'){ loadLyrics(); lySnap=true; } else stopLyAnim(); repaintAll(); return; }
  if((t=hit(HB_CTRL,x,y))){ doCtrl(t.act); return; }
  if(HB_HOME && inRect(x,y,HB_HOME)){ view='home'; repaintAll(); return; }
  if(HB_SEARCH && inRect(x,y,HB_SEARCH)){ view='search'; repaintAll(); return; }
  if(HB_ALLSONGS && inRect(x,y,HB_ALLSONGS)){ if(view!=='songs'){ view='songs'; songsScroll=songsScrollT=0; } repaintAll(); return; }
  if(HB_ADDPL && inRect(x,y,HB_ADDPL)){ var np=createNewPlaylist(); plman.ActivePlaylist=np; revealPlaylist(np); firstRow=firstRowT=0; view='playlist'; repaintAll(); return; }
  if(HB_PLADD_FILES && inRect(x,y,HB_PLADD_FILES)){ addFilesToPl(plman.ActivePlaylist); return; }
  if(HB_PLADD_FOLDER && inRect(x,y,HB_PLADD_FOLDER)){ addFolderToPl(plman.ActivePlaylist); return; }
  if((t=hit(HB_CARD,x,y))){
    if(t.kind==='pl'){ plman.ActivePlaylist=t.id; firstRow=firstRowT=0; view='playlist'; }
    else { loadArtist(t.id); view='artist'; }
    repaintAll(); return;
  }
  if((t=hit(HB_PL,x,y))){ plman.ActivePlaylist=t.i; firstRow=firstRowT=0; view='playlist'; repaintAll(); return; }
  if((t=hit(HB_Q,x,y))){ if(t.q!==undefined) playQueueItem(t.q); else playQueueNext(t.pl,t.item); repaintAll(); return; }
  if((t=hit(HB_TR,x,y))){
    if(t.srch){ var hs=[]; for(var m2=0;m2<searchTrks.length;m2++) hs.push(searchTrks[m2].h); playHandleList(hs,t.idx); }
    else if(t.songs) playSongsRow(t.ti);
    else if(t.lib) playArtistTrack(t.block,t.idx);
    else playPlaylistItem(t.pl,t.item);
    repaintAll(); return;
  }
}
function hoverSig(x,y){
  var i;
  if(dupPrompt){ if(DUP_HB){ if(inRect(x,y,DUP_HB.skip)) return 'dps'; if(inRect(x,y,DUP_HB.keep)) return 'dpk'; } return 'dp'; }
  if(renameEdit){ if(RENAME_HB){ if(inRect(x,y,RENAME_HB.save)) return 'rns'; if(inRect(x,y,RENAME_HB.cancel)) return 'rnc'; } return 'rn'; }
  if(rgPrompt){ if(RG_HB){ if(inRect(x,y,RG_HB.scan)) return 'rgs'; if(inRect(x,y,RG_HB.cancel)) return 'rgc'; } return 'rg'; }
  if(confirmDel){ if(CONF_HB && inRect(x,y,CONF_HB.del)) return 'cfd'; if(CONF_HB && inRect(x,y,CONF_HB.cancel)) return 'cfc'; return 'cf'; }
  if(ctxMenu){ i=hitIdx(CTX_HB,x,y); return (i<0)?'cx':('cx'+i); }
  if(sgMenuOpen){ i=hitIdx(SG_HB,x,y); return (i<0)?'sg':('sg'+i); }
  if(plSortMenuOpen){ i=hitIdx(PL_SORT_HB,x,y); return (i<0)?'ps':('ps'+i); }
  if((i=hitIdx(HB_DOTS,x,y))>=0) return 'd'+i;
  if(y<TBH){
    if((i=hitIdx(HB_MENU,x,y))>=0) return 'mnu'+i;
    if(HB_CAP && x>=HB_CAP.minX) return 'cap'+(((x-HB_CAP.minX)/HB_CAP.bw)|0);
    return '';
  }
  if(SBH && inRect(x,y,SBH)) return 'sbh';
  if(SBN && inRect(x,y,SBN)) return 'sbn';
  if(HB_ADDPL && inRect(x,y,HB_ADDPL)) return 'addpl';
  if(HB_PLADD_FILES && inRect(x,y,HB_PLADD_FILES)) return 'pladdf';
  if(HB_PLADD_FOLDER && inRect(x,y,HB_PLADD_FOLDER)) return 'pladdd';
  if(HB_ALLSONGS && inRect(x,y,HB_ALLSONGS)) return 'als';
  if(HB_SG && inRect(x,y,HB_SG)) return 'sgb';
  if(HB_RGNORM && inRect(x,y,HB_RGNORM)) return 'nzb';
  if(HB_PLSORT && inRect(x,y,HB_PLSORT)) return 'psb';
  if(HB_PLSORTDIR && inRect(x,y,HB_PLSORTDIR)) return 'psd';
  if(SB && inRect(x,y,SB)) return 'sb';
  if((i=hitIdx(HB_CTRL,x,y))>=0) return 'c'+i;
  if((i=hitIdx(HB_TABS,x,y))>=0) return 't'+i;
  if(HB_HOME && inRect(x,y,HB_HOME)) return 'h';
  if(HB_SEARCH && inRect(x,y,HB_SEARCH)) return 's';
  if((i=hitIdx(HB_CARD,x,y))>=0) return 'k'+i;
  if((i=hitIdx(HB_PL,x,y))>=0) return 'p'+HB_PL[i].i;
  if((i=hitIdx(HB_Q,x,y))>=0) return 'q'+i;
  if((i=hitIdx(HB_TR,x,y))>=0) return 'r'+i;
  return '';
}
function on_mouse_move(x,y){
  mx=x; my=y;
  if(drag==='seek'){ dragFrac=seekFrac(x); repaintBar(); return; }
  if(drag==='vol'){ applyVol(x); return; }
  if(drag==='scroll'){ setScroll(y); return; }
  if(drag==='scrollh'){ setScrollH(x); return; }
  if(drag==='scrolln'){ setScrollN(y); return; }
  var sig=hoverSig(x,y), sk=scrollSection(x,y), z=hoverZone(x,y);
  if(sig!==hoverKey || sk!==scrollKey){   // sk change reveals/hides the section scrollbar
    hoverKey=sig; scrollKey=sk;
    // an overlay owns the whole screen and on_paint forces a full paint while one is open
    if(renameEdit||ctxMenu||confirmDel||dupPrompt||rgPrompt||sgMenuOpen||plSortMenuOpen) repaintAll();
    else { repaintZone(hoverZoneKey); if(z!==hoverZoneKey) repaintZone(z); }   // clear the old highlight, then draw the new
  }
  hoverZoneKey=z;
}
// which scrollable section the cursor is over (so entering/leaving reveals the hover scrollbar even over gaps)
function scrollSection(x,y){
  if(R.navLib && x>=R.navLib.x && x<R.navLib.x+R.navLib.w && y>=R.navLib.y && y<R.navLib.y+R.navLib.h) return 'nav';
  if(R.main && x>=R.main.x && x<R.main.x+R.main.w+16 && y>=R.main.y && y<R.main.y+R.main.h){
    if(view==='home') return (y>=HOME_SHELF_Y0 && y<HOME_SHELF_Y1+16)?'shelf':'arts';
    if(view==='playlist') return 'pl';
    if(view==='songs') return 'songs';
    if(view==='search') return 'srch';
  }
  return '';
}
function on_mouse_leave(){
  mx=-1; my=-1;
  if(hoverKey!==''||scrollKey!==''){
    hoverKey=''; scrollKey='';
    if(renameEdit||ctxMenu||confirmDel||dupPrompt||rgPrompt||sgMenuOpen||plSortMenuOpen) repaintAll();
    else repaintZone(hoverZoneKey);
  }
  hoverZoneKey='';
}
function on_char(code){
  if(renameEdit){
    if(code===8) renameEdit.text=renameEdit.text.slice(0,-1);
    else if(code===27){ cancelRename(); return; }              // Esc = cancel
    else if(code===13){ commitRename(); return; }              // Enter = commit
    else if(code>=32) renameEdit.text+=String.fromCharCode(code);
    caretOn=true; repaintAll(); return;
  }
  if(view!=='search') return;
  if(code===8) searchQuery=searchQuery.slice(0,-1);
  else if(code===27) searchQuery='';
  else if(code>=32) searchQuery+=String.fromCharCode(code);
  searchScroll=searchScrollT=0; caretOn=true; repaintAll();   // keep caret solid right after a keystroke
}
function on_mouse_wheel(step){
  if(fsMode){
    // lyrics with no timestamps don't roll themselves, so here the wheel scrolls them; with nothing
    // to scroll (synced, short enough to fit, or another view) it stays the volume control
    if(fsView==='lyrics' && lyStWheel(step)){ repaintAll(); return; }
    fb.Volume=pos2vol(clamp01(vol2pos(fb.Volume)+step*0.04)); repaintAll(); return;
  }
  // right pane: same deal on the Lyrics tab. Consume the wheel either way -- it belongs to this
  // panel, and falling through would scroll the playlist behind the pointer.
  if(R.queue && rightTab==='lyrics' && mx>=R.queue.x && mx<R.queue.x+R.queue.w && my>=R.queue.y && my<R.queue.y+R.queue.h){
    if(lyStWheel(step)) repaintQueue();
    return;
  }
  if(R.navLib && mx>=R.navLib.x && mx<R.navLib.x+R.navLib.w && my>=R.navLib.y && my<R.navLib.y+R.navLib.h){
    navScrollT=clampPx(navScrollT-step*WHEEL_PX,NAV_MAX); startScrollAnim(); return;
  }
  if(mx<R.main.x || mx>=R.main.x+R.main.w) return;
  if(view==='home'){
    if(my>=HOME_SHELF_Y0 && my<HOME_SHELF_Y1){ plScrollT=snapShelf(plScrollT-step*WHEEL_PX); startScrollAnim(); }   // shelf: eased glide onto a card boundary
    else { homeScrollT=clampPx(homeScrollT-step*Math.round(WHEEL_PX*1.7),HOME_MAXROW); startScrollAnim(); }   // artists: bigger step, tall cards
    return;
  }
  else if(view==='songs'){ songsScrollT=clampPx(songsScrollT-step*WHEEL_PX,SONGS_MAXPX); startScrollAnim(); return; }
  else if(view==='search'){ searchScrollT=clampPx(searchScrollT-step*WHEEL_PX,SEARCH_MAXPX); startScrollAnim(); return; }
  else if(view==='artist'){ artScroll=clampPx(artScroll-step,ART_MAXBLOCK); repaintAll(); return; }
  firstRowT=clampPx(firstRowT-step*WHEEL_PX,PL_MAXPX); startScrollAnim();
}
/* ---- drag & drop external files: two targets, the library section (-> new playlist) and the
   playlist view body (-> appends to it); everywhere else denies. We never see the dropped paths
   (DropTargetAction is write-only), so we name a destination and the component does the insert. */
function overLib(x,y){ return !!R.navLib && x>=R.navLib.x && x<R.navLib.x+R.navLib.w && y>=R.navLib.y && y<R.navLib.y+R.navLib.h; }
// body of the playlist view -> index of the playlist to append to, or -1 if that's not a valid target
function plDropTarget(x,y){
  if(fsMode || view!=='playlist' || !R.main) return -1;
  if(x<R.main.x || x>=R.main.x+R.main.w || y<R.main.y || y>=R.main.y+R.main.h) return -1;
  var i=plman.ActivePlaylist;
  if(i<0 || plman.IsPlaylistLocked(i)) return -1;   // autoplaylists etc. can't take manual inserts
  return i;
}
function dragUpdate(action,x,y){
  var ext=!action.IsInternal;                        // ignore drags started inside the skin
  var onLib=ext && overLib(x,y), onPl=!onLib && ext && plDropTarget(x,y)>=0;
  if(onLib||onPl) action.Effect=(action.Effect&1)?1:((action.Effect&4)?4:0);  // prefer copy, else link
  else action.Effect=0;                                                        // deny elsewhere
  setDropHover(onLib,onPl);
}
// repaint only the section whose cue changed -- drag-over fires on every mouse move
function setDropHover(onLib,onPl){
  if(onLib!==navDropHover){ navDropHover=onLib; repaintNav(); }
  if(onPl!==plDropHover){ plDropHover=onPl; repaintMain(); }
}
function on_drag_enter(action,x,y,mask){ dragUpdate(action,x,y); }
function on_drag_over(action,x,y,mask){ dragUpdate(action,x,y); }
function on_drag_leave(){ setDropHover(false,false); }
function on_drag_drop(action,x,y,mask){
  var ext=!action.IsInternal, hit=ext&&(action.Effect&5), pi=hit?plDropTarget(x,y):-1;   // 5 = copy|link
  if(hit && overLib(x,y)){
    var np=createNewPlaylist();
    action.Playlist=np; action.Base=0; action.ToSelect=true;            // component drops the files into it
    action.Effect=(action.Effect&1)?1:4;
    plman.ActivePlaylist=np; revealPlaylist(np); firstRow=firstRowT=0; view='playlist';
  } else if(pi>=0){
    plman.UndoBackup(pi);                                              // so ctrl+Z undoes the import
    armDupWatch(pi);                                                   // snapshot before the component inserts
    action.Playlist=pi; action.Base=plman.PlaylistItemCount(pi); action.ToSelect=true;   // append at end
    action.Effect=(action.Effect&1)?1:4;
  } else action.Effect=0;
  navDropHover=false; plDropHover=false; repaintAll();
}
function on_script_unload(){
  stopLyAnim(); stopCaret(); stopViz(); stopScrollAnim(); stopShimAnim(); stopMemWatch();
  if(dupWatch && dupWatch.timer) window.ClearTimeout(dupWatch.timer);
}
function invalidateLibrary(){
  artistList=null; artistTracksMap=null; artistCandCache={}; coverPickCache={}; warmed={}; searchIdx=null; searchQ2=null;
  songsIdx=null; songsRows=null; songsTracks=null; libCovCache=null; libCount_=-1;
  libItems_=null; libTFCache={};   // everything above is derived from these
  rgStat=null; rgScanFailed=false;
  warmJob=null; jobs={};           // anything in flight refers to the old library
  gates={}; rowGate={}; shelfHandles=null; artsGating=false;   // every section re-gates
}
function libChanged(){ invalidateLibrary(); artCardCache={}; artCardN=0; repaintAll(); }
function on_library_items_added(){ libChanged(); }
function on_library_items_removed(){ libChanged(); }
function on_library_items_changed(){ libChanged(); }

/* ------------------------- playback callbacks ------------------------- */
function on_playback_new_track(){
  updateNP();
  // shuffle + loop-all: on wrapping from the last shuffled track back to the first, reshuffle the rest
  if(pbShuffle){
    var loc=playingLoc();
    var sp=playlistOfName(SHUF), idx=(loc&&loc.IsValid&&loc.PlaylistIndex===sp)?loc.PlaylistItemIndex:-1;
    if(sp>=0 && idx>=0){
      var cnt=plman.PlaylistItemCount(sp);
      if(pbRepeat===1 && lastShufIdx===cnt-1 && idx===0) reshuffleTail(sp);
      lastShufIdx=idx;
    } else lastShufIdx=-1;
  } else lastShufIdx=-1;
  repaintAll();
}
function npChanged(){ updateNP(); repaintAll(); }
function on_playback_dynamic_info_track(){ npChanged(); }
function on_playback_stop(){ npChanged(); }
function on_playback_pause(){ npChanged(); }
function on_playback_time(){
  repaintBar();
  var lyricsShown=(rightTab==='lyrics')||(fsMode&&fsView==='lyrics');
  if(lyricsShown && lyrics && lyrics!=='none' && lyrics.synced){ var c=currentLyricLine(); if(c!==lyCur){ lyCur=c; startLyAnim(); } }
}
function on_playback_seek(){ repaintAll(); }
function on_playback_order_changed(){ syncOrderFromFb(); repaintAll(); }
function on_playback_queue_changed(){ repaintAll(); }
function on_volume_change(){ repaintBar(); }
// ReplayGain can also be switched from foobar's own Playback menu -- keep the pill honest
function on_replaygain_mode_changed(){ repaintMain(); }
// rgStat included: a ReplayGain scan lands as a tag write, so this is how the pill learns it finished
function on_metadb_changed(handles,fromhook){ if(fromhook) return; invalidateItems(); albKeyCache={}; hueCache={}; artistCandCache={}; coverPickCache={}; songsIdx=null; songsRows=null; songsTracks=null; rgStat=null; updateNP(); repaintAll(); }
/* A switch changes which playlist is ACTIVE, not what any playlist contains -- and every cache
   invalidateItems() drops is keyed by playlist index, so none of them went stale here. Dropping
   them meant each switch re-derived covers and re-ran the art gates against an artCache that had
   since evicted those albums: the view fell back to its skeleton and the artwork reloaded. The
   caches that genuinely depend on playlist CONTENT are still cleared by the callbacks that mean
   content changed (items added/removed/reordered, playlists changed). */
function on_playlist_switch(){ firstRow=firstRowT=0; repaintAll(); }
function on_playlists_changed(){ invalidateItems(); repaintAll(); }
function on_playlist_items_added(pl){ invalidateItems(); if(dupWatch && dupWatch.pl===pl) scheduleDupScan(); repaintAll(); }
function on_playlist_items_removed(){ invalidateItems(); repaintAll(); }
function on_playlist_items_reordered(){ invalidateItems(); repaintAll(); }
function on_item_focus_change(){ repaintAll(); }

layout();
updateNP();
syncOrderFromFb(); applyPlaybackOrder();   // normalize native order (we manage shuffle ourselves)
capVolume();       // pull a remembered volume back under the slider's ceiling
startMemWatch();   // caches grow into the component's spare memory and back off as it fills
