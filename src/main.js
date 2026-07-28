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

// NOTE: the key is `features`, not `options` -- an unknown key is silently ignored, and without
// features.drag_n_drop the panel is never registered as an OLE drop target, so no on_drag_* fires.
window.DefineScript('Spotify for foobar2000', { author:'zulvanavivi', features:{ drag_n_drop:true, grab_focus:true } });
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
var M = { pad:8, gap:8, navW:230, queueW:400, barH:96, navTopH:84, rowH:56, radius:10, cpad:24, headH:280, artSz:200 };
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
  npTitle:F(15,0), npArtist:F(12,0), time:F(12,0), prefs:F(11,0), glyph:F(15,0)
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
TF.trackno=fb.TitleFormat('%tracknumber%');

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
function cxOf(x,w,cw){ return x+Math.round((w-cw)/2); }   // x that centres a cw-wide thing inside [x,w]
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

/* ------------------------- album art (ASYNC cache, keyed by album) -------------------------
   Covers are decoded off the paint thread via utils.GetAlbumArtAsyncV2 so scrolling never
   blocks: a miss draws the placeholder and requests the art; when it arrives we cache it and
   repaint (coalesced). warmArt() pre-requests a set so covers are ready before you scroll to them. */
var artCache={}, albKeyCache={}, thumbCache={}, artPending={}, artRepaintPending=false;
function albKey(h){ if(!h) return ''; var p=h.Path; if(albKeyCache.hasOwnProperty(p)) return albKeyCache[p]; var k=TF.albkey.EvalWithMetadb(h); albKeyCache[p]=k; return k; }
function artWarmRepaint(){ if(artRepaintPending) return; artRepaintPending=true; window.SetTimeout(function(){ artRepaintPending=false; repaintAll(); },60); }
function requestArt(h,key){
  if(!h || artCache.hasOwnProperty(key) || artPending[key]) return;
  artPending[key]=true;
  try{
    utils.GetAlbumArtAsyncV2(0,h,0,false,false,false).then(function(res){
      var img=res?res.image:null;
      if(img && img.Width>500){ try{ img=img.Resize(500,Math.round(img.Height*500/img.Width),2); }catch(e){} }
      artCache[key]=img||null; delete artPending[key]; artWarmRepaint();
    }, function(){ artCache[key]=null; delete artPending[key]; });
  }catch(e){ delete artPending[key]; }
}
function getArtK(h,key){                        // cached image, or null (not-loaded -> request async)
  if(!h) return null;
  if(artCache.hasOwnProperty(key)) return artCache[key];
  requestArt(h,key);
  return null;
}
function artLoaded(key){ return artCache.hasOwnProperty(key); }   // vs. still-loading (don't cache derivatives yet)
function getArt(h){ return h?getArtK(h,albKey(h)):null; }
var warmed={};   // guards one-time warm passes per view; reset when items change
function warmArt(handles){ if(!handles) return; var n=(handles.length!==undefined)?handles.length:handles.Count; for(var i=0;i<n;i++){ var h=handles[i]; if(h) requestArt(h,albKey(h)); } }
function warmOnce(tag,handles){ if(warmed[tag]) return; warmed[tag]=1; warmArt(handles); }
function getThumb(h,key,size){
  var img=getArtK(h,key);
  if(!artLoaded(key)) return null;             // still loading -> placeholder, don't cache
  var tk=key+'|'+size;
  if(thumbCache.hasOwnProperty(tk)) return thumbCache[tk];
  var r=null; if(img){ try{ r=img.Resize(size,size,2); }catch(e){ r=null; } }
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
// artist avatar = the artist's first track (optimistic; art loads async, placeholder if none)
function artistCover(name,fallback){
  if(artistCoverCache.hasOwnProperty(name)) return artistCoverCache[name];
  var list=artistTracksMap?artistTracksMap[name]:null;
  var h=(list && list.length)?list[0]:fallback;
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

/* ------------------------- "All Songs" library view -------------------------
   One index of every library track (built once, invalidated by the library callbacks),
   expanded into a flat ROW list: group headers and track rows in display order, each
   carrying its own height + precomputed y. Grouping never re-reads the library - it just
   re-sorts the index and rebuilds the rows, so switching modes is instant.
   Rows: {k:'g1'|'g2'|'t'}. Headers additionally carry kind:'artist'|'album'. */
var songsIdx=null, songsRows=null, songsTracks=null, songsContentH=0, songsTotalSec=0;
var songsGroup='none', songsScroll=0, songsScrollT=0, SONGS_MAXPX=0;
var sgMenuOpen=false, SG_HB=[], HB_SG=null, HB_ALLSONGS=null;
var SONGS_GROUPS=[['No grouping','none'],['By artist','artist'],['By album','album'],['By artist & album','both']];
/* ---- group-list metrics ----
   One indent step per nesting level (SG_IND), and one vertical rhythm shared by every group
   header: GAP above the block (the divider rule sits at its very top), then artwork, then
   PADB below. Header heights are DERIVED from those parts instead of hand-tuned, so the space
   above and below a header is the same everywhere and every tier lines up on the same grid.
   SG_H1B is the artist banner in artist+album mode - the same block wrapped in a slab, so it
   outweighs the album headers nested under it without breaking the rhythm.
   SG_CROP is the over-paint band that hides the top partial row (this engine has no clip API);
   it must exceed the tallest thing a row can paint above its own top edge, and SHEAD is sized
   so the band can never reach up into the album art. */
var SG_IND=32, SG_GAP1=24, SG_GAP2=14, SG_PADB1=12, SG_PADB2=10;
var SG_ART1=56, SG_ART2=44, SG_TGAP=18, SG_SLABP=10;
var SG_H1=SG_GAP1+SG_ART1+SG_PADB1;                  // 92  top-level header
var SG_H1B=SG_GAP1+SG_SLABP*2+SG_ART1+SG_PADB1;      // 112 artist banner (slab around artwork)
var SG_H2=SG_GAP2+SG_ART2+SG_PADB2;                  // 68  nested header
var SG_TRH=44, SHEAD=312, SG_CROP=96;
function sgLabel(){ for(var i=0;i<SONGS_GROUPS.length;i++) if(SONGS_GROUPS[i][1]===songsGroup) return SONGS_GROUPS[i][0]; return 'No grouping'; }
function getSongsIdx(){
  if(songsIdx) return songsIdx;
  var lib=null; try{ lib=fb.GetLibraryItems(); }catch(e){}
  var out=[]; songsTotalSec=0;
  if(lib && lib.Count){
    var ti=TF.title.EvalWithMetadbs(lib), ar=TF.artist.EvalWithMetadbs(lib), aa=TF.artistName.EvalWithMetadbs(lib),
        al=TF.album.EvalWithMetadbs(lib), ln=TF.len.EvalWithMetadbs(lib), ls=TF.lensec.EvalWithMetadbs(lib),
        ak=TF.albkey.EvalWithMetadbs(lib), tn=TF.trackno.EvalWithMetadbs(lib), yr=TF.year.EvalWithMetadbs(lib);
    for(var i=0;i<ti.length;i++){
      songsTotalSec+=parseInt(ls[i],10)||0;
      out.push({h:lib[i], title:ti[i]||'', artist:ar[i]||'', aartist:aa[i]||'Unknown Artist',
                album:al[i]||'Unknown Album', len:ln[i], artkey:ak[i], year:yr[i]||'', tn:parseInt(tn[i],10)||0});
    }
  }
  songsIdx=out; return out;
}
function cmpStr(a,b){ a=String(a).toLowerCase(); b=String(b).toLowerCase(); return a<b?-1:(a>b?1:0); }
function cmpTrk(a,b){ return (a.tn-b.tn)||cmpStr(a.title,b.title); }   // within an album: disc order, then title
function buildSongsRows(){
  var idx=getSongsIdx().slice(0), g=songsGroup, rows=[], tracks=[], i;
  if(g==='artist')     idx.sort(function(a,b){ return cmpStr(a.aartist,b.aartist)||cmpStr(a.album,b.album)||cmpTrk(a,b); });
  else if(g==='album') idx.sort(function(a,b){ return cmpStr(a.album,b.album)||cmpStr(a.aartist,b.aartist)||cmpTrk(a,b); });
  else if(g==='both')  idx.sort(function(a,b){ return cmpStr(a.aartist,b.aartist)||cmpStr(a.album,b.album)||cmpTrk(a,b); });
  else                 idx.sort(function(a,b){ return cmpStr(a.title,b.title)||cmpStr(a.artist,b.artist); });
  var curA=null, curAl=null, ref1=null, ref2=null, n=0, trH=(g==='none')?M.rowH:SG_TRH;
  var h1=(g==='both')?SG_H1B:SG_H1;
  for(i=0;i<idx.length;i++){
    var t=idx[i];
    if(g==='artist'){
      if(t.aartist!==curA){ curA=t.aartist; n=0; ref1={k:'g1',kind:'artist',label:t.aartist,sub:'',h:h1,handle:t.h,seed:t.aartist,count:0,albums:0}; rows.push(ref1); }
    } else if(g==='album'){
      if(t.artkey!==curAl){ curAl=t.artkey; n=0; ref1={k:'g1',kind:'album',label:t.album,sub:t.aartist+(t.year?(' '+CH_DOT+' '+t.year):''),h:h1,handle:t.h,seed:t.artkey,count:0,albums:0}; rows.push(ref1); }
    } else if(g==='both'){
      if(t.aartist!==curA){ curA=t.aartist; curAl=null; ref2=null; ref1={k:'g1',kind:'artist',label:t.aartist,sub:'',h:h1,handle:t.h,seed:t.aartist,count:0,albums:0}; rows.push(ref1); }
      if(t.artkey!==curAl){ curAl=t.artkey; n=0; ref2={k:'g2',kind:'album',label:t.album,sub:t.year||'',h:SG_H2,handle:t.h,seed:t.artkey,count:0}; rows.push(ref2); if(ref1) ref1.albums++; }
    }
    n++; tracks.push(t);
    rows.push({k:'t',t:t,n:(g==='none'?tracks.length:n),ti:tracks.length-1,h:trH});
    if(ref1) ref1.count++;
    if(ref2) ref2.count++;
  }
  var yy=0;
  for(i=0;i<rows.length;i++){ rows[i].y=yy; yy+=rows[i].h; }
  // Link every row back to its owning top-level header and record where each group ends, so
  // the connector rail can still be drawn when the header itself has scrolled off the top.
  var last=-1;
  for(i=0;i<rows.length;i++){
    if(rows[i].k==='g1'){ if(last>=0) rows[last].y1=rows[i].y; last=i; }
    else if(last>=0) rows[i].g1i=last;
  }
  if(last>=0) rows[last].y1=yy;
  songsRows=rows; songsTracks=tracks; songsContentH=yy+24;
}
// first row whose bottom is below the scroll position (binary search - the list can be thousands of rows)
function songsFirstAt(py){
  var lo=0, hi=songsRows.length-1, res=songsRows.length;
  while(lo<=hi){ var m=(lo+hi)>>1; if(songsRows[m].y+songsRows[m].h>py){ res=m; hi=m-1; } else lo=m+1; }
  return res;
}
function setSongsGroup(g){
  if(g!==songsGroup){ songsGroup=g; songsRows=null; songsScroll=songsScrollT=0; }
  sgMenuOpen=false; repaintAll();
}
function playSongsRow(ti){
  if(!songsTracks) return;
  var hs=[]; for(var i=0;i<songsTracks.length;i++) hs.push(songsTracks[i].h);
  playHandleList(hs,ti);
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
  var img=getArt(h);
  if(!artLoaded(k)) return coverCol(seed);   // still loading -> fallback, don't cache (recompute when it arrives)
  var col=coverCol(seed);
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
  var art=h?getArt(h):null;
  if(h && !artLoaded(albKey(h))) return null;   // still loading -> placeholder, don't cache
  var res=null;
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
/* Playlist cover: first up-to-4 DISTINCT albums (optimistic; art loads async, placeholder if none).
   >=4 -> 2x2 mosaic; otherwise a single cover. */
var plCoverCache={}, mosaicCache={};
function plCovers(pi){
  if(plCoverCache.hasOwnProperty(pi)) return plCoverCache[pi];
  var it=getItems(pi), res={list:[], single:null};
  if(it && it.Count){
    var seenAlb={}, cap=Math.min(it.Count,60);
    for(var i=0;i<cap && res.list.length<4;i++){
      var h=it[i]; if(!h) continue; var k=albKey(h); if(seenAlb[k]) continue;
      seenAlb[k]=1; res.list.push(h); if(!res.single) res.single=h;
    }
    if(!res.single) res.single=it[0];
  }
  plCoverCache[pi]=res; return res;
}
function mosaicImg(handles,seed,size,rad){
  var key=(seed||'')+'|'+size+'|m'+rad;
  if(mosaicCache.hasOwnProperty(key)) return mosaicCache[key];
  var i, ready=true;
  for(i=0;i<4;i++){ getArt(handles[i]); if(!artLoaded(albKey(handles[i]))) ready=false; }   // request all; wait for all
  if(!ready) return null;                     // still loading -> placeholder single cover; don't cache a half mosaic
  var res=null;
  try{
    var cv=gdi.CreateImage(size,size), g=cv.GetGraphics();
    var h1=Math.floor(size/2), h2=size-h1;
    var cells=[[0,0,h1,h1],[h1,0,h2,h1],[0,h1,h1,h2],[h1,h1,h2,h2]];
    for(i=0;i<4;i++){
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
/* "All Songs" cover: 4 distinct albums sampled ACROSS the whole library (not just the first
   few), so the mosaic reads as the library rather than as whichever album sorts first. */
var libCovCache=null, libCount_=-1;
function libCount(){ if(libCount_<0){ var l=null; try{ l=fb.GetLibraryItems(); }catch(e){} libCount_=l?l.Count:0; } return libCount_; }
function libCovers(){
  if(libCovCache) return libCovCache;
  var lib=null; try{ lib=fb.GetLibraryItems(); }catch(e){}
  var res={list:[], single:null};
  if(lib && lib.Count){
    var seen={}, step=Math.max(1,Math.floor(lib.Count/400));
    for(var i=0;i<lib.Count && res.list.length<4;i+=step){
      var h=lib[i]; if(!h) continue; var k=albKey(h); if(seen[k]) continue;
      seen[k]=1; res.list.push(h); if(!res.single) res.single=h;
    }
    if(!res.single) res.single=lib[0];
  }
  libCovCache=res; return res;
}
function drawLibCover(gr,x,y,size,rad){
  var cov=libCovers();
  if(cov.list.length>=4){ var mi=mosaicImg(cov.list,'__lib__',size,rad); if(mi){ gr.DrawImage(mi,x,y,size,size,0,0,mi.Width,mi.Height,0,255); return; } }
  drawRounded(gr,x,y,size,rad,cov.single,'__lib__');
}
function fmtNum(n){ n=String(n); var out='', c=0; for(var i=n.length-1;i>=0;i--){ out=n.charAt(i)+out; if(++c%3===0 && i>0) out=','+out; } return out; }

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
  var moving=false, mm=false, nm=false, d1=firstRowT-firstRow, d2=navScrollT-navScroll, d3=homeScrollT-homeScroll, d4=songsScrollT-songsScroll;
  if(Math.abs(d1)>=0.5){ firstRow+=d1*0.25; moving=true; mm=true; } else firstRow=firstRowT;
  if(Math.abs(d3)>=0.5){ homeScroll+=d3*0.25; moving=true; mm=true; } else homeScroll=homeScrollT;
  if(Math.abs(d4)>=0.5){ songsScroll+=d4*0.25; moving=true; mm=true; } else songsScroll=songsScrollT;
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
// Deferred "scroll this playlist into view": drawNav is the only place that knows the row
// geometry and the post-insert row count, so the request is queued and consumed there.
var navRevealPl=-1;
function revealPlaylist(i){ navRevealPl=i; }
// empty-playlist "add songs" zone: drop cue + the two browse buttons
var plDropHover=false, HB_PLADD_FILES=null, HB_PLADD_FOLDER=null;
// playlist edit: right-click / hover-dots context menu, inline rename, delete confirm
var HB_DOTS=[], ctxMenu=null, CTX_HB=[], renameEdit=null, confirmDel=null, CONF_HB=null, RENAME_HB=null;
function openPlaylistMenu(pl,x,y){
  var items=[];
  if(!plman.IsPlaylistLocked(pl)) items.push({label:'Add files...',act:'addfiles'},{label:'Add folder...',act:'addfolder'});
  items.push({label:'Rename',act:'rename'},{label:'Delete',act:'delete',danger:true});
  ctxMenu={kind:'pl', pl:pl, name:plman.GetPlaylistName(pl), x:x, y:y, items:items};
  repaintAll();
}
// Track-level menu (right-click a row in the playlist view). Locked/auto playlists have no
// removable rows, so there's nothing to offer -> fall through to JSplitter's own panel menu.
function openTrackMenu(pl,item,x,y){
  if(!canEditPl(pl)) return false;
  ctxMenu={kind:'track', pl:pl, item:item, x:x, y:y,
           items:[{label:'Remove from this playlist',act:'trkremove',danger:true}]};
  repaintAll(); return true;
}
function canEditPl(pl){
  if(pl<0) return false;
  try{ if(plman.IsPlaylistLocked(pl) || plman.IsAutoPlaylist(pl)) return false; }catch(e){}
  return true;
}
// Is this row the track you are currently hearing? Only when playback runs straight off this
// playlist does the location point at the row, so the index match is used there (it tells
// duplicates apart). Anything else - the hidden SHUF / ROUTE copies this skin plays through, or
// another playlist entirely - reports a foreign PlaylistIndex, so fall back to matching the file.
function isRowPlaying(pl,item,h){
  if(!fb.IsPlaying && !fb.IsPaused) return false;
  var loc=plman.GetPlayingItemLocation?plman.GetPlayingItemLocation():null;
  if(loc && loc.IsValid && loc.PlaylistIndex===pl) return loc.PlaylistItemIndex===item;
  return sameHandle(h,NP);
}
// Removing the playing item does NOT stop foobar - the file plays on to its end - so confirm the
// fb.Next() hand-off actually took once the playlist edit has settled. If the removed file is
// still the one playing, push again, and stop if there was simply nowhere to go.
function verifyAdvanced(h){
  window.SetTimeout(function(){
    var np=null; try{ np=fb.GetNowPlaying(); }catch(e){}
    if(!(fb.IsPlaying||fb.IsPaused) || !sameHandle(np,h)) return;
    fb.Next();
    window.SetTimeout(function(){
      var n2=null; try{ n2=fb.GetNowPlaying(); }catch(e2){}
      if((fb.IsPlaying||fb.IsPaused) && sameHandle(n2,h)) fb.Stop();
    },150);
  },60);
}
// Drop the row out of the manual playback queue ("Next in queue" in the right panel). Entries
// normally carry a playlist reference; ones queued by handle alone (PlaylistIndex < 0) are matched
// by file instead. Must run BEFORE the playlist removal, while the item indices still line up.
function dequeueRow(pl,item,h){
  var q=null; try{ q=plman.GetPlaybackQueueContents(); }catch(e){ q=null; }
  if(!q || !q.length) return;
  var kill=[];
  for(var i=0;i<q.length;i++){
    var e=q[i];
    if(e.PlaylistIndex===pl && e.PlaylistItemIndex===item) kill.push(i);
    else if(e.PlaylistIndex<0 && sameHandle(e.Handle,h)) kill.push(i);
  }
  if(kill.length){ try{ plman.RemoveItemsFromPlaybackQueue(kill); }catch(e2){} }
}
// With shuffle on, "next up" is read from the hidden shuffled copy, so a track removed from the
// source would still come round later. Pull every instance of it out of that copy too.
function removeFromShuffleCopy(pl,h){
  if(!pbShuffle || !h || pl<0) return;
  if(plman.GetPlaylistName(pl)!==shufSrcName) return;      // a different playlist is the shuffle source
  var si=playlistOfName(SHUF); if(si<0) return;
  var list=null; try{ list=plman.GetPlaylistItems(si); }catch(e){ return; }
  if(!list || !list.Count) return;
  var kill=[], i;
  for(i=0;i<list.Count;i++) if(sameHandle(list[i],h)) kill.push(i);
  if(!kill.length) return;
  try{
    plman.ClearPlaylistSelection(si);
    for(i=0;i<kill.length;i++) plman.SetPlaylistSelectionSingle(si,kill[i],true);
    plman.RemovePlaylistSelection(si,false);
    plman.ClearPlaylistSelection(si);
  }catch(e){}
}
// Remove one row. RemovePlaylistSelection is selection-based, so select just that item first;
// UndoBackup keeps foobar's own Edit > Undo working. on_playlist_items_removed repaints us.
// Removing the track that is playing hands playback on first (fb.Next honours the manual queue),
// so the file is no longer the playing item by the time it leaves the playlist. Paused playback
// stops instead of advancing - deleting the track you're parked on shouldn't start audio.
function removeTrackFromPl(pl,item){
  if(!canEditPl(pl) || item<0 || item>=plman.PlaylistItemCount(pl)) return;
  var items=getItems(pl), h=(items && item<items.Count)?items[item]:null;
  var playing=isRowPlaying(pl,item,h), wasPaused=fb.IsPaused;
  dequeueRow(pl,item,h);
  if(playing){ if(wasPaused) fb.Stop(); else fb.Next(); }
  removeFromShuffleCopy(pl,h);
  try{
    plman.UndoBackup(pl);
    plman.ClearPlaylistSelection(pl);
    plman.SetPlaylistSelectionSingle(pl,item,true);
    plman.RemovePlaylistSelection(pl,false);
    plman.ClearPlaylistSelection(pl);
  }catch(e){}
  if(playing && !wasPaused) verifyAdvanced(h);   // the row is gone now: make sure playback really moved on
  invalidateItems(); updateNP(); repaintAll();
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
// Rounded outline. GDI+ rejects an arc bigger than half the side and centres a stroke on
// the path, so inset by the line width first, then clamp the radius to what's left.
function strokeRound(gr,x,y,w,h,rad,lw,col){
  var i=lw/2, sw=w-lw, sh=h-lw;
  if(sw<=0 || sh<=0) return;
  var a=Math.min(rad,sw/2,sh/2);
  gr.DrawRoundRect(x+i,y+i,sw,sh,a,a,lw,col);
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
  else if(view==='songs'){ songsScroll=songsScrollT=Math.round(frac*SB.maxPx); }
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
// Native multi-select pickers. fb.AddFiles/AddDirectory take no arguments and always target the
// ACTIVE playlist, so point it at the destination first. (utils.FilePicker is single-select only.)
// The insert is async; on_playlist_items_added already invalidates the caches and repaints.
function addFilesToPl(i){ if(i<0 || plman.IsPlaylistLocked(i)) return; plman.ActivePlaylist=i; fb.AddFiles(); }
function addFolderToPl(i){ if(i<0 || plman.IsPlaylistLocked(i)) return; plman.ActivePlaylist=i; fb.AddDirectory(); }
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
var SHUF='__spotify_shuffle__', shufSrcName='', lastShufIdx=-1;   // shufSrcName = the real playlist we shuffled from
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
  lastShufIdx=0; invalidateItems();
}
// On loop-around, reshuffle the upcoming tracks so the next pass differs. Reorders the hidden
// SHUF playlist in place (keeps the currently-playing item 0, no restart).
function reshuffleTail(shufPi){
  var it=getItems(shufPi), n=it.Count; if(n<=2) return;
  var tail=[], i; for(i=1;i<n;i++) tail.push(it[i]);
  shuffleArr(tail);
  plman.ClearPlaylistSelection(shufPi);
  for(i=1;i<n;i++) plman.SetPlaylistSelectionSingle(shufPi,i,true);
  plman.RemovePlaylistSelection(shufPi);
  var hl=fb.CreateHandleList(); for(i=0;i<tail.length;i++) hl.Add(tail[i]);
  plman.InsertPlaylistItems(shufPi,1,hl,false);
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
function invalidateItems(){ plCacheMap={}; plMetaMap={}; plCoverCache={}; mosaicCache={}; warmed={}; }

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
// Carve rounded corners over already-drawn (square) content: blit black corner masks (no clip API).
var CORN=null;
function buildCorners(rad){
  var specs={tl:[0,0],tr:[-rad,0],bl:[0,-rad],br:[-rad,-rad]}, q={}, key;
  for(key in specs){
    var im=gdi.CreateImage(rad,rad), g=im.GetGraphics(); g.FillSolidRect(0,0,rad,rad,COL.black); im.ReleaseGraphics(g);
    var mk=gdi.CreateImage(rad,rad), mg=mk.GetGraphics();
    mg.FillSolidRect(0,0,rad,rad,RGB(0,0,0)); mg.SetSmoothingMode(2); mg.FillEllipse(specs[key][0],specs[key][1],rad*2,rad*2,RGB(255,255,255));
    mk.ReleaseGraphics(mg); im.ApplyMask(mk); q[key]=im;
  }
  return q;
}
function roundPanel(gr,x,y,w,h){
  var rad=M.radius; if(!CORN) CORN=buildCorners(rad);
  gr.DrawImage(CORN.tl,x,y,rad,rad,0,0,rad,rad,0,255);
  gr.DrawImage(CORN.tr,x+w-rad,y,rad,rad,0,0,rad,rad,0,255);
  gr.DrawImage(CORN.bl,x,y+h-rad,rad,rad,0,0,rad,rad,0,255);
  gr.DrawImage(CORN.br,x+w-rad,y+h-rad,rad,rad,0,0,rad,rad,0,255);
}
function roundTop(gr,x,y,w){   // carve only the top corners (where square gradient/band overrides panelBg rounding)
  var rad=M.radius; if(!CORN) CORN=buildCorners(rad);
  gr.DrawImage(CORN.tl,x,y,rad,rad,0,0,rad,rad,0,255);
  gr.DrawImage(CORN.tr,x+w-rad,y,rad,rad,0,0,rad,rad,0,255);
}

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
    var ih=42, pad=6, i, it, iw=190;
    // width follows the longest label (16px left inset + 24px breathing room on the right)
    for(i=0;i<ctxMenu.items.length;i++) iw=Math.max(iw,Math.round(gr.CalcTextWidth(ctxMenu.items[i].label,FONT.pl))+40);
    iw=Math.min(iw,Math.max(120,W-20));
    var h=ctxMenu.items.length*ih+pad*2;
    var mnx=Math.max(10,Math.min(ctxMenu.x,W-iw-10)), mny=Math.max(10,Math.min(ctxMenu.y,H-h-10));
    gr.FillSolidRect(mnx+3,mny+4,iw,h,RGBA(0,0,0,120));       // soft shadow
    gr.FillRoundRect(mnx,mny,iw,h,8,8,RGB(43,43,43));
    for(i=0;i<ctxMenu.items.length;i++){
      var iy=mny+pad+i*ih; it=ctxMenu.items[i];
      if(hv(mnx,iy,mnx+iw,iy+ih)) gr.FillRoundRect(mnx+4,iy,iw-8,ih,5,5,RGBA(255,255,255,20));
      tL(gr,it.label,FONT.pl,it.danger?RGB(240,96,96):COL.text,mnx+16,iy,iw-24,ih);
      CTX_HB.push({x0:mnx,y0:iy,x1:mnx+iw,y1:iy+ih,act:it.act});
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
    gr.FillSolidRect(0,0,W,H,COL.black);   // black canvas -> panels read as separated cards (Spotify look)
    drawTitleBar(gr);
    drawNav(gr);
    drawMain(gr); roundTop(gr,R.main.x,R.main.y,R.main.w);
    drawQueue(gr);
    drawBar(gr);
    drawOverlays(gr);
    return;
  }
  // partial composite: only the regions actually flagged (each drawn over live content)
  if(dirtyMain||dirtyNav) HB_DOTS=[];   // these rebuild their hover targets
  if(dirtyMain){ dirtyMain=false; drawMain(gr); roundTop(gr,R.main.x,R.main.y,R.main.w); }
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
  var footH=72, footTop=R.navLib.y+R.navLib.h-footH;
  // pinned "All Songs" entry above the list (Spotify's Liked Songs slot) - drawn after the crop, below
  var pinY=R.navLib.y+48, pinH=58;
  // scrollable playlist list (continuous pixel scroll), cropped just above the footer
  var listTop=pinY+pinH+10, rh=58, cropY=footTop-6, viewH=cropY-listTop;
  var contentH=pls.length*rh, maxPx=Math.max(0,contentH-viewH);   // navScroll is a PIXEL offset
  NAV_MAX=maxPx;
  if(navScroll>maxPx) navScroll=maxPx; if(navScroll<0) navScroll=0;
  if(navScrollT>maxPx) navScrollT=maxPx; if(navScrollT<0) navScrollT=0;
  // honour a pending "scroll this playlist into view" request now that the row geometry is known
  if(navRevealPl>=0){
    var rk=-1, ri; for(ri=0;ri<pls.length;ri++){ if(pls[ri]===navRevealPl){ rk=ri; break; } }
    navRevealPl=-1;
    if(rk>=0){
      var rt=rk*rh, want=navScrollT;
      if(rt<want) want=rt;                                 // above the viewport: bring it to the top edge
      else if(rt+rh>want+viewH) want=rt+rh-viewH;          // below it: bring it to the bottom edge
      want=Math.max(0,Math.min(want,maxPx));
      if(want!==navScrollT){ navScrollT=want; startScrollAnim(); }   // eased, same as wheel scrolling
    }
  }
  for(var k=Math.floor(navScroll/rh); k<pls.length; k++){
    var ry=listTop+k*rh-navScroll; if(ry>=cropY) break;
    var i2=pls[k], nm=plman.GetPlaylistName(i2);
    var isA=(view==='playlist' && i2===active);
    // clamp hover + click targets to the visible band: a row scrolled under the pinned
    // "All Songs" header is painted over, so it must not answer the mouse there either
    var hy0=Math.max(ry,listTop), hy1=Math.min(ry+rh,cropY);
    var rowHov=(hy1>hy0) && hv(R.navLib.x,hy0,R.navLib.x+R.navLib.w,hy1);
    if(isA) gr.FillRoundRect(R.navLib.x+8,ry,R.navLib.w-16,rh-4,6,6,COL.rowActive);
    else if(rowHov) gr.FillRoundRect(R.navLib.x+8,ry,R.navLib.w-16,rh-4,6,6,COL.rowHover);
    var cs=44, cx=R.navLib.x+16, cy=ry+(rh-cs)/2;
    drawPlCover(gr,cx,cy,cs,4,i2,nm);
    var tx=cx+cs+12;
    var tw=R.navLib.x+R.navLib.w-16-tx-(rowHov?26:0);
    tL(gr,nm,FONT.pl,isA?COL.green:COL.text,tx,ry+8,tw,20);
    tL(gr,plman.PlaylistItemCount(i2)+' songs',FONT.plSub,COL.text2,tx,ry+30,tw,16);
    if(rowHov && ry>=listTop) drawDots(gr,R.navLib.x+R.navLib.w-32,ry+(rh-24)/2,i2);
    if(hy1>hy0) HB_PL.push({x0:R.navLib.x,y0:hy0,x1:R.navLib.x+R.navLib.w,y1:hy1,i:i2});
  }
  // crop partial rows top & bottom, redraw the sticky header block (title + All Songs), then the scrollbar
  // (clear starts below the panel's rounded corners so a square fill can't square them off)
  gr.FillSolidRect(R.navLib.x,R.navLib.y+M.radius+2,R.navLib.w,listTop-R.navLib.y-M.radius-2,COL.base);
  gr.FillSolidRect(R.navLib.x,cropY,R.navLib.w,R.navLib.y+R.navLib.h-cropY,COL.base);
  tL(gr,'Your Library',FONT.lib,COL.text2,R.navLib.x+18,R.navLib.y+14,R.navLib.w-56,26);
  var pinOn=(view==='songs'), pinHov=hv(R.navLib.x,pinY,R.navLib.x+R.navLib.w,pinY+pinH);
  if(pinOn||pinHov) gr.FillRoundRect(R.navLib.x+8,pinY,R.navLib.w-16,pinH-4,6,6,pinOn?COL.rowActive:COL.rowHover);
  var pcs=44, pcx=R.navLib.x+16, pcy=pinY+(pinH-pcs)/2;
  drawLibCover(gr,pcx,pcy,pcs,4);
  var ptx=pcx+pcs+12, ptw=R.navLib.x+R.navLib.w-16-ptx;
  tL(gr,'All Songs',FONT.pl,pinOn?COL.green:COL.text,ptx,pinY+8,ptw,20);
  tL(gr,fmtNum(libCount())+' songs',FONT.plSub,COL.text2,ptx,pinY+30,ptw,16);
  HB_ALLSONGS={x0:R.navLib.x,y0:pinY,x1:R.navLib.x+R.navLib.w,y1:pinY+pinH};
  gr.DrawLine(R.navLib.x+16,listTop-6,R.navLib.x+R.navLib.w-16,listTop-6,1,COL.line);
  drawScrollbarN(gr,R.navLib.x+R.navLib.w-9,listTop,viewH,navScroll,maxPx,viewH,contentH,hv(R.navLib.x,R.navLib.y,R.navLib.x+R.navLib.w,R.navLib.y+R.navLib.h)||drag==='scrolln');
  drawAddPlaylist(gr,footTop,footH);
}
/* Pinned sidebar footer: click to create a blank playlist, or drop files on it to import.
   Laid out horizontally (badge + two lines) because the sidebar is far wider than it is
   tall here -- the old stacked version spent 94px to say the same thing. */
function drawAddPlaylist(gr,footTop,footH){
  var bx=R.navLib.x+12, bw=R.navLib.w-24, by=footTop+6, bh=footH-16;
  var hot=hv(bx,by,bx+bw,by+bh), drop=navDropHover;
  var rad=Math.min(10,bw/2,bh/2);
  if(drop)      gr.FillRoundRect(bx,by,bw,bh,rad,rad,RGBA(30,215,96,26));
  else if(hot)  gr.FillRoundRect(bx,by,bw,bh,rad,rad,COL.rowHover);
  strokeRound(gr,bx,by,bw,bh,rad,drop?2:1,drop?COL.green:(hot?COL.text3:COL.line));
  // circular badge, echoing the empty-playlist state in the main panel
  var bs=30, ax=bx+13, ay=by+Math.round((bh-bs)/2);
  gr.FillEllipse(ax,ay,bs,bs,drop?RGBA(30,215,96,46):RGBA(255,255,255,hot?26:16));
  drawIcon(gr,'add',drop?COL.green:(hot?COL.text:COL.text2),ax,ay,bs,bs,18);
  var tx=ax+bs+12, tw=bx+bw-12-tx;
  if(drop){ tL(gr,'Drop to import',FONT.pl,COL.green,tx,by+Math.round((bh-20)/2),tw,20); }
  else {
    var ty=by+Math.round((bh-35)/2);          // two-line block, optically centred
    tL(gr,'New playlist',FONT.pl,hot?COL.text:COL.text2,tx,ty,tw,19);
    tL(gr,'drag a file or click',FONT.plSub,COL.text3,tx,ty+19,tw,16);
  }
  HB_ADDPL={x0:bx,y0:by,x1:bx+bw,y1:by+bh};
}

function drawMain(gr){
  HB_CARD=[]; HB_TR=[]; HB_ARTIST=[]; SB=null; SBH=null;   // clear stale click targets from the previous view
  if(view!=='songs'){ HB_SG=null; SG_HB=[]; }
  applyKeyMode();
  if(view==='search') startCaret(); else stopCaret();
  var r=R.main; panelBg(gr,r,COL.base);
  if(view==='home'){ drawHome(gr,r); return; }
  if(view==='search'){ drawSearch(gr,r); return; }
  if(view==='artist'){ drawArtist(gr,r); return; }
  if(view==='songs'){ drawSongs(gr,r); return; }
  drawPlaylist(gr,r);
}
function drawPlaylist(gr,r){
  HB_TR=[]; HB_ARTIST=[]; HB_PLADD_FILES=null; HB_PLADD_FOLDER=null;
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
  warmOnce('pl'+p.i,items);   // pre-load this playlist's covers in the background
  for(var j=Math.floor(firstRow/rh); j<p.count; j++){
    var ry=rowsTop+j*rh-firstRow; if(ry>=cropY) break;
    var h=items[j]; if(!h){ continue; }
    var isPlaying=(playingLoc && playingLoc.IsValid && playingLoc.PlaylistIndex===p.i && playingLoc.PlaylistItemIndex===j)
                  || (shufHere && sameHandle(h,NP));   // playing from the hidden shuffle copy of this playlist
    // the row whose context menu is open stays lit (brighter than hover) so the target is unambiguous
    var isMenuRow=!!(ctxMenu && ctxMenu.kind==='track' && ctxMenu.pl===p.i && ctxMenu.item===j);
    var isHover=hv(r.x,ry,r.x+r.w,ry+rh)||isMenuRow;
    if(isHover) gr.FillRoundRect(lx-8,ry,rx-lx+16,rh,4,4,isMenuRow?COL.rowActive:COL.rowHover);
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
  gr.FillSolidRect(r.x,cropY,r.w,M.pad+2,COL.black);   // gutter below the panel
  if(p.count===0){ drawPlEmpty(gr,r,rowsTop-rh,cropY); return; }   // column headings over a void read as a bug
  tL(gr,'#',FONT.head,COL.text2,lx,listTop,numW,20);
  tL(gr,'TITLE',FONT.head,COL.text2,titleX,listTop,titleW,20);
  tL(gr,'ALBUM',FONT.head,COL.text2,albumX,listTop,albumW,20);
  drawIcon(gr,'clock',COL.text2,rx-16,listTop,16,20,15);
  gr.DrawLine(lx,listTop+26,rx,listTop+26,1,COL.line);
  drawScrollbar(gr,rx+8,rowsTop,viewH,firstRow,maxPx,viewH,contentH,hv(r.x,r.y,r.x+r.w,cropY)||drag==='scroll');
  // the empty-state zone isn't on screen here, so outline the list itself as the target
  if(plDropHover){
    var iy=rowsTop-rh, ih=cropY-iy, ix=lx-12, iw=rx-lx+24, ir=Math.min(12,iw/2,ih/2);
    gr.FillRoundRect(ix,iy,iw,ih,ir,ir,RGBA(30,215,96,20));
    strokeRound(gr,ix,iy,iw,ih,ir,2,COL.green);
    var lh=34, ly=iy+ih-lh-18, lw=Math.min(iw-32,pillW(gr,'Drop to add to this playlist'));
    if(lw>=lh && ih>lh+36){                                  // radius is lh/2, so lw must clear it
      gr.FillRoundRect(cxOf(ix,iw,lw),ly,lw,lh,lh/2,lh/2,COL.green);
      tC(gr,'Drop to add to this playlist',FONT.pl,COL.black,cxOf(ix,iw,lw),ly,lw,lh);
    }
  }
}
// zero-track playlist: a centred badge/headline/buttons block, or one big drop cue while
// files are dragged over it. Degrades from the top down as the panel gets shorter.
function drawPlEmpty(gr,r,top,bottom){
  var availH=bottom-top, availW=r.w-M.cpad*2;
  if(availW<220 || availH<110) return;               // too cramped to say anything useful
  var cx=r.x+Math.round(r.w/2);
  if(plDropHover){ drawDropZone(gr,cx,top,availW,availH); return; }

  var badge=availH>=250, sub=availH>=170;            // 216 / 130 / 106 px of content
  var blockH=(badge?86:0)+40+(sub?24:0)+24+PILL_H;
  var y=top+Math.round((availH-blockH)/2);
  if(badge){
    var bs=64, bx=cx-bs/2;
    gr.FillEllipse(bx,y,bs,bs,RGBA(255,255,255,16));   // a lift off COL.base, not a hard disc
    drawIcon(gr,'add',COL.text2,bx,y,bs,bs,26);
    y+=86;
  }
  tC(gr,"Let's add some songs",FONT.sect2,COL.text,r.x,y,r.w,40); y+=40;
  if(sub){ tC(gr,'Drag files here, or browse your computer.',FONT.meta,COL.text2,r.x,y,r.w,24); y+=24; }
  y+=24;
  // the pair hugs its labels and centres as a group, so the widths stay balanced at any UISCALE
  var w1=pillW(gr,'Browse files'), w2=pillW(gr,'Browse folder'), gap=12;
  var px=cx-Math.round((w1+w2+gap)/2);
  HB_PLADD_FILES=drawPill(gr,px,y,w1,'Browse files',true);
  HB_PLADD_FOLDER=drawPill(gr,px+w1+gap,y,w2,'Browse folder',false);
}
// green wash + rounded outline + label: the shape the cursor is aiming at
function drawDropZone(gr,cx,top,availW,availH){
  var bw=Math.min(560,availW), bh=Math.min(260,availH-24);
  var bx=cx-Math.round(bw/2), by=top+Math.round((availH-bh)/2), rad=Math.min(14,bw/2,bh/2);
  gr.FillRoundRect(bx,by,bw,bh,rad,rad,RGBA(30,215,96,26));
  strokeRound(gr,bx,by,bw,bh,rad,2,COL.green);
  var iy=by+Math.round(bh/2)-40;
  drawIcon(gr,'add',COL.green,bx,iy,bw,34,34);
  tC(gr,'Drop to add to this playlist',FONT.sect,COL.green,bx,iy+44,bw,26);
}
/* Spotify-style pill buttons: primary is a solid white capsule with black text,
   secondary is outlined. Both nudge outward on hover (the component has no transforms,
   so "scale" is a 2px grow), inside a hitbox padded enough that the grow can't flicker. */
var PILL_H=42;
function pillW(gr,label){ return Math.max(140,gr.CalcTextWidth(label,FONT.pl)+48); }
function drawPill(gr,x,y,w,label,primary){
  var hb={x0:x-3,y0:y-3,x1:x+w+3,y1:y+PILL_H+3};
  var g=hv(hb.x0,hb.y0,hb.x1,hb.y1)?2:0;
  var bx=x-g, by=y-g, bw=w+g*2, bh=PILL_H+g*2, rad=bh/2;
  if(primary) gr.FillRoundRect(bx,by,bw,bh,rad,rad,COL.text);
  else strokeRound(gr,bx,by,bw,bh,rad,g?2:1,g?COL.text:COL.text2);
  tC(gr,label,FONT.pl,primary?COL.black:COL.text,bx,by,bw,bh);
  return hb;
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
  if(!warmed['home']){ warmed['home']=1; var wa=[],wi; for(wi=0;wi<arts.length;wi++) wa.push(artistCover(arts[wi].name,arts[wi].handle)); for(wi=0;wi<pls.length;wi++) wa.push(plCovers(pls[wi]).single); warmArt(wa); }   // warm artist avatars + shelf covers
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
  gr.FillSolidRect(r.x,cropY,r.w,M.pad+2,COL.black);   // gutter below the panel              // crop below the grid

  // ---- 2) shelf + section titles drawn ON TOP (covers the grid's top overflow) ----
  gr.FillSolidRect(r.x,r.y,r.w,gy-r.y,COL.base);                 // clear the whole band above the grid viewport
  tL(gr,'Your Playlists',FONT.sect2,COL.text,x0,shelfTitleY,w,28);
  HOME_PLMAX=Math.max(0,pls.length-cols);
  if(plScroll>HOME_PLMAX) plScroll=HOME_PLMAX; if(plScroll<0) plScroll=0;
  for(i=plScroll;i<pls.length;i++){
    var cx=x0+(i-plScroll)*(scardW+gap); if(cx>=rightEdge) break;
    drawPlaylistCard(gr,cx,shelfY,scardW,pls[i]);
  }
  gr.FillSolidRect(rightEdge,shelfY,M.gap+2,scardH+2,COL.black);   // gap between shelf and queue
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
  var cover=artistAlbums.length?artistAlbums[0].handle:null;   // optimistic (art loads async)
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
/* ---- All Songs: header + group-by pill + grouped/flat track list ---- */
function drawGroupPill(gr,x,y,w,h){
  var open=sgMenuOpen, hov=hv(x,y,x+w,y+h);
  gr.FillRoundRect(x,y,w,h,h/2,h/2,(open||hov)?RGB(58,58,58):RGBA(0,0,0,90));
  tL(gr,'Group: '+sgLabel(),FONT.pl,COL.text,x+18,y,w-46,h);
  drawIcon(gr,'chevron',COL.text2,x+w-32,y+(h-20)/2,20,20,18);
  HB_SG={x0:x,y0:y,x1:x+w,y1:y+h};
}
function drawGroupMenu(gr){          // drawn last so it floats over the track list
  SG_HB=[];
  if(!sgMenuOpen || !HB_SG) return;
  var bw=Math.max(216,HB_SG.x1-HB_SG.x0), ih=40, bx=HB_SG.x1-bw, iy=HB_SG.y1+6, bh=SONGS_GROUPS.length*ih+10;
  gr.FillSolidRect(bx+3,iy+4,bw,bh,RGBA(0,0,0,120));
  gr.FillRoundRect(bx,iy,bw,bh,8,8,RGB(43,43,43));
  for(var i=0;i<SONGS_GROUPS.length;i++){
    var ry=iy+5+i*ih, on=(SONGS_GROUPS[i][1]===songsGroup);
    if(hv(bx,ry,bx+bw,ry+ih)) gr.FillRoundRect(bx+4,ry,bw-8,ih,5,5,RGBA(255,255,255,20));
    tL(gr,SONGS_GROUPS[i][0],FONT.pl,on?COL.green:COL.text,bx+18,ry,bw-30,ih);
    SG_HB.push({x0:bx,y0:ry,x1:bx+bw,y1:ry+ih,g:SONGS_GROUPS[i][1]});
  }
}
function drawSongs(gr,r){
  HB_TR=[]; HB_CARD=[]; HB_SG=null;
  if(!songsRows) buildSongsRows();
  var cov=libCovers(), g=songsGroup;
  // header: gradient wash + mosaic cover + title/meta, mirroring the playlist header
  gr.FillGradRect(r.x,r.y,r.w,SHEAD,90,blend(artHue(cov.single,'__lib__'),COL.base,0.42),COL.base,1.0);
  var rx=r.x+r.w-M.cpad, lx=r.x+M.cpad, ay=r.y+44, art=M.artSz;
  drawLibCover(gr,lx,ay,art,8);
  // header text stops short of the pill's column so the two can never collide on a narrow panel
  var pillW=232, pillX=Math.max(lx+art+24,rx-pillW);
  var tx=lx+art+24, tw=Math.max(120,pillX-12-tx);
  tL(gr,'LIBRARY',FONT.eyebrow,COL.text,tx,ay+6,tw,18);
  tL(gr,'All Songs',FONT.title,COL.text,tx,ay+28,tw,84);
  tL(gr,fmtNum(songsTracks.length)+' songs'+(songsTotalSec>0?(' '+CH_DOT+' '+fmtDur(songsTotalSec)):''),FONT.meta,COL.text2,tx,ay+150,tw,22);
  drawGroupPill(gr,pillX,ay+142,pillW,38);

  if(!songsRows.length){
    tC(gr,'Nothing in your library yet',FONT.sect,COL.text2,r.x,r.y+SHEAD+40,r.w,24);
    tC(gr,'Add a music folder via Library '+CH_BULL+' Configure.',FONT.qArtist,COL.text3,r.x,r.y+SHEAD+70,r.w,18);
    return;
  }

  /* ---- columns ----
     Flat mode mirrors the playlist view (cover + two-line title/artist + ALBUM column).
     Grouped mode strips all of that: the header directly above already shows the artwork,
     the album and the artist, so repeating them per row is noise. Rows become single-line
     and indent under their header, one step per nesting level, so containment reads at a
     glance. The secondary column follows suit: ALBUM when flat, ARTIST when grouped by
     album (compilations differ per track), nothing when grouped by artist. */
  var flat=(g==='none'), tind=flat?0:(g==='both'?SG_IND*2:SG_IND);
  var showAlbum=flat, showArtist=(g==='album');
  // index column: wide enough for the largest number it can hold (whole library when flat,
  // per-group otherwise) so digits never clip against the title
  var numW=flat?46:36, durW=64, cgap=16;
  var numX=lx+tind, titleX=numX+numW+cgap;
  var colW=showAlbum?Math.round((rx-titleX-durW-cgap*2)*0.34):(showArtist?Math.round((rx-titleX-durW-cgap*2)*0.28):0);
  var colX=rx-durW-cgap-colW;
  var titleW=(colW?colX:rx-durW)-cgap-titleX;

  var listTop=r.y+SHEAD+8;
  var rowsTop=listTop+34, cropY=r.y+r.h, viewH=cropY-rowsTop;
  var contentH=songsContentH, maxPx=Math.max(0,contentH-viewH);
  SONGS_MAXPX=maxPx;
  if(songsScroll>maxPx) songsScroll=maxPx; if(songsScroll<0) songsScroll=0;
  if(songsScrollT>maxPx) songsScrollT=maxPx; if(songsScrollT<0) songsScrollT=0;
  var j0=songsFirstAt(songsScroll);
  // Nested mode: a vertical rail runs from each artist banner down past all of its albums, so
  // you can always see which artist the block you're looking at belongs to. Drawn before the
  // rows so hover fills paint over it. Starts from the group owning the first visible row -
  // the banner itself is often scrolled away.
  if(g==='both' && j0<songsRows.length){
    var q0=(songsRows[j0].g1i!==undefined)?songsRows[j0].g1i:j0;
    for(var q=q0;q<songsRows.length;q++){
      var gq=songsRows[q]; if(gq.k!=='g1') continue;
      var rt=rowsTop+gq.y+gq.h-songsScroll-4, rb=rowsTop+(gq.y1||0)-songsScroll-8;
      if(rt>=cropY) break;
      var t0=Math.max(rt,rowsTop), t1=Math.min(rb,cropY);
      if(t1>t0) gr.FillSolidRect(lx+SG_IND/2-1,t0,2,t1-t0,RGBA(255,255,255,30));   // centred in the indent gutter
    }
  }
  for(var j=j0; j<songsRows.length; j++){
    var row=songsRows[j], ry=rowsTop+row.y-songsScroll, gh=row.h;
    if(ry>=cropY) break;
    var vy0=Math.max(ry,rowsTop), vy1=Math.min(ry+gh,cropY);   // visible band: rows scrolled
    if(vy1<=vy0) continue;                                     // under the sticky header don't take the mouse
    if(row.k==='t'){
      var t=row.t, isPlaying=!!(NP && t.h && t.h.Path===NP.Path);
      var isHover=hv(lx-8,vy0,rx+8,vy1);
      if(isHover) gr.FillRoundRect(lx-8,ry,rx-lx+16,gh,4,4,COL.rowHover);
      if(isHover) drawIcon(gr,'play',COL.text,numX,ry,numW,gh,14);
      else tR(gr,String(row.n),FONT.rowNum,isPlaying?COL.green:COL.text2,numX,ry,numW-8,gh);
      if(flat){
        var cs=40, cy=ry+(gh-cs)/2;
        drawCover(gr,titleX,cy,cs,3,t.h,t.album||t.title,t.artkey);
        tL(gr,t.title,FONT.rowTitle,isPlaying?COL.green:COL.text,titleX+cs+12,ry+8,titleW-cs-12,20);
        tL(gr,t.artist,FONT.rowArtist,COL.text2,titleX+cs+12,ry+30,titleW-cs-12,16);
      } else {
        tL(gr,t.title,FONT.rowTitle,isPlaying?COL.green:COL.text,titleX,ry,titleW,gh);
      }
      if(showAlbum) tL(gr,t.album,FONT.rowCell,COL.text2,colX,ry,colW,gh);
      else if(showArtist) tL(gr,t.artist,FONT.rowCell,COL.text2,colX,ry,colW,gh);
      tR(gr,t.len,FONT.rowCell,COL.text2,rx-durW,ry,durW,gh);
      HB_TR.push({x0:lx-8,y0:vy0,x1:rx+8,y1:vy1,songs:true,ti:row.ti});
    } else {
      /* Group header. Every kind is the same block on the same rhythm - GAP above (where the
         divider rule sits), artwork, PADB below - differing only in indent, artwork size and,
         for the artist banner, a slab + eyebrow. All offsets derive from the metrics above so
         the tiers stay on one grid. */
      var nest=(row.k==='g2'), isArt=(row.kind==='artist'), banner=(isArt && g==='both');
      var gap=nest?SG_GAP2:SG_GAP1, acs=nest?SG_ART2:SG_ART1;
      var blockTop=ry+gap, blockH=gh-gap-(nest?SG_PADB2:SG_PADB1);
      var hx=lx+(nest?SG_IND:0), hy=blockTop+(banner?SG_SLABP:0);
      // divider only once the row's top edge is actually in view (it sits above the crop band)
      if(j>0 && !nest && ry+2>=rowsTop) gr.DrawLine(lx,ry+2,rx,ry+2,banner?2:1,COL.line);
      var hb0=Math.max(blockTop-(banner?0:4),rowsTop), hb1=vy1;
      var hHov=isArt && hb1>hb0 && hv(lx-8,hb0,rx+8,hb1);
      if(banner) gr.FillRoundRect(lx-8,blockTop,rx-lx+16,blockH,8,8,hHov?COL.hover:RGB(34,34,34));
      else if(hHov) gr.FillRoundRect(lx-8,blockTop-4,rx-lx+16,blockH+8,6,6,COL.rowHover);
      if(isArt) drawCircle(gr,hx,hy,acs,artistCover(row.label,row.handle),row.label);
      else drawRounded(gr,hx,hy,acs,5,row.handle,row.seed);
      // text block centred against the artwork, and running to the same right edge as the rows
      var htx=hx+acs+SG_TGAP, htw=rx-htx;
      var eyeH=banner?16:0, nameH=nest?22:26, subH=16;
      var ty0=Math.round(hy+acs/2-(eyeH+nameH+subH)/2);
      var sub=banner?(fmtNum(row.albums||1)+' album'+((row.albums||1)===1?'':'s')+'  '+CH_DOT+'  '+fmtNum(row.count)+' songs')
                    :((row.sub?row.sub+'  '+CH_DOT+'  ':'')+fmtNum(row.count)+' songs');
      if(banner) tL(gr,'ARTIST',FONT.eyebrow,COL.text3,htx,ty0,htw,eyeH);
      tL(gr,row.label,nest?FONT.sect:FONT.sect2,COL.text,htx,ty0+eyeH,htw,nameH);
      tL(gr,sub,FONT.plSub,COL.text2,htx,ty0+eyeH+nameH,htw,subH);
      // artist headers are a shortcut to the full artist page (same target kind as an artist card)
      if(isArt && hb1>hb0) HB_CARD.push({x0:lx-8,y0:hb0,x1:rx+8,y1:hb1,kind:'artist',id:row.label});
    }
  }
  // crop the partial rows top & bottom (tallest row is a group header), then the sticky column header
  gr.FillSolidRect(r.x,rowsTop-SG_CROP,r.w,SG_CROP,COL.base);
  gr.FillSolidRect(r.x,cropY,r.w,M.pad+2,COL.black);   // gutter below the panel
  tR(gr,'#',FONT.head,COL.text2,numX,listTop,numW-8,20);
  tL(gr,'TITLE',FONT.head,COL.text2,titleX,listTop,titleW,20);
  if(showAlbum) tL(gr,'ALBUM',FONT.head,COL.text2,colX,listTop,colW,20);
  else if(showArtist) tL(gr,'ARTIST',FONT.head,COL.text2,colX,listTop,colW,20);
  drawIcon(gr,'clock',COL.text2,rx-16,listTop,16,20,15);
  gr.DrawLine(lx,listTop+26,rx,listTop+26,1,COL.line);
  drawScrollbar(gr,rx+8,rowsTop,viewH,songsScroll,maxPx,viewH,contentH,hv(r.x,r.y,r.x+r.w,cropY)||drag==='scroll');
  drawGroupMenu(gr);
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
  // loop-one: playback just repeats the current song, so show only that
  if(pbRepeat===2){
    if(NP && qy+rh+30<bottom){
      tL(gr,'Repeating this song',FONT.sect,COL.text,x,qy,r.w-36,24); qy+=36;
      drawCover(gr,x,qy,44,4,NP,'np');
      tL(gr,npTitleStr,FONT.qName,COL.green,x+56,qy+5,r.w-36-56,18);
      tL(gr,npArtistStr,FONT.qArtist,COL.text2,x+56,qy+25,r.w-36-56,16);
    }
    return;
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

function ctrlBtn(gr,name,cx,cyc,active,act,rad,isz){
  rad=rad||18; isz=isz||22;
  drawIcon(gr,name,active?COL.green:(hv(cx-rad,cyc-rad,cx+rad,cyc+rad)?COL.text:COL.text2),cx-rad,cyc-rad,rad*2,rad*2,isz);
  HB_CTRL.push({x0:cx-rad,y0:cyc-rad,x1:cx+rad,y1:cyc+rad,act:act});
}
function drawBar(gr){
  HB_CTRL=[];
  var by=R.barY;
  gr.FillSolidRect(0,by,W,M.barH,COL.black);
  var np=fb.IsPlaying||fb.IsPaused, playing=np&&fb.IsPlaying&&!fb.IsPaused;
  // left: cover + title/artist
  var cs=64, cx=16, cy=by+(M.barH-cs)/2;
  drawCover(gr,cx,cy,cs,5,NP,'np');
  var tx=cx+cs+14;
  tL(gr,npTitleStr,FONT.npTitle,COL.text,tx,by+26,260,20);
  tL(gr,npArtistStr,FONT.npArtist,COL.text2,tx,by+50,260,18);
  // center: transport row + seekbar
  var cxC=Math.round(W/2);
  var pcy=by+34, pb=hv(cxC-27,by+7,cxC+27,by+61)?52:48, pbx=cxC-pb/2, pby=pcy-pb/2;
  var shufOn=pbShuffle, repMode=pbRepeat;
  ctrlBtn(gr,'shuffle',cxC-108,pcy,shufOn,'shuffle',22,26);
  ctrlBtn(gr,'prev',cxC-58,pcy,false,'prev',22,26);
  gr.FillEllipse(pbx,pby,pb,pb,COL.text);
  drawIcon(gr,playing?'pause':'play',COL.black,pbx,pby,pb,pb,Math.round(pb*0.5));
  HB_CTRL.push({x0:pbx,y0:pby,x1:pbx+pb,y1:pby+pb,act:'play'});
  ctrlBtn(gr,'next',cxC+58,pcy,false,'next',22,26);
  ctrlBtn(gr,repMode===2?'repeat1':'repeat',cxC+108,pcy,repMode>0,'repeat',22,26);
  var sbW=Math.min(Math.round(W*0.36),560), sbX=cxC-sbW/2, sbY=by+74;
  var len=fb.PlaybackLength, pos=(drag==='seek')?dragFrac:(len>0?fb.PlaybackTime/len:0);
  gr.FillSolidRect(sbX,sbY,sbW,5,COL.seekbg);
  if(pos>0) gr.FillSolidRect(sbX,sbY,Math.max(1,Math.round(sbW*pos)),5,COL.text);
  tR(gr,fmtTime((drag==='seek')?len*dragFrac:fb.PlaybackTime),FONT.time,COL.text2,sbX-54,sbY-7,46,17);
  tL(gr,fmtTime(len),FONT.time,COL.text2,sbX+sbW+10,sbY-7,46,17);
  HB_SEEK={x0:sbX,y0:sbY-10,x1:sbX+sbW,y1:sbY+15,x:sbX,w:sbW};
  // right: volume + fullscreen
  var gearC=by+M.barH/2;
  var fsx=W-46;   // enter-fullscreen button, far right
  drawIcon(gr,'expand',hv(fsx-8,gearC-16,fsx+30,gearC+16)?COL.text:COL.text2,fsx,gearC-13,26,26,22);
  HB_CTRL.push({x0:fsx-8,y0:gearC-16,x1:fsx+30,y1:gearC+16,act:'fullscreen'});
  var volW=104, volX=fsx-24-volW, volY=gearC-2;
  drawIcon(gr,'volume',COL.text2,volX-32,gearC-13,26,26,22);
  var vp=clamp01(vol2pos(fb.Volume));
  gr.FillSolidRect(volX,volY,volW,5,COL.seekbg);
  gr.FillSolidRect(volX,volY,Math.max(1,Math.round(volW*vp)),5,COL.text);
  HB_VOL={x0:volX,y0:volY-10,x1:volX+volW,y1:volY+15,x:volX,w:volW};
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
  loadLyrics();   // reload for the current track (fast: cached by track; reloads on track change)
  if(!lyrics || lyrics==='none' || !lyrics.lines || !lyrics.lines.length){ tC(gr,'No lyrics found',FONT.sect2,COL.text2,0,Math.round(H*0.45),W,40); return; }
  if(lyrics.synced) drawRollingLyrics(gr,140,150,W-280,bot,FONT.fsLyric,COL.green,'c');
  else { stopLyAnim(); var L=lyLayout(gr,W-280,FONT.fsLyric), yy=170, s; for(var li=0;li<lyrics.lines.length;li++){ var p=L.subs[li]; for(s=0;s<p.length&&yy+L.subLh<=bot;s++){ tC(gr,p[s],FONT.fsLyric,COL.text2,140,yy,W-280,L.subLh); yy+=L.subLh; } yy+=Math.round(L.subLh*0.4); if(yy>=bot) break; } }
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
  if(ctxMenu||confirmDel||renameEdit||sgMenuOpen) return;   // overlays are modal; dismissal/actions handled on button-up
  if(HB_SEEK && inRect(x,y,HB_SEEK)){ drag='seek'; dragFrac=seekFrac(x); repaintBar(); return; }
  if(HB_VOL && inRect(x,y,HB_VOL)){ drag='vol'; applyVol(x); return; }
  if(SBH && inRect(x,y,SBH)){ drag='scrollh'; setScrollH(x); return; }
  if(SBN && inRect(x,y,SBN)){ drag='scrolln'; setScrollN(y); return; }
  if(SB && inRect(x,y,SB)){ drag='scroll'; setScroll(y); return; }
}
function on_mouse_rbtn_up(x,y){
  if(ctxMenu||confirmDel||renameEdit) return true;   // a modal is open: swallow
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
      var act=CTX_HB[ci].act, pl=ctxMenu.pl, nm=ctxMenu.name, itm=ctxMenu.item;
      if(act==='trkremove'){ ctxMenu=null; removeTrackFromPl(pl,itm); return; }
      // navigate to the target first, so the tracks land somewhere the user can actually see
      if(act==='addfiles'||act==='addfolder'){
        ctxMenu=null; firstRow=firstRowT=0; view='playlist'; repaintAll();
        if(act==='addfiles') addFilesToPl(pl); else addFolderToPl(pl);
      }
      else if(act==='rename'){ startRename(pl); }
      else { confirmDel={pl:pl,name:nm}; ctxMenu=null; repaintAll(); }
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
  // group-by dropdown (All Songs) - open menu is modal-ish: any click either picks or closes it
  if(sgMenuOpen){
    var sg; for(sg=0;sg<SG_HB.length;sg++){ if(inRect(x,y,SG_HB[sg])){ setSongsGroup(SG_HB[sg].g); return; } }
    sgMenuOpen=false; repaintAll(); return;
  }
  if(HB_SG && inRect(x,y,HB_SG)){ sgMenuOpen=true; repaintAll(); return; }
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
  if(HB_ALLSONGS && inRect(x,y,HB_ALLSONGS)){ if(view!=='songs'){ view='songs'; songsScroll=songsScrollT=0; } repaintAll(); return; }
  if(HB_ADDPL && inRect(x,y,HB_ADDPL)){ var np=createNewPlaylist(); plman.ActivePlaylist=np; revealPlaylist(np); firstRow=firstRowT=0; view='playlist'; repaintAll(); return; }
  if(HB_PLADD_FILES && inRect(x,y,HB_PLADD_FILES)){ addFilesToPl(plman.ActivePlaylist); return; }
  if(HB_PLADD_FOLDER && inRect(x,y,HB_PLADD_FOLDER)){ addFolderToPl(plman.ActivePlaylist); return; }
  for(i=0;i<HB_CARD.length;i++){ if(inRect(x,y,HB_CARD[i])){ var c=HB_CARD[i]; if(c.kind==='pl'){ plman.ActivePlaylist=c.id; firstRow=firstRowT=0; view='playlist'; } else { loadArtist(c.id); view='artist'; } repaintAll(); return; } }
  for(i=0;i<HB_PL.length;i++){ if(inRect(x,y,HB_PL[i])){ plman.ActivePlaylist=HB_PL[i].i; firstRow=firstRowT=0; view='playlist'; repaintAll(); return; } }
  for(i=0;i<HB_TR.length;i++){ if(inRect(x,y,HB_TR[i])){ var tr=HB_TR[i]; if(tr.srch){ var hs=[]; for(var m2=0;m2<searchTrks.length;m2++) hs.push(searchTrks[m2].h); playHandleList(hs,tr.idx); } else if(tr.songs) playSongsRow(tr.ti); else if(tr.lib) playArtistTrack(tr.block,tr.idx); else playPlaylistItem(tr.pl,tr.item); repaintAll(); return; } }
}
function hoverSig(x,y){
  var i;
  if(renameEdit){ if(RENAME_HB){ if(inRect(x,y,RENAME_HB.save)) return 'rns'; if(inRect(x,y,RENAME_HB.cancel)) return 'rnc'; } return 'rn'; }
  if(confirmDel){ if(CONF_HB && inRect(x,y,CONF_HB.del)) return 'cfd'; if(CONF_HB && inRect(x,y,CONF_HB.cancel)) return 'cfc'; return 'cf'; }
  if(ctxMenu){ for(i=0;i<CTX_HB.length;i++) if(inRect(x,y,CTX_HB[i])) return 'cx'+i; return 'cx'; }
  if(sgMenuOpen){ for(i=0;i<SG_HB.length;i++) if(inRect(x,y,SG_HB[i])) return 'sg'+i; return 'sg'; }
  for(i=0;i<HB_DOTS.length;i++) if(inRect(x,y,HB_DOTS[i])) return 'd'+i;
  if(y<TBH){ for(var mj=0;mj<HB_MENU.length;mj++) if(inRect(x,y,HB_MENU[mj])) return 'mnu'+mj; if(HB_CAP && x>=HB_CAP.minX) return 'cap'+(((x-HB_CAP.minX)/HB_CAP.bw)|0); return ''; }
  if(SBH && inRect(x,y,SBH)) return 'sbh';
  if(SBN && inRect(x,y,SBN)) return 'sbn';
  if(HB_ADDPL && inRect(x,y,HB_ADDPL)) return 'addpl';
  if(HB_PLADD_FILES && inRect(x,y,HB_PLADD_FILES)) return 'pladdf';
  if(HB_PLADD_FOLDER && inRect(x,y,HB_PLADD_FOLDER)) return 'pladdd';
  if(HB_ALLSONGS && inRect(x,y,HB_ALLSONGS)) return 'als';
  if(HB_SG && inRect(x,y,HB_SG)) return 'sgb';
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
    if(view==='songs') return 'songs';
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
  else if(view==='songs'){ songsScrollT-=step*WHEEL_PX; if(songsScrollT<0)songsScrollT=0; if(songsScrollT>SONGS_MAXPX)songsScrollT=SONGS_MAXPX; startScrollAnim(); return; }   // smooth, like the playlist list
  else if(view==='search'){ searchScroll-=step*3; if(searchScroll<0)searchScroll=0; repaintAll(); return; }
  else if(view==='artist'){ artScroll-=step; if(artScroll<0)artScroll=0; if(artScroll>ART_MAXBLOCK)artScroll=ART_MAXBLOCK; repaintAll(); return; }
  firstRowT-=step*WHEEL_PX; if(firstRowT<0)firstRowT=0; if(firstRowT>PL_MAXPX)firstRowT=PL_MAXPX; startScrollAnim();   // playlist songs: smooth
}
/* ---- drag & drop external files ------------------------------------------------
   Two targets: the library section (-> creates a new playlist) and the body of the
   playlist view (-> appends to the playlist you're looking at). Everywhere else denies.
   Note we never see the dropped paths: DropTargetAction exposes Playlist/Base/ToSelect
   write-only, so we just name a destination and the component performs the insert. */
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
    action.Playlist=pi; action.Base=plman.PlaylistItemCount(pi); action.ToSelect=true;   // append at end
    action.Effect=(action.Effect&1)?1:4;
  } else action.Effect=0;
  navDropHover=false; plDropHover=false; repaintAll();
}
function on_script_unload(){ stopLyAnim(); stopCaret(); stopViz(); stopScrollAnim(); }
function invalidateLibrary(){
  artistList=null; artistTracksMap=null; artistCoverCache={}; warmed={}; searchIdx=null; searchQ2=null;
  songsIdx=null; songsRows=null; songsTracks=null; libCovCache=null; libCount_=-1;
}
function on_library_items_added(){ invalidateLibrary(); repaintAll(); }
function on_library_items_removed(){ invalidateLibrary(); repaintAll(); }
function on_library_items_changed(){ invalidateLibrary(); repaintAll(); }

/* ------------------------- playback callbacks ------------------------- */
function on_playback_new_track(){
  updateNP();
  // shuffle + loop-all: when playback wraps from the last shuffled track back to the first, reshuffle the rest
  if(pbShuffle){
    var loc=plman.GetPlayingItemLocation?plman.GetPlayingItemLocation():null;
    var sp=playlistOfName(SHUF), idx=(loc&&loc.IsValid&&loc.PlaylistIndex===sp)?loc.PlaylistItemIndex:-1;
    if(sp>=0 && idx>=0){
      var cnt=plman.PlaylistItemCount(sp);
      if(pbRepeat===1 && lastShufIdx===cnt-1 && idx===0) reshuffleTail(sp);
      lastShufIdx=idx;
    } else lastShufIdx=-1;
  } else lastShufIdx=-1;
  repaintAll();
}
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
function on_metadb_changed(handles,fromhook){ if(fromhook) return; invalidateItems(); albKeyCache={}; hueCache={}; artistCoverCache={}; songsIdx=null; songsRows=null; songsTracks=null; updateNP(); repaintAll(); }
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
