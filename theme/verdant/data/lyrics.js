/* verdant/data/lyrics.js -- lyrics: load, parse, layout, rolling render, edit and save
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* Three places a lyric can come from, tried in this order and no other:
     1. a .lrc or .txt beside the track   -- what a tagger or a download script leaves
     2. the track's own tags              -- LYRICS / UNSYNCEDLYRICS / SYNCEDLYRICS / (c)lyr
     3. LRCLIB, over the network          -- data/lyrfetch.js, and only when 1 and 2 are empty
   A local source always wins, so the fetcher only ever runs where the pane would otherwise have
   said "No lyrics found". Which one answered is remembered in lySource, because the Edit button
   has to know where a save belongs -- back into the tag, or out to a file beside the song. */

/* ------------------------- lyrics (file, tags, or fetched) ------------------------- */
var lyricsFor=null, lyrics=null; // {lines:[{t,text}],synced,offset} | 'none'
var lyScroll=0, lyTarget=0, lyCur=0, lyTimer=null, lySnap=true, lyLay={lyr:null,w:-1};   // pixel roll: lines wrap
var lyStScroll=0, lyStMax=0;   // unsynced lyrics: wheel-driven offset + its clamp, both in pixels
var lySource='';   // '' none | 'sidecar' | 'embedded' | 'fetched'
var lyKey='';      // the tag name embedded lyrics were found under, so a save goes back to THAT one
var lyFile='';     // the sidecar actually read, when there was one
var lyFetched='';  // a fetched lyric held in memory only, until the user saves it

/* Tag names carrying lyrics, in the order they should be preferred: a synced tag beats a plain
   one, and the track's own spelling beats a guess. foobar maps ID3's USLT frame onto
   UNSYNCEDLYRICS, which is how the MP3s in a mixed library are reached without a special case.
   (c)lyr is the MP4/iTunes atom. */
var LY_TAGS=['syncedlyrics','lyrics','unsyncedlyrics','\u00a9lyr'];

/* How a fetched file is told apart from one that was already there. It has to be recorded rather
   than inferred: the moment a fetched lyric is written to disk it is a .lrc beside the track like
   any other, and nothing about the file itself would ever say otherwise again. [re:...] is the
   LRC spec's own "program that made this" field, and parseLyrics already discards bracket tags,
   so the line costs nothing on screen and survives being edited. */
var LY_MARK=/^\s*\[re:\s*Verdant\b/im;

function lyBase(path){ return String(path||'').replace(/\.[^.\\\/]+$/,''); }
// everything about WHERE the view is scrolled, reset together: a new lyric starts at the top
function lyReset(){ lyScroll=0; lyTarget=0; lySnap=true; lyLay={lyr:null,w:-1}; lyStScroll=0; lyStMax=0; }
/* ONE distinction, and it is not where the words are stored -- it is whose they are. A lyric the
   user already had is theirs whether it sits in a .lrc or in the track's own tags; which of the
   two answered is Verdant's business, not theirs, and a badge for it was an implementation detail
   wearing a label. A FETCHED lyric is the only one that came from somewhere else, and the only
   one the user has to decide about, so it is the only one that says anything.

   The badge states a CONDITION rather than issuing an instruction: where the lyric came from, and
   that it will not outlive the track change. The instruction is the half the Edit button sitting
   beside it already supplies, and a sentence that teaches a one-time fact does not earn a place
   on every fetched track forever. Once saved it drops to the bare fact. */
function lyBadgeLong(){
  if(lySource!=='fetched') return '';
  return lyFile ? 'Fetched' : 'Fetched \u00b7 not saved';
}
/* A capsule sized to its text, in the theme's green: only a fetched lyric gets one, and it is
   always asking for something. Measured separately so a view can find out whether the long label
   fits before it commits to drawing it. */
function lyPillH(gr,font){ return Math.round(lineH(gr,font||FONT.qArtist))+7; }
function lyPillW(gr,label,font){ return Math.round(gr.CalcTextWidth(label,font||FONT.qArtist))+20; }
function lyPill(gr,x,y,label,font){
  font=font||FONT.qArtist;
  var h=lyPillH(gr,font), w=lyPillW(gr,label,font);
  var rad=roundRad(w,h,Math.round(h/2));
  gr.FillRoundRect(x,y,w,h,rad,rad,COL.green);
  tC(gr,label,font,COL.black,x,y,w,h);
  return {x0:x,y0:y,x1:x+w,y1:y+h,w:w,h:h};
}

/* ------------------------- reading ------------------------- */
/* The sidecar, with the path kept: a save has to go back to the file it came from, which may be
   the .txt rather than the .lrc. */
function lyReadSidecar(base){
  var cands=[base+'.lrc', base+'.txt'], i, t;
  for(i=0;i<cands.length;i++){
    t=null;
    try{ if(utils.IsFile && !utils.IsFile(cands[i])) continue; t=utils.ReadUTF8(cands[i]); }catch(e){ t=null; }
    if(t && t.length) return {path:cands[i], text:t};
  }
  return null;
}
/* Which meta index holds the lyrics, by name first and by shape second. The fallback scan is what
   covers the spellings a name list cannot enumerate -- LYRICS:eng, a bare USLT, a tagger's own
   variant -- and it is cheap because MetaCount on a music file is a couple of dozen entries. */
function lyMetaIdx(fi){
  var i, n, idx;
  for(i=0;i<LY_TAGS.length;i++){
    idx=-1; try{ idx=fi.MetaFind(LY_TAGS[i]); }catch(e){ idx=-1; }
    if(idx>=0) return idx;
  }
  n=0; try{ n=fi.MetaCount||0; }catch(e2){ n=0; }
  for(i=0;i<n;i++){
    var nm=''; try{ nm=String(fi.MetaName(i)||'').toLowerCase(); }catch(e3){ nm=''; }
    if(nm.indexOf('lyric')>=0 || nm.indexOf('uslt')>=0) return i;
  }
  return -1;
}
/* Lyrics out of the file's own tags, as {key,text}.

   GetFileInfo(true) rather than (): the `true` asks for fields that LargeFieldsConfig-v2 blocks
   from the metadb in foobar 2.26 and later, and lyrics are exactly the kind of long value that
   list exists to hold back. It costs a read of the file, which is why this runs once per track
   with the lyrics pane open and never across a library. Older builds ignore the argument, and the
   catch falls back to the plain call for anything that rejects it outright.

   The KEY is returned, not just the text, and that is the point of using this API at all rather
   than a title format: a save has to write back to the tag the lyric was actually in. Writing
   'lyrics' onto an MP3 whose words live in USLT would leave the original frame untouched and add
   a second, divergent copy. */
function lyReadEmbedded(h){
  if(!h) return null;
  var fi=null;
  try{ fi=h.GetFileInfo(true); }catch(e){ try{ fi=h.GetFileInfo(); }catch(e2){ fi=null; } }
  if(!fi) return null;
  var idx=lyMetaIdx(fi);
  if(idx<0) return null;
  var name=''; try{ name=String(fi.MetaName(idx)||''); }catch(e3){ name=''; }
  var n=1; try{ n=fi.MetaValueCount(idx)||1; }catch(e4){ n=1; }
  var parts=[], k, v;
  for(k=0;k<n;k++){
    v=null; try{ v=fi.MetaValue(idx,k); }catch(e5){ v=null; }
    if(v) parts.push(String(v));
  }
  var text=parts.join('\n');
  if(!text || !/\S/.test(text)) return null;
  return {key:name, text:text};
}

/* ------------------------- timing ------------------------- */
/* The setting and the file's own [offset:] tag add up, because they mean the same thing and pull
   the same way: positive = the lines land earlier. A file that carries its own correction is
   honoured, and the setting then nudges whatever is left. */
function lyOffsetSec(){
  var tag=(lyrics && lyrics!=='none' && lyrics.offset)?lyrics.offset:0;
  return (LY_OFFSET+tag)/1000;
}
function currentLyricLine(){
  if(!lyrics || lyrics==='none' || !lyrics.synced) return 0;
  var pt=fb.PlaybackTime+lyOffsetSec(), c=0;
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
    /* The cull above keeps a block while its CENTRE is near the view, which let its top edge sit a
       whole block height above `top` -- over the tab strip in the queue pane, over the mini header
       in fullscreen. There is no clip API, so each sub-line is drawn only when it fits entirely
       inside the view, exactly as the unsynced block does. The rolling fade already takes lines to
       near-invisible at the edges, so the cut lands where there is almost nothing to see. */
    for(s=0;s<parts.length;s++){
      var sy=bTop+s*subLh;
      if(sy<top || sy+subLh>bot) continue;
      if(align==='l') tL(gr,parts[s],font,col,x,sy,w,subLh); else tC(gr,parts[s],font,col,x,sy,w,subLh);
    }
  }
}
/* Unsynced lyrics: a plain top-down block, no roll -- there are no timestamps to roll to. Anything
   past the bottom of the pane used to be simply unreachable, so the block scrolls on the wheel
   instead (lyStWheel). There is no clip API, so a line is drawn only when it fits ENTIRELY within
   the view: a half-line would otherwise spill over the tab strip above or the controls below.
   The cost is up to one line-height of slack at each edge, which reads as padding. */
function drawStaticLyrics(gr,x,w,top,bot,font,gapMul){
  stopLyAnim();
  var L=lyLayout(gr,w,font), gap=Math.round(L.subLh*gapMul), li, s, h=0;
  for(li=0;li<lyrics.lines.length;li++) h+=L.subs[li].length*L.subLh+gap;
  lyStMax=Math.max(0,Math.round(h-gap-(bot-top)));   // the trailing gap is not content to scroll to
  if(lyStScroll>lyStMax) lyStScroll=lyStMax;
  if(lyStScroll<0) lyStScroll=0;
  var y=top-lyStScroll;
  for(li=0;li<lyrics.lines.length && y<bot;li++){
    var p=L.subs[li];
    for(s=0;s<p.length;s++){
      if(y>=top && y+L.subLh<=bot) tC(gr,p[s],font,COL.text2,x,y,w,L.subLh);
      y+=L.subLh;
    }
    y+=gap;
  }
}
/* Wheel handling for that block, shared by the right pane and fullscreen. Returns false when there
   is nothing to scroll -- synced lyrics roll themselves, and in fullscreen the wheel is the volume
   control, which it must stay whenever the lyrics cannot use it. lyStMax is set by the draw above,
   so this is a no-op until the pane has been painted once. */
function lyStWheel(step){
  if(noLyrics() || lyrics.synced || lyStMax<=0) return false;
  var v=lyStScroll-Math.round(step*3*(lyLay.subLh||20));
  if(v<0) v=0; else if(v>lyStMax) v=lyStMax;
  if(v===lyStScroll) return false;
  lyStScroll=v; return true;
}
function noLyrics(){ return !lyrics || lyrics==='none' || !lyrics.lines || !lyrics.lines.length; }
function lyTick(){
  var d=lyTarget-lyScroll; if(Math.abs(d)<0.5){ lyScroll=lyTarget; stopLyAnim(); } else lyScroll+=d*0.25;
  if(fsMode){ repaintAll(); } else { markDirty(); dirtyQueue=true; window.RepaintRect(R.queue.x,R.queue.y,R.queue.w,R.queue.h); }
}
function startLyAnim(){ if(!lyTimer) lyTimer=window.SetInterval(lyTick,16); }   // 60fps roll
function stopLyAnim(){ if(lyTimer){ window.ClearInterval(lyTimer); lyTimer=null; } }
// blinking caret in the Search box / rename dialog
var caretOn=true, caretTimer=null;
function caretTick(){
  if(renameEdit){ caretOn=!caretOn; repaintAll(); return; }              // caret sits in a playlist row/card
  if(view==='search'){ caretOn=!caretOn; markDirty(); dirtySearch=true; var b=searchBoxRect(); window.RepaintRect(b.x,b.y,b.w,b.h); return; }
  stopCaret();
}
function startCaret(){ if(!caretTimer){ caretOn=true; caretTimer=window.SetInterval(caretTick,530); } }
function stopCaret(){ if(caretTimer){ window.ClearInterval(caretTimer); caretTimer=null; } caretOn=true; }

/* ------------------------- parsing ------------------------- */
function parseLyrics(text){
  var raw=text.split(/\r?\n/), lines=[], synced=false, offset=0, reAll=/\[(\d+):(\d+(?:\.\d+)?)\]/g, i, j, m;
  for(i=0;i<raw.length;i++){
    var line=raw[i], times=[]; reAll.lastIndex=0;
    while((m=reAll.exec(line))!==null){ times.push(parseInt(m[1],10)*60+parseFloat(m[2])); }
    var txt=line.replace(reAll,'').trim();
    if(times.length){ synced=true; for(j=0;j<times.length;j++) lines.push({t:times[j],text:txt}); }
    else {
      /* Read before the bracket-tag line is discarded: [offset:] is the file saying its own timing
         is out, which is information the pane would otherwise throw away and then ask the user to
         re-enter by hand in the settings. */
      var mo=/^\s*\[offset:\s*([+-]?\d+)\s*\]/i.exec(line);
      if(mo){ var ov=parseInt(mo[1],10); if(isFinite(ov)) offset=ov; }
      if(/^\s*\[[a-zA-Z#]+:/.test(line)) continue;
      lines.push({t:-1,text:txt});
    }
  }
  if(synced) lines.sort(function(a,b){ return a.t-b.t; });
  return {lines:lines, synced:synced, offset:offset};
}
function loadLyrics(){
  var key=NP?NP.Path:null;
  if(key===lyricsFor) return;
  lyricsFor=key; lyrics='none'; lySource=''; lyKey=''; lyFile=''; lyFetched='';
  lyReset();   // a new track's lyrics start at the top
  if(!key) return;
  var side=lyReadSidecar(lyBase(key));
  if(side){
    lyFile=side.path;
    lySource=LY_MARK.test(side.text)?'fetched':'sidecar';
    lyrics=parseLyrics(side.text);
    return;
  }
  var emb=lyReadEmbedded(NP);
  if(emb){
    lySource='embedded'; lyKey=emb.key;
    lyrics=parseLyrics(emb.text);
    return;
  }
  lyfWant(NP,key);   // nothing local: ask the fetcher, which is a no-op when the setting is off
}

/* ------------------------- saving ------------------------- */
/* A failure here is the one case in this module that interrupts: the user pressed Save on text
   they typed, and silently dropping it would be the worst possible outcome. Everything else in
   the lyrics path fails quietly, because everything else was speculative. */
function lyNotice(msg){
  try{ console.log('Verdant: lyrics -- '+msg); }catch(e){}
  try{ utils.MessageBox(msg,'Verdant -- lyrics',0,16); }catch(e2){}
}
/* The text the editor opens on: re-read rather than re-serialised from `lyrics`, because the parse
   drops the bracket tags and the blank lines and would hand back a lossy copy of the user's file. */
function lyRawText(){
  if(lyFile){ try{ return utils.ReadUTF8(lyFile)||''; }catch(e){ return ''; } }
  // a fetched lyric lives only here until it is saved, markers and all
  if(lySource==='fetched' && lyFetched) return lyFetched;
  if(lySource==='embedded'){ var e2=lyReadEmbedded(NP); return e2?e2.text:''; }
  return '';
}
function lyCanEdit(){ return !!NP; }
function lySave(text){
  if(!NP) return false;
  text=String(text==null?'':text);
  return (lySource==='embedded')?lySaveEmbedded(text):lySaveFile(text);
}
/* A sidecar: the file it came from, or a new .lrc beside the track when there was none. BOM off,
   because a .lrc is read by other players too and a BOM is the kind of thing an old one chokes on
   -- ReadUTF8 handles both, so nothing here needs it. */
function lySaveFile(text){
  var path=lyFile||(lyBase(NP.Path)+'.lrc');
  var ok=false;
  try{ ok=!!utils.WriteTextFile(path,text,false); }catch(e){ ok=false; }
  if(!ok){ lyNotice('Could not write '+path+'\n\nThe folder may be read-only, or on a share that is no longer reachable.'); return false; }
  lyFile=path; lyFetched='';
  /* The badge follows the FILE, not the history: if the user deleted the [re:Verdant] line while
     editing, the lyric is theirs now and should stop claiming to have been fetched. Either way the
     note goes, because once there is a file there is nothing left unsaved. */
  lySource=LY_MARK.test(text)?'fetched':'sidecar';
  lyrics=parseLyrics(text); lyReset();
  return true;
}
/* Embedded: back into the tag the lyric was read from, and nothing else in the file is named in
   the JSON, so nothing else can be touched by it.

   This is the only place Verdant writes to a music file rather than to its own profile folder, and
   it is not undoable -- so it asks first, names the file and the tag, and says what it is about to
   do. It is also reached ONLY from the editor's Save button: no fetch, no automatic repair, and no
   code path that runs without someone having typed something. */
function lySaveEmbedded(text){
  var name=lyKey||'LYRICS', ans=0;
  try{
    ans=utils.MessageBox('Write these lyrics into the '+name+' tag of:\n\n'+NP.Path+
      '\n\nThis edits the music file itself and cannot be undone.',
      'Verdant -- save lyrics',1,48);
  }catch(e){ ans=0; }
  if(ans!==1) return false;
  var hl=null;
  try{ hl=new FbMetadbHandleList(); hl.Add(NP); }catch(e2){ hl=null; }
  if(!hl){ try{ hl=fb.CreateHandleList(); hl.Add(NP); }catch(e3){ hl=null; } }
  if(!hl || !hl.Count){ lyNotice('Could not prepare the tag write for '+NP.Path); return false; }
  var o={}; o[name]=text;
  try{ hl.UpdateFileInfoFromJSON(JSON.stringify(o)); }
  catch(e4){ lyNotice('Writing the '+name+' tag failed.\n\n'+e4); return false; }
  lyrics=parseLyrics(text); lyReset();
  return true;
}

/* ------------------------- the editor ------------------------- */
/* A real HTML dialog rather than a canvas text box, and that is a deliberate trade. Everything
   else in this theme is drawn by hand, but a lyrics editor needs selection, a caret that survives
   wrapping, Home/End, shift-arrow, undo and paste -- weeks of work to do badly, and a <textarea>
   has had all of it for thirty years. ShowHtmlDialog is modal, so the panel is simply paused
   while it is open and no timer can fire into a half-edited state.

   The markup is IE-compatible on purpose: the control behind this dialog is Trident, so no let,
   no arrow functions and no template strings. Data crosses the boundary as strings and functions
   only -- A.save is the panel's own closure, so the text comes back without the dialog needing to
   know anything about files or tags. */
function lyEsc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function lyEditHtml(){
  return [
'<!DOCTYPE html>',
'<html><head><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta charset="utf-8"><title>Verdant</title>',
'<style>',
'html,body{margin:0;padding:0;height:100%;background:#121212;color:#f2f2f2;',
'font-family:"Segoe UI",Tahoma,sans-serif;font-size:12px;overflow:hidden}',
'#w{position:absolute;top:0;left:0;right:0;bottom:0;padding:16px}',
'#hd{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'#sb{color:#9a9a9a;margin:2px 0 12px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
'#ta{width:100%;box-sizing:border-box;background:#181818;color:#f2f2f2;border:1px solid #2b2b2b;',
'padding:10px;font-family:Consolas,"Courier New",monospace;font-size:12px;line-height:1.5;overflow:auto}',
'#ft{margin-top:12px;text-align:right;white-space:nowrap}',
'#hint{float:left;color:#6f6f6f;padding-top:10px}',
'button{font-family:inherit;font-size:12px;padding:8px 18px;border:0;cursor:pointer;margin-left:8px}',
'.p{background:#1db954;color:#06250f;font-weight:600}',
'.g{background:#343434;color:#f2f2f2}',
'</style></head><body><div id="w">',
'<div id="hd"></div><div id="sb"></div>',
'<textarea id="ta" spellcheck="false"></textarea>',
'<div id="ft"><span id="hint">Ctrl+Enter saves</span>',
'<button class="g" id="bc">Cancel</button><button class="p" id="bs">Save</button></div>',
'</div><script type="text/javascript">',
/* dialogArguments arrives as a VBArray, which is why the sample calls toArray() on it before
   touching an element. The try/catch covers the case where it is already a plain array. */
'var A=window.external.dialogArguments;',
'try{ A=A.toArray(); }catch(e){}',
'var ta=document.getElementById("ta"), hd=document.getElementById("hd");',
'var sb=document.getElementById("sb"), ft=document.getElementById("ft");',
'var saveFn=A[3];',
'hd.innerHTML=A[0]; sb.innerHTML=A[1]; ta.value=A[2];',
'function fit(){',
'  try{',
'    var h=document.body.clientHeight-(hd.offsetHeight+sb.offsetHeight+ft.offsetHeight+54);',
'    ta.style.height=(h<80?80:h)+"px";',
'  }catch(e){ ta.style.height="360px"; }',
'}',
'fit(); window.onresize=fit;',
/* The two-step close is the sample's, and it is required: window.close() on its own makes IE ask
   the user to confirm, inside a dialog they already told to close. */
'function shut(){ window.open("","_self",""); window.close(); }',
'function doSave(){ if(saveFn) saveFn(ta.value); shut(); }',
'document.getElementById("bs").onclick=doSave;',
'document.getElementById("bc").onclick=shut;',
'document.onkeydown=function(e){',
'  e=e||window.event;',
'  if(e.keyCode===13&&(e.ctrlKey||e.metaKey)){ doSave(); return false; }',
'  if(e.keyCode===27){ shut(); return false; }',
'};',
'ta.focus();',
'<\/script></body></html>'
  ].join('\r\n');
}
/* Where the Save button will land, said plainly BEFORE anything is typed -- the one thing the
   user needs to know is whether they are about to edit a file or their music. */
function lyEditSub(){
  if(lySource==='embedded') return 'Saving writes the '+lyEsc(lyKey||'LYRICS')+' tag inside the track.';
  if(lyFile)                return 'Saving writes '+lyEsc(lyFile);
  return 'Saving creates '+lyEsc(lyBase(NP?NP.Path:'')+'.lrc');
}
/* The two lyrics buttons, wherever they are drawn: the right-hand pane and fullscreen both push
   hitboxes carrying these names, so neither view holds any logic of its own. */
function doLyAct(act){
  if(act==='lyedit') lyEditOpen();
  else if(act==='lyfetch') lyfNow();
}
function lyEditOpen(){
  if(!lyCanEdit()) return;
  var saved=null;
  var head=lyEsc(npTitleStr||'Lyrics')+(npArtistStr?(' <span style="color:#9a9a9a;font-weight:400">-- '+lyEsc(npArtistStr)+'</span>'):'');
  /* An ARRAY, not an object. The component marshals data into the HTML control itself, and a plain
     object carrying a function is rejected outright -- "ActiveX: unsupported JS object type". The
     array form is what the component's own sample uses, and it is the only shape a callback
     survives; the HTML picks the fields apart by index. */
  try{
    utils.ShowHtmlDialog(0,lyEditHtml(),{
      width:660, height:580, center:true, resizable:true, selection:true,
      data:[
        head,
        lyEditSub(),
        lyRawText(),
        /* Captured, not acted on: the write happens after ShowHtmlDialog returns, so a MessageBox
           for the tag-write confirmation is never raised underneath a dialog that still owns the
           modal loop. */
        function(t){ saved=String(t==null?'':t); }
      ]
    });
  }catch(e){ lyNotice('The lyrics editor could not be opened.\n\n'+e); return; }
  if(saved===null) return;        // cancelled, or closed from the title bar
  if(lySave(saved)) repaintAll();
}
