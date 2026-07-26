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
FONT.fsLyric = gf('Segoe UI',30,1);
FONT.fsSrc = gf('Segoe UI Semibold',13,0);
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

/* ------------------------- vector icons (SVG rasterized via gdi.LoadSVG, tinted + cached) ------------------------- */
var ICONS={
 play:"<path d='M8 5v14l11-7z'/>",
 pause:"<rect x='6' y='5' width='4' height='14' rx='1.3'/><rect x='14' y='5' width='4' height='14' rx='1.3'/>",
 prev:"<path d='M6 6h2.2v12H6zm3 6l9 6V6z'/>",
 next:"<path d='M15.8 6H18v12h-2.2zM6 18l9-6-9-6z'/>",
 shuffle:"<path d='M10.59 9.17 5.41 4 4 5.41l5.17 5.17zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04z'/>",
 repeat:"<path d='M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z'/>",
 repeat1:"<path d='M13 15V9h-1l-2 1v1h1.5v4zm4-8v3l4-4-4-4v3H5v6h2V7zm0 10H7v-3l-4 4 4 4v-3h12v-6h-2z'/>",
 volume:"<path d='M3 9v6h4l5 5V4L7 9zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z'/>",
 home:"<path d='M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z'/>",
 search:"<path d='M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.49 4.49 0 0 1 9.5 14z'/>",
 add:"<path d='M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z'/>",
 more:"<path d='M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z'/>",
 clock:"<path d='M11.99 2A10 10 0 1 0 22 12 10 10 0 0 0 11.99 2zM12 20a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z'/>",
 expand:"<path d='M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z'/>",
 compress:"<path d='M5 16h3v3h2v-5H5zm3-8H5v2h5V5H8zm6 11h2v-3h3v-2h-5zm2-11V5h-2v5h5V8z'/>",
 mic:"<path d='M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z'/>",
 equalizer:"<path d='M10 20h4V4h-4zm-6 0h4v-8H4zm12-11v11h4V9z'/>",
 heart:"<path d='M12 20.7l-1.35-1.23C5.9 15.28 3 12.7 3 9.5A4.5 4.5 0 0 1 12 6.9 4.5 4.5 0 0 1 21 9.5c0 3.2-2.9 5.78-7.65 10l-1.35 1.2zm0-2.7c3.9-3.54 6-5.65 6-8.5A2.5 2.5 0 0 0 12.86 8h-1.72A2.5 2.5 0 0 0 6 9.5c0 2.85 2.1 4.96 6 8.5z'/>",
 heartFill:"<path d='M12 20.7l-1.35-1.23C5.9 15.28 3 12.7 3 9.5A4.5 4.5 0 0 1 12 6.9 4.5 4.5 0 0 1 21 9.5c0 3.2-2.9 5.78-7.65 10l-1.35 1.2z'/>",
 chevron:"<path d='M7 10l5 5 5-5z'/>"
};
var svgCache={};
function iconImg(name,size,col){
  var rgb=((col>>16)&0xff)+','+((col>>8)&0xff)+','+(col&0xff), key=name+'|'+size+'|'+rgb;
  if(svgCache.hasOwnProperty(key)) return svgCache[key];
  var xml="<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='"+size+"' height='"+size+"'><g fill='rgb("+rgb+")'>"+ICONS[name]+"</g></svg>";
  var bmp=null; try{ bmp=gdi.LoadSVG(xml,size); }catch(e){ bmp=null; }
  svgCache[key]=bmp; return bmp;
}
// draw a crisp size-px vector icon centred in [x,y,w,h]; falls back to the MDL2 glyph if LoadSVG is unavailable
function drawIcon(gr,name,col,x,y,w,h,size){
  var s=size||Math.min(w,h), img=iconImg(name,s,col);
  if(img){ var a=(col>>>24)&0xff; if(!a) a=255; gr.DrawImage(img,Math.round(x+(w-s)/2),Math.round(y+(h-s)/2),s,s,0,0,img.Width,img.Height,0,a); return; }
  tC(gr,GLYPH[name]||'?',(s>=26?FONT.navIco:(s>=18?FONT.iconBtn:FONT.icon)),col,x,y,w,h);
}

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
// Spotify-style shuffle + repeat. Repeat maps to native PlaybackOrder (0/1/2); SHUFFLE is our own
// (we play from a hidden shuffled copy of the playlist -> accurate "next up"). See shuffle engine below.
var pbShuffle=false, pbRepeat=0;   // pbRepeat: 0 off | 1 all | 2 one
function applyPlaybackOrder(){ setOrder(pbRepeat===2?2:(pbRepeat===1?1:0)); }   // native handles repeat only
function syncOrderFromFb(){ var o=readOrder(); pbRepeat=(o===2)?2:(o===1?1:0); }
function toggleShuffle(){
  pbShuffle=!pbShuffle;
  if(fb.IsPlaying||fb.IsPaused){ if(pbShuffle) shuffleEnterFromCurrent(); else shuffleExitToSource(); }
  applyPlaybackOrder(); repaintAll();
}
function cycleRepeat(){ pbRepeat=(pbRepeat+1)%3; applyPlaybackOrder(); }

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
// Wrap each phrase to the given width+font and precompute cumulative block geometry. Cached by width+font.
function lyLayout(gr,maxW,font){
  font=font||FONT.lyric;
  if(lyLay.lyr===lyrics && lyLay.w===maxW && lyLay.font===font) return lyLay;
  var subLh=Math.round(gr.CalcTextHeight('Ag',font))+4, gap=Math.round(subLh*0.55);
  var subs=[], top=[], cen=[], blockH=[], acc=0;
  for(var i=0;i<lyrics.lines.length;i++){
    var wr=gr.EstimateLineWrap(lyrics.lines[i].text||'',font,maxW), parts=[];
    for(var j=0;j<wr.length;j+=2) parts.push(wr[j]);
    if(!parts.length) parts=[''];
    var bh=parts.length*subLh;
    subs.push(parts); top.push(acc); blockH.push(bh); cen.push(acc+bh/2); acc+=bh+gap;
  }
  lyLay={lyr:lyrics,w:maxW,font:font,subs:subs,top:top,cen:cen,blockH:blockH,subLh:subLh};
  return lyLay;
}
// Shared rolling synced-lyric renderer (queue tab + fullscreen). align: 'c' centred / 'l' left.
function drawRollingLyrics(gr,x,top,w,bot,font,curCol,align){
  var viewMid=Math.round((top+bot)/2), L=lyLayout(gr,w,font), subLh=L.subLh, li,s;
  lyCur=currentLyricLine();
  lyTarget=L.cen[lyCur]||0;
  if(lySnap){ lyScroll=lyTarget; lySnap=false; } else if(Math.abs(lyTarget-lyScroll)>0.5) startLyAnim();
  for(li=0;li<lyrics.lines.length;li++){
    var bcY=viewMid+(L.cen[li]-lyScroll);
    if(bcY<top-L.blockH[li] || bcY>bot+L.blockH[li]) continue;
    var isCur=(li===lyCur), dist=Math.abs(bcY-viewMid), a=clamp01(1-dist/(viewMid-top));
    var col=isCur?curCol:RGBA(255,255,255,Math.round(24+120*a));
    var parts=L.subs[li], bTop=Math.round(bcY-L.blockH[li]/2);
    for(s=0;s<parts.length;s++){ if(align==='l') tL(gr,parts[s],font,col,x,bTop+s*subLh,w,subLh); else tC(gr,parts[s],font,col,x,bTop+s*subLh,w,subLh); }
  }
}
function lyTick(){
  var d=lyTarget-lyScroll; if(Math.abs(d)<0.5){ lyScroll=lyTarget; stopLyAnim(); } else lyScroll+=d*0.25;
  if(fsMode){ repaintAll(); } else { dirtyQueue=true; window.RepaintRect(R.queue.x,R.queue.y,R.queue.w,R.queue.h); }
}
function startLyAnim(){ if(!lyTimer) lyTimer=window.SetInterval(lyTick,16); }   // 60fps roll
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
var dirtyAll=true, dirtyBar=false, dirtyQueue=false, dirtySearch=false, dirtyMain=false, dirtyNav=false;
function repaintAll(){ dirtyAll=true; window.Repaint(); }
function repaintMain(){ dirtyMain=true; window.RepaintRect(R.main.x,R.main.y,R.main.w,R.main.h); }   // scroll: main panel only
function repaintNav(){ dirtyNav=true; window.RepaintRect(R.navLib.x,R.navLib.y,R.navLib.w,R.navLib.h); }
var firstRow=0, hoverKey='', scrollKey='', mx=-1, my=-1, drag=null, dragFrac=0, WHEEL_PX=180;
// smooth (eased) scrolling for the continuous lists: animate the rendered position toward a target
var firstRowT=0, navScrollT=0, homeScrollT=0, PL_MAXPX=0, scrollTimer=null;
function scrollTick(){
  var moving=false, mm=false, nm=false, d1=firstRowT-firstRow, d2=navScrollT-navScroll, d3=homeScrollT-homeScroll;
  if(Math.abs(d1)>=0.5){ firstRow+=d1*0.25; moving=true; mm=true; } else firstRow=firstRowT;
  if(Math.abs(d3)>=0.5){ homeScroll+=d3*0.25; moving=true; mm=true; } else homeScroll=homeScrollT;
  if(Math.abs(d2)>=0.5){ navScroll+=d2*0.25; moving=true; nm=true; } else navScroll=navScrollT;
  if(mm) repaintMain(); if(nm) repaintNav();   // repaint only the region that's scrolling -> high fps
  if(!moving) stopScrollAnim();
}
function startScrollAnim(){ if(!scrollTimer) scrollTimer=window.SetInterval(scrollTick,16); }
function stopScrollAnim(){ if(scrollTimer){ window.ClearInterval(scrollTimer); scrollTimer=null; } }
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
  drawIcon(gr,'more',COL.text,cx,cy,24,24,18);
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
// Pixel-based scrollbar: thumb size/pos from viewport vs content height, position from scrollPx/maxPx.
function drawScrollbar(gr,sx,top,h,scrollPx,maxPx,viewH,contentH,show){
  if(contentH<=viewH || h<=6 || !show){ SB=null; return; }   // hidden until the section is hovered
  var sw=6;
  gr.FillSolidRect(sx,top,sw,h,RGBA(255,255,255,20));
  var thumbH=Math.max(36,Math.round(h*viewH/contentH)); if(thumbH>h) thumbH=h;
  var ty=top+(maxPx>0?Math.round((h-thumbH)*scrollPx/maxPx):0);
  var on=(drag==='scroll')||hv(sx-6,top,sx+sw+6,top+h);
  gr.FillSolidRect(sx,ty,sw,thumbH,RGBA(255,255,255,on?175:95));
  SB={x0:sx-6,y0:top,x1:sx+sw+6,y1:top+h,top:top,h:h,thumbH:thumbH,maxPx:maxPx};
}
function setScroll(y){
  if(!SB) return;
  var frac=clamp01((y-SB.top-SB.thumbH/2)/Math.max(1,SB.h-SB.thumbH));
  if(view==='playlist'){ firstRow=firstRowT=Math.round(frac*SB.maxPx); }    // continuous (pixels); sync target so easing doesn't fight the drag
  else if(view==='home'){ homeScroll=homeScrollT=Math.round(frac*SB.maxPx); }   // continuous (pixels)
  repaintMain();
}
// Dedicated scrollbar for the sidebar playlist list (independent of the main view).
function drawScrollbarN(gr,sx,top,h,scrollPx,maxPx,viewH,contentH,show){
  if(contentH<=viewH || h<=6 || !show){ SBN=null; return; }   // hidden until the section is hovered
  var sw=5;
  gr.FillSolidRect(sx,top,sw,h,RGBA(255,255,255,16));
  var thumbH=Math.max(30,Math.round(h*viewH/contentH)); if(thumbH>h) thumbH=h;
  var ty=top+(maxPx>0?Math.round((h-thumbH)*scrollPx/maxPx):0);
  var on=(drag==='scrolln')||hv(sx-6,top,sx+sw+6,top+h);
  gr.FillSolidRect(sx,ty,sw,thumbH,RGBA(255,255,255,on?150:80));
  SBN={x0:sx-6,y0:top,x1:sx+sw+6,y1:top+h,top:top,h:h,thumbH:thumbH,maxPx:maxPx};
}
function setScrollN(y){ if(!SBN) return; var frac=clamp01((y-SBN.top-SBN.thumbH/2)/Math.max(1,SBN.h-SBN.thumbH)); navScroll=navScrollT=Math.round(frac*SBN.maxPx); repaintNav(); }
// create a uniquely-named empty playlist, return its index
function newPlaylistName(){ var b='New Playlist', nm=b, k=1, i; for(;;){ var hit=false; for(i=0;i<plman.PlaylistCount;i++){ if(plman.GetPlaylistName(i)===nm){ hit=true; break; } } if(!hit) return nm; k++; nm=b+' '+k; } }
function createNewPlaylist(){ return plman.CreatePlaylist(plman.PlaylistCount, newPlaylistName()); }
var rightTab='queue';
var view='home', viewArtist='', artistAlbums=[], homeScroll=0, artScroll=0;
// Fullscreen "chill" mode + its sub-view (default now-playing / lyrics / visualizer)
var fsMode=false, fsView='default', HB_FS=[], vizTimer=null, vizBars=[], fsBgCache={key:null,img:null};
var vizStyle='bars', vizMenuOpen=false, VIZ_MENU_HB=[], vizWave=[];
var VIZ_STYLES=[['Bars','bars'],['Mirrored','mirror'],['Waveform','wave'],['Radial','radial']];
function vizStyleLabel(){ for(var i=0;i<VIZ_STYLES.length;i++) if(VIZ_STYLES[i][1]===vizStyle) return VIZ_STYLES[i][0]; return 'Bars'; }
// Keyboard capture on only in Search view. Re-asserted every full paint + on_size
// because JSplitter can reset window.DlgCode on resize/reload.
function applyKeyMode(){ try{ window.DlgCode=(view==='search'||renameEdit)?DLGC_WANTALLKEYS:0; }catch(e){} }
var ROUTE='__spotify_np__'; // hidden playlist used to play library tracks (artist page / search)
/* ------------------------- custom shuffle engine ------------------------- */
// Shuffle plays from a hidden shuffled copy so the "next up" list is the real order.
// Reshuffles every time shuffle is toggled on / a playlist is started while shuffle is on.
var SHUF='__spotify_shuffle__', shufSrcName='';   // shufSrcName = the real playlist we shuffled from
function isHiddenPl(nm){ return nm===ROUTE || nm===SHUF; }
function playlistOfName(nm){ for(var i=0;i<plman.PlaylistCount;i++) if(plman.GetPlaylistName(i)===nm) return i; return -1; }
function handleArray(pi){ var it=getItems(pi), a=[]; if(it){ for(var i=0;i<it.Count;i++) a.push(it[i]); } return a; }
function sameHandle(a,b){ return !!(a&&b&&a.Path===b.Path); }
function indexOfHandle(arr,h){ if(!h) return -1; for(var i=0;i<arr.length;i++) if(sameHandle(arr[i],h)) return i; return -1; }
function shuffleArr(a){ for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)), t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
function playShuffled(pi,startHandle,name,preservePos){   // build hidden shuffled copy of pi (start first) and play it
  var arr=handleArray(pi); if(!arr.length) return;
  shuffleArr(arr);
  if(startHandle){ var ci=indexOfHandle(arr,startHandle); if(ci>=0) arr.splice(ci,1); arr.unshift(startHandle); }
  if(name!==undefined && !isHiddenPl(name)) shufSrcName=name;
  var pl=plman.FindOrCreatePlaylist(SHUF,true);
  try{ plman.ClearPlaylist(pl); }catch(e){}
  var hl=fb.CreateHandleList(); for(var i=0;i<arr.length;i++) hl.Add(arr[i]);
  plman.InsertPlaylistItems(pl,0,hl,false);
  var savedActive=plman.ActivePlaylist, wasActive=(fb.IsPlaying||fb.IsPaused), pos=fb.PlaybackTime;
  plman.ExecutePlaylistDefaultAction(pl,0);
  try{ plman.ActivePlaylist=savedActive; }catch(e){}   // keep the user's viewed playlist, not the hidden one
  if(preservePos && wasActive && pos>0){ try{ fb.PlaybackTime=pos; }catch(e){} }
  invalidateItems();
}
function shuffleEnterFromCurrent(){   // toggled shuffle ON mid-playback -> reshuffle the current source, keep current track
  var loc=plman.GetPlayingItemLocation?plman.GetPlayingItemLocation():null;
  var src=(loc&&loc.IsValid)?loc.PlaylistIndex:plman.ActivePlaylist; if(src<0) return;
  playShuffled(src,NP,plman.GetPlaylistName(src),true);
}
function shuffleExitToSource(){   // toggled shuffle OFF -> resume the real playlist at the current track, in order
  var si=playlistOfName(shufSrcName); if(si<0) return;
  var it=getItems(si), idx=0; if(it){ for(var i=0;i<it.Count;i++) if(sameHandle(it[i],NP)){ idx=i; break; } }
  var savedActive=plman.ActivePlaylist, wasActive=(fb.IsPlaying||fb.IsPaused), pos=fb.PlaybackTime;
  plman.ExecutePlaylistDefaultAction(si,idx);
  try{ plman.ActivePlaylist=savedActive; }catch(e){}
  if(wasActive && pos>0){ try{ fb.PlaybackTime=pos; }catch(e){} }
}
function playPlaylistItem(pl,item){   // clicking a track: shuffle-aware
  if(pbShuffle) playShuffled(pl,getItems(pl)[item],plman.GetPlaylistName(pl),false);
  else plman.ExecutePlaylistDefaultAction(pl,item);
}
// is the now-playing track this playlist's shuffled source? (for highlighting the right row)
function npIsShuffleOf(name){ return pbShuffle && NP && name===shufSrcName; }
var searchQuery='', searchScroll=0, searchIdx=null, searchQ2=null, searchArts=[], searchTrks=[], HB_SEARCH=null;
var HOME_MAXROW=0, ART_MAXBLOCK=0;
// Home "Your Playlists" horizontal shelf: scroll offset (card index), max, wheel hit-band, h-scrollbar.
var plScroll=0, HOME_PLMAX=0, HOME_SHELF_Y0=0, HOME_SHELF_Y1=0, SBH=null;
function drawScrollbarH(gr,sx,top,w,scrollX,maxX,viewW,contentW,show){
  if(contentW<=viewW || w<=6 || !show){ SBH=null; return; }   // hidden until the section is hovered
  var sh=5;
  gr.FillSolidRect(sx,top,w,sh,RGBA(255,255,255,20));
  var thumbW=Math.max(40,Math.round(w*viewW/contentW)); if(thumbW>w) thumbW=w;
  var tx=sx+(maxX>0?Math.round((w-thumbW)*scrollX/maxX):0);
  var on=(drag==='scrollh')||hv(sx,top-6,sx+w,top+sh+6);
  gr.FillSolidRect(tx,top,thumbW,sh,RGBA(255,255,255,on?175:95));
  SBH={x0:sx,y0:top-6,x1:sx+w,y1:top+sh+6,left:sx,w:w,thumbW:thumbW,maxIdx:HOME_PLMAX};
}
function setScrollH(x){   // shelf stays card-stepped
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
function repaintBar(){ if(fsMode){ repaintAll(); return; } dirtyBar=true; window.RepaintRect(0,R.barY,W,M.barH); }

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
  if(fsMode){ dirtyAll=false; dirtyBar=false; dirtyQueue=false; dirtySearch=false; dirtyMain=false; dirtyNav=false; HB_DOTS=[]; drawFullscreen(gr); return; }
  var anyPartial=dirtyBar||dirtyQueue||dirtySearch||dirtyMain||dirtyNav;
  if(dirtyAll || !anyPartial){          // full paint, or an OS/stale paint we can't scope -> repaint everything
    dirtyAll=false; dirtyBar=false; dirtyQueue=false; dirtySearch=false; dirtyMain=false; dirtyNav=false;
    HB_DOTS=[];
    gr.FillSolidRect(0,0,W,H,COL.base);   // Spotify's real bg (#121212); no base-vs-black seam behind panels
    drawTitleBar(gr);
    drawNav(gr);
    drawMain(gr);
    drawQueue(gr);
    drawBar(gr);
    drawOverlays(gr);
    return;
  }
  // partial composite: only the regions actually flagged (each drawn over live content)
  if(dirtyMain||dirtyNav) HB_DOTS=[];   // these rebuild their hover targets
  if(dirtyMain){ dirtyMain=false; drawMain(gr); }
  if(dirtyNav){ dirtyNav=false; drawNav(gr); }
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
  drawIcon(gr,'home',hon?COL.text:COL.text2,hx,iy,bw,bh,26);
  HB_HOME={x0:hx,y0:iy,x1:hx+bw,y1:iy+bh};
  var son=(view==='search'), shov=hv(sx2,iy,sx2+bw,iy+bh);
  if(son||shov) gr.FillRoundRect(sx2,iy,bw,bh,10,10,son?COL.rowActive:COL.rowHover);
  drawIcon(gr,'search',son?COL.text:COL.text2,sx2,iy,bw,bh,26);
  HB_SEARCH={x0:sx2,y0:iy,x1:sx2+bw,y1:iy+bh};
  // library card
  panelBg(gr,R.navLib,COL.base);
  tL(gr,'Your Library',FONT.lib,COL.text2,R.navLib.x+18,R.navLib.y+14,R.navLib.w-56,26);
  var active=plman.ActivePlaylist;
  var pls=[]; for(var i=0;i<plman.PlaylistCount;i++){ if(!isHiddenPl(plman.GetPlaylistName(i))) pls.push(i); }
  // pinned "add playlist" footer at the very bottom (always visible)
  var footH=94, footTop=R.navLib.y+R.navLib.h-footH;
  // scrollable playlist list (continuous pixel scroll), cropped just above the footer
  var listTop=R.navLib.y+52, rh=58, cropY=footTop-6, viewH=cropY-listTop;
  var contentH=pls.length*rh, maxPx=Math.max(0,contentH-viewH);   // navScroll is a PIXEL offset
  NAV_MAX=maxPx;
  if(navScroll>maxPx) navScroll=maxPx; if(navScroll<0) navScroll=0;
  if(navScrollT>maxPx) navScrollT=maxPx; if(navScrollT<0) navScrollT=0;
  for(var k=Math.floor(navScroll/rh); k<pls.length; k++){
    var ry=listTop+k*rh-navScroll; if(ry>=cropY) break;
    var i2=pls[k], nm=plman.GetPlaylistName(i2);
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
  // crop partial rows top & bottom, redraw the sticky "Your Library" title, then the scrollbar
  gr.FillSolidRect(R.navLib.x,listTop-rh,R.navLib.w,rh,COL.base);
  gr.FillSolidRect(R.navLib.x,cropY,R.navLib.w,R.navLib.y+R.navLib.h-cropY,COL.base);
  tL(gr,'Your Library',FONT.lib,COL.text2,R.navLib.x+18,R.navLib.y+14,R.navLib.w-56,26);
  drawScrollbarN(gr,R.navLib.x+R.navLib.w-9,listTop,viewH,navScroll,maxPx,viewH,contentH,hv(R.navLib.x,R.navLib.y,R.navLib.x+R.navLib.w,R.navLib.y+R.navLib.h)||drag==='scrolln');
  // dashed "drag a file / click to create" box (hint stays this size; whole section is the drop target)
  var bx=R.navLib.x+14, bw2=R.navLib.w-28, by=footTop+5, bh2=footH-14;
  var addHov=navDropHover||hv(bx,by,bx+bw2,by+bh2);
  var dcol=navDropHover?COL.green:(addHov?COL.text:COL.text2);
  if(navDropHover) gr.FillRoundRect(bx,by,bw2,bh2,10,10,RGBA(30,215,96,30));
  dashRect(gr,bx,by,bw2,bh2,dcol,6,5,2);
  var cy0=by+Math.round((bh2-63)/2);   // vertically-centred content block (icon + 2 lines), padded off the border
  drawIcon(gr,'add',dcol,bx,cy0,bw2,22,22);
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
  var rowsTop=listTop+34, rh=M.rowH, cropY=r.y+r.h, viewH=cropY-rowsTop;
  var contentH=p.count*rh, maxPx=Math.max(0,contentH-viewH);   // firstRow is now a PIXEL offset (continuous scroll)
  PL_MAXPX=maxPx;
  if(firstRow>maxPx) firstRow=maxPx; if(firstRow<0) firstRow=0;
  if(firstRowT>maxPx) firstRowT=maxPx; if(firstRowT<0) firstRowT=0;
  var playingLoc=plman.GetPlayingItemLocation ? plman.GetPlayingItemLocation() : null;
  var items=getItems(p.i), meta=getMeta(p.i), shufHere=npIsShuffleOf(p.name);
  for(var j=Math.floor(firstRow/rh); j<p.count; j++){
    var ry=rowsTop+j*rh-firstRow; if(ry>=cropY) break;
    var h=items[j]; if(!h){ continue; }
    var isPlaying=(playingLoc && playingLoc.IsValid && playingLoc.PlaylistIndex===p.i && playingLoc.PlaylistItemIndex===j)
                  || (shufHere && sameHandle(h,NP));   // playing from the hidden shuffle copy of this playlist
    var isHover=hv(r.x,ry,r.x+r.w,ry+rh);
    if(isHover) gr.FillRoundRect(lx-8,ry,rx-lx+16,rh,4,4,COL.rowHover);
    var titleCol=isPlaying?COL.green:COL.text;
    if(isHover) drawIcon(gr,'play',COL.text,lx,ry,numW,rh,14);
    else tL(gr,String(j+1),FONT.rowNum,isPlaying?COL.green:COL.text2,lx,ry,numW,rh);
    var cs=40, cy=ry+(rh-cs)/2, alb=meta.album[j];
    drawCover(gr,titleX,cy,cs,3,h,alb||String(j),meta.artkey[j]);
    var ttx=titleX+cs+12, ttw=titleW-cs-12;
    tL(gr,meta.title[j],FONT.rowTitle,titleCol,ttx,ry+8,ttw,20);
    tL(gr,meta.artist[j],FONT.rowArtist,COL.text2,ttx,ry+30,ttw,16);
    tL(gr,alb,FONT.rowCell,COL.text2,albumX,ry,albumW,rh);
    tR(gr,meta.len[j],FONT.rowCell,COL.text2,rx-durW,ry,durW,rh);
    HB_TR.push({x0:lx-8,y0:ry,x1:rx+8,y1:ry+rh,pl:p.i,item:j});
  }
  // crop the partial rows top & bottom, then draw the sticky column header on top
  gr.FillSolidRect(r.x,rowsTop-rh,r.w,rh,COL.base);
  gr.FillSolidRect(r.x,cropY,r.w,M.pad+2,COL.base);
  tL(gr,'#',FONT.head,COL.text2,lx,listTop,numW,20);
  tL(gr,'TITLE',FONT.head,COL.text2,titleX,listTop,titleW,20);
  tL(gr,'ALBUM',FONT.head,COL.text2,albumX,listTop,albumW,20);
  drawIcon(gr,'clock',COL.text2,rx-16,listTop,16,20,15);
  gr.DrawLine(lx,listTop+26,rx,listTop+26,1,COL.line);
  drawScrollbar(gr,rx+8,rowsTop,viewH,firstRow,maxPx,viewH,contentH,hv(r.x,r.y,r.x+r.w,cropY)||drag==='scroll');
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
function drawArtistCard(gr,x,y,w,a,clipTop,clipBot){
  gr.FillRoundRect(x,y,w,w+56,8,8,hv(x,y,x+w,y+w+56)?RGB(40,40,40):COL.elev);
  var cs=w-24;
  drawCircle(gr,x+12,y+12,cs,artistCover(a.name,a.handle),a.name);
  tC(gr,a.name,FONT.card,COL.text,x+12,y+cs+18,w-24,20);
  tC(gr,'Artist',FONT.plSub,COL.text2,x+12,y+cs+40,w-24,16);
  var hy0=y, hy1=y+w+56;                                   // clip the click target to the scroll viewport
  if(clipTop!==undefined && hy0<clipTop) hy0=clipTop;
  if(clipBot!==undefined && hy1>clipBot) hy1=clipBot;
  if(hy1>hy0) HB_CARD.push({x0:x,y0:hy0,x1:x+w,y1:hy1,kind:'artist',id:a.name});
}
function drawHome(gr,r){
  HB_CARD=[];
  var pad=M.cpad, x0=r.x+pad, w=r.w-pad*2, rightEdge=r.x+r.w, i;
  var gap=16, cardW=176, cols=Math.max(2,Math.floor((w+gap)/(cardW+gap)));
  cardW=Math.floor((w-gap*(cols-1))/cols);
  var cardH=cardW+56;
  // ---- geometry ----
  var shelfTitleY=r.y+18, shelfY=shelfTitleY+42;
  var pls=[]; for(i=0;i<plman.PlaylistCount;i++){ if(!isHiddenPl(plman.GetPlaylistName(i))) pls.push(i); }
  var scardW=(pls.length>cols)?Math.floor((w-cols*gap)/(cols+0.4)):cardW, scardH=scardW+56;
  var artTitleY=shelfY+scardH+(pls.length>cols?26:16), gy=artTitleY+42;   // artist grid top
  var cropY=r.y+r.h, rowStep=cardH+8, viewH=cropY-gy;
  var arts=getArtistList();
  var totalRows=Math.max(1,Math.ceil(arts.length/cols)), contentH=totalRows*rowStep, maxPx=Math.max(0,contentH-viewH);
  HOME_MAXROW=maxPx;   // pixels now (continuous artist grid)
  if(homeScroll>maxPx) homeScroll=maxPx; if(homeScroll<0) homeScroll=0;
  if(homeScrollT>maxPx) homeScrollT=maxPx; if(homeScrollT<0) homeScrollT=0;

  // ---- 1) artist grid (continuous; the top partial row overflows up, cleared below) ----
  for(i=Math.floor(homeScroll/rowStep)*cols; i<arts.length; i++){
    var col=(i%cols), row=Math.floor(i/cols), ay=gy+row*rowStep-homeScroll;
    if(ay>=cropY) break;
    if(ay+cardH<=gy) continue;
    drawArtistCard(gr,x0+col*(cardW+gap),ay,cardW,arts[i],gy,cropY);
  }
  gr.FillSolidRect(r.x,cropY,r.w,M.pad+2,COL.base);              // crop below the grid

  // ---- 2) shelf + section titles drawn ON TOP (covers the grid's top overflow) ----
  gr.FillSolidRect(r.x,r.y,r.w,gy-r.y,COL.base);                 // clear the whole band above the grid viewport
  tL(gr,'Your Playlists',FONT.sect2,COL.text,x0,shelfTitleY,w,28);
  HOME_PLMAX=Math.max(0,pls.length-cols);
  if(plScroll>HOME_PLMAX) plScroll=HOME_PLMAX; if(plScroll<0) plScroll=0;
  for(i=plScroll;i<pls.length;i++){
    var cx=x0+(i-plScroll)*(scardW+gap); if(cx>=rightEdge) break;
    drawPlaylistCard(gr,cx,shelfY,scardW,pls[i]);
  }
  gr.FillSolidRect(rightEdge,shelfY,M.gap+2,scardH+2,COL.base);
  HOME_SHELF_Y0=shelfY; HOME_SHELF_Y1=shelfY+scardH;
  var sbY=shelfY+scardH+6;
  drawScrollbarH(gr,x0,sbY,w,plScroll*(scardW+gap),HOME_PLMAX*(scardW+gap),w,pls.length*(scardW+gap),hv(x0,shelfY,rightEdge,sbY+10)||drag==='scrollh');
  tL(gr,'Artists in your library',FONT.sect2,COL.text,x0,artTitleY,w,28);

  // ---- 3) artist scrollbar (continuous, pixel) ----
  drawScrollbar(gr,x0+w+8,gy,viewH,homeScroll,maxPx,viewH,contentH,hv(x0,gy,x0+w+16,cropY)||drag==='scroll');
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
  drawIcon(gr,'search',COL.text2,x0+16,boxY,22,boxH,18);
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
    var viewTop=r.y+64, viewBot=r.y+r.h-16, maxW=r.w-28, li;
    var L=lyLayout(gr,maxW), subLh=L.subLh, s;
    if(lyrics.synced){
      drawRollingLyrics(gr,r.x+14,viewTop,maxW,viewBot,FONT.lyric,COL.green,'c');
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

  var rh=56, bottom=r.y+r.h-8, shown=0, qi;
  // playback-mode indicators (update the instant you toggle shuffle / repeat)
  drawIcon(gr,'shuffle',pbShuffle?COL.green:COL.text3,r.x+r.w-40,qy,22,24,18);
  drawIcon(gr,pbRepeat===2?'repeat1':'repeat',pbRepeat>0?COL.green:COL.text3,r.x+r.w-70,qy,22,24,18);
  // real manual queue (explicitly-queued tracks) first, if any
  var mq=null; try{ mq=plman.GetPlaybackQueueHandles(); }catch(e){ mq=null; }
  if(mq && mq.Count){
    tL(gr,'Next in queue',FONT.sect,COL.text,x,qy,r.w-110,24); qy+=36;
    for(qi=0;qi<mq.Count && shown<18;qi++){
      if(qy+rh>bottom) break;
      var qh=mq[qi]; if(!qh) continue;
      drawCover(gr,x,qy,44,4,qh,'mq'+qi);
      tL(gr,TF.title.EvalWithMetadb(qh),FONT.qName,COL.text,x+56,qy+5,r.w-36-56,18);
      tL(gr,TF.artist.EvalWithMetadb(qh),FONT.qArtist,COL.text2,x+56,qy+25,r.w-36-56,16);
      qy+=rh; shown++;
    }
    qy+=10;
  }
  // "Next up" from the playing playlist
  var loc=plman.GetPlayingItemLocation?plman.GetPlayingItemLocation():null;
  var pli=(loc&&loc.IsValid)?loc.PlaylistIndex:plman.ActivePlaylist;
  var start=(loc&&loc.IsValid)?loc.PlaylistItemIndex+1:0;
  var rawnm=(pli>=0)?plman.GetPlaylistName(pli):'';
  var pnm=(rawnm===SHUF)?shufSrcName:(rawnm===ROUTE?'':rawnm);   // show the real source, not the hidden copy
  if(qy+30<bottom){
    tL(gr,pnm?('Next from: '+pnm):'Next up',FONT.sect,COL.text,x,qy,r.w-110,24); qy+=36;
    if(pli>=0){
      var items=getItems(pli), qmeta=getMeta(pli), cnt=plman.PlaylistItemCount(pli);
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
}
TF.npAlbumSeed=function(){ return TF.album.Eval()||'np'; };

function ctrlBtn(gr,name,cx,cyc,active,act){
  drawIcon(gr,name,active?COL.green:(hv(cx-18,cyc-18,cx+18,cyc+18)?COL.text:COL.text2),cx-18,cyc-18,36,36,22);
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
  var shufOn=pbShuffle, repMode=pbRepeat;
  ctrlBtn(gr,'shuffle',cxC-92,pcy,shufOn,'shuffle');
  ctrlBtn(gr,'prev',cxC-50,pcy,false,'prev');
  gr.FillEllipse(pbx,pby,pb,pb,COL.text);
  drawIcon(gr,playing?'pause':'play',COL.black,pbx,pby,pb,pb,Math.round(pb*0.5));
  HB_CTRL.push({x0:pbx,y0:pby,x1:pbx+pb,y1:pby+pb,act:'play'});
  ctrlBtn(gr,'next',cxC+50,pcy,false,'next');
  ctrlBtn(gr,repMode===2?'repeat1':'repeat',cxC+92,pcy,repMode>0,'repeat');
  var sbW=Math.min(Math.round(W*0.34),520), sbX=cxC-sbW/2, sbY=by+54;
  var len=fb.PlaybackLength, pos=(drag==='seek')?dragFrac:(len>0?fb.PlaybackTime/len:0);
  gr.FillSolidRect(sbX,sbY,sbW,4,COL.seekbg);
  if(pos>0) gr.FillSolidRect(sbX,sbY,Math.max(1,Math.round(sbW*pos)),4,COL.text);
  tR(gr,fmtTime((drag==='seek')?len*dragFrac:fb.PlaybackTime),FONT.time,COL.text2,sbX-48,sbY-6,42,16);
  tL(gr,fmtTime(len),FONT.time,COL.text2,sbX+sbW+8,sbY-6,42,16);
  HB_SEEK={x0:sbX,y0:sbY-9,x1:sbX+sbW,y1:sbY+13,x:sbX,w:sbW};
  // right: volume (Preferences now lives in the File/Library menu up top)
  var gearC=by+M.barH/2;
  var fsx=W-40;   // enter-fullscreen button, far right
  drawIcon(gr,'expand',hv(fsx-6,gearC-14,fsx+26,gearC+14)?COL.text:COL.text2,fsx,gearC-12,24,24,20);
  HB_CTRL.push({x0:fsx-6,y0:gearC-14,x1:fsx+26,y1:gearC+14,act:'fullscreen'});
  var volW=92, volX=fsx-20-volW, volY=gearC-2;
  drawIcon(gr,'volume',COL.text2,volX-28,gearC-12,24,24,20);
  var vp=clamp01(vol2pos(fb.Volume));
  gr.FillSolidRect(volX,volY,volW,4,COL.seekbg);
  gr.FillSolidRect(volX,volY,Math.max(1,Math.round(volW*vp)),4,COL.text);
  HB_VOL={x0:volX,y0:volY-9,x1:volX+volW,y1:volY+13,x:volX,w:volW};
}

/* ------------------------- fullscreen "chill" mode ------------------------- */
function enterFullscreen(){ fsMode=true; try{ if(UIWizard && UIWizard.WindowState!==1) UIWizard.ToggleMaximize(); }catch(e){} if(fsView==='viz') startViz(); if(fsView==='lyrics'){ loadLyrics(); lySnap=true; } repaintAll(); }
function exitFullscreen(){ fsMode=false; vizMenuOpen=false; stopViz(); repaintAll(); }
function setFsView(v){ fsView=v; vizMenuOpen=false; if(v==='viz') startViz(); else stopViz(); if(v==='lyrics'){ loadLyrics(); lySnap=true; } repaintAll(); }
function doFsAct(act){
  if(act==='exit') exitFullscreen();
  else if(act==='lyrics'){ vizMenuOpen=false; setFsView(fsView==='lyrics'?'default':'lyrics'); }
  else if(act==='viz'){ vizMenuOpen=false; setFsView(fsView==='viz'?'default':'viz'); }
  else if(act==='vizmenu'){ vizMenuOpen=!vizMenuOpen; repaintAll(); }
}
// ---- audio spectrum visualizer (real PCM via fb.GetAudioChunk -> FFT bars) ----
var VIZ_N=56;
function vizUpdate(){
  if(!fsMode || fsView!=='viz'){ stopViz(); return; }
  var N=512, re=new Array(N), im=new Array(N), i, ok=false;
  try{
    var ch=fb.GetAudioChunk(0.06);
    if(ch && ch.SampleCount>0){
      var d=ch.Data, cc=ch.ChannelCount||2, sc=ch.SampleCount, step=Math.max(1,Math.floor(sc/N));
      var wv=[];
      for(i=0;i<N;i++){ var si=(i*step)*cc, v=0; if(si<d.length){ for(var c=0;c<cc;c++) v+=d[si+c]||0; v/=cc; } wv[i]=v; var w=0.5-0.5*Math.cos(2*Math.PI*i/(N-1)); re[i]=v*w; im[i]=0; }
      vizWave=wv;   // raw mono for the waveform style
      ok=true;
    }
  }catch(e){ ok=false; }
  if(!ok){ for(i=0;i<VIZ_N;i++) vizBars[i]=(vizBars[i]||0)*0.82; repaintAll(); return; }
  // simple DFT-ish magnitude via naive FFT (N=512, power of 2)
  fftMag(re,im,N);
  var bars=[], nb=VIZ_N, half=N/2;
  for(i=0;i<nb;i++){
    var f0=Math.floor(Math.pow(half,i/nb)), f1=Math.max(f0+1,Math.floor(Math.pow(half,(i+1)/nb))), m=0;
    for(var f=f0;f<f1 && f<half;f++){ var mag=Math.sqrt(re[f]*re[f]+im[f]*im[f]); if(mag>m) m=mag; }
    var val=clamp01(Math.log(1+m*8)/3.5);
    vizBars[i]=Math.max(val,(vizBars[i]||0)*0.80);   // smooth falloff
  }
  repaintAll();
}
function fftMag(re,im,n){
  var i,j=0,k,l,t; for(i=1;i<n;i++){ var bit=n>>1; for(;j&bit;bit>>=1) j^=bit; j^=bit; if(i<j){ t=re[i];re[i]=re[j];re[j]=t; t=im[i];im[i]=im[j];im[j]=t; } }
  for(l=2;l<=n;l<<=1){ var ang=-2*Math.PI/l, wr=Math.cos(ang), wi=Math.sin(ang); for(i=0;i<n;i+=l){ var cr=1,ci=0; for(k=0;k<l/2;k++){ var pr=re[i+k], pi=im[i+k], qr=cr*re[i+k+l/2]-ci*im[i+k+l/2], qi=cr*im[i+k+l/2]+ci*re[i+k+l/2]; re[i+k]=pr+qr; im[i+k]=pi+qi; re[i+k+l/2]=pr-qr; im[i+k+l/2]=pi-qi; var ncr=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=ncr; } } }
}
function startViz(){ if(!vizTimer){ vizTimer=window.SetInterval(vizUpdate,45); } }
function stopViz(){ if(vizTimer){ window.ClearInterval(vizTimer); vizTimer=null; } }
// darkened, cover-fit album background (cached per art+size)
function fsBg(gr){
  var art=getArt(NP), key=(art?albKey(NP):'none')+'|'+W+'x'+H;
  if(fsBgCache.key!==key){
    var bmp=null;
    try{
      bmp=gdi.CreateImage(W,H); var g=bmp.GetGraphics();
      if(art){ var s=Math.max(W/art.Width,H/art.Height), dw=art.Width*s, dh=art.Height*s; g.DrawImage(art,Math.round((W-dw)/2),Math.round((H-dh)/2),Math.round(dw),Math.round(dh),0,0,art.Width,art.Height); g.FillSolidRect(0,0,W,H,RGBA(0,0,0,150)); }
      else { g.FillSolidRect(0,0,W,H,RGB(28,28,34)); }
      g.FillGradRect(0,H-320,W,320,90,RGBA(0,0,0,0),RGBA(0,0,0,150),1.0);
      bmp.ReleaseGraphics(g);
    }catch(e){ bmp=null; }
    fsBgCache={key:key,img:bmp};
  }
  if(fsBgCache.img) gr.DrawImage(fsBgCache.img,0,0,W,H,0,0,fsBgCache.img.Width,fsBgCache.img.Height);
  else gr.FillSolidRect(0,0,W,H,RGB(24,24,28));
}
function fsIcon(gr,name,col,x,y,sz,act){
  drawIcon(gr,name,hv(x-8,y-8,x+sz+8,y+sz+8)?COL.text:col,x,y,sz,sz,sz);
  HB_FS.push({x0:x-8,y0:y-8,x1:x+sz+8,y1:y+sz+8,act:act});
}
function fsMiniNP(gr){   // small cover + title + artist, top-left (lyrics/viz views)
  var s=64;
  drawRounded(gr,64,48,s,6,NP,'np');
  tL(gr,npTitleStr||'Nothing playing',FONT.sect2,COL.text,64+s+18,54,W/2,26);
  tL(gr,npArtistStr,FONT.qName,COL.text2,64+s+18,86,W/2,20);
}
function drawFsDefault(gr,bot){
  var sz=Math.min(360,Math.round(H*0.36)), ax=72, ay=bot-sz;
  drawRounded(gr,ax,ay,sz,12,NP,'np');
  var tx=ax+sz+40, tw=W-tx-72;
  tL(gr,npTitleStr||'Nothing playing',FONT.title,COL.text,tx,ay+sz-150,tw,90);
  tL(gr,npArtistStr,FONT.sect2,COL.text2,tx,ay+sz-46,tw,32);
}
function drawFsLyrics(gr,bot){
  fsMiniNP(gr);
  if(!lyrics || lyrics==='none' || !lyrics.lines || !lyrics.lines.length){ tC(gr,'No lyrics found',FONT.sect2,COL.text2,0,Math.round(H*0.45),W,40); return; }
  if(lyrics.synced) drawRollingLyrics(gr,140,150,W-280,bot,FONT.fsLyric,COL.green,'l');
  else { stopLyAnim(); var L=lyLayout(gr,W-280,FONT.fsLyric), yy=170, s; for(var li=0;li<lyrics.lines.length;li++){ var p=L.subs[li]; for(s=0;s<p.length&&yy+L.subLh<=bot;s++){ tL(gr,p[s],FONT.fsLyric,COL.text2,140,yy,W-280,L.subLh); yy+=L.subLh; } yy+=Math.round(L.subLh*0.4); if(yy>=bot) break; } }
}
function withA(c,a){ return ((a&0xff)<<24)|(c&0xffffff); }
function drawFsViz(gr,bot){
  fsMiniNP(gr);
  var top=200, cy=Math.round((top+bot)/2), n=VIZ_N, i;
  var hue=artHue(NP,'np');
  var cBot=COL.green, cTop=blend(blend(COL.green,COL.text,0.55),hue,0.20);   // bright, lightly album-tinted
  var gLow=withA(COL.green,70), gZero=withA(COL.green,0);
  if(vizStyle==='wave'){
    var pts=vizWave.length?vizWave:[], amp=(bot-top)/2-16, px=150, pw=W-300, m=Math.max(1,pts.length-1), xs=[], ys=[], k;
    for(k=0;k<pts.length;k++){ xs[k]=px+Math.round(pw*k/m); ys[k]=cy-Math.round(Math.max(-1,Math.min(1,pts[k]))*amp); }
    for(k=0;k<pts.length;k++){ var hgt=Math.abs(ys[k]-cy); if(hgt>1) gr.FillSolidRect(xs[k],Math.min(ys[k],cy),2,hgt,withA(COL.green,24)); }   // soft body
    var pass=[[8,withA(cTop,38)],[4,withA(cTop,110)],[2,cTop]];                          // glow -> bright line
    for(var pp=0;pp<pass.length;pp++){ for(k=1;k<pts.length;k++) gr.DrawLine(xs[k-1],ys[k-1],xs[k],ys[k],pass[pp][0],pass[pp][1]); }
    if(!pts.length) gr.DrawLine(px,cy,px+pw,cy,2,cTop);
  } else if(vizStyle==='radial'){
    var ccx=Math.round(W/2), ccy=cy, R=Math.round(Math.min(bot-top,W*0.42)/2-24), maxLen=Math.round(R*0.85);
    for(i=0;i<n;i++){
      var vv=vizBars[i]||0, ang=(i/n)*Math.PI*2-Math.PI/2, ln=10+vv*maxLen;
      var ix=ccx+Math.cos(ang)*R, iy=ccy+Math.sin(ang)*R, ox=ccx+Math.cos(ang)*(R+ln), oy=ccy+Math.sin(ang)*(R+ln);
      gr.DrawLine(ix,iy,ox,oy,6,withA(cTop,55));    // glow
      gr.DrawLine(ix,iy,ox,oy,3,cTop);
      gr.FillEllipse(ox-2.5,oy-2.5,5,5,cTop);        // rounded cap
    }
    drawCircle(gr,ccx-R+16,ccy-R+16,(R-16)*2,NP,'np');
  } else {   // bars / mirror -- gradient bars, rounded caps, reflection
    var mirror=(vizStyle==='mirror'), cell=(W-300)/n, bw=Math.max(4,Math.floor(cell*0.62)), gap=cell-bw, x0=Math.round((W-cell*n+gap)/2);
    var hh=mirror?((bot-top)/2-18):(bot-top-16), baseY=mirror?cy:(bot-14);
    for(i=0;i<n;i++){
      var v2=vizBars[i]||0, bh=Math.max(3,Math.round(v2*hh)), bx=Math.round(x0+i*cell);
      if(mirror){
        gr.FillGradRect(bx,cy-bh,bw,bh,90,cTop,cBot,1.0);
        gr.FillGradRect(bx,cy,bw,bh,90,cBot,cTop,1.0);
        if(bh>=bw){ gr.FillEllipse(bx,cy-bh-bw/2,bw,bw,cTop); gr.FillEllipse(bx,cy+bh-bw/2,bw,bw,cTop); }
      } else {
        var byT=baseY-bh;
        gr.FillGradRect(bx,byT,bw,bh,90,cTop,cBot,1.0);
        if(bh>=bw) gr.FillEllipse(bx,byT-bw/2,bw,bw,cTop);
        gr.FillGradRect(bx,baseY+3,bw,Math.round(bh*0.32),90,gLow,gZero,1.0);   // reflection
      }
    }
  }
  drawVizDropdown(gr);
}
// style-picker dropdown (top-right of the visualizer)
function drawVizDropdown(gr){
  VIZ_MENU_HB=[];
  var bw=170, bh=38, bx=W-72-bw, by=52;
  gr.FillRoundRect(bx,by,bw,bh,8,8,hv(bx,by,bx+bw,by+bh)?RGB(58,58,58):RGBA(0,0,0,90));
  tL(gr,vizStyleLabel(),FONT.pl,COL.text,bx+16,by,bw-40,bh);
  drawIcon(gr,'chevron',COL.text2,bx+bw-30,by+8,22,22,18);
  HB_FS.push({x0:bx,y0:by,x1:bx+bw,y1:by+bh,act:'vizmenu'});
  if(vizMenuOpen){
    var iy=by+bh+6;
    gr.FillSolidRect(bx+3,iy+4,bw,VIZ_STYLES.length*bh+10,RGBA(0,0,0,120));
    gr.FillRoundRect(bx,iy,bw,VIZ_STYLES.length*bh+10,8,8,RGB(43,43,43));
    for(var i=0;i<VIZ_STYLES.length;i++){
      var r=iy+5+i*bh, on=(VIZ_STYLES[i][1]===vizStyle);
      if(hv(bx,r,bx+bw,r+bh)) gr.FillRoundRect(bx+4,r,bw-8,bh,5,5,RGBA(255,255,255,20));
      tL(gr,VIZ_STYLES[i][0],FONT.pl,on?COL.green:COL.text,bx+16,r,bw-24,bh);
      VIZ_MENU_HB.push({x0:bx,y0:r,x1:bx+bw,y1:r+bh,style:VIZ_STYLES[i][1]});
    }
  }
}
function drawFsBar(gr){
  var playing=fb.IsPlaying&&!fb.IsPaused, by=H-150;
  var sbX=72, sbW=W-144, sbY=by+30;
  var len=fb.PlaybackLength, pos=(drag==='seek')?dragFrac:(len>0?fb.PlaybackTime/len:0);
  gr.FillSolidRect(sbX,sbY,sbW,4,RGBA(255,255,255,55));
  if(pos>0) gr.FillSolidRect(sbX,sbY,Math.max(1,Math.round(sbW*pos)),4,COL.text);
  tR(gr,fmtTime((drag==='seek')?len*dragFrac:fb.PlaybackTime),FONT.time,COL.text2,sbX-54,sbY-6,46,16);
  tL(gr,fmtTime(len),FONT.time,COL.text2,sbX+sbW+8,sbY-6,46,16);
  HB_SEEK={x0:sbX,y0:sbY-10,x1:sbX+sbW,y1:sbY+14,x:sbX,w:sbW};
  var cxC=Math.round(W/2), cy=by+86, pb=56, pbx=cxC-pb/2, pby=cy-pb/2;
  var shufOn=pbShuffle, repMode=pbRepeat;
  ctrlBtn(gr,'shuffle',cxC-150,cy,shufOn,'shuffle');
  ctrlBtn(gr,'prev',cxC-84,cy,false,'prev');
  gr.FillEllipse(pbx,pby,pb,pb,COL.text);
  drawIcon(gr,playing?'pause':'play',COL.black,pbx,pby,pb,pb,Math.round(pb*0.5));
  HB_CTRL.push({x0:pbx,y0:pby,x1:pbx+pb,y1:pby+pb,act:'play'});
  ctrlBtn(gr,'next',cxC+84,cy,false,'next');
  ctrlBtn(gr,repMode===2?'repeat1':'repeat',cxC+150,cy,repMode>0,'repeat');
  fsIcon(gr,'heart',COL.text2,72,cy-13,26,'like');
  var rx=W-72;
  fsIcon(gr,'compress',COL.text2,rx-26,cy-13,26,'exit');
  var volW=120, volX=rx-26-46-volW, volY=cy-2;
  drawIcon(gr,'volume',COL.text2,volX-32,cy-12,24,24,20);
  var vp=clamp01(vol2pos(fb.Volume));
  gr.FillSolidRect(volX,volY,volW,4,RGBA(255,255,255,55));
  gr.FillSolidRect(volX,volY,Math.max(1,Math.round(volW*vp)),4,COL.text);
  HB_VOL={x0:volX,y0:volY-10,x1:volX+volW,y1:volY+14,x:volX,w:volW};
  fsIcon(gr,'equalizer',fsView==='viz'?COL.green:COL.text2,volX-116,cy-13,26,'viz');
  fsIcon(gr,'mic',fsView==='lyrics'?COL.green:COL.text2,volX-74,cy-13,26,'lyrics');
}
function drawFullscreen(gr){
  HB_CTRL=[]; HB_SEEK=null; HB_VOL=null; HB_FS=[]; SB=null; SBH=null; SBN=null;
  fsBg(gr);
  var bot=H-172;
  if(fsView==='lyrics') drawFsLyrics(gr,bot);
  else if(fsView==='viz') drawFsViz(gr,bot);
  else {
    var loc=plman.GetPlayingItemLocation?plman.GetPlayingItemLocation():null, pli=(loc&&loc.IsValid)?loc.PlaylistIndex:-1;
    var rnm=(pli>=0)?plman.GetPlaylistName(pli):'';
    var src=(rnm===SHUF)?shufSrcName:((rnm&&!isHiddenPl(rnm))?rnm:'Your Library');
    tL(gr,'PLAYING FROM PLAYLIST',FONT.fsSrc,COL.text2,72,54,W-144,18);
    tL(gr,src,FONT.sect,COL.text,72,76,W-144,28);
    drawFsDefault(gr,bot);
  }
  drawFsBar(gr);
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
  else if(act==='shuffle') toggleShuffle();
  else if(act==='repeat') cycleRepeat();
  else if(act==='fullscreen'){ enterFullscreen(); return; }
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
  if(fsMode){
    if(vizMenuOpen){
      var vm; for(vm=0;vm<VIZ_MENU_HB.length;vm++){ if(inRect(x,y,VIZ_MENU_HB[vm])){ vizStyle=VIZ_MENU_HB[vm].style; vizMenuOpen=false; repaintAll(); return; } }
      var vb2; for(vb2=0;vb2<HB_FS.length;vb2++){ if(inRect(x,y,HB_FS[vb2]) && HB_FS[vb2].act==='vizmenu'){ vizMenuOpen=false; repaintAll(); return; } }
      vizMenuOpen=false; repaintAll(); return;   // click elsewhere closes the dropdown
    }
    var f2; for(f2=0;f2<HB_FS.length;f2++){ if(inRect(x,y,HB_FS[f2])){ doFsAct(HB_FS[f2].act); return; } }
    var c3; for(c3=0;c3<HB_CTRL.length;c3++){ if(inRect(x,y,HB_CTRL[c3])){ doCtrl(HB_CTRL[c3].act); return; } }
    return;
  }
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
  if(HB_ADDPL && inRect(x,y,HB_ADDPL)){ var np=createNewPlaylist(); plman.ActivePlaylist=np; firstRow=firstRowT=0; view='playlist'; repaintAll(); return; }
  for(i=0;i<HB_CARD.length;i++){ if(inRect(x,y,HB_CARD[i])){ var c=HB_CARD[i]; if(c.kind==='pl'){ plman.ActivePlaylist=c.id; firstRow=firstRowT=0; view='playlist'; } else { loadArtist(c.id); view='artist'; } repaintAll(); return; } }
  for(i=0;i<HB_PL.length;i++){ if(inRect(x,y,HB_PL[i])){ plman.ActivePlaylist=HB_PL[i].i; firstRow=firstRowT=0; view='playlist'; repaintAll(); return; } }
  for(i=0;i<HB_TR.length;i++){ if(inRect(x,y,HB_TR[i])){ var tr=HB_TR[i]; if(tr.srch){ var hs=[]; for(var m2=0;m2<searchTrks.length;m2++) hs.push(searchTrks[m2].h); playHandleList(hs,tr.idx); } else if(tr.lib) playArtistTrack(tr.block,tr.idx); else playPlaylistItem(tr.pl,tr.item); repaintAll(); return; } }
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
  var sig=hoverSig(x,y), sk=scrollSection(x,y);
  if(sig!==hoverKey || sk!==scrollKey){ hoverKey=sig; scrollKey=sk; repaintAll(); }   // sk change reveals/hides the section scrollbar
}
// which scrollable section the cursor is over (so entering/leaving reveals the hover scrollbar even over gaps)
function scrollSection(x,y){
  if(R.navLib && x>=R.navLib.x && x<R.navLib.x+R.navLib.w && y>=R.navLib.y && y<R.navLib.y+R.navLib.h) return 'nav';
  if(R.main && x>=R.main.x && x<R.main.x+R.main.w+16 && y>=R.main.y && y<R.main.y+R.main.h){
    if(view==='home') return (y>=HOME_SHELF_Y0 && y<HOME_SHELF_Y1+16)?'shelf':'arts';
    if(view==='playlist') return 'pl';
  }
  return '';
}
function on_mouse_leave(){ mx=-1; my=-1; if(hoverKey!==''||scrollKey!==''){ hoverKey=''; scrollKey=''; repaintAll(); } }
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
  if(fsMode){ fb.Volume=pos2vol(clamp01(vol2pos(fb.Volume)+step*0.04)); repaintAll(); return; }
  if(R.navLib && mx>=R.navLib.x && mx<R.navLib.x+R.navLib.w && my>=R.navLib.y && my<R.navLib.y+R.navLib.h){
    navScrollT-=step*WHEEL_PX; if(navScrollT<0)navScrollT=0; if(navScrollT>NAV_MAX)navScrollT=NAV_MAX; startScrollAnim(); return;   // smooth
  }
  if(mx<R.main.x || mx>=R.main.x+R.main.w) return;
  if(view==='home'){
    if(my>=HOME_SHELF_Y0 && my<HOME_SHELF_Y1){ plScroll-=step; if(plScroll<0)plScroll=0; if(plScroll>HOME_PLMAX)plScroll=HOME_PLMAX; repaintAll(); }   // shelf: card-stepped
    else { homeScrollT-=step*Math.round(WHEEL_PX*1.7); if(homeScrollT<0)homeScrollT=0; if(homeScrollT>HOME_MAXROW)homeScrollT=HOME_MAXROW; startScrollAnim(); }   // artists: smooth (bigger step: tall cards)
    return;
  }
  else if(view==='search'){ searchScroll-=step*3; if(searchScroll<0)searchScroll=0; repaintAll(); return; }
  else if(view==='artist'){ artScroll-=step; if(artScroll<0)artScroll=0; if(artScroll>ART_MAXBLOCK)artScroll=ART_MAXBLOCK; repaintAll(); return; }
  firstRowT-=step*WHEEL_PX; if(firstRowT<0)firstRowT=0; if(firstRowT>PL_MAXPX)firstRowT=PL_MAXPX; startScrollAnim();   // playlist songs: smooth
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
    plman.ActivePlaylist=np; firstRow=firstRowT=0; view='playlist';
  } else action.Effect=0;
  navDropHover=false; repaintAll();
}
function on_script_unload(){ stopLyAnim(); stopCaret(); stopViz(); stopScrollAnim(); }
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
  var lyricsShown=(rightTab==='lyrics')||(fsMode&&fsView==='lyrics');
  if(lyricsShown && lyrics && lyrics!=='none' && lyrics.synced){ var c=currentLyricLine(); if(c!==lyCur){ lyCur=c; startLyAnim(); } }
}
function on_playback_seek(){ repaintAll(); }
function on_playback_order_changed(){ syncOrderFromFb(); repaintAll(); }
function on_playback_queue_changed(){ repaintAll(); }
function on_volume_change(){ repaintBar(); }
function on_metadb_changed(handles,fromhook){ if(fromhook) return; invalidateItems(); albKeyCache={}; hueCache={}; artistCoverCache={}; updateNP(); repaintAll(); }
function on_playlist_switch(){ firstRow=firstRowT=0; invalidateItems(); repaintAll(); }
function on_playlists_changed(){ invalidateItems(); repaintAll(); }
function on_playlist_items_added(){ invalidateItems(); repaintAll(); }
function on_playlist_items_removed(){ invalidateItems(); repaintAll(); }
function on_playlist_items_reordered(){ invalidateItems(); repaintAll(); }
function on_item_focus_change(){ repaintAll(); }

layout();
updateNP();
syncOrderFromFb(); applyPlaybackOrder();   // normalize native order (we manage shuffle ourselves)
console.log('[foobar-spotify] Phase 3 loaded (perf + custom title bar)');
