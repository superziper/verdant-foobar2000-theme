/* verdant/core/util.js -- small pure helpers with no foobar or paint state. Loaded by
   main.js; every module shares one global scope, so load order is set there. */

/* ------------------------- helpers ------------------------- */
function hash(s) {
  s = String(s);
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}
function coverCol(seed) {
  return PALETTE[hash(seed) % PALETTE.length];
}
function blend(c1, c2, t) {
  var r = (c1 >> 16) & 255,
    g = (c1 >> 8) & 255,
    b = c1 & 255,
    r2 = (c2 >> 16) & 255,
    g2 = (c2 >> 8) & 255,
    b2 = c2 & 255;
  return RGB(
    Math.round(r + (r2 - r) * t),
    Math.round(g + (g2 - g) * t),
    Math.round(b + (b2 - b) * t),
  );
}
function fmtTime(s) {
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
}
function inRect(x, y, r) {
  return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
}
function cxOf(x, w, cw) {
  return x + Math.round((w - cw) / 2);
} // x that centres a cw-wide thing inside [x,w]
function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clampPx(v, max) {
  return v < 0 ? 0 : v > max ? max : v;
}
function hitIdx(list, x, y) {
  for (var i = 0; i < list.length; i++) if (inRect(x, y, list[i])) return i;
  return -1;
}
function hit(list, x, y) {
  var i = hitIdx(list, x, y);
  return i < 0 ? null : list[i];
}
function labelOf(list, v, dflt) {
  for (var i = 0; i < list.length; i++) if (list[i][1] === v) return list[i][0];
  return dflt;
}
function playingLoc() {
  return plman.GetPlayingItemLocation ? plman.GetPlayingItemLocation() : null;
}

/* Byte sizes for the Settings page: KB below a megabyte so an almost-empty cache does
   not read as 0 MB, one decimal in the single digits, whole numbers above that. */
/* GDI+ builds a rounded rectangle from four arcs and THROWS on a corner that does not
   fit the box ("FillRoundRect failed: Arc argument has invalid value"), which from a
   paint handler ends the script and takes the whole panel with it. A hardcoded radius
   is therefore a latent crash on any computed box, so clamping is the fix: the corner
   just stops getting rounder once there is no room. */
function roundRad(w, h, r) {
  var m = Math.floor(Math.min(w, h) / 2);
  return Math.max(0, Math.min(r, m));
}
function fmtBytes(b) {
  b = Math.max(0, b || 0);
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + " GB";
  if (b < 1048576) return Math.max(1, Math.round(b / 1024)) + " KB";
  var mb = b / 1048576;
  return (mb < 10 ? mb.toFixed(1) : String(Math.round(mb))) + " MB";
}

function fmtNum(n) {
  n = String(n);
  var out = "",
    c = 0;
  for (var i = n.length - 1; i >= 0; i--) {
    out = n.charAt(i) + out;
    if (++c % 3 === 0 && i > 0) out = "," + out;
  }
  return out;
}

// "1 hr 23 min" / "42 min" / "38 sec" style duration
function fmtDur(s) {
  s = Math.max(0, Math.round(s));
  var h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60);
  if (h > 0) return h + " hr " + m + " min";
  if (m > 0) return m + " min";
  return s + " sec";
}
