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

window.DefineScript('Spotify for foobar2000', { author:'zulvanavivi', options:{ grab_focus:false } });

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

/* ------------------------- fonts (create once) ------------------------- */
function F(sz,bold){ return gdi.Font('Segoe UI', sz, bold?1:0); }
var FONT = {
  nav:F(15,1), lib:F(15,1), pl:F(13,1), plSub:F(11,0),
  eyebrow:F(11,1), title:F(52,1), meta:F(13,0),
  rowTitle:F(14,0), rowArtist:F(12,0), rowNum:F(13,0), rowCell:F(13,0), head:F(12,1),
  tab:F(16,1), sect:F(15,1), qName:F(13,0), qArtist:F(11,0),
  npTitle:F(13,0), npArtist:F(11,0), time:F(11,0), prefs:F(11,0), glyph:F(15,0)
};
FONT.icon = gdi.Font('Segoe MDL2 Assets', 12, 0);
FONT.iconBtn = gdi.Font('Segoe MDL2 Assets', 14, 0);
FONT.card = gdi.Font('Segoe UI', 14, 1);
FONT.sect2 = gdi.Font('Segoe UI', 22, 1);
var GLYPH = { play:String.fromCharCode(0xE768), pause:String.fromCharCode(0xE769), prev:String.fromCharCode(0xE892), next:String.fromCharCode(0xE893), shuffle:String.fromCharCode(0xE8B1), repeat:String.fromCharCode(0xE8EE) };
GLYPH.repeat1=String.fromCharCode(0xE8ED); GLYPH.volume=String.fromCharCode(0xE767); GLYPH.settings=String.fromCharCode(0xE713);

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
var artCache={};
function getArt(h){
  if(!h) return null;
  var k=TF.albkey.EvalWithMetadb(h);
  if(artCache.hasOwnProperty(k)) return artCache[k];
  var img=null;
  try{ img=utils.GetAlbumArtV2(h,0); if(img&&img.Width>500){ img=img.Resize(500,Math.round(img.Height*500/img.Width),2); } }catch(e){ img=null; }
  artCache[k]=img||null;
  return artCache[k];
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
function drawCover(gr,x,y,sz,rad,h,seed){
  var img=getArt(h);
  if(img){ gr.DrawImage(img,x,y,sz,sz,0,0,img.Width,img.Height,0,255); }
  else if(rad>0){ gr.FillRoundRect(x,y,sz,sz,rad,rad,coverCol(seed)); }
  else { gr.FillSolidRect(x,y,sz,sz,coverCol(seed)); }
}

/* ------------------------- state ------------------------- */
var W=window.Width, H=window.Height, R={}, NP=null;
var firstRow=0, hoverTrack=-1, mx=-1, my=-1;
var HB_PL=[], HB_TR=[], HB_PREFS=null, HB_CTRL=[], HB_TABS=[], HB_SEEK=null, HB_VOL=null;
var HB_CARD=[], HB_ARTIST=[], HB_HOME=null;
var rightTab='queue';
var view='playlist', viewArtist='', artistAlbums=[], homeScroll=0, artScroll=0;
var HOME_MAXROW=0, ART_MAXBLOCK=0;
var plCacheMap={};
function getItems(pi){ if(!plCacheMap[pi]){ plCacheMap[pi]=plman.GetPlaylistItems(pi); } return plCacheMap[pi]; }
function invalidateItems(){ plCacheMap={}; }

function layout(){
  var pad=M.pad, gap=M.gap;
  R.barY=H-M.barH;
  R.top={x:pad,y:pad,bottom:R.barY-pad};
  R.navX=pad; R.navW=M.navW;
  R.queueW=M.queueW; R.queueX=W-pad-R.queueW;
  R.mainX=R.navX+R.navW+gap; R.mainW=R.queueX-gap-R.mainX;
  var topH=R.top.bottom-R.top.y;
  R.navTop={x:R.navX,y:pad,w:R.navW,h:M.navTopH};
  R.navLib={x:R.navX,y:pad+M.navTopH+gap,w:R.navW,h:topH-M.navTopH-gap};
  R.main={x:R.mainX,y:pad,w:R.mainW,h:topH};
  R.queue={x:R.queueX,y:pad,w:R.queueW,h:topH};
}
function on_size(w,h){ W=w; H=h; layout(); }

function activePl(){ var i=plman.ActivePlaylist; return {i:i, name:i>=0?plman.GetPlaylistName(i):'', count:i>=0?plman.PlaylistItemCount(i):0}; }

/* ------------------------- paint ------------------------- */
function panelBg(gr,r,c){ gr.FillRoundRect(r.x,r.y,r.w,r.h,M.radius,M.radius,c); }

function on_paint(gr){
  gr.SetSmoothingMode(2);
  NP=(fb.IsPlaying||fb.IsPaused)?fb.GetNowPlaying():null;
  gr.FillSolidRect(0,0,W,H,COL.black);
  drawNav(gr);
  drawMain(gr);
  drawQueue(gr);
  drawBar(gr);
}

function drawNav(gr){
  HB_PL=[];
  // top card
  panelBg(gr,R.navTop,COL.base);
  var x=R.navTop.x+18, w=R.navTop.w-30;
  tL(gr,'Home',FONT.nav,view==='home'?COL.text:COL.text2,x,R.navTop.y+12,w,32);
  tL(gr,'Search',FONT.nav,COL.text2,x,R.navTop.y+12+38,w,32);
  HB_HOME={x0:R.navTop.x+8,y0:R.navTop.y+8,x1:R.navTop.x+R.navTop.w-8,y1:R.navTop.y+44};
  // library card
  panelBg(gr,R.navLib,COL.base);
  tL(gr,'Your Library',FONT.lib,COL.text2,R.navLib.x+18,R.navLib.y+14,R.navLib.w-56,26);
  tR(gr,'+',FONT.tab,COL.text2,R.navLib.x,R.navLib.y+14,R.navLib.w-16,26);
  var listTop=R.navLib.y+52, rh=58, bottom=R.navLib.y+R.navLib.h;
  var active=plman.ActivePlaylist, n=plman.PlaylistCount;
  for(var i=0;i<n;i++){
    var ry=listTop+i*rh;
    if(ry+rh>bottom) break;
    var isA=(i===active);
    if(isA) gr.FillRoundRect(R.navLib.x+8,ry,R.navLib.w-16,rh-4,6,6,COL.rowActive);
    var cs=44, cx=R.navLib.x+16, cy=ry+(rh-cs)/2;
    drawCover(gr,cx,cy,cs,4,firstHandle(i),plman.GetPlaylistName(i));
    var tx=cx+cs+12, tw=R.navLib.x+R.navLib.w-16-tx;
    tL(gr,plman.GetPlaylistName(i),FONT.pl,isA?COL.green:COL.text,tx,ry+8,tw,20);
    tL(gr,'Playlist · '+plman.PlaylistItemCount(i)+' songs',FONT.plSub,COL.text2,tx,ry+30,tw,16);
    HB_PL.push({x0:R.navLib.x,y0:ry,x1:R.navLib.x+R.navLib.w,y1:ry+rh,i:i});
  }
}

function drawMain(gr){
  var r=R.main; panelBg(gr,r,COL.base);
  if(view==='home'){ drawHome(gr,r); return; }
  if(view==='artist'){ drawArtist(gr,r); return; }
  drawPlaylist(gr,r);
}
function drawPlaylist(gr,r){
  HB_TR=[]; HB_ARTIST=[];
  var p=activePl();
  // header gradient wash (square top corners; polish later)
  gr.FillGradRect(r.x,r.y,r.w,M.headH,90,blend(coverCol(p.name),COL.base,0.35),COL.base,1.0);
  var ax=r.x+M.cpad, ay=r.y+44, art=M.artSz;
  drawCover(gr,ax,ay,art,6,firstHandle(p.i),p.name);
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
  var items=getItems(p.i);
  for(var v=0; v<visible; v++){
    var j=firstRow+v; if(j>=p.count) break;
    var h=items[j]; if(!h){ continue; }
    var ry=rowsTop+v*rh;
    var isPlaying=playingLoc && playingLoc.IsValid && playingLoc.PlaylistIndex===p.i && playingLoc.PlaylistItemIndex===j;
    var isHover=(j===hoverTrack);
    if(isHover) gr.FillRoundRect(lx-8,ry,rx-lx+16,rh,4,4,COL.rowHover);
    var titleCol=isPlaying?COL.green:COL.text;
    // index / play glyph on hover
    if(isHover) tC(gr,GLYPH.play,FONT.icon,COL.text,lx,ry,numW,rh);
    else tL(gr,String(j+1),FONT.rowNum,isPlaying?COL.green:COL.text2,lx,ry,numW,rh);
    // cover + title + artist
    var cs=40, cy=ry+(rh-cs)/2;
    var alb=TF.album.EvalWithMetadb(h);
    drawCover(gr,titleX,cy,cs,3,h,alb||String(j));
    var ttx=titleX+cs+12, ttw=titleW-cs-12;
    tL(gr,TF.title.EvalWithMetadb(h),FONT.rowTitle,titleCol,ttx,ry+8,ttw,20);
    var art2=TF.artist.EvalWithMetadb(h);
    tL(gr,art2,FONT.rowArtist,COL.text2,ttx,ry+30,ttw,16);
    HB_ARTIST.push({x0:ttx,y0:ry+27,x1:ttx+Math.min(ttw,240),y1:ry+46,name:art2});
    // album + duration
    tL(gr,alb,FONT.rowCell,COL.text2,albumX,ry,albumW,rh);
    tR(gr,TF.len.EvalWithMetadb(h),FONT.rowCell,COL.text2,rx-durW,ry,durW,rh);
    HB_TR.push({x0:lx-8,y0:ry,x1:rx+8,y1:ry+rh,pl:p.i,item:j});
  }
  // scrollbar hint
  if(p.count>visible && visible>0){
    var trackH=bottom-rowsTop, thumbH=Math.max(30,trackH*visible/p.count), thumbY=rowsTop+trackH*firstRow/p.count;
    gr.FillSolidRect(rx+6,thumbY,4,thumbH,COL.rowActive);
  }
}

function drawPlaylistCard(gr,x,y,w,i){
  gr.FillRoundRect(x,y,w,w+56,8,8,COL.elev);
  var cs=w-24;
  drawCover(gr,x+12,y+12,cs,6,firstHandle(i),plman.GetPlaylistName(i));
  tL(gr,plman.GetPlaylistName(i),FONT.card,COL.text,x+12,y+cs+18,w-24,20);
  tL(gr,'Playlist · '+plman.PlaylistItemCount(i)+' songs',FONT.plSub,COL.text2,x+12,y+cs+40,w-24,16);
  HB_CARD.push({x0:x,y0:y,x1:x+w,y1:y+w+56,kind:'pl',id:i});
}
function drawArtistCard(gr,x,y,w,a){
  gr.FillRoundRect(x,y,w,w+56,8,8,COL.elev);
  var cs=w-24;
  drawCover(gr,x+12,y+12,cs,6,a.handle,a.name);
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
  var n=plman.PlaylistCount, plRows=Math.max(1,Math.ceil(n/cols));
  for(i=0;i<n;i++) drawPlaylistCard(gr,x0+(i%cols)*(cardW+gap),y+Math.floor(i/cols)*(cardH+8),cardW,i);
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
  gr.FillGradRect(r.x,r.y,r.w,220,90,blend(coverCol(viewArtist),COL.base,0.4),COL.base,1.0);
  var art=150, ay=r.y+34, cover=artistAlbums.length?artistAlbums[0].handle:null;
  drawCover(gr,x0,ay,art,6,cover,viewArtist);
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
    drawCover(gr,x0,y,72,6,al.handle,al.album);
    tL(gr,al.album,FONT.sect2,COL.text,x0+88,y+6,w-88,26);
    tL(gr,(al.year||'')+' · '+al.tracks.length+' songs',FONT.meta,COL.text2,x0+88,y+38,w-88,20);
    var ty=y+84;
    for(var t=0;t<al.tracks.length;t++){
      if(ty+40>bottom) break;
      var tr=al.tracks[t];
      tL(gr,String(t+1),FONT.rowNum,COL.text2,x0,ty,26,40);
      tL(gr,tr.title,FONT.rowTitle,COL.text,x0+36,ty,w-36-64,40);
      tR(gr,tr.dur,FONT.rowCell,COL.text2,r.x+r.w-pad-60,ty,60,40);
      ty+=40;
    }
    y=ty+22;
  }
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
    tL(gr,'Lyrics',FONT.sect,COL.text,x,r.y+74,r.w-36,24);
    tL(gr,'ESLyric / .lrc beside the track — wiring next.',FONT.qArtist,COL.text3,x,r.y+104,r.w-36,18);
    return;
  }

  var np=fb.IsPlaying||fb.IsPaused, qy=r.y+70;
  tL(gr,'Now playing',FONT.sect,COL.text,x,qy,r.w-36,24); qy+=36;
  drawCover(gr,x,qy,48,4,NP,'np');
  tL(gr,np?TF.npTitle.Eval():'Nothing playing',FONT.qName,np?COL.green:COL.text,x+60,qy+6,r.w-36-60,18);
  tL(gr,np?TF.npArtist.Eval():'',FONT.qArtist,COL.text2,x+60,qy+26,r.w-36-60,16);
  qy+=70;

  var loc=plman.GetPlayingItemLocation?plman.GetPlayingItemLocation():null;
  var pli=(loc&&loc.IsValid)?loc.PlaylistIndex:plman.ActivePlaylist;
  var start=(loc&&loc.IsValid)?loc.PlaylistItemIndex+1:0;
  tL(gr,pli>=0?('Next from: '+plman.GetPlaylistName(pli)):'Next up',FONT.sect,COL.text,x,qy,r.w-36,24); qy+=36;
  if(pli>=0){
    var items=getItems(pli), cnt=plman.PlaylistItemCount(pli), rh=56, bottom=r.y+r.h-8, shown=0;
    for(var k=start;k<cnt&&shown<20;k++){
      if(qy+rh>bottom) break;
      var h=items[k]; if(!h) continue;
      drawCover(gr,x,qy,44,4,h,TF.album.EvalWithMetadb(h)||String(k));
      tL(gr,TF.title.EvalWithMetadb(h),FONT.qName,COL.text,x+56,qy+5,r.w-36-56,18);
      tL(gr,TF.artist.EvalWithMetadb(h),FONT.qArtist,COL.text2,x+56,qy+25,r.w-36-56,16);
      qy+=rh; shown++;
    }
    if(shown===0) tL(gr,'End of playlist',FONT.qArtist,COL.text3,x,qy,r.w-36,18);
  }
}
TF.npAlbumSeed=function(){ return TF.album.Eval()||'np'; };

function ctrlBtn(gr,glyph,cx,cyc,active,act){
  tC(gr,glyph,FONT.iconBtn,active?COL.green:COL.text2,cx-14,cyc-14,28,28);
  HB_CTRL.push({x0:cx-16,y0:cyc-16,x1:cx+16,y1:cyc+16,act:act});
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
  tL(gr,np?TF.npTitle.Eval():'',FONT.npTitle,COL.text,tx,by+22,220,18);
  tL(gr,np?TF.npArtist.Eval():'',FONT.npArtist,COL.text2,tx,by+42,220,16);
  // center: transport row + seekbar
  var cxC=Math.round(W/2);
  var pb=34, pbx=cxC-pb/2, pby=by+8, pcy=pby+pb/2;
  var order=readOrder(), shufOn=order>=3, repMode=(order===1?1:(order===2?2:0));
  ctrlBtn(gr,GLYPH.shuffle,cxC-92,pcy,shufOn,'shuffle');
  ctrlBtn(gr,GLYPH.prev,cxC-50,pcy,false,'prev');
  gr.FillEllipse(pbx,pby,pb,pb,COL.text);
  tC(gr,playing?GLYPH.pause:GLYPH.play,FONT.iconBtn,COL.black,pbx,pby,pb,pb);
  HB_CTRL.push({x0:pbx,y0:pby,x1:pbx+pb,y1:pby+pb,act:'play'});
  ctrlBtn(gr,GLYPH.next,cxC+50,pcy,false,'next');
  ctrlBtn(gr,repMode===2?GLYPH.repeat1:GLYPH.repeat,cxC+92,pcy,repMode>0,'repeat');
  var sbW=Math.min(Math.round(W*0.34),520), sbX=cxC-sbW/2, sbY=by+54;
  var len=fb.PlaybackLength, pos=len>0?fb.PlaybackTime/len:0;
  gr.FillSolidRect(sbX,sbY,sbW,4,COL.seekbg);
  if(pos>0) gr.FillSolidRect(sbX,sbY,Math.max(1,Math.round(sbW*pos)),4,COL.text);
  tR(gr,fmtTime(fb.PlaybackTime),FONT.time,COL.text2,sbX-48,sbY-6,42,16);
  tL(gr,fmtTime(len),FONT.time,COL.text2,sbX+sbW+8,sbY-6,42,16);
  HB_SEEK={x0:sbX,y0:sbY-9,x1:sbX+sbW,y1:sbY+13,x:sbX,w:sbW};
  // right: volume + gear(prefs)
  var gearX=W-30, gearC=by+M.barH/2;
  tC(gr,GLYPH.settings,FONT.icon,COL.text3,gearX-12,gearC-12,24,24);
  HB_PREFS={x0:gearX-16,y0:gearC-16,x1:gearX+16,y1:gearC+16};
  var volW=92, volX=gearX-30-volW, volY=gearC-2;
  tC(gr,GLYPH.volume,FONT.icon,COL.text2,volX-26,gearC-12,20,24);
  var vp=clamp01(vol2pos(fb.Volume));
  gr.FillSolidRect(volX,volY,volW,4,COL.seekbg);
  gr.FillSolidRect(volX,volY,Math.max(1,Math.round(volW*vp)),4,COL.text);
  HB_VOL={x0:volX,y0:volY-9,x1:volX+volW,y1:volY+13,x:volX,w:volW};
}

/* ------------------------- input ------------------------- */
function doCtrl(act){
  if(act==='play') fb.PlayOrPause();
  else if(act==='next') fb.Next();
  else if(act==='prev') fb.Prev();
  else if(act==='shuffle'){ var o=readOrder(); setOrder(o>=3?0:4); }
  else if(act==='repeat'){ var o=readOrder(); setOrder(o===0?1:(o===1?2:0)); }
  window.Repaint();
}
function on_mouse_lbtn_up(x,y){
  var i;
  for(i=0;i<HB_TABS.length;i++){ if(inRect(x,y,HB_TABS[i])){ rightTab=HB_TABS[i].tab; window.Repaint(); return; } }
  for(i=0;i<HB_CTRL.length;i++){ if(inRect(x,y,HB_CTRL[i])){ doCtrl(HB_CTRL[i].act); return; } }
  if(HB_SEEK && inRect(x,y,HB_SEEK)){ if(fb.PlaybackLength>0) fb.PlaybackTime=fb.PlaybackLength*clamp01((x-HB_SEEK.x)/HB_SEEK.w); window.Repaint(); return; }
  if(HB_VOL && inRect(x,y,HB_VOL)){ fb.Volume=pos2vol(clamp01((x-HB_VOL.x)/HB_VOL.w)); window.Repaint(); return; }
  if(HB_PREFS && inRect(x,y,HB_PREFS)){ fb.ShowPreferences(); return; }
  if(HB_HOME && inRect(x,y,HB_HOME)){ view='home'; window.Repaint(); return; }
  for(i=0;i<HB_CARD.length;i++){ if(inRect(x,y,HB_CARD[i])){ var c=HB_CARD[i]; if(c.kind==='pl'){ plman.ActivePlaylist=c.id; firstRow=0; view='playlist'; } else { loadArtist(c.id); view='artist'; } window.Repaint(); return; } }
  for(i=0;i<HB_ARTIST.length;i++){ if(inRect(x,y,HB_ARTIST[i])){ loadArtist(HB_ARTIST[i].name); view='artist'; window.Repaint(); return; } }
  for(i=0;i<HB_PL.length;i++){ if(inRect(x,y,HB_PL[i])){ plman.ActivePlaylist=HB_PL[i].i; firstRow=0; view='playlist'; window.Repaint(); return; } }
  for(i=0;i<HB_TR.length;i++){ if(inRect(x,y,HB_TR[i])){ plman.ExecutePlaylistDefaultAction(HB_TR[i].pl,HB_TR[i].item); window.Repaint(); return; } }
}
function on_mouse_move(x,y){
  mx=x; my=y;
  var h=-1;
  for(var i=0;i<HB_TR.length;i++){ if(inRect(x,y,HB_TR[i])){ h=HB_TR[i].item; break; } }
  if(h!==hoverTrack){ hoverTrack=h; window.Repaint(); }
}
function on_mouse_leave(){ if(hoverTrack!==-1){ hoverTrack=-1; window.Repaint(); } }
function on_mouse_wheel(step){
  if(mx<R.main.x || mx>=R.main.x+R.main.w) return;
  if(view==='home'){ homeScroll-=step; if(homeScroll<0)homeScroll=0; if(homeScroll>HOME_MAXROW)homeScroll=HOME_MAXROW; }
  else if(view==='artist'){ artScroll-=step; if(artScroll<0)artScroll=0; if(artScroll>ART_MAXBLOCK)artScroll=ART_MAXBLOCK; }
  else { firstRow-=step*3; if(firstRow<0)firstRow=0; }
  window.Repaint();
}
function on_library_items_added(){ artistList=null; window.Repaint(); }
function on_library_items_removed(){ artistList=null; window.Repaint(); }
function on_library_items_changed(){ artistList=null; window.Repaint(); }

/* ------------------------- playback callbacks ------------------------- */
function on_playback_new_track(){ window.Repaint(); }
function on_playback_stop(){ window.Repaint(); }
function on_playback_pause(){ window.Repaint(); }
function on_playback_time(){ window.Repaint(); }
function on_playback_seek(){ window.Repaint(); }
function on_playback_order_changed(){ window.Repaint(); }
function on_volume_change(){ window.Repaint(); }
function on_playlist_switch(){ firstRow=0; invalidateItems(); window.Repaint(); }
function on_playlists_changed(){ invalidateItems(); window.Repaint(); }
function on_playlist_items_added(){ invalidateItems(); window.Repaint(); }
function on_playlist_items_removed(){ invalidateItems(); window.Repaint(); }
function on_playlist_items_reordered(){ invalidateItems(); window.Repaint(); }
function on_item_focus_change(){ window.Repaint(); }

console.log('[foobar-spotify] Phase 3-A shell loaded');
