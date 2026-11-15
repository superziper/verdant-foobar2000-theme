/* verdant/views/settings.js -- Settings page: the panel properties, as real controls
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* Reached from the gear at the right of the title bar (ui/chrome.js: drawGearBtn), and a view
   rather than a modal -- which is what makes the page cost almost nothing. It inherits the main
   panel's scrolling, its reveal timing and its repaint scoping, and every other destination
   (Home, Search, a playlist) is still one click away, so there is no dialog to dismiss. A modal
   would have had to re-implement all of that and fight drawOverlays' full-paint rule besides.

   Every control writes through an apply* function in core/props.js, which updates the stored
   property AND the running value. Nothing here needs a panel reload -- not even UI scale.
   Right-click > Properties still edits the same values; this is simply the way in that
   doesn't require knowing that. */

var cfgScroll=0, cfgScrollT=0, CFG_MAXPX=0;         // page scroll (eased, same model as the other views)
var cfgMenu=null, CFG_PILL=[], CFG_HB=[], CFG_SWITCH=[], CFG_BTN=[];   // open dropdown key, pill/menu/switch/button targets
/* The whole row is the target, not just the control in it: the control sits at the far right of a
   wide panel, and a hover cue that spans the row is only honest if the row acts on a click too.
   The pill and the switch keep hitboxes of their own regardless -- they are what hoverSig needs to
   tell "over the control" from "over the row", and without that distinction the control's own
   hover state would never repaint. */
var CFG_ROWS=[];
function cfgRowAt(x,y){ return hitIdx(CFG_ROWS,x,y); }

function cfgPct(s){ return Math.round(s*100)+'%'; }
// Signed, because the sign is the whole meaning of this one and "200 ms" would not say which way.
function cfgMs(ms){ return (ms>0?'+':'')+ms+' ms'; }
/* Auto names the scale it actually resolved to. "Auto" alone leaves the one question a scale
   picker exists to answer -- what am I running at now -- unanswered. */
function cfgScaleOpts(){
  return [['Auto ('+cfgPct(resolveScale(0))+')',0],
          ['100%',1],['110%',1.1],['125%',1.25],['150%',1.5],['200%',2],['250%',2.5]];
}
var CFG_CEIL=[['Full range (0 dB)',0],['-3 dB',-3],['-6 dB',-6],['-12 dB',-12],['-20 dB',-20],['-30 dB',-30]];
var CFG_WHEEL=[['Slow (90 px)',90],['Normal (180 px)',180],['Fast (300 px)',300],['Very fast (480 px)',480]];
/* Album counts, not just byte counts: MB is the unit the setting is in, but albums is the unit the
   question is actually about. They come from the measured ~63KB a cached 500px cover takes, so they
   are honest rather than round. */
var CFG_CACHE_MB=[['128 MB (~2,000 albums)',128],['512 MB (~8,000 albums)',512],
                  ['1 GB (~16,000 albums)',1024],['4 GB (~65,000 albums)',4096],['No limit',0]];

/* The fallback label is the live value, not a guess: these four are editable from the Properties
   dialog too, so the page has to be able to show -8 dB honestly rather than claiming one of its
   own presets. */
function cfgModel(){
  var sc=cfgScaleOpts();
  return [
    {k:'scale', label:'UI scale',          desc:'Fonts, icons and the title bar. Auto follows your display.',
     items:sc,        val:UISCALE_PROP, text:labelOf(sc,UISCALE_PROP,cfgPct(UISCALE))},
    {k:'ceil',  label:'Output ceiling',    desc:'Lowers the top of the volume slider.',
     items:CFG_CEIL,  val:VOL_CEIL,     text:labelOf(CFG_CEIL,VOL_CEIL,VOL_CEIL+' dB')},
    {k:'wheel', label:'Wheel step',        desc:'How far one wheel notch scrolls a list.',
     items:CFG_WHEEL, val:WHEEL_PX,     text:labelOf(CFG_WHEEL,WHEEL_PX,WHEEL_PX+' px')},
    {k:'drp',   label:'Discord presence',  kind:'switch', on:DRP_ON, enabled:drpPresent,
     desc:drpPresent ? 'Shows the playing track on your Discord profile.'
                     : 'Needs the foo_verdant component, which is not installed.'},
    {k:'cache', label:'Cache artwork on disk', kind:'switch', on:ARTDISK_ON, enabled:true,
     desc:'Keeps covers between restarts instead of re-reading them from your library every launch.'},
    /* The size is in the label rather than the description because it is the one fact that makes
       this click informed, and a button whose label says what it will throw away needs no
       confirmation dialog on top -- a cache can only ever cost a refetch. */
    {k:'cachemb', label:'Cache size limit', items:CFG_CACHE_MB, val:ARTDISK_MB,
     text:labelOf(CFG_CACHE_MB,ARTDISK_MB,ARTDISK_MB?fmtBytes(ARTDISK_MB*1048576):'No limit'),
     desc:'The most disk the cover cache may use. Over it, the covers you looked at longest ago go first.'},
    {k:'clear', label:'Cached artwork', kind:'button', btn:'Clear'+(artDiskUsage()?' ('+fmtBytes(artDiskUsage())+')':''),
     enabled:artDiskUsage()>0, desc:artDiskUsageText()},
    {k:'lyrfetch', label:'Find lyrics online', kind:'switch', on:LYR_FETCH_ON, enabled:true,
     desc:'Only for tracks with no .lrc beside them and none in their tags. Saves a .lrc next to the song.'},
    /* A button row rather than a dropdown, because the useful value is a number the user arrives
       at by ear and it is not one of five. The capsule shows the value and opens a text box; the
       Properties dialog edits the same property, as it does for every other setting here. */
    {k:'lyroffset', label:'Lyrics timing', kind:'button', btn:cfgMs(LY_OFFSET), enabled:true,
     desc:'Shifts every lyric line. Positive shows them earlier, negative later.'}
  ];
}

/* Row heights come from the FONTS, not from constants: the whole point of the scale setting is
   that this page is used at every scale, including to climb back down from one that turned out
   too large to read. lineH is identity-cached per font, so this costs nothing per frame. */
function drawSettings(gr,r){
  CFG_PILL=[]; CFG_SWITCH=[]; CFG_BTN=[]; CFG_ROWS=[];
  var lx=r.x+M.cpad, w=r.w-M.cpad*2, cropY=r.y+r.h;
  var lhL=lineH(gr,FONT.pl), lhD=lineH(gr,FONT.plSub);
  var rowH=lhL+lhD+40, ph=Math.max(36,lhL+18), pw=Math.min(Math.round(w*0.42),Math.max(200,Math.round(260*UISCALE)));
  var rows=cfgModel(), i;

  // ---- header: the page's title, so it stays put while the rows scroll under it ----
  var hy=r.y+26, lhT=lineH(gr,FONT.sect2), top=hy+lhT+lhD+26;
  function header(){
    tL(gr,'Settings',FONT.sect2,COL.text,lx,hy,w,lhT);
    tL(gr,'Saved with this layout, and applied as you change them.',FONT.plSub,COL.text2,lx,hy+lhT+4,w,lhD);
    gr.DrawLine(lx,top-10,lx+w,top-10,1,COL.line);
  }
  header();

  // ---- rows ----
  var viewH=Math.max(0,cropY-top), contentH=rows.length*rowH;
  CFG_MAXPX=Math.max(0,contentH-viewH);
  cfgScroll=clampPx(cfgScroll,CFG_MAXPX); cfgScrollT=clampPx(cfgScrollT,CFG_MAXPX);
  var openA=null, openR=null;
  for(i=0;i<rows.length;i++){
    var ry=top+i*rowH-cfgScroll;
    if(ry>=cropY) break;
    if(ry+rowH<=top) continue;
    var row=rows[i], cy=ry+Math.round((rowH-ph)/2);
    // hover cue across the whole row: the control is on the far right of a wide panel, and the
    // band is what ties it back to the label it belongs to
    var bt=Math.max(ry+4,top), bb=Math.min(ry+rowH-4,cropY);   // clamped: a row half under the header must not answer the mouse there
    /* A button row is the exception to the whole-row rule above, and on purpose. The argument
       for a row-wide target is that a row-wide hover cue has to be honest -- but it cuts the
       other way for an action that destroys something: a stray click anywhere along a 56px band
       should not empty the cache. So a button row gets neither the band nor the hitbox, and its
       button is the only thing that answers. */
    /* bb-bt rather than bb>bt: a row scrolling under the header is clamped to whatever sliver is
       still below it, and an 8px corner needs 16px of height to exist in. One pixel of hover cue
       is not worth drawing anyway, so the band is simply skipped -- but the row stays a target. */
    if(bb-bt>=2 && row.kind!=='button'){
      if(hv(lx-8,bt,lx+w+8,bb)){
        var brad=roundRad(w+16,bb-bt,8);
        gr.FillRoundRect(lx-8,bt,w+16,bb-bt,brad,brad,RGBA(255,255,255,10));
      }
      CFG_ROWS.push({x0:lx-8,y0:bt,x1:lx+w+8,y1:bb,k:row.k,kind:row.kind,enabled:row.enabled});
    }
    var ty=ry+Math.round((rowH-lhL-lhD-4)/2), tw=Math.max(40,w-pw-28);
    tL(gr,row.label,FONT.pl,COL.text,lx,ty,tw,lhL);
    tL(gr,row.desc,FONT.plSub,COL.text2,lx,ty+lhL+4,tw,lhD);
    if(row.kind==='switch'){
      var sw=Math.round(ph*1.55), sx=lx+w-sw;
      var hbs=drawSwitch(gr,sx,cy+Math.round((ph-ph*0.72)/2),sw,Math.round(ph*0.72),row.on,row.enabled);
      if(row.enabled) CFG_SWITCH.push(hbs);  // disabled: drawn, but not a target
    } else if(row.kind==='button'){
      // same capsule the modal dialogs use, in the neutral (Cancel) weight: this is not a primary
      // action and should not read like one. Disabled draws with hover == rest, so it stays inert.
      var bw2=Math.min(Math.round(w*0.42),Math.max(140,Math.round(170*UISCALE))), bx2=lx+w-bw2;
      var hbb=dlgBtn(gr,bx2,cy,bw2,ph,row.btn,row.enabled?RGB(52,52,52):RGB(44,44,44),
                     row.enabled?RGB(66,66,66):RGB(44,44,44),row.enabled?COL.text:COL.text3);
      if(row.enabled){ hbb.k=row.k; CFG_BTN.push(hbb); }
    } else {
      var anchor=drawDropPill(gr,lx+w-pw,cy,pw,ph,row.text,cfgMenu===row.k);
      anchor.k=row.k; CFG_PILL.push(anchor);
      if(cfgMenu===row.k){ openA=anchor; openR=row; }
    }
    if(i<rows.length-1 && ry+rowH<cropY) gr.DrawLine(lx,ry+rowH,lx+w,ry+rowH,1,RGBA(255,255,255,14));
  }
  /* Crop the partial top row, then redraw the header over it -- the same order drawNav uses for
     its pinned block. The clear starts below the panel's rounded corners so a square fill can't
     square them off. */
  gr.FillSolidRect(r.x,r.y+M.radius+2,r.w,Math.max(0,top-(r.y+M.radius+2)),COL.base);
  header();
  gr.FillSolidRect(r.x,cropY,r.w,M.pad+2,COL.black);   // gutter below the panel
  drawScrollbar(gr,lx+w+8,top,viewH,cfgScroll,CFG_MAXPX,viewH,contentH,hv(r.x,top,r.x+r.w,cropY)||drag==='scroll');

  // last, so it floats over the rows; the panel's own edges are the lines it may not cross
  CFG_HB=(openA&&openR)?drawDropMenu(gr,openA,openR.items,openR.val,pw,cropY,r.y+8):[];
}

/* A click anywhere on a row. A switch flips; anything else opens its dropdown. */
function cfgClickRow(row){
  if(row.kind==='switch'){ if(row.enabled) cfgToggle(row.k); return; }
  cfgMenu=row.k; repaintAll();
}
/* The switch counterpart of cfgApply: the key says which setting was flipped and core/props.js
   owns what that means. Keyed dispatch rather than a handler stored on the row, because cfgModel()
   is rebuilt on every paint -- a closure per row would allocate on every frame. */
function cfgToggle(k){
  if(k==='drp')        applyDrpOn(!DRP_ON);
  else if(k==='cache') applyArtDiskOn(!ARTDISK_ON);
  else if(k==='lyrfetch') applyLyrFetchOn(!LYR_FETCH_ON);
  else repaintAll();
}
/* Free text, via the system input box. A number typed by ear wants to be typed, not chosen from a
   list someone else guessed at -- and the one thing the dialog has to carry is the sign
   convention, which is what the Help button is for.

   Anything unparseable leaves the value alone rather than resetting it to zero: a typo should cost
   a second attempt, not the setting. */
function cfgAskOffset(){
  var s=null;
  try{ s=utils.InputBox(0,'Lyrics timing offset, in milliseconds:','Verdant -- lyrics timing',
                        String(LY_OFFSET),true,
                        'Positive values show each line EARLIER, negative values later. '+
                        'The range is -30000 to 30000 ms. A file carrying its own [offset:] tag '+
                        'is honoured as well, and the two add up.'); }
  catch(e){ return; }   // cancelled
  if(s===null) return;
  s=String(s).replace(/\s|ms/gi,'');
  if(!s){ applyLyrOffset(0); return; }
  var v=parseFloat(s);
  if(!isFinite(v)){ repaintAll(); return; }
  applyLyrOffset(v);
}
/* Buttons, same keyed dispatch as the switches and the dropdowns. A full repaint rather than
   repaintMain: the label it was just clicked through is part of the row it sits in, and the row's
   description changes with it. */
function cfgButton(k){
  if(k==='clear') artDiskClear();
  else if(k==='lyroffset') cfgAskOffset();
  // unconditional: the modal above covered the page, so the row under the pointer has to be redrawn
  // whether the value changed or the dialog was cancelled
  repaintAll();
}
/* One entry point for every dropdown on the page: the key says which setting was picked, and
   core/props.js owns what that means. Each apply* repaints. */
function cfgApply(k,v){
  cfgMenu=null;
  if(k==='scale')      applyUIScale(v);
  else if(k==='ceil')  applyVolCeil(v);
  else if(k==='wheel') applyWheelPx(v);
  else if(k==='cachemb') applyArtDiskMB(v);
  else repaintAll();
}
