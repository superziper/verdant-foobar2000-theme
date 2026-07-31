/* verdant/views/fullscreen.js -- fullscreen chill mode and the spectrum visualizer
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* ------------------------- fullscreen "chill" mode ------------------------- */
function enterFullscreen(){ fsMode=true; try{ if(UIWizard && UIWizard.WindowState!==1) UIWizard.ToggleMaximize(); }catch(e){} if(fsView==='viz') startViz(); if(fsView==='lyrics'){ loadLyrics(); lySnap=true; } repaintAll(); }
function exitFullscreen(){ fsMode=false; stopViz(); repaintAll(); }
function setFsView(v){ fsView=v; if(v==='viz') startViz(); else stopViz(); if(v==='lyrics'){ loadLyrics(); lySnap=true; } repaintAll(); }
function doFsAct(act){
  if(act==='exit') exitFullscreen();
  else if(act==='lyrics') setFsView(fsView==='lyrics'?'default':'lyrics');
  else if(act==='viz') setFsView(fsView==='viz'?'default':'viz');
}
// ---- audio spectrum visualizer: real PCM via fb.GetAudioChunk -> FFT bars ----
var VIZ_N=56;
function vizUpdate(){
  if(!fsMode || fsView!=='viz'){ stopViz(); return; }
  var N=512, re=new Array(N), im=new Array(N), i, ok=false;
  try{
    var ch=fb.GetAudioChunk(0.06);
    if(ch && ch.SampleCount>0){
      var d=ch.Data, cc=ch.ChannelCount||2, sc=ch.SampleCount, step=Math.max(1,Math.floor(sc/N));
      for(i=0;i<N;i++){ var si=(i*step)*cc, v=0; if(si<d.length){ for(var c=0;c<cc;c++) v+=d[si+c]||0; v/=cc; } var w=0.5-0.5*Math.cos(2*Math.PI*i/(N-1)); re[i]=v*w; im[i]=0; }
      ok=true;
    }
  }catch(e){ ok=false; }
  if(!ok){ for(i=0;i<VIZ_N;i++) vizBars[i]=(vizBars[i]||0)*0.82; repaintAll(); return; }
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
function fsIcon(gr,name,col,x,y,sz,act){
  drawIcon(gr,name,hv(x-8,y-8,x+sz+8,y+sz+8)?COL.text:col,x,y,sz,sz,sz);
  HB_FS.push({x0:x-8,y0:y-8,x1:x+sz+8,y1:y+sz+8,act:act});
}
// name of the real playlist driving playback, or null (e.g. playing from library/search/artist)
function npPlaylistSrc(){
  var loc=playingLoc(), pli=(loc&&loc.IsValid)?loc.PlaylistIndex:-1;
  if(pli<0) return null;
  var rnm=plName(pli);
  if(rnm===SHUF) return shufSrcName||null;
  if(rnm && !isHiddenPl(rnm)) return rnm;
  return null;
}
function fsMiniNP(gr){   // small cover + title + artist, top-left (lyrics/viz views)
  var s=64, src=npPlaylistSrc();
  if(src){
    var lbl='PLAYING FROM PLAYLIST  ';
    tL(gr,lbl,FONT.fsSrc,COL.text3,64,20,W/2,20);
    var lw=gr.CalcTextWidth(lbl,FONT.fsSrc);
    tL(gr,src,FONT.fsSrcName,COL.text,64+lw,20,Math.max(0,W/2-lw),20);   // bold: the playlist name
  }
  drawRounded(gr,64,78,s,6,NP,'np');
  tL(gr,npTitleStr||'Nothing playing',FONT.sect2,COL.text,64+s+18,84,W/2,26);
  tL(gr,npArtistStr,FONT.qName,COL.text2,64+s+18,116,W/2,20);
}
// cover + title + artist, centred between the header and the transport bar
function drawFsDefault(gr,bot){
  var top=120, avail=bot-top, txtH=130, gap=30;
  var sz=Math.max(140,Math.min(420,avail-txtH-gap));
  var y0=top+Math.max(0,Math.round((avail-(sz+gap+txtH))/2));
  drawRounded(gr,Math.round((W-sz)/2),y0,sz,12,NP,'np');
  var tx=72, tw=W-144, ty=y0+sz+gap;
  tCE(gr,npTitleStr||'Nothing playing',FONT.title,COL.text,tx,ty,tw,90);
  tCE(gr,npArtistStr,FONT.sect2,COL.text2,tx,ty+96,tw,34);
}
function drawFsLyrics(gr,bot){
  fsMiniNP(gr);
  loadLyrics();   // reload for the current track (fast: cached by track; reloads on track change)
  if(noLyrics()){ tC(gr,'No lyrics found',FONT.sect2,COL.text2,0,Math.round(H*0.45),W,40); return; }
  if(lyrics.synced) drawRollingLyrics(gr,140,165,W-280,bot,FONT.fsLyric,COL.green,'c');
  else drawStaticLyrics(gr,140,W-280,180,bot,FONT.fsLyric,0.4);
}
// mirrored pill bars: deeper green when quiet, brighter at peaks
function drawFsViz(gr,bot){
  fsMiniNP(gr);
  var top=200, cy=Math.round((top+bot)/2), n=VIZ_N, i;
  var cell=(W-300)/n, bw=Math.max(4,Math.floor(cell*0.62)), gap=cell-bw, x0=Math.round((W-cell*n+gap)/2);
  var hh=(bot-top)/2-18, peak=blend(COL.green,COL.text,0.22);
  for(i=0;i<n;i++){
    var v=vizBars[i]||0, bh=Math.max(2,Math.round(v*hh)), bx=Math.round(x0+i*cell);
    var rad=Math.min(bw>>1,bh);   // GDI+ needs 2*rad <= both width and height, so floor -- never round
    gr.FillRoundRect(bx,cy-bh,bw,bh*2,rad,rad,blend(COL.greenC,peak,clamp01(v*1.3)));
  }
}
function drawFsBar(gr){
  var playing=fb.IsPlaying&&!fb.IsPaused, by=H-150;
  var sbX=72, sbW=W-144, sbY=by+30;
  var len=fb.PlaybackLength, pos=(drag==='seek')?dragFrac:(len>0?fb.PlaybackTime/len:0);
  var rail=RGBA(255,255,255,55);
  HB_SEEK=drawTrackBar(gr,sbX,sbY,sbW,4,rail,pos);
  tR(gr,fmtTime((drag==='seek')?len*dragFrac:fb.PlaybackTime),FONT.time,COL.text2,sbX-54,sbY-6,46,16);
  tL(gr,fmtTime(len),FONT.time,COL.text2,sbX+sbW+8,sbY-6,46,16);
  var cxC=Math.round(W/2), cy=by+86, pb=56, pbx=cxC-pb/2, pby=cy-pb/2;
  ctrlBtn(gr,'shuffle',cxC-150,cy,pbShuffle,'shuffle');
  ctrlBtn(gr,'prev',cxC-84,cy,false,'prev');
  gr.FillEllipse(pbx,pby,pb,pb,COL.text);
  drawIcon(gr,playing?'pause':'play',COL.black,pbx,pby,pb,pb,Math.round(pb*0.5));
  HB_CTRL.push({x0:pbx,y0:pby,x1:pbx+pb,y1:pby+pb,act:'play'});
  ctrlBtn(gr,'next',cxC+84,cy,false,'next');
  ctrlBtn(gr,pbRepeat===2?'repeat1':'repeat',cxC+150,cy,pbRepeat>0,'repeat');
  fsIcon(gr,'equalizer',fsView==='viz'?COL.green:COL.text2,72,cy-13,26,'viz');
  fsIcon(gr,'mic',fsView==='lyrics'?COL.green:COL.text2,114,cy-13,26,'lyrics');
  var rx=W-72;
  fsIcon(gr,'compress',COL.text2,rx-26,cy-13,26,'exit');
  var volW=120, volX=rx-26-46-volW, volY=cy-2;
  drawIcon(gr,'volume',COL.text2,volX-32,cy-12,24,24,20);
  HB_VOL=drawTrackBar(gr,volX,volY,volW,4,rail,clamp01(vol2pos(fb.Volume)));
}
function drawFullscreen(gr){
  HB_CTRL=[]; HB_SEEK=null; HB_VOL=null; HB_FS=[]; SB=null; SBH=null; SBN=null;
  gr.FillSolidRect(0,0,W,H,COL.base);
  var bot=H-172;
  if(fsView==='lyrics') drawFsLyrics(gr,bot);
  else if(fsView==='viz') drawFsViz(gr,bot);
  else {
    var src=npPlaylistSrc();
    if(src){ tL(gr,'PLAYING FROM PLAYLIST',FONT.fsSrc,COL.text2,72,54,W-144,18); tL(gr,src,FONT.sect,COL.text,72,76,W-144,28); }
    drawFsDefault(gr,bot);
  }
  drawFsBar(gr);
}
