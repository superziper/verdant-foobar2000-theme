/* verdant/data/lyrics.js -- .lrc / .txt lyrics: load, parse, layout, rolling render
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* ------------------------- lyrics (.lrc / .txt beside the track) ------------------------- */
var lyricsFor=null, lyrics=null; // {lines:[{t,text}],synced} | 'none'
var lyScroll=0, lyTarget=0, lyCur=0, lyTimer=null, lySnap=true, lyLay={lyr:null,w:-1};   // pixel roll: lines wrap
function currentLyricLine(){
  if(!lyrics || lyrics==='none' || !lyrics.synced) return 0;
  var pt=fb.PlaybackTime, c=0;
  for(var i=0;i<lyrics.lines.length;i++){ if(lyrics.lines[i].t<=pt) c=i; else break; }
  return c;
}
// wrap each phrase to width+font, precompute cumulative block geometry (cached by width+font)
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
// rolling synced lyrics (queue tab + fullscreen). align: 'c' centred / 'l' left
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
// unsynced lyrics: plain top-down block, no roll
function drawStaticLyrics(gr,x,w,yy,bot,font,gapMul){
  stopLyAnim();
  var L=lyLayout(gr,w,font), li, s;
  for(li=0;li<lyrics.lines.length;li++){
    var p=L.subs[li];
    for(s=0;s<p.length && yy+L.subLh<=bot; s++){ tC(gr,p[s],font,COL.text2,x,yy,w,L.subLh); yy+=L.subLh; }
    yy+=Math.round(L.subLh*gapMul);
    if(yy>=bot) break;
  }
}
function noLyrics(){ return !lyrics || lyrics==='none' || !lyrics.lines || !lyrics.lines.length; }
function lyTick(){
  var d=lyTarget-lyScroll; if(Math.abs(d)<0.5){ lyScroll=lyTarget; stopLyAnim(); } else lyScroll+=d*0.25;
  if(fsMode){ repaintAll(); } else { dirtyQueue=true; window.RepaintRect(R.queue.x,R.queue.y,R.queue.w,R.queue.h); }
}
function startLyAnim(){ if(!lyTimer) lyTimer=window.SetInterval(lyTick,16); }   // 60fps roll
function stopLyAnim(){ if(lyTimer){ window.ClearInterval(lyTimer); lyTimer=null; } }
// blinking caret in the Search box / rename dialog
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
