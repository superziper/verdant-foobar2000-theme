/* verdant/core/props.js -- panel properties: the settings store, read at load and written by the Settings page
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* Panel settings live in JSplitter's own per-panel property store, which means they travel with
   the layout: the shipped configuration carries these defaults, so a fresh install is already
   correct without anyone opening a dialog.

   They are READ once, here, because the values are consumed at LOAD time -- core/tokens.js builds
   every font from UISCALE and ui/chrome.js sizes the title bar from it.

   They are WRITTEN from the Settings page (views/settings.js, title bar > gear), through the
   apply* functions at the bottom of this file. Each of those updates the running value as well as
   the stored one, so no setting needs a panel reload any more. Right-click > Properties still
   works and still shows the same four values -- it is simply no longer the only way in. */
function propNum(name,dflt){
  var v=dflt;
  try{ v=window.GetProperty(name,dflt); }catch(e){ v=dflt; }
  v=parseFloat(v);
  return isFinite(v)?v:dflt;
}
/* Property names are constants because two places now use each one: this module reads it at load
   and the Settings page writes it back. A disagreement between them would not fail -- GetProperty
   CREATES a missing property -- it would silently strand the user's choice in a second, orphaned
   entry, so neither spells the names out inline. */
var PROP={
  scale:'Display: UI scale (0 = auto)',
  ceil :'Playback: output ceiling (dB below max)',
  wheel:'Scrolling: wheel step (px)',
  drp  :'Discord: show the playing track (1 = on)'
};
function propSet(name,val){ try{ window.SetProperty(name,val); }catch(e){} }

/* Which visualizer the fullscreen view draws. Deliberately NOT a panel property: the picker in
   fullscreen is the place to change it, and mirroring the choice into window.SetProperty only
   put a second, duplicate control in the Properties dialog. The cost is that the choice lasts
   for the session rather than across a restart. An unknown value falls through to the bars
   (see drawVizBody). */
var vizStyle = 'bars';

/* 0 = auto: follow the display, where 96 dpi is 100% scaling. Auto is right on most machines;
   set a number to override -- 1.0 is compact, 1.25 suits a 1440p 21", higher for a 4K panel.
   Clamped because a bad value here makes the panel unusable rather than merely ugly.
   The RAW value is kept beside the resolved one: the Settings page has to show "Auto" as Auto
   rather than as whatever the display happens to resolve it to. */
var UISCALE_PROP = propNum(PROP.scale,0);
function resolveScale(raw){
  var s=raw;
  if(s<=0){
    var dpi=96;
    try{ dpi=window.DPI||96; }catch(e){ dpi=96; }
    s=dpi/96;
  }
  return Math.max(0.75,Math.min(3,s));
}
var UISCALE = resolveScale(UISCALE_PROP);

/* Output ceiling, in dB below foobar's own maximum, applied to the volume slider's full position.
   0 is foobar's range unchanged and is the right default: a theme has no business making anyone's
   music quieter without being asked. Set it negative on a system with plenty of gain downstream,
   where the top of the scale is unusable and the slider's whole travel is better spent lower --
   -12 is a quarter of the amplitude, -20 nearer a quarter of the perceived loudness. Clamped, since
   a wild value here would leave no usable range at all. */
var VOL_CEIL = Math.max(-60, Math.min(0, propNum(PROP.ceil, 0)));

/* Wheel step for the continuous (pixel-scrolled) lists. The tall artist cards scale this up
   themselves; see on_mouse_wheel. */
var WHEEL_PX = Math.max(20, propNum(PROP.wheel, 180));

/* Show the playing track on your Discord profile, via the bundled foo_verdant component.
   On by default, because a feature nobody can find is worse than one that announces itself --
   and because the card is a large part of why this theme exists.

   Turning it off genuinely turns it OFF: the panel tells the component to stand down, so no track
   data is published and no connection to the Discord client is opened at all. Does nothing if
   foo_verdant is not installed. See data/discord.js. */
var DRP_ON = propNum(PROP.drp, 1) > 0;

/* ------------------------- live apply -------------------------
   One function per setting, each the single place that writes the property AND updates the
   running value, so views/settings.js never has to know which globals a setting feeds.

   These run at call time, so they may freely reach forward into tokens.js, chrome.js and app.js
   even though props.js loads first. */

/* UI scale has exactly two consumers -- the font table and the title-bar metrics -- and both are
   rebuilt here, which is what lets the Settings page offer a scale picker that takes effect on
   the click instead of asking for a panel reload. Note what is NOT rebuilt and why:
     - the icon cache is keyed by its own explicit pixel size, so it is already correct
     - the corner stamps and card bitmaps key off M.radius and geometry, neither of which scales
     - the line-height cache keys off font IDENTITY, so its entries are dead and must be dropped */
function applyUIScale(raw){
  propSet(PROP.scale,raw);
  UISCALE_PROP=raw;
  UISCALE=resolveScale(raw);
  FONT=buildFonts();
  LH_F=[]; LH_V=[];
  chromeMetrics();
  layout();
  repaintAll();
}
/* A ceiling lowered below the current volume has to pull the volume down with it, or the slider
   would draw past its own full position until the next time anything touched it. */
function applyVolCeil(db){
  db=Math.max(-60,Math.min(0,db));
  propSet(PROP.ceil,db);
  VOL_CEIL=db;
  capVolume();
  repaintAll();
}
function applyWheelPx(px){
  px=Math.max(20,px);
  propSet(PROP.wheel,px);
  WHEEL_PX=px;
  repaintMain();
}
/* drpSync is what actually moves the component: it compares the component's own menu checkmark
   against DRP_ON and runs the toggle when they disagree. Calling it here means the switch on the
   Settings page and the component's menu item can never drift apart. */
function applyDrpOn(on){
  propSet(PROP.drp,on?1:0);
  DRP_ON=!!on;
  drpSync();
  repaintMain();
}
