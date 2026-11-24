/* verdant/core/props.js -- panel properties: the settings store, read at load and
   written by the Settings page. Loaded by main.js; every module shares one global
   scope, so load order is set there. */

/* Panel settings live in JSplitter's own per-panel property store, so they travel with
   the layout and the shipped configuration is already correct without anyone opening a
   dialog. They are READ once here because the values are consumed at load time, and
   WRITTEN from the Settings page through the apply* functions at the bottom of this
   file, each of which updates the running value as well as the stored one. */
function propNum(name, dflt) {
  var v = dflt;
  try {
    v = window.GetProperty(name, dflt);
  } catch (e) {
    v = dflt;
  }
  v = parseFloat(v);
  return isFinite(v) ? v : dflt;
}
/* Property names are constants because two places use each one: this module reads at
   load, the Settings page writes back. A disagreement would not fail, since GetProperty
   creates a missing property, but it would silently strand the user's choice in an
   orphaned entry. */
var PROP = {
  scale: "Display: UI scale (0 = auto)",
  ceil: "Playback: output ceiling (dB below max)",
  wheel: "Scrolling: wheel step (px)",
  drp: "Discord: show the playing track (1 = on)",
  cache: "Artwork: cache covers on disk (1 = on)",
  cachemb: "Artwork: disk cache limit (MB, 0 = no limit)",
  lyrfetch: "Lyrics: fetch when missing (1 = on)",
  lyroffset: "Lyrics: timing offset (ms)",
};
function propSet(name, val) {
  try {
    window.SetProperty(name, val);
  } catch (e) {}
}

/* Which visualizer the fullscreen view draws, deliberately NOT a panel property: the
   picker in fullscreen is the place to change it, and mirroring the choice into
   SetProperty only duplicated the control in the Properties dialog. The choice
   therefore lasts the session rather than across a restart, and an unknown value falls
   through to the bars (see drawVizBody). */
var vizStyle = "bars";

/* 0 = auto: follow the display, where 96 dpi is 100% scaling; set a number to override,
   where 1.0 is compact and 1.25 suits a 1440p 21-inch. Clamped because a bad value
   makes the panel unusable rather than merely ugly, and the RAW value is kept beside
   the resolved one so the Settings page can show Auto as Auto. */
var UISCALE_PROP = propNum(PROP.scale, 0);
function resolveScale(raw) {
  var s = raw;
  if (s <= 0) {
    var dpi = 96;
    try {
      dpi = window.DPI || 96;
    } catch (e) {
      dpi = 96;
    }
    s = dpi / 96;
  }
  return Math.max(0.75, Math.min(3, s));
}
var UISCALE = resolveScale(UISCALE_PROP);

/* Output ceiling, in dB below foobar's own maximum, applied to the volume slider's full
   position; 0 leaves foobar's range unchanged and is the default. Set it negative where
   there is plenty of gain downstream and the top of the scale is unusable (-12 is a
   quarter of the amplitude, -20 nearer a quarter of the perceived loudness), clamped so
   a wild value cannot leave no usable range at all. */
var VOL_CEIL = Math.max(-60, Math.min(0, propNum(PROP.ceil, 0)));

/* Wheel step for the continuous (pixel-scrolled) lists. The tall artist cards scale this up
   themselves; see on_mouse_wheel. */
var WHEEL_PX = Math.max(20, propNum(PROP.wheel, 180));

/* Show the playing track on your Discord profile, via the bundled foo_verdant
   component, on by default. Off tells the component to stand down, so no track data is
   published and no connection to the Discord client is opened; it does nothing if
   foo_verdant is not installed (see data/discord.js). */
var DRP_ON = propNum(PROP.drp, 1) > 0;

/* Keep decoded covers on disk as well as in memory so they survive a restart; artCache
   is unchanged either way, and this only decides whether an artCache MISS is served
   from a local file or re-read from the library. On by default because it is bounded
   and helps most where every cover is a network round trip, and off means no reads and
   no writes (see data/artdisk.js). */
var ARTDISK_ON = propNum(PROP.cache, 1) > 0;

/* How much disk the cover cache may use, in MB; 0 means no limit, the same idiom
   PROP.scale uses for auto, and over it the covers longest unlooked-at go first. 1GB by
   default, about 16,000 albums at the ~63KB a 500px cover actually encodes to
   (measured, since GdiBitmap.SaveAs takes only a path and a format, so JPEG quality is
   whatever GDI+ picks), and clamped at 0, since a negative budget would evict
   everything on every write. */
var ARTDISK_MB = Math.max(0, propNum(PROP.cachemb, 1024));

/* Look lyrics up online when a track has NEITHER a .lrc/.txt beside it nor lyrics in
   its tags; both local sources are tried first and always win. On by default, and off
   means no request is made and the pane says so rather than pretending it looked (see
   data/lyrfetch.js). */
var LYR_FETCH_ON = propNum(PROP.lyrfetch, 1) > 0;

/* How far ahead of the audio the lyrics run, in milliseconds. Positive lands the lines
   EARLIER, the sign convention the LRC [offset:] tag itself uses, so a file carrying
   its own offset and this setting simply add up; 0 by default, clamped at 30 seconds. */
var LY_OFFSET_MAX = 30000;
var LY_OFFSET = Math.round(
  Math.max(-LY_OFFSET_MAX, Math.min(LY_OFFSET_MAX, propNum(PROP.lyroffset, 0))),
);

/* ------------------------- live apply ------------------------- One function per
   setting, each the single place that writes the property AND updates the running
   value, so views/settings.js never has to know which globals a setting feeds. These
   run at call time, so they may reach forward into tokens.js, chrome.js and app.js even
   though props.js loads first. */

/* UI scale has exactly two consumers, the font table and the title-bar metrics, and both are rebuilt here, which is what lets the Settings page apply a scale change on the click instead of on a reload. Not rebuilt, and why:
     - the icon cache is keyed by its own explicit pixel size, so it is already correct
     - the corner stamps and card bitmaps key off M.radius and geometry, neither of which scales
     - the line-height cache keys off font IDENTITY, so its entries are dead and must be dropped */
function applyUIScale(raw) {
  propSet(PROP.scale, raw);
  UISCALE_PROP = raw;
  UISCALE = resolveScale(raw);
  FONT = buildFonts();
  LH_F = [];
  LH_V = [];
  /* Anything baked from the old fonts is now the wrong size, not merely the wrong
     weight: the artist card derives its HEIGHT from the font, so a stale bitmap would
     tile the grid at the previous pitch. on_size clears these for the same reason. */
  artTextH_ = 0;
  plCardCache = {};
  artCardCache = {};
  artCardN = 0;
  skelImgs = {};
  chromeMetrics();
  layout();
  repaintAll();
}
/* A ceiling lowered below the current volume has to pull the volume down with it, or the slider
   would draw past its own full position until the next time anything touched it. */
function applyVolCeil(db) {
  db = Math.max(-60, Math.min(0, db));
  propSet(PROP.ceil, db);
  VOL_CEIL = db;
  capVolume();
  repaintAll();
}
function applyWheelPx(px) {
  px = Math.max(20, px);
  propSet(PROP.wheel, px);
  WHEEL_PX = px;
  repaintMain();
}
/* drpSync is what actually moves the component: it compares the component's own menu
   checkmark against DRP_ON and runs the toggle when they disagree. Calling it here
   keeps the Settings switch and the component's menu item from drifting apart. */
function applyDrpOn(on) {
  propSet(PROP.drp, on ? 1 : 0);
  DRP_ON = !!on;
  drpSync();
  repaintMain();
}
/* Deliberately does NOT touch artCache: the in-memory tier is valid whichever way this
   goes, and clearing it would drop every cover on screen to a placeholder and re-gate
   every section. Off stops reads and writes and drops the pending write queue, so it is
   the behaviour that existed before the cache did. */
function applyArtDiskOn(on) {
  propSet(PROP.cache, on ? 1 : 0);
  // Order matters on the way DOWN: artDiskSuspend flushes the index, and the flush has to happen
  // while the cache still counts as live or the entries written in the last few seconds are lost.
  if (on) {
    ARTDISK_ON = true;
    artDiskResume();
  } else {
    artDiskSuspend();
    ARTDISK_ON = false;
  }
  repaintMain();
}
/* Lowering the limit applies at once rather than at the next launch, since wanting the
   disk back is the whole reason to touch this control. Raising it evicts nothing, so it
   is free. */
function applyArtDiskMB(mb) {
  mb = Math.max(0, mb);
  propSet(PROP.cachemb, mb);
  ARTDISK_MB = mb;
  artDiskEnforce();
  repaintMain();
}
/* Turning the fetcher OFF drops anything in flight, so the switch means what it says
   even while a request is open. Turning it ON re-asks for the track on screen, which is
   very likely showing no-lyrics at that moment. */
function applyLyrFetchOn(on) {
  propSet(PROP.lyrfetch, on ? 1 : 0);
  LYR_FETCH_ON = !!on;
  if (on) lyfRetry();
  else lyfCancel();
  repaintAll();
}
/* lySnap, because an offset change should land on the corrected line immediately.
   Without it the roll glides to the new position, which at a large correction reads as
   the panel having mistaken the click for something else. */
function applyLyrOffset(ms) {
  ms = Math.round(Math.max(-LY_OFFSET_MAX, Math.min(LY_OFFSET_MAX, ms)));
  propSet(PROP.lyroffset, ms);
  LY_OFFSET = ms;
  lySnap = true;
  repaintAll();
}
