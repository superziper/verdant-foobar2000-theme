/* verdant/core/props.js -- panel properties, resolved before anything sizes itself
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* Panel settings live in JSplitter's own per-panel property store (right-click > Properties),
   which means they travel with the layout: the shipped configuration carries these defaults, so
   a fresh install is already correct without anyone opening the dialog.

   Read once, here, because the values are consumed at LOAD time -- core/tokens.js builds every
   font from UISCALE and ui/chrome.js sizes the title bar from it. Changing a property therefore
   takes a panel reload (right-click > Reload), not just a repaint. */
function propNum(name,dflt){
  var v=dflt;
  try{ v=window.GetProperty(name,dflt); }catch(e){ v=dflt; }
  v=parseFloat(v);
  return isFinite(v)?v:dflt;
}

/* Which visualizer the fullscreen view draws. Deliberately NOT a panel property: the picker in
   fullscreen is the place to change it, and mirroring the choice into window.SetProperty only
   put a second, duplicate control in the Properties dialog. The cost is that the choice lasts
   for the session rather than across a restart. An unknown value falls through to the bars
   (see drawVizBody). */
var vizStyle = 'bars';

/* 0 = auto: follow the display, where 96 dpi is 100% scaling. Auto is right on most machines;
   set a number to override -- 1.0 is compact, 1.25 suits a 1440p 21", higher for a 4K panel.
   Clamped because a bad value here makes the panel unusable rather than merely ugly. */
var UISCALE = propNum('Display: UI scale (0 = auto)', 0);
if(UISCALE<=0){
  var _dpi=96;
  try{ _dpi=window.DPI||96; }catch(e){ _dpi=96; }
  UISCALE=_dpi/96;
}
UISCALE=Math.max(0.75,Math.min(3,UISCALE));

/* Output ceiling, in dB below foobar's own maximum, applied to the volume slider's full position.
   0 is foobar's range unchanged and is the right default: a theme has no business making anyone's
   music quieter without being asked. Set it negative on a system with plenty of gain downstream,
   where the top of the scale is unusable and the slider's whole travel is better spent lower --
   -12 is a quarter of the amplitude, -20 nearer a quarter of the perceived loudness. Clamped, since
   a wild value here would leave no usable range at all. */
var VOL_CEIL = Math.max(-60, Math.min(0, propNum('Playback: output ceiling (dB below max)', 0)));

/* Wheel step for the continuous (pixel-scrolled) lists. The tall artist cards scale this up
   themselves; see on_mouse_wheel. */
var WHEEL_PX = Math.max(20, propNum('Scrolling: wheel step (px)', 180));

/* Show the playing track on your Discord profile, via the bundled foo_verdant component.
   On by default, because a feature nobody can find is worse than one that announces itself --
   and because the card is a large part of why this theme exists.

   Set to 0 and reload the panel to turn it off. That genuinely turns it OFF: the panel tells
   the component to stand down, so no track data is published and no connection to the Discord
   client is opened at all. Does nothing if foo_verdant is not installed.
   See data/discord.js. */
var DRP_ON = propNum('Discord: show the playing track (1 = on)', 1) > 0;
