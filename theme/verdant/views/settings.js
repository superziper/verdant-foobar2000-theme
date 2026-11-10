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
   Right-click > Properties still edits the same four values; this is simply the way in that
   doesn't require knowing that. */

var cfgScroll=0, cfgScrollT=0, CFG_MAXPX=0;         // page scroll (eased, same model as the other views)
var cfgMenu=null, CFG_PILL=[], CFG_HB=[], CFG_SWITCH=null;   // open dropdown key, pill targets, menu items, switch
/* The whole row is the target, not just the control in it: the control sits at the far right of a
   wide panel, and a hover cue that spans the row is only honest if the row acts on a click too.
   The pill and the switch keep hitboxes of their own regardless -- they are what hoverSig needs to
   tell "over the control" from "over the row", and without that distinction the control's own
   hover state would never repaint. */
var CFG_ROWS=[];
function cfgRowAt(x,y){ return hitIdx(CFG_ROWS,x,y); }

function cfgPct(s){ return Math.round(s*100)+'%'; }
/* Auto names the scale it actually resolved to. "Auto" alone leaves the one question a scale
   picker exists to answer -- what am I running at now -- unanswered. */
function cfgScaleOpts(){
  return [['Auto ('+cfgPct(resolveScale(0))+')',0],
          ['100%',1],['110%',1.1],['125%',1.25],['150%',1.5],['200%',2],['250%',2.5]];
}
var CFG_CEIL=[['Full range (0 dB)',0],['-3 dB',-3],['-6 dB',-6],['-12 dB',-12],['-20 dB',-20],['-30 dB',-30]];
var CFG_WHEEL=[['Slow (90 px)',90],['Normal (180 px)',180],['Fast (300 px)',300],['Very fast (480 px)',480]];

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
                     : 'Needs the foo_verdant component, which is not installed.'}
  ];
}

/* Row heights come from the FONTS, not from constants: the whole point of the scale setting is
   that this page is used at every scale, including to climb back down from one that turned out
   too large to read. lineH is identity-cached per font, so this costs nothing per frame. */
function drawSettings(gr,r){
  CFG_PILL=[]; CFG_SWITCH=null; CFG_ROWS=[];
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
    if(bb>bt){
      if(hv(lx-8,bt,lx+w+8,bb)) gr.FillRoundRect(lx-8,bt,w+16,bb-bt,8,8,RGBA(255,255,255,10));
      CFG_ROWS.push({x0:lx-8,y0:bt,x1:lx+w+8,y1:bb,k:row.k,kind:row.kind,enabled:row.enabled});
    }
    var ty=ry+Math.round((rowH-lhL-lhD-4)/2), tw=Math.max(40,w-pw-28);
    tL(gr,row.label,FONT.pl,COL.text,lx,ty,tw,lhL);
    tL(gr,row.desc,FONT.plSub,COL.text2,lx,ty+lhL+4,tw,lhD);
    if(row.kind==='switch'){
      var sw=Math.round(ph*1.55), sx=lx+w-sw;
      var hbs=drawSwitch(gr,sx,cy+Math.round((ph-ph*0.72)/2),sw,Math.round(ph*0.72),row.on,row.enabled);
      if(row.enabled) CFG_SWITCH=hbs;        // disabled: drawn, but not a target
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
  if(row.kind==='switch'){ if(row.enabled) applyDrpOn(!DRP_ON); return; }
  cfgMenu=row.k; repaintAll();
}
/* One entry point for every dropdown on the page: the key says which setting was picked, and
   core/props.js owns what that means. Each apply* repaints. */
function cfgApply(k,v){
  cfgMenu=null;
  if(k==='scale')      applyUIScale(v);
  else if(k==='ceil')  applyVolCeil(v);
  else if(k==='wheel') applyWheelPx(v);
  else repaintAll();
}
