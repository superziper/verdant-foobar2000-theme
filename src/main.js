'use strict';

/* =============================================================
 * foobar2000 x Spotify  -  Phase 3, milestone A: app shell
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
var DLGC_WANTALLKEYS=0x0004;   // capture ALL keys (incl. as-typed chars) instead of letting
                               // foobar swallow them as global shortcuts. Applied only in Search
                               // view (see applyKeyMode) so shortcuts still work everywhere else.

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
FONT.searchTxt = gf('Segoe UI Semibold',16,0);
FONT.searchIco = gf('Segoe MDL2 Assets',15);
FONT.lyric = gf('Segoe UI',18,1);
FONT.lyricCur = gf('Segoe UI',23,1);
var GLYPH = { play:String.fromCharCode(0xE768), pause:String.fromCharCode(0xE769), prev:String.fromCharCode(0xE892), next:String.fromCharCode(0xE893), shuffle:String.fromCharCode(0xE8B1), repeat:String.fromCharCode(0xE8EE) };
GLYPH.repeat1=String.fromCharCode(0xE8ED); GLYPH.volume=String.fromCharCode(0xE767); GLYPH.settings=String.fromCharCode(0xE713);
GLYPH.search=String.fromCharCode(0xE721); GLYPH.home=String.fromCharCode(0xE80F); GLYPH.add=String.fromCharCode(0xE710); GLYPH.more=String.fromCharCode(0xE712);
FONT.navIco = gf('Segoe MDL2 Assets',24);
var CH_DOT=String.fromCharCode(0xB7), CH_BULL=String.fromCharCode(0x2022);
GLYPH.clock=String.fromCharCode(0xE823);
GLYPH.cmin=String.fromCharCode(0xE921); GLYPH.cmax=String.fromCharCode(0xE922); GLYPH.crestore=String.fromCharCode(0xE923); GLYPH.cclose=String.fromCharCode(0xE8BB);
FONT.cap = gf('Segoe MDL2 Assets',10);
/* Custom window title bar via UI Wizard (foo_ui_wizard, already installed) - frameless + our own controls */
var TBH = Math.round(32*UISCALE), CAPBW = Math.round(46*UISCALE);
var UIWizard=null; try{ UIWizard=new ActiveXObject('UIWizard'); }catch(e){ UIWizard=null; }
FONT.menu = gf('Segoe UI',12);
var MENUS=[['File','file'],['Library','library'],['Help','help']];
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
TF.lensec=fb.TitleFormat('%length_seconds%');

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
var artistList=null, artistTracksMap=null, artistCoverCache={};
function getArtistList(){
  if(artistList) return artistList;
  var lib=null; try{ lib=fb.GetLibraryItems(); }catch(e){}
  var out=[]; artistTracksMap={};
  if(lib && lib.Count){
    var names=TF.artistName.EvalWithMetadbs(lib), seen={};
    for(var i=0;i<names.length;i++){
      var nm=names[i]; if(!nm) continue;
      if(!artistTracksMap[nm]) artistTracksMap[nm]=[];
      artistTracksMap[nm].push(lib[i]);
      if(!seen[nm]){ seen[nm]=1; out.push({name:nm, handle:lib[i]}); }
    }
    out.sort(function(a,b){ var an=a.name.toLowerCase(), bn=b.name.toLowerCase(); return an<bn?-1:(an>bn?1:0); });
  }
  artistList=out; return out;
}
// artist avatar = the artist's first track that actually has embedded art
// (else the given fallback handle -> placeholder). Scanned lazily, cached per artist.
function artistCover(name,fallback){
  if(artistCoverCache.hasOwnProperty(name)) return artistCoverCache[name];
  var h=fallback, list=artistTracksMap?artistTracksMap[name]:null;
  if(list){
    var seenAlb={}, cap=Math.min(list.length,40);
    for(var i=0;i<cap;i++){ var hh=list[i]; if(!hh) continue; var k=albKey(hh); if(seenAlb[k]) continue; seenAlb[k]=1; if(getArt(hh)){ h=hh; break; } }
  }
  artistCoverCache[name]=h; return h;
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
// Pixel-based roll (variable line heights, since long phrases wrap to >1 line).
var lyScroll=0, lyTarget=0, lyCur=0, lyTimer=null, lySnap=true, lyLay={lyr:null,w:-1};
function currentLyricLine(){
  if(!lyrics || lyrics==='none' || !lyrics.synced) return 0;
  var pt=fb.PlaybackTime, c=0;
  for(var i=0;i<lyrics.lines.length;i++){ if(lyrics.lines[i].t<=pt) c=i; else break; }
  return c;
}
// Wrap each phrase to the panel width and precompute cumulative block geometry. Cached by width.
function lyLayout(gr,maxW){
  if(lyLay.lyr===lyrics && lyLay.w===maxW) return lyLay;
  var subLh=Math.round(gr.CalcTextHeight('Ag',FONT.lyric))+4, gap=Math.round(subLh*0.55);
  var subs=[], top=[], cen=[], blockH=[], acc=0;
  for(var i=0;i<lyrics.lines.length;i++){
    var wr=gr.EstimateLineWrap(lyrics.lines[i].text||'',FONT.lyric,maxW), parts=[];
    for(var j=0;j<wr.length;j+=2) parts.push(wr[j]);
    if(!parts.length) parts=[''];
    var bh=parts.length*subLh;
    subs.push(parts); top.push(acc); blockH.push(bh); cen.push(acc+bh/2); acc+=bh+gap;
  }
  lyLay={lyr:lyrics,w:maxW,subs:subs,top:top,cen:cen,blockH:blockH,subLh:subLh};
  return lyLay;
}
function lyTick(){ var d=lyTarget-lyScroll; if(Math.abs(d)<0.5){ lyScroll=lyTarget; stopLyAnim(); } else lyScroll+=d*0.25; dirtyQueue=true; window.RepaintRect(R.queue.x,R.queue.y,R.queue.w,R.queue.h); }
function startLyAnim(){ if(!lyTimer) lyTimer=window.SetInterval(lyTick,33); }
function stopLyAnim(){ if(lyTimer){ window.ClearInterval(lyTimer); lyTimer=null; } }
// Blinking text caret in the Search box, so it reads as a focused, ready-to-type field.
var caretOn=true, caretTimer=null;
function caretTick(){
  if(renameEdit){ caretOn=!caretOn; repaintAll(); return; }              // caret sits in a playlist row/card
  if(view==='search'){ caretOn=!caretOn; dirtySearch=true; var b=searchBoxRect(); window.RepaintRect(b.x,b.y,b.w,b.h); return; }
  stopCaret();
}
function startCaret(){ if(!caretTimer){ caretOn=true; caretTimer=window.SetInterval(caretTick,530); } }
function stopCaret(){ if(caretTimer){ window.ClearInterval(caretTimer); caretTimer=null; } caretOn=true; }
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
  lyricsFor=key; lyrics='none'; lyScroll=0; lyTarget=0; lySnap=true; lyLay={lyr:null,w:-1};
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
/* Playlist cover: first up-to-4 DISTINCT albums that actually have art.
   >=4 found -> 2x2 mosaic; otherwise a single (first-available) cover. Both cached. */
var plCoverCache={}, mosaicCache={};
function plCovers(pi){
  if(plCoverCache.hasOwnProperty(pi)) return plCoverCache[pi];
  var it=getItems(pi), res={list:[], single:null};
  if(it && it.Count){
    var seenAlb={}, cap=Math.min(it.Count,40);
    for(var i=0;i<cap && res.list.length<4;i++){
      var h=it[i]; if(!h) continue; var k=albKey(h); if(seenAlb[k]) continue;
      if(getArt(h)){ seenAlb[k]=1; res.list.push(h); if(!res.single) res.single=h; }
    }
    if(!res.single) res.single=it[0];   // nothing had art: keep the placeholder path
  }
  plCoverCache[pi]=res; return res;
}
function mosaicImg(handles,seed,size,rad){
  var key=(seed||'')+'|'+size+'|m'+rad;
  if(mosaicCache.hasOwnProperty(key)) return mosaicCache[key];
  var res=null;
  try{
    var cv=gdi.CreateImage(size,size), g=cv.GetGraphics();
    var h1=Math.floor(size/2), h2=size-h1;
    var cells=[[0,0,h1,h1],[h1,0,h2,h1],[0,h1,h1,h2],[h1,h1,h2,h2]];
    for(var i=0;i<4;i++){
      var art=getArt(handles[i]), c=cells[i];
      if(art){ var rz=art.Resize(c[2],c[3]); g.DrawImage(rz,c[0],c[1],c[2],c[3],0,0,rz.Width,rz.Height); }
      else g.FillSolidRect(c[0],c[1],c[2],c[3],coverCol((seed||'')+i));
    }
    cv.ReleaseGraphics(g);
    if(rad>0) cv.ApplyMask(roundMask(size,rad));
    res=cv;
  }catch(e){ res=null; }
  mosaicCache[key]=res; return res;
}
function drawPlCover(gr,x,y,size,rad,pi,seed){
  var cov=plCovers(pi);
  if(cov.list.length>=4){ var mi=mosaicImg(cov.list,seed,size,rad); if(mi){ gr.DrawImage(mi,x,y,size,size,0,0,mi.Width,mi.Height,0,255); return; } }
  drawRounded(gr,x,y,size,rad,cov.single,seed);
}

/* ------------------------- state ------------------------- */
var W=window.Width, H=window.Height, R={}, NP=null, npTitleStr='', npArtistStr='';
// Repaint scope flags. dirtyAll (sticky) forces a full paint; the partial flags
// accumulate. A full window.Repaint() MUST set dirtyAll (use repaintAll) so a paint
// serviced while a partial flag is pending can't blank the rest of the window.
var dirtyAll=true, dirtyBar=false, dirtyQueue=false, dirtySearch=false;
function repaintAll(){ dirtyAll=true; window.Repaint(); }
var firstRow=0, hoverKey='', mx=-1, my=-1, drag=null, dragFrac=0;
function hv(x0,y0,x1,y1){ return mx>=x0 && mx<x1 && my>=y0 && my<y1; }
var HB_PL=[], HB_TR=[], HB_PREFS=null, HB_CTRL=[], HB_TABS=[], HB_SEEK=null, HB_VOL=null;
var HB_CARD=[], HB_ARTIST=[], HB_HOME=null, HB_CAP=null, HB_MENU=[], SB=null;
var navScroll=0, NAV_MAX=0, SBN=null, HB_ADDPL=null, navDropHover=false;
// playlist edit: right-click / hover-dots context menu, inline rename, delete confirm
var HB_DOTS=[], ctxMenu=null, CTX_HB=[], renameEdit=null, confirmDel=null, CONF_HB=null, RENAME_HB=null;
function openPlaylistMenu(pl,x,y){
  ctxMenu={pl:pl, name:plman.GetPlaylistName(pl), x:x, y:y,
           items:[{label:'Rename',act:'rename'},{label:'Delete',act:'delete'}]};
  repaintAll();
}
function startRename(pl){ renameEdit={pl:pl, text:plman.GetPlaylistName(pl)}; ctxMenu=null; caretOn=true; startCaret(); applyKeyMode(); repaintAll(); }
function commitRename(){ if(!renameEdit) return; var t=renameEdit.text.replace(/^\s+|\s+$/g,''); if(t) plman.RenamePlaylist(renameEdit.pl,t); renameEdit=null; applyKeyMode(); repaintAll(); }
function cancelRename(){ renameEdit=null; applyKeyMode(); repaintAll(); }
function doDeletePlaylist(pl){
  var wasShown=(view==='playlist' && pl===plman.ActivePlaylist);
  try{ plman.RemovePlaylist(pl); }catch(e){}
  confirmDel=null; invalidateItems();
  if(wasShown || plman.PlaylistCount===0) view='home';   // don't strand the playlist view on a deleted list
  repaintAll();
}
// small hover "..." button; records a HB_DOTS target that opens the menu just below it
function drawDots(gr,cx,cy,pl){
  if(hv(cx,cy,cx+24,cy+24)) gr.FillEllipse(cx,cy,24,24,RGBA(255,255,255,26));
  tC(gr,GLYPH.more,FONT.icon,COL.text,cx,cy,24,24);
  HB_DOTS.push({x0:cx-2,y0:cy-2,x1:cx+26,y1:cy+26,pl:pl,mx:cx,my:cy+26});
}
// dashed rectangle border, drawn as short segments (GDI+ has no native dash)
function dashRect(gr,x,y,w,h,col,dash,gap,th){
  var st=dash+gap, d;
  for(d=0;d<w;d+=st){ var dw=Math.min(dash,w-d); gr.FillSolidRect(x+d,y,dw,th,col); gr.FillSolidRect(x+d,y+h-th,dw,th,col); }
  for(d=0;d<h;d+=st){ var dh=Math.min(dash,h-d); gr.FillSolidRect(x,y+d,th,dh,col); gr.FillSolidRect(x+w-th,y+d,th,dh,col); }
}
// Always-visible, draggable scrollbar. Each scrollable view calls this at the end
// of its draw; setScroll() maps a drag/click to that view's scroll index.
function drawScrollbar(gr,sx,top,h,idx,maxIdx,vis,total){
  if(total<=vis || h<=6){ SB=null; return; }
  var sw=6;
  gr.FillSolidRect(sx,top,sw,h,RGBA(255,255,255,20));
  var thumbH=Math.max(36,Math.round(h*vis/total)); if(thumbH>h) thumbH=h;
  var ty=top+(maxIdx>0?Math.round((h-thumbH)*idx/maxIdx):0);
  var on=(drag==='scroll')||hv(sx-6,top,sx+sw+6,top+h);
  gr.FillSolidRect(sx,ty,sw,thumbH,RGBA(255,255,255,on?175:95));
  SB={x0:sx-6,y0:top,x1:sx+sw+6,y1:top+h,top:top,h:h,thumbH:thumbH,maxIdx:maxIdx};
}
function setScroll(y){
  if(!SB) return;
  var frac=clamp01((y-SB.top-SB.thumbH/2)/Math.max(1,SB.h-SB.thumbH));
  var idx=Math.round(frac*SB.maxIdx);
  if(view==='playlist') firstRow=idx;
  else if(view==='home') homeScroll=idx;
  repaintAll();
}
// Dedicated scrollbar for the sidebar playlist list (independent of the main view).
function drawScrollbarN(gr,sx,top,h,idx,maxIdx,vis,total){
  if(total<=vis || h<=6){ SBN=null; return; }
  var sw=5;
  gr.FillSolidRect(sx,top,sw,h,RGBA(255,255,255,16));
  var thumbH=Math.max(30,Math.round(h*vis/total)); if(thumbH>h) thumbH=h;
  var ty=top+(maxIdx>0?Math.round((h-thumbH)*idx/maxIdx):0);
  var on=(drag==='scrolln')||hv(sx-6,top,sx+sw+6,top+h);
  gr.FillSolidRect(sx,ty,sw,thumbH,RGBA(255,255,255,on?150:80));
  SBN={x0:sx-6,y0:top,x1:sx+sw+6,y1:top+h,top:top,h:h,thumbH:thumbH,maxIdx:maxIdx};
}
function setScrollN(y){ if(!SBN) return; var frac=clamp01((y-SBN.top-SBN.thumbH/2)/Math.max(1,SBN.h-SBN.thumbH)); navScroll=Math.round(frac*SBN.maxIdx); repaintAll(); }
// create a uniquely-named empty playlist, return its index
function newPlaylistName(){ var b='New Playlist', nm=b, k=1, i; for(;;){ var hit=false; for(i=0;i<plman.PlaylistCount;i++){ if(plman.GetPlaylistName(i)===nm){ hit=true; break; } } if(!hit) return nm; k++; nm=b+' '+k; } }
function createNewPlaylist(){ return plman.CreatePlaylist(plman.PlaylistCount, newPlaylistName()); }
var rightTab='queue';
var view='home', viewArtist='', artistAlbums=[], homeScroll=0, artScroll=0;
// Keyboard capture on only in Search view. Re-asserted every full paint + on_size
// because JSplitter can reset window.DlgCode on resize/reload.
function applyKeyMode(){ try{ window.DlgCode=(view==='search'||renameEdit)?DLGC_WANTALLKEYS:0; }catch(e){} }
var ROUTE='__spotify_np__'; // hidden playlist used to play library tracks (artist page / search)
var searchQuery='', searchScroll=0, searchIdx=null, searchQ2=null, searchArts=[], searchTrks=[], HB_SEARCH=null;
var HOME_MAXROW=0, ART_MAXBLOCK=0;
// Home "Your Playlists" horizontal shelf: scroll offset (card index), max, wheel hit-band, h-scrollbar.
var plScroll=0, HOME_PLMAX=0, HOME_SHELF_Y0=0, HOME_SHELF_Y1=0, SBH=null;
function drawScrollbarH(gr,sx,top,w,idx,maxIdx,vis,total){
  if(total<=vis || w<=6){ SBH=null; return; }
  var sh=5;
  gr.FillSolidRect(sx,top,w,sh,RGBA(255,255,255,20));
  var thumbW=Math.max(40,Math.round(w*vis/total)); if(thumbW>w) thumbW=w;
  var tx=sx+(maxIdx>0?Math.round((w-thumbW)*idx/maxIdx):0);
  var on=(drag==='scrollh')||hv(sx,top-6,sx+w,top+sh+6);
  gr.FillSolidRect(tx,top,thumbW,sh,RGBA(255,255,255,on?175:95));
  SBH={x0:sx,y0:top-6,x1:sx+w,y1:top+sh+6,left:sx,w:w,thumbW:thumbW,maxIdx:maxIdx};
}
function setScrollH(x){
  if(!SBH) return;
  var frac=clamp01((x-SBH.left-SBH.thumbW/2)/Math.max(1,SBH.w-SBH.thumbW));
  plScroll=Math.round(frac*SBH.maxIdx); repaintAll();
}
var plCacheMap={}, plMetaMap={};
function getItems(pi){ if(!plCacheMap[pi]){ plCacheMap[pi]=plman.GetPlaylistItems(pi); } return plCacheMap[pi]; }
function getMeta(pi){
  if(!plMetaMap[pi]){
    var list=getItems(pi), secs=TF.lensec.EvalWithMetadbs(list), tot=0;
    for(var i=0;i<secs.length;i++) tot+=parseInt(secs[i],10)||0;
    plMetaMap[pi]={ title:TF.title.EvalWithMetadbs(list), artist:TF.artist.EvalWithMetadbs(list),
                    album:TF.album.EvalWithMetadbs(list), len:TF.len.EvalWithMetadbs(list), artkey:TF.albkey.EvalWithMetadbs(list),
                    totalSec:tot };
  }
  return plMetaMap[pi];
}
// "1 hr 23 min" / "42 min" / "38 sec" style duration
function fmtDur(s){
  s=Math.max(0,Math.round(s)); var h=Math.floor(s/3600), m=Math.floor((s%3600)/60);
  if(h>0) return h+' hr '+m+' min';
  if(m>0) return m+' min';
  return s+' sec';
}
function invalidateItems(){ plCacheMap={}; plMetaMap={}; plCoverCache={}; mosaicCache={}; }

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
  applyKeyMode();
}
function on_size(w,h){ W=w; H=h; layout(); }

function activePl(){ var i=plman.ActivePlaylist; return {i:i, name:i>=0?plman.GetPlaylistName(i):'', count:i>=0?plman.PlaylistItemCount(i):0}; }
function updateNP(){
  var m=(fb.IsPlaying||fb.IsPaused)?fb.GetNowPlaying():null;
  NP=m;
  npTitleStr=m?TF.npTitle.EvalWithMetadb(m):'';
  npArtistStr=m?TF.npArtist.EvalWithMetadb(m):'';
}
function repaintBar(){ dirtyBar=true; window.RepaintRect(0,R.barY,W,M.barH); }

/* ------------------------- paint ------------------------- */
function panelBg(gr,r,c){ gr.FillRoundRect(r.x,r.y,r.w,r.h,M.radius,M.radius,c); }

// Themed context menu + delete-confirm overlay, painted on top of everything.
function drawOverlays(gr){
  CTX_HB=[]; CONF_HB=null; RENAME_HB=null;
  if(renameEdit){
    gr.FillSolidRect(0,0,W,H,RGBA(0,0,0,150));            // dim backdrop (modal)
    var rw=Math.min(420,W-40), rhh=196, rx0=Math.round((W-rw)/2), ry0=Math.round((H-rhh)/2);
    gr.FillSolidRect(rx0+4,ry0+6,rw,rhh,RGBA(0,0,0,140));
    gr.FillRoundRect(rx0,ry0,rw,rhh,12,12,RGB(42,42,42));
    tL(gr,'Rename playlist',FONT.sect,COL.text,rx0+28,ry0+22,rw-56,26);
    var ix=rx0+28, iyf=ry0+64, iw=rw-56, ih=46;
    gr.FillRoundRect(ix,iyf,iw,ih,6,6,RGB(62,62,62));
    var tw3=gr.CalcTextWidth(renameEdit.text,FONT.pl);
    tL(gr,renameEdit.text,FONT.pl,COL.text,ix+14,iyf,iw-28,ih);
    if(caretOn){ var cxr=ix+14+Math.min(iw-30,tw3)+2; gr.FillSolidRect(cxr,iyf+Math.round((ih-20)/2),2,20,COL.text); }
    var canSave=renameEdit.text.replace(/^\s+|\s+$/g,'').length>0;
    var bw=118, bh=40, gap=14, by=ry0+rhh-bh-22, dx=rx0+rw-28-bw, ccx=dx-gap-bw;
    gr.FillRoundRect(ccx,by,bw,bh,20,20,hv(ccx,by,ccx+bw,by+bh)?RGB(66,66,66):RGB(52,52,52));
    tC(gr,'Cancel',FONT.pl,COL.text,ccx,by,bw,bh);
    var sv=canSave?(hv(dx,by,dx+bw,by+bh)?RGB(45,215,110):COL.green):RGB(60,92,74);
    gr.FillRoundRect(dx,by,bw,bh,20,20,sv);
    tC(gr,'Save',FONT.pl,canSave?COL.black:COL.text3,dx,by,bw,bh);
    RENAME_HB={panel:{x0:rx0,y0:ry0,x1:rx0+rw,y1:ry0+rhh},save:{x0:dx,y0:by,x1:dx+bw,y1:by+bh},cancel:{x0:ccx,y0:by,x1:ccx+bw,y1:by+bh},canSave:canSave};
  }
  if(ctxMenu){
    var iw=190, ih=42, pad=6, h=ctxMenu.items.length*ih+pad*2;
    var mx=Math.min(ctxMenu.x,W-iw-10), my=Math.min(ctxMenu.y,H-h-10);
    gr.FillSolidRect(mx+3,my+4,iw,h,RGBA(0,0,0,120));       // soft shadow
    gr.FillRoundRect(mx,my,iw,h,8,8,RGB(43,43,43));
    for(var i=0;i<ctxMenu.items.length;i++){
      var iy=my+pad+i*ih, it=ctxMenu.items[i];
      if(hv(mx,iy,mx+iw,iy+ih)) gr.FillRoundRect(mx+4,iy,iw-8,ih,5,5,RGBA(255,255,255,20));
      tL(gr,it.label,FONT.pl,(it.act==='delete')?RGB(240,96,96):COL.text,mx+16,iy,iw-24,ih);
      CTX_HB.push({x0:mx,y0:iy,x1:mx+iw,y1:iy+ih,act:it.act});
    }
  }
  if(confirmDel){
    gr.FillSolidRect(0,0,W,H,RGBA(0,0,0,150));             // dim backdrop (modal)
    var cw=380, ch=180, cx=Math.round((W-cw)/2), cy=Math.round((H-ch)/2);
    gr.FillSolidRect(cx+4,cy+6,cw,ch,RGBA(0,0,0,140));
    gr.FillRoundRect(cx,cy,cw,ch,12,12,RGB(42,42,42));
    tL(gr,'Delete playlist?',FONT.sect,COL.text,cx+28,cy+24,cw-56,26);
    tL(gr,'This removes "'+confirmDel.name+'" from your library.',FONT.pl,COL.text2,cx+28,cy+58,cw-56,40);
    var bw=118, bh=40, gap=14, by=cy+ch-bh-22, dx=cx+cw-28-bw, ccx=dx-gap-bw;
    gr.FillRoundRect(ccx,by,bw,bh,20,20,hv(ccx,by,ccx+bw,by+bh)?RGB(66,66,66):RGB(52,52,52));
    tC(gr,'Cancel',FONT.pl,COL.text,ccx,by,bw,bh);
    gr.FillRoundRect(dx,by,bw,bh,20,20,hv(dx,by,dx+bw,by+bh)?RGB(240,96,96):RGB(224,72,72));
    tC(gr,'Delete',FONT.pl,COL.text,dx,by,bw,bh);
    CONF_HB={cancel:{x0:ccx,y0:by,x1:ccx+bw,y1:by+bh},del:{x0:dx,y0:by,x1:dx+bw,y1:by+bh}};
  }
}
function on_paint(gr){
  gr.SetSmoothingMode(2);
  var anyPartial=dirtyBar||dirtyQueue||dirtySearch;
  if(dirtyAll || !anyPartial){          // full paint, or an OS/stale paint we can't scope -> repaint everything
    dirtyAll=false; dirtyBar=false; dirtyQueue=false; dirtySearch=false;
    HB_DOTS=[];
    gr.FillSolidRect(0,0,W,H,COL.black);
    drawTitleBar(gr);
    drawNav(gr);
    drawMain(gr);
    drawQueue(gr);
    drawBar(gr);
    drawOverlays(gr);
    return;
  }
  // partial composite: only the regions actually flagged (each drawn over live content)
  if(dirtyQueue){ dirtyQueue=false; drawQueue(gr); }
  if(dirtySearch){ dirtySearch=false; if(view==='search') drawSearchBox(gr,R.main); }
  if(dirtyBar){ dirtyBar=false; drawBar(gr); }
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
  // Home + Search as two wide icon buttons spanning the sidebar, side by side
  var m=16, g=12, bh=54, iy=R.navTop.y+Math.round((R.navTop.h-bh)/2);
  var bw=Math.floor((R.navTop.w-2*m-g)/2);
  var hx=R.navTop.x+m, sx2=hx+bw+g;
  var hon=(view==='home'), hhov=hv(hx,iy,hx+bw,iy+bh);
  if(hon||hhov) gr.FillRoundRect(hx,iy,bw,bh,10,10,hon?COL.rowActive:COL.rowHover);
  tC(gr,GLYPH.home,FONT.navIco,hon?COL.text:COL.text2,hx,iy,bw,bh);
  HB_HOME={x0:hx,y0:iy,x1:hx+bw,y1:iy+bh};
  var son=(view==='search'), shov=hv(sx2,iy,sx2+bw,iy+bh);
  if(son||shov) gr.FillRoundRect(sx2,iy,bw,bh,10,10,son?COL.rowActive:COL.rowHover);
  tC(gr,GLYPH.search,FONT.navIco,son?COL.text:COL.text2,sx2,iy,bw,bh);
  HB_SEARCH={x0:sx2,y0:iy,x1:sx2+bw,y1:iy+bh};
  // library card
  panelBg(gr,R.navLib,COL.base);
  tL(gr,'Your Library',FONT.lib,COL.text2,R.navLib.x+18,R.navLib.y+14,R.navLib.w-56,26);
  var active=plman.ActivePlaylist;
  var pls=[]; for(var i=0;i<plman.PlaylistCount;i++){ if(plman.GetPlaylistName(i)!==ROUTE) pls.push(i); }
  // pinned "add playlist" footer at the very bottom (always visible)
  var footH=94, footTop=R.navLib.y+R.navLib.h-footH;
  // scrollable playlist list, cropped just above the footer (continuous: partial peek row like the songs list)
  var listTop=R.navLib.y+52, rh=58, cropY=footTop-6;
  var fullVis=Math.max(0,Math.floor((cropY-listTop)/rh));
  NAV_MAX=Math.max(0,pls.length-fullVis);
  if(navScroll>NAV_MAX) navScroll=NAV_MAX; if(navScroll<0) navScroll=0;
  var v;
  for(v=0; ; v++){
    var ry=listTop+v*rh; if(ry>=cropY) break;    // draw a partial peek row past the fold
    var idx=navScroll+v; if(idx>=pls.length) break;
    var i2=pls[idx], nm=plman.GetPlaylistName(i2);
    var isA=(view==='playlist' && i2===active);
    if(isA) gr.FillRoundRect(R.navLib.x+8,ry,R.navLib.w-16,rh-4,6,6,COL.rowActive);
    else if(hv(R.navLib.x,ry,R.navLib.x+R.navLib.w,ry+rh)) gr.FillRoundRect(R.navLib.x+8,ry,R.navLib.w-16,rh-4,6,6,COL.rowHover);
    var cs=44, cx=R.navLib.x+16, cy=ry+(rh-cs)/2;
    drawPlCover(gr,cx,cy,cs,4,i2,nm);
    var tx=cx+cs+12, rowHov=hv(R.navLib.x,ry,R.navLib.x+R.navLib.w,ry+rh);
    var tw=R.navLib.x+R.navLib.w-16-tx-(rowHov?26:0);
    tL(gr,nm,FONT.pl,isA?COL.green:COL.text,tx,ry+8,tw,20);
    tL(gr,plman.PlaylistItemCount(i2)+' songs',FONT.plSub,COL.text2,tx,ry+30,tw,16);
    if(rowHov) drawDots(gr,R.navLib.x+R.navLib.w-32,ry+(rh-24)/2,i2);
    HB_PL.push({x0:R.navLib.x,y0:ry,x1:R.navLib.x+R.navLib.w,y1:ry+rh,i:i2});
  }
  // crop the peek row overflow, fade the bottom when there's more, then the always-visible scrollbar
  gr.FillSolidRect(R.navLib.x,cropY,R.navLib.w,R.navLib.y+R.navLib.h-cropY,COL.base);
  if(navScroll<NAV_MAX) gr.FillGradRect(R.navLib.x+8,cropY-30,R.navLib.w-16,30,90,RGBA(18,18,18,0),COL.base,1.0);
  drawScrollbarN(gr,R.navLib.x+R.navLib.w-9,listTop,cropY-listTop,navScroll,NAV_MAX,fullVis,pls.length);
  // dashed "drag a file / click to create" box (hint stays this size; whole section is the drop target)
  var bx=R.navLib.x+14, bw2=R.navLib.w-28, by=footTop+5, bh2=footH-14;
  var addHov=navDropHover||hv(bx,by,bx+bw2,by+bh2);
  var dcol=navDropHover?COL.green:(addHov?COL.text:COL.text2);
  if(navDropHover) gr.FillRoundRect(bx,by,bw2,bh2,10,10,RGBA(30,215,96,30));
  dashRect(gr,bx,by,bw2,bh2,dcol,6,5,2);
  var cy0=by+Math.round((bh2-63)/2);   // vertically-centred content block (icon + 2 lines), padded off the border
  tC(gr,GLYPH.add,FONT.iconBtn,dcol,bx,cy0,bw2,22);
  tC(gr,navDropHover?'Drop to import':'New playlist',FONT.pl,dcol,bx,cy0+28,bw2,18);
  if(!navDropHover) tC(gr,'drag a file or click',FONT.plSub,COL.text3,bx,cy0+49,bw2,14);
  HB_ADDPL={x0:bx,y0:by,x1:bx+bw2,y1:by+bh2};
}

function drawMain(gr){
  HB_CARD=[]; HB_TR=[]; HB_ARTIST=[]; SB=null; SBH=null;   // clear stale click targets from the previous view
  applyKeyMode();
  if(view==='search') startCaret(); else stopCaret();
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
  drawPlCover(gr,ax,ay,art,8,p.i,p.name);
  var tx=ax+art+24, tw=r.x+r.w-M.cpad-tx;
  tL(gr,'PLAYLIST',FONT.eyebrow,COL.text,tx,ay+6,tw,18);
  tL(gr,p.name,FONT.title,COL.text,tx,ay+28,tw,84);
  var meta0=getMeta(p.i);
  tL(gr,p.count+' songs'+(meta0.totalSec>0?(' '+CH_DOT+' '+fmtDur(meta0.totalSec)):''),FONT.meta,COL.text2,tx,ay+150,tw,22);

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
  tR(gr,GLYPH.clock,FONT.icon,COL.text2,rx-durW,listTop,durW,20);
  gr.DrawLine(lx,listTop+26,rx,listTop+26,1,COL.line);

  var rowsTop=listTop+34, rh=M.rowH, cropY=r.y+r.h;
  var fullVis=Math.max(0,Math.floor((cropY-rowsTop)/rh));
  var maxFirst=Math.max(0,p.count-fullVis);
  if(firstRow>maxFirst) firstRow=maxFirst;
  if(firstRow<0) firstRow=0;
  var playingLoc=plman.GetPlayingItemLocation ? plman.GetPlayingItemLocation() : null;
  var items=getItems(p.i), meta=getMeta(p.i);
  for(var v=0; ; v++){
    var ry=rowsTop+v*rh; if(ry>=cropY) break;   // draw one partial "peek" row past the fold
    var j=firstRow+v; if(j>=p.count) break;
    var h=items[j]; if(!h){ continue; }
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
    tL(gr,meta.artist[j],FONT.rowArtist,COL.text2,ttx,ry+30,ttw,16);
    // album + duration
    tL(gr,alb,FONT.rowCell,COL.text2,albumX,ry,albumW,rh);
    tR(gr,meta.len[j],FONT.rowCell,COL.text2,rx-durW,ry,durW,rh);
    HB_TR.push({x0:lx-8,y0:ry,x1:rx+8,y1:ry+rh,pl:p.i,item:j});
  }
  // crop the peek row cleanly at the panel edge, then fade the bottom to hint "more below"
  gr.FillSolidRect(r.x,cropY,r.w,M.pad+2,COL.black);
  if(firstRow<maxFirst) gr.FillGradRect(lx-8,cropY-40,(rx-lx)+16,40,90,RGBA(18,18,18,0),COL.base,1.0);
  drawScrollbar(gr,rx+8,rowsTop,cropY-rowsTop,firstRow,maxFirst,fullVis,p.count);
}

function drawPlaylistCard(gr,x,y,w,i){
  var cardHov=hv(x,y,x+w,y+w+56);
  gr.FillRoundRect(x,y,w,w+56,8,8,cardHov?RGB(40,40,40):COL.elev);
  var cs=w-24;
  drawPlCover(gr,x+12,y+12,cs,6,i,plman.GetPlaylistName(i));
  tL(gr,plman.GetPlaylistName(i),FONT.card,COL.text,x+12,y+cs+18,w-24-(cardHov?26:0),20);
  tL(gr,plman.PlaylistItemCount(i)+' songs',FONT.plSub,COL.text2,x+12,y+cs+40,w-24,16);
  if(cardHov) drawDots(gr,x+w-32,y+cs+16,i);
  HB_CARD.push({x0:x,y0:y,x1:x+w,y1:y+w+56,kind:'pl',id:i});
}
function drawArtistCard(gr,x,y,w,a){
  gr.FillRoundRect(x,y,w,w+56,8,8,hv(x,y,x+w,y+w+56)?RGB(40,40,40):COL.elev);
  var cs=w-24;
  drawCircle(gr,x+12,y+12,cs,artistCover(a.name,a.handle),a.name);
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
  // ---- Your Playlists: single horizontal shelf (scroll sideways) ----
  tL(gr,'Your Playlists',FONT.sect2,COL.text,x0,y,w,28); y+=42;
  var pls=[]; for(i=0;i<plman.PlaylistCount;i++){ if(plman.GetPlaylistName(i)!==ROUTE) pls.push(i); }
  HOME_PLMAX=Math.max(0,pls.length-cols);
  if(plScroll>HOME_PLMAX) plScroll=HOME_PLMAX; if(plScroll<0) plScroll=0;
  var shelfY=y, rightEdge=r.x+r.w;
  for(i=plScroll;i<pls.length;i++){
    var cx=x0+(i-plScroll)*(cardW+gap); if(cx>=rightEdge) break;   // last card peeks past the fold
    drawPlaylistCard(gr,cx,shelfY,cardW,pls[i]);
  }
  gr.FillSolidRect(rightEdge,shelfY,M.gap+2,cardH+2,COL.black);   // hide right overflow in the gap to the queue
  if(plScroll<HOME_PLMAX) gr.FillGradRect(rightEdge-48,shelfY,48,cardH,0,RGBA(18,18,18,0),COL.base,1.0);
  if(plScroll>0)          gr.FillGradRect(x0,shelfY,44,cardH,0,COL.base,RGBA(18,18,18,0),1.0);
  HOME_SHELF_Y0=shelfY; HOME_SHELF_Y1=shelfY+cardH;
  var sbY=shelfY+cardH+6;
  drawScrollbarH(gr,x0,sbY,w,plScroll,HOME_PLMAX,cols,pls.length);
  y=shelfY+cardH+(HOME_PLMAX>0?26:16);
  // ---- Artists in your library: vertical grid (scroll down) ----
  tL(gr,'Artists in your library',FONT.sect2,COL.text,x0,y,w,28); y+=42;
  var arts=getArtistList();
  var cropY=r.y+r.h, rowStep=cardH+8;
  var fullRows=Math.max(1,Math.floor((cropY-y)/rowStep));
  var totalRows=Math.max(1,Math.ceil(arts.length/cols));
  HOME_MAXROW=Math.max(0,totalRows-fullRows);
  if(homeScroll>HOME_MAXROW) homeScroll=HOME_MAXROW;
  var startIdx=homeScroll*cols;
  for(i=startIdx;i<arts.length;i++){
    var col=(i-startIdx)%cols, row=Math.floor((i-startIdx)/cols), ay=y+row*rowStep;
    if(ay>=cropY) break;   // draw one partial "peek" row past the fold
    drawArtistCard(gr,x0+col*(cardW+gap),ay,cardW,arts[i]);
  }
  gr.FillSolidRect(r.x,cropY,r.w,M.pad+2,COL.black);
  if(homeScroll<HOME_MAXROW) gr.FillGradRect(x0,cropY-40,w,40,90,RGBA(18,18,18,0),COL.base,1.0);
  drawScrollbar(gr,x0+w+8,y,cropY-y,homeScroll,HOME_MAXROW,fullRows,totalRows);
}
function drawArtist(gr,r){
  HB_TR=[]; HB_ARTIST=[];
  var pad=M.cpad, x0=r.x+pad, w=r.w-pad*2, bottom=r.y+r.h-12, i;
  var cover=artistAlbums.length?artistAlbums[0].handle:null;
  for(var ci=0;ci<artistAlbums.length;ci++){ if(getArt(artistAlbums[ci].handle)){ cover=artistAlbums[ci].handle; break; } }
  gr.FillGradRect(r.x,r.y,r.w,220,90,blend(artHue(cover,viewArtist),COL.base,0.44),COL.base,1.0);
  var art=150, ay=r.y+34;
  drawCircle(gr,x0,ay,art,cover,viewArtist);
  var tx=x0+art+24, tw=w-art-24, songs=0;
  for(i=0;i<artistAlbums.length;i++) songs+=artistAlbums[i].tracks.length;
  tL(gr,'ARTIST',FONT.eyebrow,COL.text,tx,ay+10,tw,18);
  tL(gr,viewArtist,FONT.title,COL.text,tx,ay+30,tw,70);
  tL(gr,artistAlbums.length+' albums '+CH_DOT+' '+songs+' songs in your library',FONT.meta,COL.text2,tx,ay+112,tw,22);
  ART_MAXBLOCK=Math.max(0,artistAlbums.length-1);
  var y=r.y+236;
  for(var b=artScroll;b<artistAlbums.length;b++){
    if(y+96>bottom) break;
    var al=artistAlbums[b];
    drawRounded(gr,x0,y,72,6,al.handle,al.album);
    tL(gr,al.album,FONT.sect2,COL.text,x0+88,y+6,w-88,26);
    tL(gr,(al.year||'')+' '+CH_DOT+' '+al.tracks.length+' songs',FONT.meta,COL.text2,x0+88,y+38,w-88,20);
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
// The search field, factored out so the blinking caret can repaint just this
// strip (dirtySearch flag) instead of the whole view twice a second.
var SBOX_H=44, SBOX_TOP=26;   // box height + offset below R.main.y (shared by box + results layout)
function searchBoxRect(){ var r=R.main, boxW=Math.min(520,r.w-M.cpad*2); return {x:r.x+M.cpad-2,y:r.y+SBOX_TOP-4,w:boxW+8,h:SBOX_H+8}; }
function drawSearchBox(gr,r){
  var x0=r.x+M.cpad, boxH=SBOX_H, boxY=r.y+SBOX_TOP, boxW=Math.min(520,r.w-M.cpad*2);
  gr.FillSolidRect(x0-2,boxY-4,boxW+8,boxH+8,COL.base);   // clean bg for partial repaints
  gr.FillRoundRect(x0,boxY,boxW,boxH,boxH/2,boxH/2,RGB(42,42,42));
  var txtX=x0+48, txtW=boxW-(txtX-x0)-18;
  tC(gr,GLYPH.search,FONT.searchIco,COL.text2,x0+16,boxY,22,boxH);
  var empty=!searchQuery.length, caretH=20, caretY=boxY+(boxH-caretH)/2, caretX;
  if(empty){
    caretX=txtX;
    tL(gr,'What do you want to play?',FONT.searchTxt,COL.text3,txtX+12,boxY,txtW-12,boxH);
  } else {
    tL(gr,searchQuery,FONT.searchTxt,COL.text,txtX,boxY,txtW,boxH);
    caretX=txtX+Math.min(txtW,gr.CalcTextWidth(searchQuery,FONT.searchTxt))+2;
  }
  if(caretOn) gr.FillSolidRect(caretX,caretY,2,caretH,empty?COL.text2:COL.text);
}
function drawSearch(gr,r){
  HB_CARD=[]; HB_TR=[];
  computeSearch();
  var pad=M.cpad, x0=r.x+pad, w=r.w-pad*2, bottom=r.y+r.h-12, i;
  var boxH=SBOX_H, boxY=r.y+SBOX_TOP;
  drawSearchBox(gr,r);
  var empty=!searchQuery.length;
  if(empty){ tL(gr,'Search your playlists and library.',FONT.qArtist,COL.text3,x0+2,boxY+boxH+18,w,18); return; }
  var y=boxY+boxH+26, any=false;
  if(searchArts.length){
    any=true;
    tL(gr,'Artists',FONT.sect2,COL.text,x0,y,w,28); y+=42;
    var gap=16,cardW=176,cols=Math.max(2,Math.floor((w+gap)/(cardW+gap))); cardW=Math.floor((w-gap*(cols-1))/cols);
    var cardH=cardW+56;
    for(i=0;i<searchArts.length;i++) drawArtistCard(gr,x0+(i%cols)*(cardW+gap),y+Math.floor(i/cols)*(cardH+8),cardW,searchArts[i]);
    y+=Math.ceil(searchArts.length/cols)*(cardH+8)+18;
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
      tL(gr,tr.artist+(tr.album?('  '+CH_BULL+'  '+tr.album):''),FONT.rowArtist,COL.text2,x0+52,ry+30,w-52-durW,16);
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
    var viewTop=r.y+64, viewBot=r.y+r.h-16, viewMid=Math.round((viewTop+viewBot)/2), maxW=r.w-28, li;
    var L=lyLayout(gr,maxW), subLh=L.subLh, s;
    if(lyrics.synced){
      lyCur=currentLyricLine();
      lyTarget=L.cen[lyCur]||0;
      if(lySnap){ lyScroll=lyTarget; lySnap=false; }
      else if(Math.abs(lyTarget-lyScroll)>0.5) startLyAnim();
      for(li=0;li<lyrics.lines.length;li++){
        var bcY=viewMid+(L.cen[li]-lyScroll);                          // this phrase's block centre, on screen
        if(bcY<viewTop-L.blockH[li] || bcY>viewBot+L.blockH[li]) continue;
        var isCur=(li===lyCur);
        var dist=Math.abs(bcY-viewMid), a=clamp01(1-dist/(viewMid-viewTop));
        var col=isCur?COL.green:RGBA(255,255,255,Math.round(28+112*a));
        var parts=L.subs[li], bTop=Math.round(bcY-L.blockH[li]/2);
        for(s=0;s<parts.length;s++) tC(gr,parts[s],FONT.lyric,col,r.x+14,bTop+s*subLh,maxW,subLh);
      }
    } else {
      stopLyAnim();
      var yy=viewTop+6;
      for(li=0;li<lyrics.lines.length;li++){
        var p2=L.subs[li];
        for(s=0;s<p2.length && yy+subLh<=viewBot; s++){ tC(gr,p2[s],FONT.lyric,COL.text2,r.x+14,yy,maxW,subLh); yy+=subLh; }
        yy+=Math.round(subLh*0.45);
        if(yy>=viewBot) break;
      }
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
  if(ctxMenu||confirmDel||renameEdit) return;   // overlays are modal; dismissal/actions handled on button-up
  if(HB_SEEK && inRect(x,y,HB_SEEK)){ drag='seek'; dragFrac=seekFrac(x); repaintBar(); return; }
  if(HB_VOL && inRect(x,y,HB_VOL)){ drag='vol'; applyVol(x); return; }
  if(SBH && inRect(x,y,SBH)){ drag='scrollh'; setScrollH(x); return; }
  if(SBN && inRect(x,y,SBN)){ drag='scrolln'; setScrollN(y); return; }
  if(SB && inRect(x,y,SB)){ drag='scroll'; setScroll(y); return; }
}
function on_mouse_rbtn_up(x,y){
  if(ctxMenu||confirmDel||renameEdit) return true;   // a modal is open: swallow
  var i;
  for(i=0;i<HB_PL.length;i++){ if(inRect(x,y,HB_PL[i])){ openPlaylistMenu(HB_PL[i].i,x,y); return true; } }
  for(i=0;i<HB_CARD.length;i++){ if(inRect(x,y,HB_CARD[i]) && HB_CARD[i].kind==='pl'){ openPlaylistMenu(HB_CARD[i].id,x,y); return true; } }
  return false;   // elsewhere: let JSplitter's own panel menu through (Reload / Configure / Properties)
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
  else if(act==='shuffle'){ var o=readOrder(); setOrder(o>=3?0:4); }
  else if(act==='repeat'){ var o=readOrder(); setOrder(o===0?1:(o===1?2:0)); }
  repaintAll();
}
function on_mouse_lbtn_up(x,y){
  // ---- modal overlays first ----
  if(confirmDel){
    if(CONF_HB && inRect(x,y,CONF_HB.del)){ doDeletePlaylist(confirmDel.pl); return; }
    confirmDel=null; repaintAll(); return;   // cancel / click outside
  }
  if(ctxMenu){
    var ci; for(ci=0;ci<CTX_HB.length;ci++){ if(inRect(x,y,CTX_HB[ci])){
      var act=CTX_HB[ci].act, pl=ctxMenu.pl, nm=ctxMenu.name;
      if(act==='rename'){ startRename(pl); } else { confirmDel={pl:pl,name:nm}; ctxMenu=null; repaintAll(); }
      return;
    } }
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
  var dd; for(dd=0;dd<HB_DOTS.length;dd++){ if(inRect(x,y,HB_DOTS[dd])){ openPlaylistMenu(HB_DOTS[dd].pl,HB_DOTS[dd].mx,HB_DOTS[dd].my); return; } }
  if(drag==='seek'){ if(fb.PlaybackLength>0) fb.PlaybackTime=fb.PlaybackLength*dragFrac; drag=null; repaintAll(); return; }
  if(drag==='vol'){ drag=null; return; }
  if(drag==='scroll'){ drag=null; repaintAll(); return; }
  if(drag==='scrollh'){ drag=null; repaintAll(); return; }
  if(drag==='scrolln'){ drag=null; repaintAll(); return; }
  if(y<TBH){
    var mm; for(mm=0;mm<HB_MENU.length;mm++){ if(inRect(x,y,HB_MENU[mm])){ openMenu(HB_MENU[mm].root,HB_MENU[mm].mx,TBH); return; } }
    if(HB_CAP){
      if(x>=HB_CAP.closeX){ fb.Exit(); return; }
      if(x>=HB_CAP.maxX){ if(UIWizard){ try{ UIWizard.ToggleMaximize(); }catch(e){} } repaintAll(); return; }
      if(x>=HB_CAP.minX){ if(UIWizard){ try{ UIWizard.WindowMinimize(); }catch(e){} } return; }
    }
    return;
  }
  var i;
  for(i=0;i<HB_TABS.length;i++){ if(inRect(x,y,HB_TABS[i])){ rightTab=HB_TABS[i].tab; if(rightTab==='lyrics'){ loadLyrics(); lySnap=true; } else stopLyAnim(); repaintAll(); return; } }
  for(i=0;i<HB_CTRL.length;i++){ if(inRect(x,y,HB_CTRL[i])){ doCtrl(HB_CTRL[i].act); return; } }
  if(HB_HOME && inRect(x,y,HB_HOME)){ view='home'; repaintAll(); return; }
  if(HB_SEARCH && inRect(x,y,HB_SEARCH)){ view='search'; repaintAll(); return; }
  if(HB_ADDPL && inRect(x,y,HB_ADDPL)){ var np=createNewPlaylist(); plman.ActivePlaylist=np; firstRow=0; view='playlist'; repaintAll(); return; }
  for(i=0;i<HB_CARD.length;i++){ if(inRect(x,y,HB_CARD[i])){ var c=HB_CARD[i]; if(c.kind==='pl'){ plman.ActivePlaylist=c.id; firstRow=0; view='playlist'; } else { loadArtist(c.id); view='artist'; } repaintAll(); return; } }
  for(i=0;i<HB_PL.length;i++){ if(inRect(x,y,HB_PL[i])){ plman.ActivePlaylist=HB_PL[i].i; firstRow=0; view='playlist'; repaintAll(); return; } }
  for(i=0;i<HB_TR.length;i++){ if(inRect(x,y,HB_TR[i])){ var tr=HB_TR[i]; if(tr.srch){ var hs=[]; for(var m2=0;m2<searchTrks.length;m2++) hs.push(searchTrks[m2].h); playHandleList(hs,tr.idx); } else if(tr.lib) playArtistTrack(tr.block,tr.idx); else plman.ExecutePlaylistDefaultAction(tr.pl,tr.item); repaintAll(); return; } }
}
function hoverSig(x,y){
  var i;
  if(renameEdit){ if(RENAME_HB){ if(inRect(x,y,RENAME_HB.save)) return 'rns'; if(inRect(x,y,RENAME_HB.cancel)) return 'rnc'; } return 'rn'; }
  if(confirmDel){ if(CONF_HB && inRect(x,y,CONF_HB.del)) return 'cfd'; if(CONF_HB && inRect(x,y,CONF_HB.cancel)) return 'cfc'; return 'cf'; }
  if(ctxMenu){ for(i=0;i<CTX_HB.length;i++) if(inRect(x,y,CTX_HB[i])) return 'cx'+i; return 'cx'; }
  for(i=0;i<HB_DOTS.length;i++) if(inRect(x,y,HB_DOTS[i])) return 'd'+i;
  if(y<TBH){ for(var mj=0;mj<HB_MENU.length;mj++) if(inRect(x,y,HB_MENU[mj])) return 'mnu'+mj; if(HB_CAP && x>=HB_CAP.minX) return 'cap'+(((x-HB_CAP.minX)/HB_CAP.bw)|0); return ''; }
  if(SBH && inRect(x,y,SBH)) return 'sbh';
  if(SBN && inRect(x,y,SBN)) return 'sbn';
  if(HB_ADDPL && inRect(x,y,HB_ADDPL)) return 'addpl';
  if(SB && inRect(x,y,SB)) return 'sb';
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
  if(drag==='scroll'){ setScroll(y); return; }
  if(drag==='scrollh'){ setScrollH(x); return; }
  if(drag==='scrolln'){ setScrollN(y); return; }
  var sig=hoverSig(x,y);
  if(sig!==hoverKey){ hoverKey=sig; repaintAll(); }
}
function on_mouse_leave(){ mx=-1; my=-1; if(hoverKey!==''){ hoverKey=''; repaintAll(); } }
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
  searchScroll=0; caretOn=true; repaintAll();   // keep caret solid right after a keystroke
}
function on_mouse_wheel(step){
  if(R.navLib && mx>=R.navLib.x && mx<R.navLib.x+R.navLib.w && my>=R.navLib.y && my<R.navLib.y+R.navLib.h){
    navScroll-=step; if(navScroll<0)navScroll=0; if(navScroll>NAV_MAX)navScroll=NAV_MAX; repaintAll(); return;
  }
  if(mx<R.main.x || mx>=R.main.x+R.main.w) return;
  if(view==='home'){
    if(my>=HOME_SHELF_Y0 && my<HOME_SHELF_Y1){ plScroll-=step; if(plScroll<0)plScroll=0; if(plScroll>HOME_PLMAX)plScroll=HOME_PLMAX; }
    else { homeScroll-=step; if(homeScroll<0)homeScroll=0; if(homeScroll>HOME_MAXROW)homeScroll=HOME_MAXROW; }
  }
  else if(view==='search'){ searchScroll-=step*3; if(searchScroll<0)searchScroll=0; }
  else if(view==='artist'){ artScroll-=step; if(artScroll<0)artScroll=0; if(artScroll>ART_MAXBLOCK)artScroll=ART_MAXBLOCK; }
  else { firstRow-=step*3; if(firstRow<0)firstRow=0; }
  repaintAll();
}
/* ---- drag & drop external files anywhere in the library section -> new playlist ---- */
function overLib(x,y){ return R.navLib && x>=R.navLib.x && x<R.navLib.x+R.navLib.w && y>=R.navLib.y && y<R.navLib.y+R.navLib.h; }
function dragUpdate(action,x,y){
  var over=overLib(x,y) && !action.IsInternal;   // external files, anywhere over the library
  if(over) action.Effect=(action.Effect&1)?1:((action.Effect&4)?4:0);  // prefer copy, else link
  else action.Effect=0;                                                  // deny elsewhere
  if(over!==navDropHover){ navDropHover=over; repaintAll(); }
}
function on_drag_enter(action,x,y,mask){ dragUpdate(action,x,y); }
function on_drag_over(action,x,y,mask){ dragUpdate(action,x,y); }
function on_drag_leave(){ if(navDropHover){ navDropHover=false; repaintAll(); } }
function on_drag_drop(action,x,y,mask){
  if(overLib(x,y) && !action.IsInternal && (action.Effect&5)){          // 5 = copy|link
    var np=createNewPlaylist();
    action.Playlist=np; action.Base=0; action.ToSelect=true;            // component drops the files into it
    action.Effect=(action.Effect&1)?1:4;
    plman.ActivePlaylist=np; firstRow=0; view='playlist';
  } else action.Effect=0;
  navDropHover=false; repaintAll();
}
function on_script_unload(){ stopLyAnim(); stopCaret(); }
function on_library_items_added(){ artistList=null; artistTracksMap=null; artistCoverCache={}; searchIdx=null; searchQ2=null; repaintAll(); }
function on_library_items_removed(){ artistList=null; artistTracksMap=null; artistCoverCache={}; searchIdx=null; searchQ2=null; repaintAll(); }
function on_library_items_changed(){ artistList=null; artistTracksMap=null; artistCoverCache={}; searchIdx=null; searchQ2=null; repaintAll(); }

/* ------------------------- playback callbacks ------------------------- */
function on_playback_new_track(){ updateNP(); repaintAll(); }
function on_playback_dynamic_info_track(){ updateNP(); repaintAll(); }
function on_playback_stop(){ updateNP(); repaintAll(); }
function on_playback_pause(){ updateNP(); repaintAll(); }
function on_playback_time(){
  repaintBar();
  if(rightTab==='lyrics' && lyrics && lyrics!=='none' && lyrics.synced){ var c=currentLyricLine(); if(c!==lyCur){ lyCur=c; startLyAnim(); } }
}
function on_playback_seek(){ repaintAll(); }
function on_playback_order_changed(){ repaintBar(); }
function on_volume_change(){ repaintBar(); }
function on_metadb_changed(handles,fromhook){ if(fromhook) return; invalidateItems(); albKeyCache={}; hueCache={}; artistCoverCache={}; updateNP(); repaintAll(); }
function on_playlist_switch(){ firstRow=0; invalidateItems(); repaintAll(); }
function on_playlists_changed(){ invalidateItems(); repaintAll(); }
function on_playlist_items_added(){ invalidateItems(); repaintAll(); }
function on_playlist_items_removed(){ invalidateItems(); repaintAll(); }
function on_playlist_items_reordered(){ invalidateItems(); repaintAll(); }
function on_item_focus_change(){ repaintAll(); }

layout();
updateNP();
console.log('[foobar-spotify] Phase 3 loaded (perf + custom title bar)');
