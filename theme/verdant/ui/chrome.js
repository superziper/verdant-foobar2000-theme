/* verdant/ui/chrome.js -- window chrome and shared widgets: title bar, scrollbars,
   panels, overlays, menus. Loaded by main.js, which sets load order; every module
   shares one global scope. */

/* Custom window title bar via UI Wizard (foo_ui_wizard) - frameless + our own controls */
/* Title-bar metrics, all derived from UISCALE. Settings can change the scale while the
   panel runs, so these move with the fonts (see applyUIScale); GEARW/GEARGAP size the
   settings button inside the window controls. */
var TBH, CAPBW, GEARW, GEARGAP;
function chromeMetrics() {
  TBH = Math.round(32 * UISCALE);
  CAPBW = Math.round(46 * UISCALE);
  GEARW = Math.round(40 * UISCALE);
  GEARGAP = Math.round(10 * UISCALE);
  capW = -1; // the caption rect's height just changed: make applyCaption re-send it
}
chromeMetrics();
var UIWizard = null;
try {
  UIWizard = new ActiveXObject("UIWizard");
} catch (e) {
  UIWizard = null;
}
var MENUS = [
  ["File", "file"],
  ["Library", "library"],
  ["Help", "help"],
];
var MENU_END = 0,
  capW = -1,
  capEnd = -1;
// left edge of the settings button -- also where the OS caption (drag) area has to stop
function gearX() {
  return W - CAPBW * 3 - GEARGAP - GEARW;
}
function applyCaption() {
  if (!UIWizard) return;
  if (capW === W && capEnd === MENU_END) return;
  capW = W;
  capEnd = MENU_END;
  try {
    UIWizard.SetCaptionAreaSize(
      MENU_END,
      0,
      Math.max(0, gearX() - MENU_END),
      TBH,
    );
  } catch (e) {}
}
function openMenu(root, x, y) {
  try {
    var mm = fb.CreateMainMenuManager();
    mm.Init(root);
    var m = window.CreatePopupMenu();
    mm.BuildMenu(m, 1, 600);
    var id = m.TrackPopupMenu(x, y);
    if (id > 0) mm.ExecuteByID(id - 1);
  } catch (e) {}
}

// small hover "..." button; records a HB_DOTS target that opens the menu just below it
function drawDots(gr, cx, cy, pl) {
  if (hv(cx, cy, cx + 24, cy + 24))
    gr.FillEllipse(cx, cy, 24, 24, RGBA(255, 255, 255, 26));
  drawIcon(gr, "more", COL.text, cx, cy, 24, 24, 18);
  HB_DOTS.push({
    x0: cx - 2,
    y0: cy - 2,
    x1: cx + 26,
    y1: cy + 26,
    pl: pl,
    mx: cx,
    my: cy + 26,
  });
}
// Rounded outline. GDI+ rejects an arc bigger than half the side and centres a stroke on the
// path, so inset by the line width first, then clamp the radius to what's left.
function strokeRound(gr, x, y, w, h, rad, lw, col) {
  var i = lw / 2,
    sw = w - lw,
    sh = h - lw;
  if (sw <= 0 || sh <= 0) return;
  var a = Math.min(rad, sw / 2, sh / 2);
  gr.DrawRoundRect(x + i, y + i, sw, sh, a, a, lw, col);
}
/* Dashed rounded outline. GDI+ here has no pen dash style, so the path is walked by
   hand with the corners as chords, and the dash period is scaled to divide the
   perimeter a whole number of times so the pattern closes at the start corner. */
function strokeRoundDash(gr, x, y, w, h, rad, lw, col, dash, gap) {
  var i = lw / 2,
    sw = w - lw,
    sh = h - lw;
  if (sw <= 0 || sh <= 0) return;
  var a = Math.min(rad, sw / 2, sh / 2),
    x0 = x + i,
    y0 = y + i,
    x1 = x0 + sw,
    y1 = y0 + sh;
  var P = [],
    STEP = 6,
    k,
    ang; // 6 chords per corner still reads as round at this size
  function arc(cx, cy, from) {
    for (k = 1; k <= STEP; k++) {
      ang = ((from + (90 * k) / STEP) * Math.PI) / 180;
      P.push([cx + Math.cos(ang) * a, cy + Math.sin(ang) * a]);
    }
  }
  P.push([x0 + a, y0]);
  arc(x1 - a, y0 + a, -90);
  arc(x1 - a, y1 - a, 0);
  arc(x0 + a, y1 - a, 90);
  arc(x0 + a, y0 + a, 180);
  var n = P.length,
    j,
    dx,
    dy,
    L,
    len = [],
    total = 0;
  for (j = 1; j < n; j++) {
    dx = P[j][0] - P[j - 1][0];
    dy = P[j][1] - P[j - 1][1];
    L = Math.sqrt(dx * dx + dy * dy);
    len.push(L);
    total += L;
  }
  if (total <= 0) return;
  var period = dash + gap;
  period = total / Math.max(1, Math.round(total / period));
  var on = (period * dash) / (dash + gap),
    pos = 0,
    s,
    t,
    run,
    p0,
    p1,
    ux,
    uy;
  for (j = 0; j < len.length; j++) {
    L = len[j];
    if (L > 0) {
      p0 = P[j];
      p1 = P[j + 1];
      ux = (p1[0] - p0[0]) / L;
      uy = (p1[1] - p0[1]) / L;
      s = 0;
      while (s < L - 0.01) {
        t = (pos + s) % period;
        if (t < on) {
          run = Math.min(on - t, L - s);
          if (run > 0.01)
            gr.DrawLine(
              p0[0] + ux * s,
              p0[1] + uy * s,
              p0[0] + ux * (s + run),
              p0[1] + uy * (s + run),
              lw,
              col,
            );
        } else run = Math.min(period - t, L - s);
        s += Math.max(run, 0.01);
      }
      pos = (pos + L) % period;
    }
  }
}
/* Draggable pixel scrollbar, hidden until its section is hovered. Thumb size comes from
   viewport vs content height and position from scrollPx/maxPx; the matching set*() maps
   a drag or click back to a scroll offset. */
var SB_MAIN = { sw: 6, min: 36, track: 20, on: 175, off: 95, key: "scroll" };
var SB_NAV = { sw: 5, min: 30, track: 16, on: 150, off: 80, key: "scrolln" };
function drawSBV(gr, sx, top, h, scrollPx, maxPx, viewH, contentH, show, s) {
  if (contentH <= viewH || h <= 6 || !show) return null;
  gr.FillSolidRect(sx, top, s.sw, h, RGBA(255, 255, 255, s.track));
  var thumbH = Math.max(s.min, Math.round((h * viewH) / contentH));
  if (thumbH > h) thumbH = h;
  var ty =
    top + (maxPx > 0 ? Math.round(((h - thumbH) * scrollPx) / maxPx) : 0);
  var on = drag === s.key || hv(sx - 6, top, sx + s.sw + 6, top + h);
  gr.FillSolidRect(
    sx,
    ty,
    s.sw,
    thumbH,
    RGBA(255, 255, 255, on ? s.on : s.off),
  );
  return {
    x0: sx - 6,
    y0: top,
    x1: sx + s.sw + 6,
    y1: top + h,
    top: top,
    h: h,
    thumbH: thumbH,
    maxPx: maxPx,
  };
}
function drawScrollbar(gr, sx, top, h, sp, mp, vh, ch, show) {
  SB = drawSBV(gr, sx, top, h, sp, mp, vh, ch, show, SB_MAIN);
}
function drawScrollbarN(gr, sx, top, h, sp, mp, vh, ch, show) {
  SBN = drawSBV(gr, sx, top, h, sp, mp, vh, ch, show, SB_NAV);
}
function sbFrac(v, start, size, thumb) {
  return clamp01((v - start - thumb / 2) / Math.max(1, size - thumb));
}
// scroll + target are set together so the easing animation doesn't fight the drag
function setScroll(y) {
  if (!SB) return;
  var px = Math.round(sbFrac(y, SB.top, SB.h, SB.thumbH) * SB.maxPx);
  if (view === "playlist") firstRow = firstRowT = px;
  else if (view === "home") homeScroll = homeScrollT = px;
  else if (view === "songs") songsScroll = songsScrollT = px;
  else if (view === "search") searchScroll = searchScrollT = px;
  else if (view === "settings") cfgScroll = cfgScrollT = px;
  else if (view === "artist") artScroll = artScrollT = px;
  repaintMain();
}
function setScrollN(y) {
  if (!SBN) return;
  navScroll = navScrollT = Math.round(
    sbFrac(y, SBN.top, SBN.h, SBN.thumbH) * SBN.maxPx,
  );
  repaintNav();
}

function drawScrollbarH(gr, sx, top, w, scrollX, maxX, viewW, contentW, show) {
  if (contentW <= viewW || w <= 6 || !show) {
    SBH = null;
    return;
  } // hidden until the section is hovered
  var sh = 5;
  gr.FillSolidRect(sx, top, w, sh, RGBA(255, 255, 255, 20));
  var thumbW = Math.max(40, Math.round((w * viewW) / contentW));
  if (thumbW > w) thumbW = w;
  var tx = sx + (maxX > 0 ? Math.round(((w - thumbW) * scrollX) / maxX) : 0);
  var on = drag === "scrollh" || hv(sx, top - 6, sx + w, top + sh + 6);
  gr.FillSolidRect(tx, top, thumbW, sh, RGBA(255, 255, 255, on ? 175 : 95));
  SBH = {
    x0: sx,
    y0: top - 6,
    x1: sx + w,
    y1: top + sh + 6,
    left: sx,
    w: w,
    thumbW: thumbW,
    maxPx: HOME_PLMAX,
  };
}
function setScrollH(x) {
  // free pixel scrolling; target set with it so the easing doesn't fight the drag
  if (!SBH) return;
  plScroll = plScrollT = Math.round(
    sbFrac(x, SBH.left, SBH.w, SBH.thumbW) * SBH.maxPx,
  );
  repaintAll();
}

/* ------------------------- paint ------------------------- */
/* FillRoundRect antialiases a path over the panel's whole area, ~1.7Mpx for the main
   panel on every repaint, and cost ~8ms a frame. A flat fill plus the four pre-rendered
   corner stamps from buildCorners is identical on screen and far cheaper; the stamps
   are black because every panel sits on the black canvas. */
function panelBg(gr, r, c) {
  var rad = M.radius;
  if (!CORN) CORN = buildCorners(rad);
  gr.FillSolidRect(r.x, r.y, r.w, r.h, c);
  gr.DrawImage(CORN.tl, r.x, r.y, rad, rad, 0, 0, rad, rad);
  gr.DrawImage(CORN.tr, r.x + r.w - rad, r.y, rad, rad, 0, 0, rad, rad);
  gr.DrawImage(CORN.bl, r.x, r.y + r.h - rad, rad, rad, 0, 0, rad, rad);
  gr.DrawImage(
    CORN.br,
    r.x + r.w - rad,
    r.y + r.h - rad,
    rad,
    rad,
    0,
    0,
    rad,
    rad,
  );
}
// carve rounded corners over already-drawn square content: blit black corner masks (no clip API)
var CORN = null;
function buildCorners(rad) {
  var specs = { tl: [0, 0], tr: [-rad, 0], bl: [0, -rad], br: [-rad, -rad] },
    q = {},
    key;
  for (key in specs) {
    var im = gdi.CreateImage(rad, rad),
      g = im.GetGraphics();
    g.FillSolidRect(0, 0, rad, rad, COL.black);
    im.ReleaseGraphics(g);
    var mk = gdi.CreateImage(rad, rad),
      mg = mk.GetGraphics();
    mg.FillSolidRect(0, 0, rad, rad, RGB(0, 0, 0));
    mg.SetSmoothingMode(2);
    mg.FillEllipse(
      specs[key][0],
      specs[key][1],
      rad * 2,
      rad * 2,
      RGB(255, 255, 255),
    );
    mk.ReleaseGraphics(mg);
    im.ApplyMask(mk);
    q[key] = im;
  }
  return q;
}
// carve only the top corners, where a square gradient/band overrides panelBg's rounding
function roundTop(gr, x, y, w) {
  var rad = M.radius;
  if (!CORN) CORN = buildCorners(rad);
  gr.DrawImage(CORN.tl, x, y, rad, rad, 0, 0, rad, rad, 0, 255);
  gr.DrawImage(CORN.tr, x + w - rad, y, rad, rad, 0, 0, rad, rad, 0, 255);
}

/* ---- modal dialogs: dim backdrop + drop-shadowed rounded panel, and a capsule button ---- */
function modalPanel(gr, cw, ch, cy) {
  gr.FillSolidRect(0, 0, W, H, RGBA(0, 0, 0, 150));
  var cx = Math.round((W - cw) / 2);
  gr.FillSolidRect(cx + 4, cy + 6, cw, ch, RGBA(0, 0, 0, 140));
  gr.FillRoundRect(cx, cy, cw, ch, 12, 12, RGB(42, 42, 42));
  return cx;
}
/* 20 is the design radius and a capsule at the 40px height the modals use, but Settings
   calls this at row heights as low as 36, and GDI+ throws on an arc of 40 in a box of
   36. roundRad keeps 20 where it fits and makes a capsule where it does not. */
function dlgBtn(gr, x, y, w, h, label, col, hcol, txt) {
  if (w < 2 || h < 2) return { x0: x, y0: y, x1: x + w, y1: y + h }; // nothing to draw, and no arc to get wrong
  var rad = roundRad(w, h, 20);
  gr.FillRoundRect(x, y, w, h, rad, rad, hv(x, y, x + w, y + h) ? hcol : col);
  tC(gr, label, FONT.pl, txt, x, y, w, h);
  return { x0: x, y0: y, x1: x + w, y1: y + h };
}
// themed context menu + modal overlays, painted on top of everything
function drawOverlays(gr) {
  CTX_HB = [];
  CONF_HB = null;
  RENAME_HB = null;
  RG_HB = null;
  if (renameEdit) {
    var rw = Math.min(420, W - 40),
      rhh = 196,
      ry0 = Math.round((H - rhh) / 2),
      rx0 = modalPanel(gr, rw, rhh, ry0);
    tL(
      gr,
      "Rename playlist",
      FONT.sect,
      COL.text,
      rx0 + 28,
      ry0 + 22,
      rw - 56,
      26,
    );
    var ix = rx0 + 28,
      iyf = ry0 + 64,
      iw = rw - 56,
      ih = 46;
    gr.FillRoundRect(ix, iyf, iw, ih, 6, 6, RGB(62, 62, 62));
    var tw3 = gr.CalcTextWidth(renameEdit.text, FONT.pl);
    tL(gr, renameEdit.text, FONT.pl, COL.text, ix + 14, iyf, iw - 28, ih);
    if (caretOn) {
      var cxr = ix + 14 + Math.min(iw - 30, tw3) + 2;
      gr.FillSolidRect(cxr, iyf + Math.round((ih - 20) / 2), 2, 20, COL.text);
    }
    var canSave = renameEdit.text.replace(/^\s+|\s+$/g, "").length > 0;
    var bw = 118,
      bh = 40,
      by = ry0 + rhh - bh - 22,
      dx = rx0 + rw - 28 - bw,
      ccx = dx - 14 - bw;
    RENAME_HB = {
      panel: { x0: rx0, y0: ry0, x1: rx0 + rw, y1: ry0 + rhh },
      cancel: dlgBtn(
        gr,
        ccx,
        by,
        bw,
        bh,
        "Cancel",
        RGB(52, 52, 52),
        RGB(66, 66, 66),
        COL.text,
      ),
      save: dlgBtn(
        gr,
        dx,
        by,
        bw,
        bh,
        "Save",
        canSave ? COL.green : RGB(60, 92, 74),
        canSave ? COL.greenH : RGB(60, 92, 74),
        canSave ? COL.black : COL.text3,
      ),
      canSave: canSave,
    };
  }
  if (ctxMenu) {
    var ih = 42,
      pad = 6,
      i,
      it,
      iw = 190;
    // width follows the longest label (16px left inset + 24px breathing room on the right)
    for (i = 0; i < ctxMenu.items.length; i++)
      iw = Math.max(
        iw,
        Math.round(gr.CalcTextWidth(ctxMenu.items[i].label, FONT.pl)) + 40,
      );
    iw = Math.min(iw, Math.max(120, W - 20));
    var h = ctxMenu.items.length * ih + pad * 2;
    var mnx = Math.max(10, Math.min(ctxMenu.x, W - iw - 10)),
      mny = Math.max(10, Math.min(ctxMenu.y, H - h - 10));
    gr.FillSolidRect(mnx + 3, mny + 4, iw, h, RGBA(0, 0, 0, 120)); // soft shadow
    gr.FillRoundRect(mnx, mny, iw, h, 8, 8, RGB(43, 43, 43));
    for (i = 0; i < ctxMenu.items.length; i++) {
      var iy = mny + pad + i * ih;
      it = ctxMenu.items[i];
      if (hv(mnx, iy, mnx + iw, iy + ih))
        gr.FillRoundRect(
          mnx + 4,
          iy,
          iw - 8,
          ih,
          5,
          5,
          RGBA(255, 255, 255, 20),
        );
      tL(
        gr,
        it.label,
        FONT.pl,
        it.danger ? RGB(240, 96, 96) : COL.text,
        mnx + 16,
        iy,
        iw - 24,
        ih,
      );
      CTX_HB.push({ x0: mnx, y0: iy, x1: mnx + iw, y1: iy + ih, act: it.act });
    }
  }
  if (confirmDel) {
    var cw = 380,
      ch = 180,
      cy = Math.round((H - ch) / 2),
      cx = modalPanel(gr, cw, ch, cy);
    tL(
      gr,
      "Delete playlist?",
      FONT.sect,
      COL.text,
      cx + 28,
      cy + 24,
      cw - 56,
      26,
    );
    tL(
      gr,
      'This removes "' + confirmDel.name + '" from your library.',
      FONT.pl,
      COL.text2,
      cx + 28,
      cy + 58,
      cw - 56,
      40,
    );
    var cbw = 118,
      cbh = 40,
      cby = cy + ch - cbh - 22,
      cdx = cx + cw - 28 - cbw,
      cccx = cdx - 14 - cbw;
    CONF_HB = {
      cancel: dlgBtn(
        gr,
        cccx,
        cby,
        cbw,
        cbh,
        "Cancel",
        RGB(52, 52, 52),
        RGB(66, 66, 66),
        COL.text,
      ),
      del: dlgBtn(
        gr,
        cdx,
        cby,
        cbw,
        cbh,
        "Delete",
        RGB(224, 72, 72),
        RGB(240, 96, 96),
        COL.text,
      ),
    };
  }
  if (dupPrompt) drawDupPrompt(gr);
  if (rgPrompt) drawRgPrompt(gr);
}
// wrapped paragraph; returns the y just past the last line drawn
function tPara(gr, s, f, c, x, y, w, lh) {
  var wr = gr.EstimateLineWrap(s, f, w);
  for (var i = 0; i < wr.length; i += 2) {
    tL(gr, wr[i], f, c, x, y, w, lh);
    y += lh;
  }
  return y;
}

/* ---- switch: the on/off control the Settings page uses ---- A capsule track with a
   knob, where the track carries the state and is COL.seekbg when off, the same grey as
   the seek and volume rails. The knob stays white in both states because it is the part
   that moves; a disabled switch draws dim and its caller draws no hitbox, so a setting
   the theme cannot deliver (Discord with no component installed) cannot be switched. */
var SW_OFFDIM = blend(COL.seekbg, COL.base, 0.72);
function drawSwitch(gr, x, y, w, h, on, enabled) {
  var rad = h / 2,
    hot = enabled && hv(x, y, x + w, y + h);
  var track = !enabled
    ? SW_OFFDIM
    : on
      ? hot
        ? COL.greenH
        : COL.green
      : hot
        ? COL.text3
        : COL.seekbg;
  gr.FillRoundRect(x, y, w, h, rad, rad, track);
  var ks = h - 8,
    kx = on ? x + w - ks - 4 : x + 4;
  gr.FillEllipse(kx, y + 4, ks, ks, enabled ? COL.text : COL.text3);
  return { x0: x, y0: y, x1: x + w, y1: y + h };
}

function winMaxed() {
  if (!UIWizard) return false;
  try {
    return UIWizard.WindowState === 1;
  } catch (e) {
    return false;
  }
}
function drawCapBtn(gr, glyph, x, w, isClose) {
  var hover = hv(x, 0, x + w, TBH);
  if (hover)
    gr.FillSolidRect(
      x,
      0,
      w,
      TBH,
      isClose ? RGB(232, 17, 35) : RGB(48, 48, 48),
    );
  tC(
    gr,
    glyph,
    FONT.cap,
    hover && isClose ? COL.text : COL.text2,
    x,
    0,
    w,
    TBH,
  );
}
/* The settings button sits just inside the window controls, drawn as an inset rounded
   button rather than a flat full-height cell so it reads as part of the app and not a
   fourth caption control. Green while the page is open, matching the sidebar's active
   cue; the hitbox is the full bar height because 32px is already a small target. */
var HB_GEAR = null;
function drawGearBtn(gr) {
  var gh = Math.max(16, TBH - Math.round(8 * UISCALE)),
    gx = gearX(),
    gy = Math.round((TBH - gh) / 2);
  var on = view === "settings",
    hov = hv(gx, 0, gx + GEARW, TBH);
  if (on || hov)
    gr.FillRoundRect(
      gx,
      gy,
      GEARW,
      gh,
      6,
      6,
      on ? COL.rowActive : COL.rowHover,
    );
  drawIcon(
    gr,
    "settings",
    on ? COL.green : hov ? COL.text : COL.text2,
    gx,
    gy,
    GEARW,
    gh,
    Math.round(18 * UISCALE),
  );
  HB_GEAR = { x0: gx, y0: 0, x1: gx + GEARW, y1: TBH };
}
function drawTitleBar(gr) {
  gr.FillSolidRect(0, 0, W, TBH, COL.black);
  // menu bar (left): real foobar File / Edit / View / Playback / Library / Help
  HB_MENU = [];
  var mx0 = 12;
  for (var mi = 0; mi < MENUS.length; mi++) {
    var lbl = MENUS[mi][0],
      mw = gr.CalcTextWidth(lbl, FONT.menu) + 24,
      mhover = hv(mx0, 0, mx0 + mw, TBH);
    if (mhover) gr.FillSolidRect(mx0, 0, mw, TBH, RGB(40, 40, 40));
    tC(gr, lbl, FONT.menu, mhover ? COL.text : COL.text2, mx0, 0, mw, TBH);
    HB_MENU.push({
      x0: mx0,
      y0: 0,
      x1: mx0 + mw,
      y1: TBH,
      root: MENUS[mi][1],
      mx: mx0,
    });
    mx0 += mw;
  }
  if (mx0 !== MENU_END) {
    MENU_END = mx0;
    applyCaption();
  }
  // settings + window controls (right)
  drawGearBtn(gr);
  var closeX = W - CAPBW,
    maxX = W - CAPBW * 2,
    minX = W - CAPBW * 3;
  drawCapBtn(gr, GLYPH.cmin, minX, CAPBW, false);
  drawCapBtn(gr, winMaxed() ? GLYPH.crestore : GLYPH.cmax, maxX, CAPBW, false);
  drawCapBtn(gr, GLYPH.cclose, closeX, CAPBW, true);
  HB_CAP = { minX: minX, maxX: maxX, closeX: closeX, bw: CAPBW };
}

/* ---- Header dropdown: a pill that opens a floating menu, shared by the playlist sort-
   by and the All Songs group-by. Items are [label,value] pairs and the menu is drawn
   last, so it floats over the track list. ---- */
function drawDropPill(gr, x, y, w, h, label, open) {
  gr.FillRoundRect(
    x,
    y,
    w,
    h,
    h / 2,
    h / 2,
    open || hv(x, y, x + w, y + h) ? RGB(58, 58, 58) : RGBA(0, 0, 0, 90),
  );
  tL(gr, label, FONT.pl, COL.text, x + 18, y, w - 46, h);
  drawIcon(gr, "chevron", COL.text2, x + w - 32, y + (h - 20) / 2, 20, 20, 18);
  return { x0: x, y0: y, x1: x + w, y1: y + h };
}
/* maxY/minY, where given, are the panel edges the menu may not cross; nothing clips
   drawing here, so a menu past either would strand on the player bar or the title bar.
   Preference is below the anchor, then above it, then clamped into the band, tightening
   the rows rather than dropping any; callers that pass neither are unconstrained. */
function drawDropMenu(gr, anchor, items, cur, minW, maxY, minY) {
  var out = [];
  if (!anchor || !items.length) return out;
  var bw = Math.max(minW, anchor.x1 - anchor.x0),
    bx = anchor.x1 - bw,
    ih = 40,
    lo = minY === undefined ? 8 : minY;
  if (maxY) {
    var band = maxY - lo - 10;
    if (band > 0 && items.length * ih > band)
      ih = Math.max(26, Math.floor(band / items.length));
  }
  var bh = items.length * ih + 10,
    iy = anchor.y1 + 6;
  if (maxY && iy + bh > maxY) {
    var up = anchor.y0 - 6 - bh;
    iy = up >= lo ? up : Math.max(lo, maxY - bh);
  }
  gr.FillSolidRect(bx + 3, iy + 4, bw, bh, RGBA(0, 0, 0, 120));
  gr.FillRoundRect(bx, iy, bw, bh, 8, 8, RGB(43, 43, 43));
  for (var i = 0; i < items.length; i++) {
    var ry = iy + 5 + i * ih;
    if (hv(bx, ry, bx + bw, ry + ih))
      gr.FillRoundRect(bx + 4, ry, bw - 8, ih, 5, 5, RGBA(255, 255, 255, 20));
    tL(
      gr,
      items[i][0],
      FONT.pl,
      items[i][1] === cur ? COL.green : COL.text,
      bx + 18,
      ry,
      bw - 30,
      ih,
    );
    out.push({ x0: bx, y0: ry, x1: bx + bw, y1: ry + ih, v: items[i][1] });
  }
  return out;
}

function drawSortDirBtn(gr, x, y, w, h) {
  gr.FillRoundRect(
    x,
    y,
    w,
    h,
    h / 2,
    h / 2,
    hv(x, y, x + w, y + h) ? RGB(58, 58, 58) : RGBA(0, 0, 0, 90),
  );
  drawIcon(
    gr,
    plSortDir === "asc" ? "sortAsc" : "sortDesc",
    COL.text,
    x,
    y,
    w,
    h,
    18,
  );
  HB_PLSORTDIR = { x0: x, y0: y, x1: x + w, y1: y + h };
}
function drawSortMenu(gr) {
  PL_SORT_HB = plSortMenuOpen
    ? drawDropMenu(gr, HB_PLSORT, PL_SORTS, plSort, 180)
    : [];
}
function drawGroupMenu(gr) {
  SG_HB = sgMenuOpen
    ? drawDropMenu(gr, HB_SG, SONGS_GROUPS, songsGroup, 216)
    : [];
}
