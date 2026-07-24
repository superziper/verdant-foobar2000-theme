'use strict';

/* =============================================================
 * foobar2000 x Spotify  —  Phase 3, milestone A: app shell
 * -------------------------------------------------------------
 * Real data, real library. Three rounded panels on black + a
 * bottom playback bar, mirroring the approved HTML mockup:
 *   - left nav  : Home/Search + your real playlists (click = switch)
 *   - main      : active playlist header + scrollable track list
 *                 (click a row = play it)
 *   - right     : Queue/Lyrics tabs + now playing (wired next)
 *   - bottom    : now playing + seekbar + play/pause
 *
 * Runs in a JSplitter panel (GDI+). Load via the one-line
 * bootstrap.txt so edits = deploy.ps1 + right-click > Reload.
 * ============================================================= */

window.DefineScript('Spotify for foobar2000', { author:'zulvanavivi', options:{ grab_focus:true } });
var DLGC_WANTCHARS=0x0080;
window.DlgCode=DLGC_WANTCHARS;

/* ------------------------- colour helpers ------------------------- */
function RGB(r,g,b){ return (0xff000000|(r<<16)|(g<<8)|b); }
function RGBA(r,g,b,a){ return ((a<<24)|(r<<16)|(g<<8)|b); }

/* ------------------------- tokens ------------------------- */
var COL = {
  black:RGB(0,0,0), base:RGB(18,18,18), elev:RGB(24,24,24), hover:RGB(42,42,42),
  text:RGB(255,255,255), text2:RGB(179,179,179), text3:RGB(106,106,106),
  green:RGB(30,215,96), greenC:RGB(29,185,84),
  rowHover:RGBA(255,255,255,18), rowActive:RGBA(255,255,255,38),
  line:RGBA(255,255,255,28), seekbg:RGB(77,77,77)
};
var M = { pad:8, gap:8, navW:230, queueW:400, barH:80, navTopH:104, rowH:56, radius:10, cpad:24, headH:280, artSz:200 };
var PALETTE=[RGB(83,62,140),RGB(30,120,110),RGB(150,64,92),RGB(43,92,160),RGB(120,92,44),RGB(58,120,64),RGB(140,80,120),RGB(52,100,150),RGB(96,72,52),RGB(70,70,96)];

/* ------------------------- fonts (create once) -------------------------
   UISCALE enlarges every font for high-DPI / large screens (2K 21" etc.).
   Raise it (e.g. 1.4) if still small; lower toward 1.0 for a compact look.
   Regular (non-bold) text uses 'Segoe UI Semibold' so it doesn't read thin. */
var UISCALE = 1.25;
function gf(name,sz,style){ return gdi.Font(name, Math.max(1,Math.round(sz*UISCALE)), style||0); }
function F(sz,bold){ return gf(bold?'Segoe UI':'Segoe UI Semibold', sz, bold?1:0); }
var FONT = {
  nav:F(15,1), lib:F(15,1), pl:F(13,1), plSub:F(11,0),
  eyebrow:F(11,1), title:F(52,1), meta:F(13,0),
  rowTitle:F(14,0), rowArtist:F(12,0), rowNum:F(13,0), rowCell:F(13,0), head:F(12,1),
  tab:F(16,1), sect:F(15,1), qName:F(13,0), qArtist:F(11,0),
  npTitle:F(13,0), npArtist:F(11,0), time:F(11,0), prefs:F(11,0), glyph:F(15,0)
};
FONT.icon = gf('Segoe MDL2 Assets',15);
FONT.iconBtn = gf('Segoe MDL2 Assets',18);
FONT.card = gf('Segoe UI',14,1);
FONT.sect2 = gf('Segoe UI',22,1);
FONT.lyric = gf('Segoe UI',18,1);
FONT.lyricCur = gf('Segoe UI',23,1);
var GLYPH = { play:String.fromCharCode(0xE768), pause:String.fromCharCode(0xE769), prev:String.fromCharCode(0xE892), next:String.fromCharCode(0xE893), shuffle:String.fromCharCode(0xE8B1), repeat:String.fromCharCode(0xE8EE) };
GLYPH.repeat1=String.fromCharCode(0xE8ED); GLYPH.volume=String.fromCharCode(0xE767); GLYPH.settings=String.fromCharCode(0xE713);
GLYPH.search=String.fromCharCode(0xE721);
GLYPH.cmin=String.fromCharCode(0xE921); GLYPH.cmax=String.fromCharCode(0xE922); GLYPH.crestore=String.fromCharCode(0xE923); GLYPH.cclose=String.fromCharCode(0xE8BB);
FONT.cap = gf('Segoe MDL2 Assets',10);
/* Custom window title bar via UI Wizard (foo_ui_wizard, already installed) — frameless + our own controls */
var TBH = Math.round(32*UISCALE), CAPBW = Math.round(46*UISCALE);
var UIWizard=null; try{ UIWizard=new ActiveXObject('UIWizard'); }catch(e){ UIWizard=null; }
FONT.menu = gf('Segoe UI',12);
var MENUS=[['File','file'],['Edit','edit'],['View','View'],['Playback','playback'],['Library','library'],['Help','help']];
var MENU_END=0, capW=-1, capEnd=-1;
function applyCaption(){ if(!UIWizard) return; if(capW===W && capEnd===MENU_END) return; capW=W; capEnd=MENU_END; try{ UIWizard.SetCaptionAreaSize(MENU_END,0,Math.max(0,W-CAPBW*3-MENU_END),TBH); }catch(e){} }
function openMenu(root,x,y){ try{ var mm=fb.CreateMainMenuManager(); mm.Init(root); var m=window.CreatePopupMenu(); mm.BuildMenu(m,1,600); var id=m.TrackPopupMenu(x,y); if(id>0) mm.ExecuteByID(id-1); }catch(e){} }

/* ------------------------- title formats ------------------------- */
var TF = {
  title:fb.TitleFormat('%title%'), artist:fb.TitleFormat('[%artist%]'),
  album:fb.TitleFormat('[%album%]'), len:fb.TitleFormat('%length%'),
  npTitle:fb.TitleFormat('[%title%]'), npArtist:fb.TitleFormat('[%artist%]')
};
TF.albkey=fb.TitleFormat('%album artist% - %album%');
TF.artistName=fb.TitleFormat('%album artist%');
TF.year=fb.TitleFormat('$year(%date%)');

/* ------------------------- DrawText flags ------------------------- */
var DT_L = 0x4|0x20|0x800|0x8000;        // left + vcenter + singleline + noprefix + end-ellipsis
var DT_R = 0x2|0x4|0x20|0x800;           // right + vcenter + singleline + noprefix
var DT_C = 0x1|0x4|0x20|0x800;           // center + vcenter + singleline + noprefix
function tL(gr,s,f,c,x,y,w,h){ gr.GdiDrawText(s,f,c,x,y,w,h,DT_L); }
function tR(gr,s,f,c,x,y,w,h){ gr.GdiDrawText(s,f,c,x,y,w,h,DT_R); }
function tC(gr,s,f,c,x,y,w,h){ gr.GdiDrawText(s,f,c,x,y,w,h,DT_C); }

/* ------------------------- helpers ------------------------- */
function hash(s){ s=String(s); var h=2166136261; for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=(h*16777619)>>>0; } return h>>>0; }
function coverCol(seed){ return PALETTE[hash(seed)%PALETTE.length]; }
function blend(c1,c2,t){ var r=(c1>>16)&255,g=(c1>>8)&255,b=c1&255,r2=(c2>>16)&255,g2=(c2>>8)&255,b2=c2&255; return RGB(Math.round(r+(r2-r)*t),Math.round(g+(g2-g)*t),Math.round(b+(b2-b)*t)); }
function fmtTime(s){ s=Math.max(0,Math.round(s)); return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2); }
function inRect(x,y,r){ return x>=r.x0 && x<r.x1 && y>=r.y0 && y<r.y1; }
function clamp01(v){ return v<0?0:(v>1?1:v); }
function vol2pos(v){ return Math.pow(2, v/10); }                                   // dB(-100..0) -> 0..1
function pos2vol(p){ return p<=0?-100:Math.max(-100,Math.min(0,10*Math.log(p)/Math.LN2)); } // 0..1 -> dB
function readOrder(){ try{ return plman.PlaybackOrder; }catch(e){ return 0; } }
function setOrder(o){ try{ plman.PlaybackOrder=o; }catch(e){} }

/* ------------------------- album art (lazy sync cache, keyed by album) ------------------------- */
var artCache={}, albKeyCache={}, thumbCache={};
function albKey(h){ if(!h) return ''; var p=h.Path; if(albKeyCache.hasOwnProperty(p)) return albKeyCache[p]; var k=TF.albkey.EvalWithMetadb(h); albKeyCache[p]=k; return k; }
function getArtK(h,key){
  if(!h) return null;
  if(artCache.hasOwnProperty(key)) return artCache[key];
  var img=null;
  try{ img=utils.GetAlbumArtV2(h,0); if(img&&img.Width>500){ img=img.Resize(500,Math.round(img.Height*500/img.Width),2); } }catch(e){ img=null; }
  artCache[key]=img||null;
  return artCache[key];
}
function getArt(h){ return h?getArtK(h,albKey(h)):null; }
function getThumb(h,key,size){
  var tk=key+'|'+size;
  if(thumbCache.hasOwnProperty(tk)) return thumbCache[tk];
  var img=getArtK(h,key), r=null;
  if(img){ try{ r=img.Resize(size,size,2); }catch(e){ r=null; } }
  thumbCache[tk]=r; return r;
}
function firstHandle(pi){ var it=getItems(pi); return (it&&it.Count>0)?it[0]:null; }

/* ------------------------- library-backed artist list ------------------------- */
var artistList=null;
function getArtistList(){
  if(artistList) return artistList;
  var lib=null; try{ lib=fb.GetLibraryItems(); }catch(e){}
  var out=[];
  if(lib && lib.Count){
    var names=TF.artistName.EvalWithMetadbs(lib), seen={};
    for(var i=0;i<names.length;i++){ var nm=names[i]; if(nm && !seen[nm]){ seen[nm]=1; out.push({name:nm, handle:lib[i]}); } }
    out.sort(function(a,b){ var an=a.name.toLowerCase(), bn=b.name.toLowerCase(); return an<bn?-1:(an>bn?1:0); });
  }
  artistList=out; return out;
}
function loadArtist(name){
  viewArtist=name; artScroll=0; artistAlbums=[];
  var lib=null; try{ lib=fb.GetLibraryItems(); }catch(e){}
  if(!lib || !lib.Count) return;
  var arts=TF.artistName.EvalWithMetadbs(lib), albs=TF.album.EvalWithMetadbs(lib),
      titles=TF.title.EvalWithMetadbs(lib), lens=TF.len.EvalWithMetadbs(lib), yrs=TF.year.EvalWithMetadbs(lib);
  var map={}, order=[];
  for(var i=0;i<arts.length;i++){
    if(arts[i]!==name) continue;
    var al=albs[i]||'Unknown Album';
    if(!map[al]){ map[al]={album:al, handle:lib[i], year:yrs[i], tracks:[]}; order.push(al); }
    map[al].tracks.push({title:titles[i], dur:lens[i], handle:lib[i]});
  }
  for(var j=0;j<order.length;j++) artistAlbums.push(map[order[j]]);
}

/* ------------------------- lyrics (.lrc / .txt beside the track) ------------------------- */
var lyricsFor=null, lyrics=null; // lyrics: {lines:[{t,text}],synced} | 'none'
var lyPos=0, lyCur=0, lyTimer=null;
function currentLyricLine(){
  if(!lyrics || lyrics==='none' || !lyrics.synced) return 0;
  var pt=fb.PlaybackTime, c=0;
  for(var i=0;i<lyrics.lines.length;i++){ if(lyrics.lines[i].t<=pt) c=i; else break; }
  return c;
}
function lyTick(){ var d=lyCur-lyPos; if(Math.abs(d)<0.01){ lyPos=lyCur; stopLyAnim(); } else lyPos+=d*0.25; paintDirty='queue'; window.RepaintRect(R.queue.x,R.queue.y,R.queue.w,R.queue.h); }
function startLyAnim(){ if(!lyTimer) lyTimer=window.SetInterval(lyTick,33); }
function stopLyAnim(){ if(lyTimer){ window.ClearInterval(lyTimer); lyTimer=null; } }
function readFirst(paths){
  for(var i=0;i<paths.length;i++){
    try{ if(utils.IsFile && !utils.IsFile(paths[i])) continue; var t=utils.ReadUTF8(paths[i]); if(t && t.length) return t; }catch(e){}
  }
  return null;
}
function parseLyrics(text){
  var raw=text.split(/\r?\n/), lines=[], synced=false, reAll=/\[(\d+):(\d+(?:\.\d+)?)\]/g, i, j, m;
  for(i=0;i<raw.length;i++){
    var line=raw[i], times=[]; reAll.lastIndex=0;
    while((m=reAll.exec(line))!==null){ times.push(parseInt(m[1],10)*60+parseFloat(m[2])); }
    var txt=line.replace(reAll,'').trim();
    if(times.length){ synced=true; for(j=0;j<times.length;j++) lines.push({t:times[j],text:txt}); }
    else { if(/^\s*\[[a-zA-Z#]+:/.test(line)) continue; lines.push({t:-1,text:txt}); }
  }
  if(synced) lines.sort(function(a,b){ return a.t-b.t; });
  return {lines:lines, synced:synced};
}
function loadLyrics(){
  var key=NP?NP.Path:null;
  if(key===lyricsFor) return;
  lyricsFor=key; lyrics='none'; lyPos=0;
  if(!key) return;
  var base=key.replace(/\.[^.\\\/]+$/,'');
  var text=readFirst([base+'.lrc', base+'.txt']);
  if(text) lyrics=parseLyrics(text);
}
function drawCover(gr,x,y,sz,rad,h,seed,key){
  var img=h?getThumb(h,key||albKey(h),sz):null;
  if(img){ gr.DrawImage(img,x,y,sz,sz,0,0,img.Width,img.Height,0,255); }
  else if(rad>0){ gr.FillRoundRect(x,y,sz,sz,rad,rad,coverCol(seed)); }
  else { gr.FillSolidRect(x,y,sz,sz,coverCol(seed)); }
}
/* dominant colour of an album's art, for header gradients (cached; falls back to placeholder) */
var hueCache={};
function artHue(h,seed){
  if(!h) return coverCol(seed);
  var k=albKey(h);
  if(hueCache.hasOwnProperty(k)) return hueCache[k];
  var col=coverCol(seed), img=getArt(h);
  if(img){ try{ var s=img.GetColourScheme(1); if(s && s.length) col=s[0]; }catch(e){} }
  hueCache[k]=col; return col;
}
/* masked art: circular (artists) / rounded (large covers). Masks + masked copies are cached;
   ApplyMask mutates, so it's applied to a resized COPY, never the shared original. */
var maskCache={}, cArtCache={};
function circleMask(size){
  var k='c'+size; if(maskCache[k]) return maskCache[k];
  var m=gdi.CreateImage(size,size), g=m.GetGraphics();
  g.FillSolidRect(0,0,size,size,RGB(255,255,255)); g.SetSmoothingMode(2); g.FillEllipse(0,0,size,size,RGB(0,0,0));
  m.ReleaseGraphics(g); maskCache[k]=m; return m;
}
function roundMask(size,rad){
  var k='r'+size+'_'+rad; if(maskCache[k]) return maskCache[k];
  var m=gdi.CreateImage(size,size), g=m.GetGraphics();
  g.FillSolidRect(0,0,size,size,RGB(255,255,255)); g.SetSmoothingMode(2); g.FillRoundRect(0,0,size,size,rad,rad,RGB(0,0,0));
  m.ReleaseGraphics(g); maskCache[k]=m; return m;
}
function maskedArt(h,seed,size,mask,tag){
  var k=(seed||'')+'|'+size+'|'+tag;
  if(cArtCache.hasOwnProperty(k)) return cArtCache[k];
  var res=null, art=getArt(h);
  if(art){ try{ var img=art.Resize(size,size); img.ApplyMask(mask); res=img; }catch(e){ res=null; } }
  cArtCache[k]=res; return res;
}
function drawCircle(gr,x,y,size,h,seed){
  var ci=maskedArt(h,seed,size,circleMask(size),'c');
  if(ci) gr.DrawImage(ci,x,y,size,size,0,0,ci.Width,ci.Height,0,255);
  else gr.FillEllipse(x,y,size,size,coverCol(seed));
}
function drawRounded(gr,x,y,size,rad,h,seed){
  var ri=maskedArt(h,seed,size,roundMask(size,rad),'r'+rad);
  if(ri) gr.DrawImage(ri,x,y,size,size,0,0,ri.Width,ri.Height,0,255);
  else gr.FillRoundRect(x,y,size,size,rad,rad,coverCol(seed));
}

/* ------------------------- state ------------------------- */
var W=window.Width, H=window.Height, R={}, NP=null, npTitleStr='', npArtistStr='', paintDirty='all';
var firstRow=0, hoverKey='', mx=-1, my=-1, drag=null, dragFrac=0;
function hv(x0,y0,x1,y1){ return mx>=x0 && mx<x1 && my>=y0 && my<y1; }
var HB_PL=[], HB_TR=[], HB_PREFS=null, HB_CTRL=[], HB_TABS=[], HB_SEEK=null, HB_VOL=null;
var HB_CARD=[], HB_ARTIST=[], HB_HOME=null, HB_CAP=null, HB_MENU=[];
var rightTab='queue';
var view='playlist', viewArtist='', artistAlbums=[], homeScroll=0, artScroll=0;
var ROUTE='__spotify_np__'; // hidden playlist used to play library tracks (artist page / search)
var searchQuery='', searchScroll=0, searchIdx=null, searchQ2=null, searchPls=[], searchTrks=[], HB_SEARCH=null;
var HOME_MAXROW=0, ART_MAXBLOCK=0;
var plCacheMap={}, plMetaMap={};
function getItems(pi){ if(!plCacheMap[pi]){ plCacheMap[pi]=plman.GetPlaylistItems(pi); } return plCacheMap[pi]; }
function getMeta(pi){
  if(!plMetaMap[pi]){
    var list=getItems(pi);
    plMetaMap[pi]={ title:TF.title.EvalWithMetadbs(list), artist:TF.artist.EvalWithMetadbs(list),
                    album:TF.album.EvalWithMetadbs(list), len:TF.len.EvalWithMetadbs(list), artkey:TF.albkey.EvalWithMetadbs(list) };
  }
  return plMetaMap[pi];
}
function invalidateItems(){ plCacheMap={}; plMetaMap={}; }

function layout(){
  var pad=M.pad, gap=M.gap, top0=TBH;   // reserve the title bar strip at the very top
  R.barY=H-M.barH;
  R.top={x:pad,y:top0,bottom:R.barY-pad};
  R.navX=pad; R.navW=M.navW;
  R.queueW=M.queueW; R.queueX=W-pad-R.queueW;
  R.mainX=R.navX+R.navW+gap; R.mainW=R.queueX-gap-R.mainX;
  var topH=R.top.bottom-R.top.y;
  R.navTop={x:R.navX,y:top0,w:R.navW,h:M.navTopH};
  R.navLib={x:R.navX,y:top0+M.navTopH+gap,w:R.navW,h:topH-M.navTopH-gap};
  R.main={x:R.mainX,y:top0,w:R.mainW,h:topH};
  R.queue={x:R.queueX,y:top0,w:R.queueW,h:topH};
  // frameless + make the title-bar strip (minus our 3 buttons) an OS caption: drag to move, dbl-click to maximise
  if(UIWizard){ try{ UIWizard.FrameStyle=3; UIWizard.MoveStyle=0; UIWizard.DisableWindowSizing=false; }catch(e){} }
  capW=-1; applyCaption();
}
function on_size(w,h){ W=w; H=h; layout(); }

function activePl(){ var i=plman.ActivePlaylist; return {i:i, name:i>=0?plman.GetPlaylistName(i):'', count:i>=0?plman.PlaylistItemCount(i):0}; }
function updateNP(){
  var m=(fb.IsPlaying||fb.IsPaused)?fb.GetNowPlaying():null;
  NP=m;
  npTitleStr=m?TF.npTitle.EvalWithMetadb(m):'';
  npArtistStr=m?TF.npArtist.EvalWithMetadb(m):'';
}
function repaintBar(){ paintDirty='bar'; window.RepaintRect(0,R.barY,W,M.barH); }

/* ------------------------- paint ------------------------- */
function panelBg(gr,r,c){ gr.FillRoundRect(r.x,r.y,r.w,r.h,M.radius,M.radius,c); }

function on_paint(gr){
  var d=paintDirty; paintDirty='all';
  gr.SetSmoothingMode(2);
  if(d==='bar'){ drawBar(gr); return; }
  if(d==='queue'){ drawQueue(gr); return; }
  gr.FillSolidRect(0,0,W,H,COL.black);
  drawTitleBar(gr);
  drawNav(gr);
  drawMain(gr);
  drawQueue(gr);
  drawBar(gr);
}

function winMaxed(){ if(!UIWizard) return false; try{ return UIWizard.WindowState===1; }catch(e){ return false; } }
function drawCapBtn(gr,glyph,x,w,isClose){
  var hover=hv(x,0,x+w,TBH);
  if(hover) gr.FillSolidRect(x,0,w,TBH,isClose?RGB(232,17,35):RGB(48,48,48));
  tC(gr,glyph,FONT.cap,(hover&&isClose)?COL.text:COL.text2,x,0,w,TBH);
}
function drawTitleBar(gr){
  gr.FillSolidRect(0,0,W,TBH,COL.black);
  // menu bar (left): real foobar File / Edit / View / Playback / Library / Help
  HB_MENU=[]; var mx0=12;
  for(var mi=0;mi<MENUS.length;mi++){
    var lbl=MENUS[mi][0], mw=gr.CalcTextWidth(lbl,FONT.menu)+24, mhover=hv(mx0,0,mx0+mw,TBH);
    if(mhover) gr.FillSolidRect(mx0,0,mw,TBH,RGB(40,40,40));
    tC(gr,lbl,FONT.menu,mhover?COL.text:COL.text2,mx0,0,mw,TBH);
    HB_MENU.push({x0:mx0,y0:0,x1:mx0+mw,y1:TBH,root:MENUS[mi][1],mx:mx0});
    mx0+=mw;
  }
  if(mx0!==MENU_END){ MENU_END=mx0; applyCaption(); }
  // window controls (right)
  var closeX=W-CAPBW, maxX=W-CAPBW*2, minX=W-CAPBW*3;
  drawCapBtn(gr,GLYPH.cmin,minX,CAPBW,false);
  drawCapBtn(gr,winMaxed()?GLYPH.crestore:GLYPH.cmax,maxX,CAPBW,false);
  drawCapBtn(gr,GLYPH.cclose,closeX,CAPBW,true);
  HB_CAP={minX:minX,maxX:maxX,closeX:closeX,bw:CAPBW};
}
function drawNav(gr){
  HB_PL=[];
  // top card
  panelBg(gr,R.navTop,COL.base);
  var x=R.navTop.x+18, w=R.navTop.w-30;
  tL(gr,'Home',FONT.nav,(view==='home'||hv(R.navTop.x+8,R.navTop.y+8,R.navTop.x+R.navTop.w-8,R.navTop.y+44))?COL.text:COL.text2,x,R.navTop.y+12,w,32);
  tL(gr,'Search',FONT.nav,(view==='search'||hv(R.navTop.x+8,R.navTop.y+46,R.navTop.x+R.navTop.w-8,R.navTop.y+82))?COL.text:COL.text2,x,R.navTop.y+12+38,w,32);
  HB_SEARCH={x0:R.navTop.x+8,y0:R.navTop.y+46,x1:R.navTop.x+R.navTop.w-8,y1:R.navTop.y+82};
  HB_HOME={x0:R.navTop.x+8,y0:R.navTop.y+8,x1:R.navTop.x+R.navTop.w-8,y1:R.navTop.y+44};
  // library card
  panelBg(gr,R.navLib,COL.base);
  tL(gr,'Your Library',FONT.lib,COL.text2,R.navLib.x+18,R.navLib.y+14,R.navLib.w-56,26);
  tR(gr,'+',FONT.tab,COL.text2,R.navLib.x,R.navLib.y+14,R.navLib.w-16,26);
  var listTop=R.navLib.y+52, rh=58, bottom=R.navLib.y+R.navLib.h;
  var active=plman.ActivePlaylist, n=plman.PlaylistCount, dispIdx=0;
  for(var i=0;i<n;i++){
    var nm=plman.GetPlaylistName(i);
    if(nm===ROUTE) continue;
    var ry=listTop+dispIdx*rh; dispIdx++;
    if(ry+rh>bottom) break;
    var isA=(i===active);
    if(isA) gr.FillRoundRect(R.navLib.x+8,ry,R.navLib.w-16,rh-4,6,6,COL.rowActive);
    else if(hv(R.navLib.x,ry,R.navLib.x+R.navLib.w,ry+rh)) gr.FillRoundRect(R.navLib.x+8,ry,R.navLib.w-16,rh-4,6,6,COL.rowHover);
    var cs=44, cx=R.navLib.x+16, cy=ry+(rh-cs)/2;
    drawCover(gr,cx,cy,cs,4,firstHandle(i),nm);
    var tx=cx+cs+12, tw=R.navLib.x+R.navLib.w-16-tx;
    tL(gr,nm,FONT.pl,isA?COL.green:COL.text,tx,ry+8,tw,20);
    tL(gr,'Playlist · '+plman.PlaylistItemCount(i)+' songs',FONT.plSub,COL.text2,tx,ry+30,tw,16);
    HB_PL.push({x0:R.navLib.x,y0:ry,x1:R.navLib.x+R.navLib.w,y1:ry+rh,i:i});
  }
}

function drawMain(gr){
  var r=R.main; panelBg(gr,r,COL.base);
  if(view==='home'){ drawHome(gr,r); return; }
  if(view==='search'){ drawSearch(gr,r); return; }
  if(view==='artist'){ drawArtist(gr,r); return; }
  drawPlaylist(gr,r);
}
function drawPlaylist(gr,r){
  HB_TR=[]; HB_ARTIST=[];
  var p=activePl();
  // header gradient wash (square top corners; polish later)
  gr.FillGradRect(r.x,r.y,r.w,M.headH,90,blend(artHue(firstHandle(p.i),p.name),COL.base,0.42),COL.base,1.0);
  var ax=r.x+M.cpad, ay=r.y+44, art=M.artSz;
  drawRounded(gr,ax,ay,art,8,firstHandle(p.i),p.name);
  var tx=ax+art+24, tw=r.x+r.w-M.cpad-tx;
  tL(gr,'PLAYLIST',FONT.eyebrow,COL.text,tx,ay+6,tw,18);
  tL(gr,p.name,FONT.title,COL.text,tx,ay+28,tw,84);
  tL(gr,'apip · '+p.count+' songs',FONT.meta,COL.text2,tx,ay+150,tw,22);

  // track list
  var lx=r.x+M.cpad, rx=r.x+r.w-M.cpad;
  var listTop=r.y+M.headH+8, bottom=r.y+r.h-12;
  var numW=30, durW=64, cgap=16;
  var albumW=Math.round((rx-lx-numW-durW-cgap*3)*0.34);
  var titleX=lx+numW+cgap, titleW=(rx-lx-numW-durW-albumW-cgap*3);
  var albumX=titleX+titleW+cgap;
  // header row
  tL(gr,'#',FONT.head,COL.text2,lx,listTop,numW,20);
  tL(gr,'TITLE',FONT.head,COL.text2,titleX,listTop,titleW,20);
  tL(gr,'ALBUM',FONT.head,COL.text2,albumX,listTop,albumW,20);
  tR(gr,'◷',FONT.head,COL.text2,rx-durW,listTop,durW,20);
  gr.DrawLine(lx,listTop+26,rx,listTop+26,1,COL.line);

  var rowsTop=listTop+34, rh=M.rowH;
  var visible=Math.max(0,Math.floor((bottom-rowsTop)/rh));
  var maxFirst=Math.max(0,p.count-visible);
  if(firstRow>maxFirst) firstRow=maxFirst;
  if(firstRow<0) firstRow=0;
  var playingLoc=plman.GetPlayingItemLocation ? plman.GetPlayingItemLocation() : null;
  var items=getItems(p.i), meta=getMeta(p.i);
  for(var v=0; v<visible; v++){
    var j=firstRow+v; if(j>=p.count) break;
    var h=items[j]; if(!h){ continue; }
    var ry=rowsTop+v*rh;
    var isPlaying=playingLoc && playingLoc.IsValid && playingLoc.PlaylistIndex===p.i && playingLoc.PlaylistItemIndex===j;
    var isHover=hv(r.x,ry,r.x+r.w,ry+rh);
    if(isHover) gr.FillRoundRect(lx-8,ry,rx-lx+16,rh,4,4,COL.rowHover);
    var titleCol=isPlaying?COL.green:COL.text;
    // index / play glyph on hover
    if(isHover) tC(gr,GLYPH.play,FONT.icon,COL.text,lx,ry,numW,rh);
    else tL(gr,String(j+1),FONT.rowNum,isPlaying?COL.green:COL.text2,lx,ry,numW,rh);
    // cover + title + artist (from batch-cached metadata)
    var cs=40, cy=ry+(rh-cs)/2, alb=meta.album[j];
    drawCover(gr,titleX,cy,cs,3,h,alb||String(j),meta.artkey[j]);
    var ttx=titleX+cs+12, ttw=titleW-cs-12;
    tL(gr,meta.title[j],FONT.rowTitle,titleCol,ttx,ry+8,ttw,20);
    var art2=meta.artist[j];
    tL(gr,art2,FONT.rowArtist,COL.text2,ttx,ry+30,ttw,16);
    HB_ARTIST.push({x0:ttx,y0:ry+27,x1:ttx+Math.min(ttw,240),y1:ry+46,name:art2});
    // album + duration
    tL(gr,alb,FONT.rowCell,COL.text2,albumX,ry,albumW,rh);
    tR(gr,meta.len[j],FONT.rowCell,COL.text2,rx-durW,ry,durW,rh);
    HB_TR.push({x0:lx-8,y0:ry,x1:rx+8,y1:ry+rh,pl:p.i,item:j});
  }
  // scrollbar hint
  if(p.count>visible && visible>0){
    var trackH=bottom-rowsTop, thumbH=Math.max(30,trackH*visible/p.count), thumbY=rowsTop+trackH*firstRow/p.count;
    gr.FillSolidRect(rx+6,thumbY,4,thumbH,COL.rowActive);
  }
}

function drawPlaylistCard(gr,x,y,w,i){
  gr.FillRoundRect(x,y,w,w+56,8,8,hv(x,y,x+w,y+w+56)?RGB(40,40,40):COL.elev);
  var cs=w-24;
  drawRounded(gr,x+12,y+12,cs,6,firstHandle(i),plman.GetPlaylistName(i));
  tL(gr,plman.GetPlaylistName(i),FONT.card,COL.text,x+12,y+cs+18,w-24,20);
  tL(gr,'Playlist · '+plman.PlaylistItemCount(i)+' songs',FONT.plSub,COL.text2,x+12,y+cs+40,w-24,16);
  HB_CARD.push({x0:x,y0:y,x1:x+w,y1:y+w+56,kind:'pl',id:i});
}
function drawArtistCard(gr,x,y,w,a){
  gr.FillRoundRect(x,y,w,w+56,8,8,hv(x,y,x+w,y+w+56)?RGB(40,40,40):COL.elev);
  var cs=w-24;
  drawCircle(gr,x+12,y+12,cs,a.handle,a.name);
  tC(gr,a.name,FONT.card,COL.text,x+12,y+cs+18,w-24,20);
  tC(gr,'Artist',FONT.plSub,COL.text2,x+12,y+cs+40,w-24,16);
  HB_CARD.push({x0:x,y0:y,x1:x+w,y1:y+w+56,kind:'artist',id:a.name});
}
function drawHome(gr,r){
  HB_CARD=[];
  var pad=M.cpad, x0=r.x+pad, w=r.w-pad*2, bottom=r.y+r.h-12;
  var gap=16, cardW=176, cols=Math.max(2,Math.floor((w+gap)/(cardW+gap)));
  cardW=Math.floor((w-gap*(cols-1))/cols);
  var cardH=cardW+56, i;
  var y=r.y+18;
  tL(gr,'Your Playlists',FONT.sect2,COL.text,x0,y,w,28); y+=42;
  var n=plman.PlaylistCount, d=0;
  for(i=0;i<n;i++){ if(plman.GetPlaylistName(i)===ROUTE) continue; drawPlaylistCard(gr,x0+(d%cols)*(cardW+gap),y+Math.floor(d/cols)*(cardH+8),cardW,i); d++; }
  var plRows=Math.max(1,Math.ceil(d/cols));
  y+=plRows*(cardH+8)+18;
  tL(gr,'Artists in your library',FONT.sect2,COL.text,x0,y,w,28); y+=42;
  var arts=getArtistList();
  HOME_MAXROW=Math.max(0,Math.ceil(arts.length/cols)-1);
  var startIdx=homeScroll*cols;
  for(i=startIdx;i<arts.length;i++){
    var col=(i-startIdx)%cols, row=Math.floor((i-startIdx)/cols), ay=y+row*(cardH+8);
    if(ay+cardH>bottom) break;
    drawArtistCard(gr,x0+col*(cardW+gap),ay,cardW,arts[i]);
  }
}
function drawArtist(gr,r){
  HB_TR=[]; HB_ARTIST=[];
  var pad=M.cpad, x0=r.x+pad, w=r.w-pad*2, bottom=r.y+r.h-12, i;
  var cover=artistAlbums.length?artistAlbums[0].handle:null;
  gr.FillGradRect(r.x,r.y,r.w,220,90,blend(artHue(cover,viewArtist),COL.base,0.44),COL.base,1.0);
  var art=150, ay=r.y+34;
  drawCircle(gr,x0,ay,art,cover,viewArtist);
  var tx=x0+art+24, tw=w-art-24, songs=0;
  for(i=0;i<artistAlbums.length;i++) songs+=artistAlbums[i].tracks.length;
  tL(gr,'ARTIST',FONT.eyebrow,COL.text,tx,ay+10,tw,18);
  tL(gr,viewArtist,FONT.title,COL.text,tx,ay+30,tw,70);
  tL(gr,artistAlbums.length+' albums · '+songs+' songs in your library',FONT.meta,COL.text2,tx,ay+112,tw,22);
  ART_MAXBLOCK=Math.max(0,artistAlbums.length-1);
  var y=r.y+236;
  for(var b=artScroll;b<artistAlbums.length;b++){
    if(y+96>bottom) break;
    var al=artistAlbums[b];
    drawRounded(gr,x0,y,72,6,al.handle,al.album);
    tL(gr,al.album,FONT.sect2,COL.text,x0+88,y+6,w-88,26);
    tL(gr,(al.year||'')+' · '+al.tracks.length+' songs',FONT.meta,COL.text2,x0+88,y+38,w-88,20);
    var ty=y+84;
    for(var t=0;t<al.tracks.length;t++){
      if(ty+40>bottom) break;
      var tr=al.tracks[t];
      if(hv(x0-8,ty,r.x+r.w-pad+8,ty+40)) gr.FillRoundRect(x0-8,ty,(r.x+r.w-pad+8)-(x0-8),40,4,4,COL.rowHover);
      tL(gr,String(t+1),FONT.rowNum,COL.text2,x0,ty,26,40);
      tL(gr,tr.title,FONT.rowTitle,COL.text,x0+36,ty,w-36-64,40);
      tR(gr,tr.dur,FONT.rowCell,COL.text2,r.x+r.w-pad-60,ty,60,40);
      HB_TR.push({x0:x0-8,y0:ty,x1:r.x+r.w-pad+8,y1:ty+40,lib:true,block:b,idx:t});
      ty+=40;
    }
    y=ty+22;
  }
}
function drawSearch(gr,r){
  HB_CARD=[]; HB_TR=[];
  computeSearch();
  var pad=M.cpad, x0=r.x+pad, w=r.w-pad*2, bottom=r.y+r.h-12, i;
  var boxH=48, boxY=r.y+24, boxW=Math.min(520,w);
  gr.FillRoundRect(x0,boxY,boxW,boxH,24,24,RGB(42,42,42));
  tC(gr,GLYPH.search,FONT.iconBtn,COL.text2,x0+8,boxY,40,boxH);
  var empty=!searchQuery.length;
  tL(gr,empty?'What do you want to play?':(searchQuery+'|'),FONT.sect2,empty?COL.text3:COL.text,x0+48,boxY,boxW-60,boxH);
  if(empty) return;
  var y=boxY+boxH+26, any=false;
  if(searchPls.length){
    any=true;
    tL(gr,'Playlists',FONT.sect2,COL.text,x0,y,w,28); y+=42;
    var gap=16,cardW=176,cols=Math.max(2,Math.floor((w+gap)/(cardW+gap))); cardW=Math.floor((w-gap*(cols-1))/cols);
    var cardH=cardW+56;
    for(i=0;i<searchPls.length;i++) drawPlaylistCard(gr,x0+(i%cols)*(cardW+gap),y+Math.floor(i/cols)*(cardH+8),cardW,searchPls[i]);
    y+=Math.ceil(searchPls.length/cols)*(cardH+8)+18;
  }
  if(searchTrks.length){
    any=true;
    tL(gr,'Songs',FONT.sect2,COL.text,x0,y,w,28); y+=38;
    var rh=56, durW=64, visible=Math.max(0,Math.floor((bottom-y)/rh));
    if(searchScroll>Math.max(0,searchTrks.length-visible)) searchScroll=Math.max(0,searchTrks.length-visible);
    for(i=0;i<visible;i++){
      var k=searchScroll+i; if(k>=searchTrks.length) break;
      var tr=searchTrks[k], ry=y+i*rh;
      if(hv(r.x,ry,r.x+r.w,ry+rh)) gr.FillRoundRect(x0-8,ry,w+16,rh,4,4,COL.rowHover);
      drawCover(gr,x0,ry+8,40,4,tr.h,tr.album||tr.title);
      tL(gr,tr.title,FONT.rowTitle,COL.text,x0+52,ry+8,w-52-durW,20);
      tL(gr,tr.artist+(tr.album?('  •  '+tr.album):''),FONT.rowArtist,COL.text2,x0+52,ry+30,w-52-durW,16);
      tR(gr,tr.len,FONT.rowCell,COL.text2,r.x+r.w-pad-durW,ry,durW,rh);
      HB_TR.push({x0:x0-8,y0:ry,x1:r.x+r.w-pad+8,y1:ry+rh,srch:true,idx:k});
    }
  }
  if(!any) tC(gr,'No results found for "'+searchQuery+'"',FONT.sect,COL.text2,r.x,r.y+Math.round(r.h/2),r.w,24);
}
function drawQueue(gr){
  HB_TABS=[];
  var r=R.queue; panelBg(gr,r,COL.base);
  var x=r.x+18;
  var qOn=rightTab==='queue';
  tL(gr,'Queue',FONT.tab,qOn?COL.text:COL.text2,x,r.y+16,80,26);
  tL(gr,'Lyrics',FONT.tab,qOn?COL.text2:COL.text,x+82,r.y+16,80,26);
  gr.FillSolidRect(qOn?x:x+82,r.y+46,qOn?54:50,3,COL.green);
  HB_TABS.push({x0:x-6,y0:r.y+8,x1:x+72,y1:r.y+48,tab:'queue'});
  HB_TABS.push({x0:x+76,y0:r.y+8,x1:x+152,y1:r.y+48,tab:'lyrics'});

  if(!qOn){
    loadLyrics();
    if(!lyrics || lyrics==='none' || !lyrics.lines || !lyrics.lines.length){
      tC(gr,'No lyrics found',FONT.sect,COL.text2,r.x,r.y+Math.round(r.h/2)-28,r.w,24);
      tC(gr,'No .lrc or .txt beside this track.',FONT.qArtist,COL.text3,r.x,r.y+Math.round(r.h/2)+2,r.w,18);
      return;
    }
    var viewTop=r.y+64, viewBot=r.y+r.h-16, viewMid=Math.round((viewTop+viewBot)/2), lh=36, li;
    if(lyrics.synced){
      lyCur=currentLyricLine();
      if(Math.abs(lyCur-lyPos)>0.01) startLyAnim();
      for(li=0;li<lyrics.lines.length;li++){
        var yc=viewMid+(li-lyPos)*lh;
        if(yc<viewTop-lh || yc>viewBot+lh) continue;
        var isCur=(li===lyCur);
        var dist=Math.abs(yc-viewMid), a=clamp01(1-dist/(viewMid-viewTop));
        var col=isCur?COL.green:RGBA(255,255,255,Math.round(28+112*a));
        var fnt=isCur?FONT.lyricCur:FONT.lyric, bh=isCur?46:lh;
        tC(gr,lyrics.lines[li].text,fnt,col,r.x+14,Math.round(yc-bh/2),r.w-28,bh);
      }
    } else {
      stopLyAnim();
      var yy=viewTop+6;
      for(li=0;li<lyrics.lines.length && yy+lh<=viewBot; li++){ tC(gr,lyrics.lines[li].text,FONT.lyric,COL.text2,r.x+14,yy,r.w-28,lh); yy+=lh; }
    }
    return;
  }

  var np=fb.IsPlaying||fb.IsPaused, qy=r.y+70;
  tL(gr,'Now playing',FONT.sect,COL.text,x,qy,r.w-36,24); qy+=36;
  drawCover(gr,x,qy,48,4,NP,'np');
  tL(gr,npTitleStr||'Nothing playing',FONT.qName,np?COL.green:COL.text,x+60,qy+6,r.w-36-60,18);
  tL(gr,npArtistStr,FONT.qArtist,COL.text2,x+60,qy+26,r.w-36-60,16);
  qy+=70;

  var loc=plman.GetPlayingItemLocation?plman.GetPlayingItemLocation():null;
  var pli=(loc&&loc.IsValid)?loc.PlaylistIndex:plman.ActivePlaylist;
  var start=(loc&&loc.IsValid)?loc.PlaylistItemIndex+1:0;
  var qlabel=(pli>=0 && plman.GetPlaylistName(pli)!==ROUTE)?('Next from: '+plman.GetPlaylistName(pli)):'Next up';
  tL(gr,qlabel,FONT.sect,COL.text,x,qy,r.w-36,24); qy+=36;
  if(pli>=0){
    var items=getItems(pli), qmeta=getMeta(pli), cnt=plman.PlaylistItemCount(pli), rh=56, bottom=r.y+r.h-8, shown=0;
    for(var k=start;k<cnt&&shown<20;k++){
      if(qy+rh>bottom) break;
      var h=items[k]; if(!h) continue;
      drawCover(gr,x,qy,44,4,h,qmeta.album[k]||String(k),qmeta.artkey[k]);
      tL(gr,qmeta.title[k],FONT.qName,COL.text,x+56,qy+5,r.w-36-56,18);
      tL(gr,qmeta.artist[k],FONT.qArtist,COL.text2,x+56,qy+25,r.w-36-56,16);
      qy+=rh; shown++;
    }
    if(shown===0) tL(gr,'End of playlist',FONT.qArtist,COL.text3,x,qy,r.w-36,18);
  }
}
TF.npAlbumSeed=function(){ return TF.album.Eval()||'np'; };

function ctrlBtn(gr,glyph,cx,cyc,active,act){
  tC(gr,glyph,FONT.iconBtn,active?COL.green:(hv(cx-18,cyc-18,cx+18,cyc+18)?COL.text:COL.text2),cx-18,cyc-18,36,36);
  HB_CTRL.push({x0:cx-18,y0:cyc-18,x1:cx+18,y1:cyc+18,act:act});
}
function drawBar(gr){
  HB_CTRL=[];
  var by=R.barY;
  gr.FillSolidRect(0,by,W,M.barH,COL.black);
  var np=fb.IsPlaying||fb.IsPaused, playing=np&&fb.IsPlaying&&!fb.IsPaused;
  // left: cover + title/artist
  var cs=56, cx=14, cy=by+(M.barH-cs)/2;
  drawCover(gr,cx,cy,cs,4,NP,'np');
  var tx=cx+cs+12;
  tL(gr,npTitleStr,FONT.npTitle,COL.text,tx,by+22,220,18);
  tL(gr,npArtistStr,FONT.npArtist,COL.text2,tx,by+42,220,16);
  // center: transport row + seekbar
  var cxC=Math.round(W/2);
  var pcy=by+25, phv=hv(cxC-22,by+4,cxC+22,by+46), pb=phv?42:38, pbx=cxC-pb/2, pby=pcy-pb/2;
  var order=readOrder(), shufOn=order>=3, repMode=(order===1?1:(order===2?2:0));
  ctrlBtn(gr,GLYPH.shuffle,cxC-92,pcy,shufOn,'shuffle');
  ctrlBtn(gr,GLYPH.prev,cxC-50,pcy,false,'prev');
  gr.FillEllipse(pbx,pby,pb,pb,COL.text);
  tC(gr,playing?GLYPH.pause:GLYPH.play,FONT.iconBtn,COL.black,pbx,pby,pb,pb);
  HB_CTRL.push({x0:pbx,y0:pby,x1:pbx+pb,y1:pby+pb,act:'play'});
  ctrlBtn(gr,GLYPH.next,cxC+50,pcy,false,'next');
  ctrlBtn(gr,repMode===2?GLYPH.repeat1:GLYPH.repeat,cxC+92,pcy,repMode>0,'repeat');
  var sbW=Math.min(Math.round(W*0.34),520), sbX=cxC-sbW/2, sbY=by+54;
  var len=fb.PlaybackLength, pos=(drag==='seek')?dragFrac:(len>0?fb.PlaybackTime/len:0);
  gr.FillSolidRect(sbX,sbY,sbW,4,COL.seekbg);
  if(pos>0) gr.FillSolidRect(sbX,sbY,Math.max(1,Math.round(sbW*pos)),4,COL.text);
  tR(gr,fmtTime((drag==='seek')?len*dragFrac:fb.PlaybackTime),FONT.time,COL.text2,sbX-48,sbY-6,42,16);
  tL(gr,fmtTime(len),FONT.time,COL.text2,sbX+sbW+8,sbY-6,42,16);
  HB_SEEK={x0:sbX,y0:sbY-9,x1:sbX+sbW,y1:sbY+13,x:sbX,w:sbW};
  // right: volume (Preferences now lives in the File/Library menu up top)
  var gearC=by+M.barH/2;
  var volW=92, volX=W-16-volW, volY=gearC-2;
  tC(gr,GLYPH.volume,FONT.icon,COL.text2,volX-26,gearC-12,20,24);
  var vp=clamp01(vol2pos(fb.Volume));
  gr.FillSolidRect(volX,volY,volW,4,COL.seekbg);
  gr.FillSolidRect(volX,volY,Math.max(1,Math.round(volW*vp)),4,COL.text);
  HB_VOL={x0:volX,y0:volY-9,x1:volX+volW,y1:volY+13,x:volX,w:volW};
}

/* ------------------------- input ------------------------- */
function seekFrac(x){ return HB_SEEK?clamp01((x-HB_SEEK.x)/HB_SEEK.w):0; }
function applyVol(x){ if(HB_VOL){ fb.Volume=pos2vol(clamp01((x-HB_VOL.x)/HB_VOL.w)); repaintBar(); } }
function on_mouse_lbtn_down(x,y){
  if(HB_SEEK && inRect(x,y,HB_SEEK)){ drag='seek'; dragFrac=seekFrac(x); repaintBar(); return; }
  if(HB_VOL && inRect(x,y,HB_VOL)){ drag='vol'; applyVol(x); return; }
}
function playHandleList(handles,idx){
  var hl=fb.CreateHandleList();
  for(var i=0;i<handles.length;i++) hl.Add(handles[i]);
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
  var lib=null; try{ lib=fb.GetLibraryItems(); }catch(e){}
  var out=[];
  if(lib && lib.Count){
    var t=TF.title.EvalWithMetadbs(lib), a=TF.artist.EvalWithMetadbs(lib), al=TF.album.EvalWithMetadbs(lib), l=TF.len.EvalWithMetadbs(lib);
    for(var i=0;i<t.length;i++) out.push({h:lib[i],title:t[i],artist:a[i],album:al[i],len:l[i],key:(t[i]+' '+a[i]+' '+al[i]).toLowerCase()});
  }
  searchIdx=out; return out;
}
function computeSearch(){
  var q=searchQuery.trim().toLowerCase();
  if(q===searchQ2) return;
  searchQ2=q; searchPls=[]; searchTrks=[];
  if(!q) return;
  var n=plman.PlaylistCount, i;
  for(i=0;i<n;i++){ var nm=plman.GetPlaylistName(i); if(nm===ROUTE) continue; if(nm.toLowerCase().indexOf(q)>=0) searchPls.push(i); }
  var idx=getSearchIdx(), cnt=0;
  for(i=0;i<idx.length && cnt<150;i++){ if(idx[i].key.indexOf(q)>=0){ searchTrks.push(idx[i]); cnt++; } }
}
function doCtrl(act){
  if(act==='play') fb.PlayOrPause();
  else if(act==='next') fb.Next();
  else if(act==='prev') fb.Prev();
  else if(act==='shuffle'){ var o=readOrder(); setOrder(o>=3?0:4); }
  else if(act==='repeat'){ var o=readOrder(); setOrder(o===0?1:(o===1?2:0)); }
  window.Repaint();
}
function on_mouse_lbtn_up(x,y){
  if(drag==='seek'){ if(fb.PlaybackLength>0) fb.PlaybackTime=fb.PlaybackLength*dragFrac; drag=null; window.Repaint(); return; }
  if(drag==='vol'){ drag=null; return; }
  if(y<TBH){
    var mm; for(mm=0;mm<HB_MENU.length;mm++){ if(inRect(x,y,HB_MENU[mm])){ openMenu(HB_MENU[mm].root,HB_MENU[mm].mx,TBH); return; } }
    if(HB_CAP){
      if(x>=HB_CAP.closeX){ fb.Exit(); return; }
      if(x>=HB_CAP.maxX){ if(UIWizard){ try{ UIWizard.ToggleMaximize(); }catch(e){} } window.Repaint(); return; }
      if(x>=HB_CAP.minX){ if(UIWizard){ try{ UIWizard.WindowMinimize(); }catch(e){} } return; }
    }
    return;
  }
  var i;
  for(i=0;i<HB_TABS.length;i++){ if(inRect(x,y,HB_TABS[i])){ rightTab=HB_TABS[i].tab; if(rightTab==='lyrics'){ loadLyrics(); lyPos=currentLyricLine(); } else stopLyAnim(); window.Repaint(); return; } }
  for(i=0;i<HB_CTRL.length;i++){ if(inRect(x,y,HB_CTRL[i])){ doCtrl(HB_CTRL[i].act); return; } }
  if(HB_HOME && inRect(x,y,HB_HOME)){ view='home'; window.Repaint(); return; }
  if(HB_SEARCH && inRect(x,y,HB_SEARCH)){ view='search'; window.Repaint(); return; }
  for(i=0;i<HB_CARD.length;i++){ if(inRect(x,y,HB_CARD[i])){ var c=HB_CARD[i]; if(c.kind==='pl'){ plman.ActivePlaylist=c.id; firstRow=0; view='playlist'; } else { loadArtist(c.id); view='artist'; } window.Repaint(); return; } }
  for(i=0;i<HB_ARTIST.length;i++){ if(inRect(x,y,HB_ARTIST[i])){ loadArtist(HB_ARTIST[i].name); view='artist'; window.Repaint(); return; } }
  for(i=0;i<HB_PL.length;i++){ if(inRect(x,y,HB_PL[i])){ plman.ActivePlaylist=HB_PL[i].i; firstRow=0; view='playlist'; window.Repaint(); return; } }
  for(i=0;i<HB_TR.length;i++){ if(inRect(x,y,HB_TR[i])){ var tr=HB_TR[i]; if(tr.srch){ var hs=[]; for(var m2=0;m2<searchTrks.length;m2++) hs.push(searchTrks[m2].h); playHandleList(hs,tr.idx); } else if(tr.lib) playArtistTrack(tr.block,tr.idx); else plman.ExecutePlaylistDefaultAction(tr.pl,tr.item); window.Repaint(); return; } }
}
function hoverSig(x,y){
  var i;
  if(y<TBH){ for(var mj=0;mj<HB_MENU.length;mj++) if(inRect(x,y,HB_MENU[mj])) return 'mnu'+mj; if(HB_CAP && x>=HB_CAP.minX) return 'cap'+(((x-HB_CAP.minX)/HB_CAP.bw)|0); return ''; }
  for(i=0;i<HB_CTRL.length;i++) if(inRect(x,y,HB_CTRL[i])) return 'c'+i;
  for(i=0;i<HB_TABS.length;i++) if(inRect(x,y,HB_TABS[i])) return 't'+i;
  if(HB_HOME && inRect(x,y,HB_HOME)) return 'h';
  if(HB_SEARCH && inRect(x,y,HB_SEARCH)) return 's';
  for(i=0;i<HB_CARD.length;i++) if(inRect(x,y,HB_CARD[i])) return 'k'+i;
  for(i=0;i<HB_PL.length;i++) if(inRect(x,y,HB_PL[i])) return 'p'+HB_PL[i].i;
  for(i=0;i<HB_TR.length;i++) if(inRect(x,y,HB_TR[i])) return 'r'+i;
  return '';
}
function on_mouse_move(x,y){
  mx=x; my=y;
  if(drag==='seek'){ dragFrac=seekFrac(x); repaintBar(); return; }
  if(drag==='vol'){ applyVol(x); return; }
  var sig=hoverSig(x,y);
  if(sig!==hoverKey){ hoverKey=sig; window.Repaint(); }
}
function on_mouse_leave(){ mx=-1; my=-1; if(hoverKey!==''){ hoverKey=''; window.Repaint(); } }
function on_char(code){
  if(view!=='search') return;
  if(code===8) searchQuery=searchQuery.slice(0,-1);
  else if(code===27) searchQuery='';
  else if(code>=32) searchQuery+=String.fromCharCode(code);
  searchScroll=0; window.Repaint();
}
function on_mouse_wheel(step){
  if(mx<R.main.x || mx>=R.main.x+R.main.w) return;
  if(view==='home'){ homeScroll-=step; if(homeScroll<0)homeScroll=0; if(homeScroll>HOME_MAXROW)homeScroll=HOME_MAXROW; }
  else if(view==='search'){ searchScroll-=step*3; if(searchScroll<0)searchScroll=0; }
  else if(view==='artist'){ artScroll-=step; if(artScroll<0)artScroll=0; if(artScroll>ART_MAXBLOCK)artScroll=ART_MAXBLOCK; }
  else { firstRow-=step*3; if(firstRow<0)firstRow=0; }
  window.Repaint();
}
function on_script_unload(){ stopLyAnim(); }
function on_library_items_added(){ artistList=null; searchIdx=null; searchQ2=null; window.Repaint(); }
function on_library_items_removed(){ artistList=null; searchIdx=null; searchQ2=null; window.Repaint(); }
function on_library_items_changed(){ artistList=null; searchIdx=null; searchQ2=null; window.Repaint(); }

/* ------------------------- playback callbacks ------------------------- */
function on_playback_new_track(){ updateNP(); window.Repaint(); }
function on_playback_dynamic_info_track(){ updateNP(); window.Repaint(); }
function on_playback_stop(){ updateNP(); window.Repaint(); }
function on_playback_pause(){ updateNP(); window.Repaint(); }
function on_playback_time(){
  repaintBar();
  if(rightTab==='lyrics' && lyrics && lyrics!=='none' && lyrics.synced){ var c=currentLyricLine(); if(c!==lyCur){ lyCur=c; startLyAnim(); } }
}
function on_playback_seek(){ window.Repaint(); }
function on_playback_order_changed(){ repaintBar(); }
function on_volume_change(){ repaintBar(); }
function on_metadb_changed(handles,fromhook){ if(fromhook) return; invalidateItems(); albKeyCache={}; hueCache={}; updateNP(); window.Repaint(); }
function on_playlist_switch(){ firstRow=0; invalidateItems(); window.Repaint(); }
function on_playlists_changed(){ invalidateItems(); window.Repaint(); }
function on_playlist_items_added(){ invalidateItems(); window.Repaint(); }
function on_playlist_items_removed(){ invalidateItems(); window.Repaint(); }
function on_playlist_items_reordered(){ invalidateItems(); window.Repaint(); }
function on_item_focus_change(){ window.Repaint(); }

layout();
updateNP();
console.log('[foobar-spotify] Phase 3 loaded (perf + custom title bar)');
