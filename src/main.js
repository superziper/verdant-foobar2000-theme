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
var GLYPH = { play:String.fromCharCode(0xE768), pause:String.fromCharCode(0xE769), prev:String.fromCharCode(0xE892), next:String.fromCharCode(0xE893), shuffle:String.fromCharCode(0xE8B1), repeat:String.fromCharCode(0xE8EE) };

/* ------------------------- title formats ------------------------- */
var TF = {
  title:fb.TitleFormat('%title%'), artist:fb.TitleFormat('[%artist%]'),
  album:fb.TitleFormat('[%album%]'), len:fb.TitleFormat('%length%'),
  npTitle:fb.TitleFormat('[%title%]'), npArtist:fb.TitleFormat('[%artist%]')
};

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

/* ------------------------- state ------------------------- */
var W=window.Width, H=window.Height, R={};
var firstRow=0, hoverTrack=-1, mx=-1, my=-1;
var HB_PL=[], HB_TR=[], HB_PREFS=null;
var plCache=null, plCacheFor=-1;
function getItems(pi){ if(pi!==plCacheFor||!plCache){ plCache=plman.GetPlaylistItems(pi); plCacheFor=pi; } return plCache; }
function invalidateItems(){ plCacheFor=-1; }

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
  tL(gr,'Home',FONT.nav,COL.text,x,R.navTop.y+12,w,32);
  tL(gr,'Search',FONT.nav,COL.text2,x,R.navTop.y+12+38,w,32);
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
    gr.FillRoundRect(cx,cy,cs,cs,4,4,coverCol(plman.GetPlaylistName(i)));
    var tx=cx+cs+12, tw=R.navLib.x+R.navLib.w-16-tx;
    tL(gr,plman.GetPlaylistName(i),FONT.pl,isA?COL.green:COL.text,tx,ry+8,tw,20);
    tL(gr,'Playlist · '+plman.PlaylistItemCount(i)+' songs',FONT.plSub,COL.text2,tx,ry+30,tw,16);
    HB_PL.push({x0:R.navLib.x,y0:ry,x1:R.navLib.x+R.navLib.w,y1:ry+rh,i:i});
  }
}

function drawMain(gr){
  HB_TR=[];
  var r=R.main; panelBg(gr,r,COL.base);
  var p=activePl();
  // header gradient wash (square top corners; polish later)
  gr.FillGradRect(r.x,r.y,r.w,M.headH,90,blend(coverCol(p.name),COL.base,0.35),COL.base,1.0);
  var ax=r.x+M.cpad, ay=r.y+44, art=M.artSz;
  gr.FillRoundRect(ax,ay,art,art,6,6,coverCol(p.name));
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
    gr.FillRoundRect(titleX,cy,cs,cs,3,3,coverCol(alb||String(j)));
    var ttx=titleX+cs+12, ttw=titleW-cs-12;
    tL(gr,TF.title.EvalWithMetadb(h),FONT.rowTitle,titleCol,ttx,ry+8,ttw,20);
    tL(gr,TF.artist.EvalWithMetadb(h),FONT.rowArtist,COL.text2,ttx,ry+30,ttw,16);
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

function drawQueue(gr){
  var r=R.queue; panelBg(gr,r,COL.base);
  var x=r.x+18;
  tL(gr,'Queue',FONT.tab,COL.text,x,r.y+16,90,26);
  tL(gr,'Lyrics',FONT.tab,COL.text2,x+82,r.y+16,90,26);
  gr.FillSolidRect(x,r.y+46,54,3,COL.green);
  var qy=r.y+70;
  tL(gr,'Now playing',FONT.sect,COL.text,x,qy,r.w-36,24); qy+=36;
  var np=fb.IsPlaying||fb.IsPaused;
  gr.FillRoundRect(x,qy,48,48,4,4,coverCol(np?TF.npAlbumSeed():'np'));
  tL(gr,np?TF.npTitle.Eval():'Nothing playing',FONT.qName,np?COL.green:COL.text,x+60,qy+6,r.w-36-60,18);
  tL(gr,np?TF.npArtist.Eval():'',FONT.qArtist,COL.text2,x+60,qy+26,r.w-36-60,16);
  qy+=68;
  tL(gr,'Next up',FONT.sect,COL.text,x,qy,r.w-36,24);
  tL(gr,'(queue wiring — next milestone)',FONT.qArtist,COL.text3,x,qy+30,r.w-36,18);
}
TF.npAlbumSeed=function(){ return TF.album.Eval()||'np'; };

function drawBar(gr){
  var by=R.barY;
  gr.FillSolidRect(0,by,W,M.barH,COL.black);
  var np=fb.IsPlaying||fb.IsPaused;
  // left: cover + title/artist
  var cs=56, cx=14, cy=by+(M.barH-cs)/2;
  gr.FillRoundRect(cx,cy,cs,cs,4,4,coverCol(np?TF.npAlbumSeed():'np'));
  var tx=cx+cs+12;
  tL(gr,np?TF.npTitle.Eval():'',FONT.npTitle,COL.text,tx,by+22,220,18);
  tL(gr,np?TF.npArtist.Eval():'',FONT.npArtist,COL.text2,tx,by+42,220,16);
  // center: play/pause + seekbar
  var cxC=Math.round(W/2), playing=np&&fb.IsPlaying&&!fb.IsPaused;
  var pb=36, pbx=cxC-pb/2, pby=by+8;
  gr.FillEllipse(pbx,pby,pb,pb,COL.text);
  tC(gr, playing?GLYPH.pause:GLYPH.play, FONT.iconBtn, COL.black, pbx, pby, pb, pb);
  var sbW=Math.min(Math.round(W*0.38),560), sbX=cxC-sbW/2, sbY=by+56;
  var pos=fb.PlaybackLength>0?fb.PlaybackTime/fb.PlaybackLength:0;
  gr.FillSolidRect(sbX,sbY,sbW,4,COL.seekbg);
  if(pos>0) gr.FillSolidRect(sbX,sbY,Math.max(1,Math.round(sbW*pos)),4,COL.text);
  tR(gr,fmtTime(fb.PlaybackTime),FONT.time,COL.text2,sbX-48,sbY-6,42,16);
  tL(gr,fmtTime(fb.PlaybackLength),FONT.time,COL.text2,sbX+sbW+8,sbY-6,42,16);
  // right: dev "Preferences" affordance (temporary)
  var pw=90, px=W-pw-14;
  tR(gr,'⚙ Preferences',FONT.prefs,COL.text3,px,by,pw,M.barH);
  HB_PREFS={x0:px,y0:by,x1:W,y1:H};
}

/* ------------------------- input ------------------------- */
function on_mouse_lbtn_up(x,y){
  if(HB_PREFS && inRect(x,y,HB_PREFS)){ fb.ShowPreferences(); return; }
  var i;
  for(i=0;i<HB_PL.length;i++){ if(inRect(x,y,HB_PL[i])){ plman.ActivePlaylist=HB_PL[i].i; firstRow=0; window.Repaint(); return; } }
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
  // scroll the main track list
  if(mx>=R.main.x && mx<R.main.x+R.main.w){ firstRow-=step*3; if(firstRow<0)firstRow=0; window.Repaint(); }
}

/* ------------------------- playback callbacks ------------------------- */
function on_playback_new_track(){ window.Repaint(); }
function on_playback_stop(){ window.Repaint(); }
function on_playback_pause(){ window.Repaint(); }
function on_playback_time(){ window.Repaint(); }
function on_playlist_switch(){ firstRow=0; invalidateItems(); window.Repaint(); }
function on_playlists_changed(){ invalidateItems(); window.Repaint(); }
function on_playlist_items_added(){ invalidateItems(); window.Repaint(); }
function on_playlist_items_removed(){ invalidateItems(); window.Repaint(); }
function on_playlist_items_reordered(){ invalidateItems(); window.Repaint(); }
function on_item_focus_change(){ window.Repaint(); }

console.log('[foobar-spotify] Phase 3-A shell loaded');
