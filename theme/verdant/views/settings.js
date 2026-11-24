/* verdant/views/settings.js -- Settings page: the panel properties, as real controls.
   Loaded by main.js; every module shares one global scope, so load order is set there. */

/* Reached from the gear at the right of the title bar (ui/chrome.js: drawGearBtn), and
   a view rather than a modal, which is what makes the page cost almost nothing: it
   inherits the main panel's scrolling, its reveal timing and its repaint scoping, and
   every other destination is still one click away. Every control writes through an
   apply* function in core/props.js, which updates the stored property AND the running
   value, so nothing here needs a panel reload, not even UI scale. */

var cfgScroll = 0,
  cfgScrollT = 0,
  CFG_MAXPX = 0; // page scroll (eased, same model as the other views)
var cfgMenu = null,
  CFG_PILL = [],
  CFG_HB = [],
  CFG_SWITCH = [],
  CFG_BTN = []; // open dropdown key, pill/menu/switch/button targets
/* The whole row is the target, not just the control in it: the control sits at the far right of a
   wide panel, and a hover cue that spans the row is only honest if the row acts on a click too.
   The pill and the switch keep hitboxes of their own regardless -- they are what hoverSig needs to
   tell "over the control" from "over the row", and without that distinction the control's own
   hover state would never repaint. */
var CFG_ROWS = [];
function cfgRowAt(x, y) {
  return hitIdx(CFG_ROWS, x, y);
}

function cfgPct(s) {
  return Math.round(s * 100) + "%";
}
// Signed, because the sign is the whole meaning of this one and "200 ms" would not say which way.
function cfgMs(ms) {
  return (ms > 0 ? "+" : "") + ms + " ms";
}
/* Auto names the scale it actually resolved to. "Auto" alone leaves the one question a scale
   picker exists to answer -- what am I running at now -- unanswered. */
function cfgScaleOpts() {
  return [
    ["Auto (" + cfgPct(resolveScale(0)) + ")", 0],
    ["100%", 1],
    ["110%", 1.1],
    ["125%", 1.25],
    ["150%", 1.5],
    ["200%", 2],
    ["250%", 2.5],
  ];
}
var CFG_CEIL = [
  ["Full range (0 dB)", 0],
  ["-3 dB", -3],
  ["-6 dB", -6],
  ["-12 dB", -12],
  ["-20 dB", -20],
  ["-30 dB", -30],
];
var CFG_WHEEL = [
  ["Slow (90 px)", 90],
  ["Normal (180 px)", 180],
  ["Fast (300 px)", 300],
  ["Very fast (480 px)", 480],
];
/* Album counts, not just byte counts: MB is the unit the setting is in, but albums is the unit the
   question is actually about. They come from the measured ~63KB a cached 500px cover takes, so they
   are honest rather than round. */
var CFG_CACHE_MB = [
  ["128 MB (~2,000 albums)", 128],
  ["512 MB (~8,000 albums)", 512],
  ["1 GB (~16,000 albums)", 1024],
  ["4 GB (~65,000 albums)", 4096],
  ["No limit", 0],
];

/* The fallback label is the live value, not a guess: these four are editable from the Properties
   dialog too, so the page has to be able to show -8 dB honestly rather than claiming one of its
   own presets. */
/* Four headings, and deliberately broad ones: the page is short enough that the
   grouping's job is to let someone SKIM to the right neighbourhood, and a heading per
   setting would be an index rather than a grouping. They are named after what the user
   came looking for, such as the lyrics being out of time, rather than after the part of
   the theme that implements it. */
function cfgModel() {
  var sc = cfgScaleOpts();
  return [
    { kind: "group", label: "Interface" },
    {
      k: "scale",
      label: "Scale fonts, icons and the title bar to your display",
      items: sc,
      val: UISCALE_PROP,
      text: labelOf(sc, UISCALE_PROP, cfgPct(UISCALE)),
    },
    {
      k: "wheel",
      label: "How far one wheel notch scrolls a list",
      items: CFG_WHEEL,
      val: WHEEL_PX,
      text: labelOf(CFG_WHEEL, WHEEL_PX, WHEEL_PX + " px"),
    },

    { kind: "group", label: "Playback" },
    {
      k: "ceil",
      label: "Lower the top of the volume slider",
      items: CFG_CEIL,
      val: VOL_CEIL,
      text: labelOf(CFG_CEIL, VOL_CEIL, VOL_CEIL + " dB"),
    },
    {
      k: "drp",
      kind: "switch",
      on: DRP_ON,
      enabled: drpPresent,
      label: drpPresent
        ? "Show the playing track on your Discord profile"
        : "Discord presence needs the foo_verdant component, which is not installed",
    },

    { kind: "group", label: "Lyrics" },
    {
      k: "lyrfetch",
      kind: "switch",
      on: LYR_FETCH_ON,
      enabled: true,
      label: "Look up lyrics online for tracks that have none of their own",
    },
    /* A button row rather than a dropdown, because the useful value is a number the user arrives
       at by ear and it is not one of five. The capsule shows the value and opens a text box; the
       Properties dialog edits the same property, as it does for every other setting here. */
    {
      k: "lyroffset",
      kind: "button",
      btn: cfgMs(LY_OFFSET),
      enabled: true,
      label: "Shift every lyric line earlier or later",
    },

    { kind: "group", label: "Artwork" },
    {
      k: "cache",
      kind: "switch",
      on: ARTDISK_ON,
      enabled: true,
      label: "Keep album art on disk so it survives a restart",
    },
    {
      k: "cachemb",
      label: "The most disk the cover cache may use",
      items: CFG_CACHE_MB,
      val: ARTDISK_MB,
      text: labelOf(
        CFG_CACHE_MB,
        ARTDISK_MB,
        ARTDISK_MB ? fmtBytes(ARTDISK_MB * 1048576) : "No limit",
      ),
    },
    /* The only row whose line is computed: it reports what is actually on disk right now, which is
       the one fact that makes the click informed. A button whose label says what it will throw
       away needs no confirmation dialog on top -- a cache can only ever cost a refetch. */
    {
      k: "clear",
      kind: "button",
      btn:
        "Clear" + (artDiskUsage() ? " (" + fmtBytes(artDiskUsage()) + ")" : ""),
      enabled: artDiskUsage() > 0,
      label: artDiskUsageText(),
    },
  ];
}

/* Row heights come from the FONTS, not from constants: the whole point of the scale setting is
   that this page is used at every scale, including to climb back down from one that turned out
   too large to read. lineH is identity-cached per font, so this costs nothing per frame. */
function drawSettings(gr, r) {
  CFG_PILL = [];
  CFG_SWITCH = [];
  CFG_BTN = [];
  CFG_ROWS = [];
  var lx = r.x + M.cpad,
    w = r.w - M.cpad * 2,
    cropY = r.y + r.h;
  /* One line per setting, in the plain weight, and that is what lets the headings do
     their job, since a 13-bold white label was a second level of heading competing with
     the real one. The line is the whole setting, saying what the control does instead
     of naming it and explaining it underneath, and the row is sized from the CONTROL
     rather than the text, because a switch or a capsule is taller than one line of 13px
     and is what sets the pitch. */
  var lhL = lineH(gr, FONT.meta);
  var ph = Math.max(36, lhL + 18),
    rowH = Math.max(ph + 20, lhL + 30);
  var pw = Math.min(
    Math.round(w * 0.42),
    Math.max(200, Math.round(260 * UISCALE)),
  ); // provisional; re-measured below

  /* The controls follow the TEXT, not the panel edge: right-aligning them to a panel
     that can be 1500px wide left a thousand pixels of nothing between a label and the
     thing it labels, and a row you have to track across with your eye is not one row
     but two columns. The column is only as wide as the longest line plus the control,
     so a narrow panel is unchanged and a wide one keeps the pair together and centres
     it; measuring every label costs nine CalcTextWidth calls a paint, which beats a
     hardcoded width that would be wrong at every UI scale and in every translation. */
  var rows = cfgModel(),
    i,
    j,
    longest = 0,
    widestOpt = 0;
  for (i = 0; i < rows.length; i++) {
    var row_ = rows[i];
    if (row_.kind === "group" || !row_.label) continue;
    var tw_ = gr.CalcTextWidth(row_.label, FONT.meta);
    if (tw_ > longest) longest = tw_;
    /* Every OPTION a dropdown can show, not just the one selected: sizing the pill to the current
       value would make it -- and the whole column behind it -- change width as you pick through
       the list, so the page would shuffle sideways under the cursor. */
    if (row_.items) {
      for (j = 0; j < row_.items.length; j++) {
        var ow_ = gr.CalcTextWidth(row_.items[j][0], FONT.pl);
        if (ow_ > widestOpt) widestOpt = ow_;
      }
      var cur_ = gr.CalcTextWidth(row_.text, FONT.pl); // may be a Properties-dialog value, off-list
      if (cur_ > widestOpt) widestOpt = cur_;
    }
  }
  /* The pill pads its text by 18 on the left and leaves 32 for the chevron (see drawDropPill), so
     this is what it actually needs rather than a constant that was simply wide enough for all of
     them. Clamped either way: nothing useful is narrower than this, and a long translation must
     not be allowed to eat the label beside it. */
  pw = Math.max(
    Math.round(150 * UISCALE),
    Math.min(Math.round(w * 0.42), widestOpt + Math.round(64 * UISCALE)),
  );
  var colW = Math.min(w, longest + Math.round(28 * UISCALE) + pw);
  /* Centred, so a column narrower than the panel sits in the middle of it rather than against the
     left edge with a field of nothing to its right. On a panel no wider than the column needs
     this resolves to the old left margin exactly, so narrow layouts are untouched. */
  lx = r.x + Math.round((r.w - colW) / 2);
  var sbX = r.x + r.w - M.cpad + 8; // the scrollbar belongs to the PANEL, so it stays at its edge
  /* Heights are per ROW now rather than one constant times an index, because a heading is not a
     row and must not be given a row's worth of height. The offsets are accumulated once per paint
     and then everything -- the scroll extent, the cull, the separators -- reads from them, so
     there is exactly one place that knows how tall anything is. */
  var lhG = lineH(gr, FONT.cfgGroup),
    hgt = [],
    yof = [],
    acc = 0;
  /* The air above a heading is what actually draws the group, far more than the type does: a
     heading with a row's worth of space around it reads as one more row. The first one gets much
     less, because the page header above it already supplies the gap. */
  for (i = 0; i < rows.length; i++) {
    var hh = rows[i].kind === "group" ? (i === 0 ? lhG + 10 : lhG + 56) : rowH;
    hgt.push(hh);
    yof.push(acc);
    acc += hh;
  }

  // ---- header: the page's title, so it stays put while the rows scroll under it ----
  var hy = r.y + 26,
    lhT = lineH(gr, FONT.sect2),
    top = hy + lhT + 22;
  function header() {
    tL(gr, "Settings", FONT.sect2, COL.text, lx, hy, colW, lhT);
    gr.DrawLine(lx, top - 10, lx + colW, top - 10, 1, COL.line);
  }
  header();

  // ---- rows ----
  var viewH = Math.max(0, cropY - top),
    contentH = acc;
  CFG_MAXPX = Math.max(0, contentH - viewH);
  cfgScroll = clampPx(cfgScroll, CFG_MAXPX);
  cfgScrollT = clampPx(cfgScrollT, CFG_MAXPX);
  var openA = null,
    openR = null;
  for (i = 0; i < rows.length; i++) {
    var rh = hgt[i],
      ry = top + yof[i] - cfgScroll;
    if (ry >= cropY) break;
    if (ry + rh <= top) continue;
    var row = rows[i];
    /* A heading is text and nothing else -- no hover band, no hitbox, no separator --
       pinned to the BOTTOM of its block so the space above belongs to the group it is
       introducing rather than to the one that just ended. Drawn only when it fits
       whole, like every other label on this page, since there is no clip API and half a
       heading under the page header reads as a fault rather than as scrolling. */
    if (row.kind === "group") {
      var gy = ry + rh - lhG;
      if (gy >= top && gy + lhG <= cropY)
        tL(gr, row.label, FONT.cfgGroup, COL.text, lx, gy, colW, lhG);
      continue;
    }
    var cy = ry + Math.round((rh - ph) / 2);
    // hover cue across the whole row: the control is on the far right of a wide panel, and the
    // band is what ties it back to the label it belongs to
    var bt = Math.max(ry + 4, top),
      bb = Math.min(ry + rh - 4, cropY); // clamped: a row half under the header must not answer the mouse there
    /* A button row is the exception to the whole-row rule above, and on purpose: a row-
       wide hover cue has to be honest, but for an action that destroys something a
       stray click anywhere along a 56px band should not empty the cache. So a button
       row gets neither the band nor the hitbox, and its button is the only thing that
       answers. */
    /* bb-bt rather than bb>bt: a row scrolling under the header is clamped to whatever sliver is
       still below it, and an 8px corner needs 16px of height to exist in. One pixel of hover cue
       is not worth drawing anyway, so the band is simply skipped -- but the row stays a target. */
    if (bb - bt >= 2 && row.kind !== "button") {
      if (hv(lx - 8, bt, lx + colW + 8, bb)) {
        var brad = roundRad(colW + 16, bb - bt, 8);
        gr.FillRoundRect(
          lx - 8,
          bt,
          colW + 16,
          bb - bt,
          brad,
          brad,
          RGBA(255, 255, 255, 10),
        );
      }
      CFG_ROWS.push({
        x0: lx - 8,
        y0: bt,
        x1: lx + colW + 8,
        y1: bb,
        k: row.k,
        kind: row.kind,
        enabled: row.enabled,
      });
    }
    var ty = ry + Math.round((rh - lhL) / 2),
      tw = Math.max(40, colW - pw - 28);
    tL(
      gr,
      row.label,
      FONT.meta,
      row.enabled === false ? COL.text3 : COL.text2,
      lx,
      ty,
      tw,
      lhL,
    );
    if (row.kind === "switch") {
      var sw = Math.round(ph * 1.55),
        sx = lx + colW - sw;
      var hbs = drawSwitch(
        gr,
        sx,
        cy + Math.round((ph - ph * 0.72) / 2),
        sw,
        Math.round(ph * 0.72),
        row.on,
        row.enabled,
      );
      if (row.enabled) CFG_SWITCH.push(hbs); // disabled: drawn, but not a target
    } else if (row.kind === "button") {
      // same capsule the modal dialogs use, in the neutral (Cancel) weight: this is not a primary
      // action and should not read like one. Disabled draws with hover == rest, so it stays inert.
      /* Sized to its own label, so "0 ms" is a small capsule and "Clear (55 MB)" a wider one,
         both ending on the same right edge as every other control. A fixed width made the short
         one a wide slab of nothing with four characters adrift in the middle of it. */
      var bw2 = Math.min(
        Math.round(colW * 0.42),
        Math.max(
          Math.round(104 * UISCALE),
          gr.CalcTextWidth(row.btn, FONT.pl) + Math.round(44 * UISCALE),
        ),
      );
      var bx2 = lx + colW - bw2;
      var hbb = dlgBtn(
        gr,
        bx2,
        cy,
        bw2,
        ph,
        row.btn,
        row.enabled ? RGB(52, 52, 52) : RGB(44, 44, 44),
        row.enabled ? RGB(66, 66, 66) : RGB(44, 44, 44),
        row.enabled ? COL.text : COL.text3,
      );
      if (row.enabled) {
        hbb.k = row.k;
        CFG_BTN.push(hbb);
      }
    } else {
      var anchor = drawDropPill(
        gr,
        lx + colW - pw,
        cy,
        pw,
        ph,
        row.text,
        cfgMenu === row.k,
      );
      anchor.k = row.k;
      CFG_PILL.push(anchor);
      if (cfgMenu === row.k) {
        openA = anchor;
        openR = row;
      }
    }
    /* No separators: a line between every row ties the whole page into one continuous
       table, which is exactly the reading the headings are there to break, since the
       eye follows the rules rather than the gaps. Spacing alone carries it, which is
       how the page this one is modelled on does it too. */
  }
  /* Crop the partial top row, then redraw the header over it -- the same order drawNav uses for
     its pinned block. The clear starts below the panel's rounded corners so a square fill can't
     square them off. */
  gr.FillSolidRect(
    r.x,
    r.y + M.radius + 2,
    r.w,
    Math.max(0, top - (r.y + M.radius + 2)),
    COL.base,
  );
  header();
  gr.FillSolidRect(r.x, cropY, r.w, M.pad + 2, COL.black); // gutter below the panel
  drawScrollbar(
    gr,
    sbX,
    top,
    viewH,
    cfgScroll,
    CFG_MAXPX,
    viewH,
    contentH,
    hv(r.x, top, r.x + r.w, cropY) || drag === "scroll",
  );

  // last, so it floats over the rows; the panel's own edges are the lines it may not cross
  CFG_HB =
    openA && openR
      ? drawDropMenu(gr, openA, openR.items, openR.val, pw, cropY, r.y + 8)
      : [];
}

/* A click anywhere on a row. A switch flips; anything else opens its dropdown. */
function cfgClickRow(row) {
  if (row.kind === "switch") {
    if (row.enabled) cfgToggle(row.k);
    return;
  }
  cfgMenu = row.k;
  repaintAll();
}
/* The switch counterpart of cfgApply: the key says which setting was flipped and core/props.js
   owns what that means. Keyed dispatch rather than a handler stored on the row, because cfgModel()
   is rebuilt on every paint -- a closure per row would allocate on every frame. */
function cfgToggle(k) {
  if (k === "drp") applyDrpOn(!DRP_ON);
  else if (k === "cache") applyArtDiskOn(!ARTDISK_ON);
  else if (k === "lyrfetch") applyLyrFetchOn(!LYR_FETCH_ON);
  else repaintAll();
}
/* Free text, via the system input box, because a number typed by ear wants to be typed
   rather than chosen from a list someone else guessed at, and the one thing the dialog
   has to carry is the sign convention, which is what the Help button is for. Anything
   unparseable leaves the value alone rather than resetting it to zero, so a typo costs
   a second attempt and not the setting. */
function cfgAskOffset() {
  var s = null;
  try {
    s = utils.InputBox(
      0,
      "Lyrics timing offset, in milliseconds:",
      "Verdant - lyrics timing",
      String(LY_OFFSET),
      true,
      "Positive values show each line EARLIER, negative values later. " +
        "The range is -30000 to 30000 ms. A file carrying its own [offset:] tag " +
        "is honoured as well, and the two add up.",
    );
  } catch (e) {
    return;
  } // cancelled
  if (s === null) return;
  s = String(s).replace(/\s|ms/gi, "");
  if (!s) {
    applyLyrOffset(0);
    return;
  }
  var v = parseFloat(s);
  if (!isFinite(v)) {
    repaintAll();
    return;
  }
  applyLyrOffset(v);
}
/* Buttons, same keyed dispatch as the switches and the dropdowns. A full repaint rather than
   repaintMain: the label it was just clicked through is part of the row it sits in, and the row's
   description changes with it. */
function cfgButton(k) {
  if (k === "clear") artDiskClear();
  else if (k === "lyroffset") cfgAskOffset();
  // unconditional: the modal above covered the page, so the row under the pointer has to be redrawn
  // whether the value changed or the dialog was cancelled
  repaintAll();
}
/* One entry point for every dropdown on the page: the key says which setting was picked, and
   core/props.js owns what that means. Each apply* repaints. */
function cfgApply(k, v) {
  cfgMenu = null;
  if (k === "scale") applyUIScale(v);
  else if (k === "ceil") applyVolCeil(v);
  else if (k === "wheel") applyWheelPx(v);
  else if (k === "cachemb") applyArtDiskMB(v);
  else repaintAll();
}
