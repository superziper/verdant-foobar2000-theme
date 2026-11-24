/* verdant/data/library.js -- library + playlist data: handles, title-format passes,
   indices, sort order. Loaded by main.js; every module shares one global scope, so load
   order is set there. */

/* Playlist name/count are read once per playlist instead of once per card per frame -- these
   are interop calls into foobar, and the draw loops ran dozens of them every paint. Cleared by
   invalidateItems(), which every callback that can change a playlist's name or contents goes
   through -- switching between playlists is not one of them and deliberately keeps the caches. */
var plNameCache = {},
  plCountCache = {};
function plName(pi) {
  if (!plNameCache.hasOwnProperty(pi))
    plNameCache[pi] = plman.GetPlaylistName(pi);
  return plNameCache[pi];
}
function plCount(pi) {
  if (!plCountCache.hasOwnProperty(pi))
    plCountCache[pi] = plman.PlaylistItemCount(pi);
  return plCountCache[pi];
}
// memoised per paint: drawNav and drawHome both call this, so it ran twice on every frame
var visPlCache = null;
function visiblePlaylists() {
  if (visPlCache) return visPlCache;
  var a = [];
  for (var i = 0; i < plman.PlaylistCount; i++)
    if (!isHiddenPl(plName(i))) a.push(i);
  visPlCache = a;
  return a;
}

/* The library handle list was fetched separately by getArtistList, getSongsIdx, getSearchIdx,
   loadArtist, libCovers and libCount, and the same title-formatting fields were evaluated across
   the whole library by two or three of them independently. Both are now fetched once and shared;
   invalidateLibrary() clears them alongside everything else derived from the library. */
var libItems_ = null,
  libTFCache = {};
function libItems() {
  if (libItems_ === null) {
    try {
      libItems_ = fb.GetLibraryItems();
    } catch (e) {
      libItems_ = null;
    }
  }
  return libItems_;
}
function libTF(field) {
  if (libTFCache.hasOwnProperty(field)) return libTFCache[field];
  var lib = libItems(),
    out = [];
  if (lib && lib.Count) {
    try {
      out = TF[field].EvalWithMetadbs(lib);
    } catch (e) {
      out = [];
    }
  }
  libTFCache[field] = out;
  return out;
}

/* ------------------------- credited artists ------------------------- Two jobs, kept separate below because each fails differently:
     1. artistsOf -- read the artists a tag credits, straight from the file's own values
     2. artistKey -- decide when two names are the same act spelled differently
   getArtistList groups the library by that key and elects a name to show; only the second is a judgement call. */

/* One tag value -> every artist it credits: the file says how many artists there are
   and the panel believes it, since FLAC/Vorbis and ID3v2.4 can hold several values in
   one field and TF.artistMulti hands them over already separated. Splitting a
   punctuated single value is deliberately NOT done -- an earlier version took A, B
   apart on punctuation with an exception list for the acts it would have ruined
   (TOMORROW X TOGETHER, HUNTR/X, Dan + Shay) and worked most of the time, which was the
   problem, because a wrong card you cannot tell from a correct one is worse than an
   obvious tagging artifact that retagging fixes in every player. */
function artistsOf(value) {
  var raw = value.split(ART_MV),
    out = [],
    i,
    t;
  for (i = 0; i < raw.length; i++) {
    t = raw[i].replace(/^\s+|\s+$/g, "");
    if (t) out.push(t);
  }
  return out;
}

/* The key two spellings of the same act share: it folds case, the Unicode dashes (a
   library picks up both the ASCII hyphen and U+2010 in Anne-Marie without anyone
   noticing), and a TRAILING bracketed alias, so IU with its Korean alias is IU and LIA
   (ITZY) is LIA. Trailing only, because (G)I-DLE wears its brackets at the front and
   has to survive intact. */
function artistKey(name) {
  var s = name.replace(/^\s+|\s+$/g, "");
  var t = s.replace(/\s*\([^()]*\)\s*$/, "").replace(/^\s+|\s+$/g, "");
  if (t) s = t; // a name that is ONLY a bracket keeps its brackets
  s = s.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-");
  s = s.replace(/\s+/g, " ");
  return s.toLowerCase();
}
/* Which spelling to show for a folded group: the one the library uses most. Ties go to the
   shorter name, so "IU" beats "IU (\uc544\uc774\uc720)", then to the lower one so the choice is stable
   rather than dependent on scan order. */
function electSpelling(counts) {
  var best = null,
    bn = -1,
    s,
    c;
  for (s in counts) {
    c = counts[s];
    if (
      c > bn ||
      (c === bn &&
        (s.length < best.length || (s.length === best.length && s < best)))
    ) {
      best = s;
      bn = c;
    }
  }
  return best;
}

/* artistTracksMap holds library INDICES, not handles: loadArtist needs each track's album, title
   and year out of the libTF arrays, which are indexed the same way, and artistCands only ever
   wanted lib[i] anyway. */
var artistList = null,
  artistTracksMap = null,
  artistCandCache = {};
function getArtistList() {
  if (artistList) return artistList;
  var lib = libItems();
  var out = [];
  artistTracksMap = {};
  if (lib && lib.Count) {
    var names = libTF("artistMulti");
    if (!names.length) names = libTF("artistName"); // $meta_sep unavailable -> the old field, still split
    var byKey = {},
      i,
      j,
      parts,
      nm,
      k,
      e,
      here;
    for (i = 0; i < names.length; i++) {
      if (!names[i]) continue;
      parts = artistsOf(names[i]);
      here = {}; // one track credits an artist once, however spelled
      for (j = 0; j < parts.length; j++) {
        nm = parts[j];
        k = artistKey(nm);
        if (!k || here[k]) continue;
        here[k] = 1;
        e = byKey[k];
        if (!e) e = byKey[k] = { first: i, tracks: [], spell: {} };
        e.tracks.push(i);
        e.spell[nm] = (e.spell[nm] || 0) + 1;
      }
    }
    for (k in byKey) {
      e = byKey[k];
      var disp = electSpelling(e.spell);
      out.push({ name: disp, handle: lib[e.first], key: k });
      artistTracksMap[disp] = e.tracks;
    }
    out.sort(function (a, b) {
      var an = a.name.toLowerCase(),
        bn = b.name.toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
  }
  artistList = out;
  return out;
}
/* artist avatar = the artist's newest album that actually HAS art, not simply their first track,
   since one untagged opener used to leave the whole artist on a placeholder; coverPick settles on
   the first candidate with art as they resolve, and the fallback stands in meanwhile. One track
   per album, deduped by album name and ordered by artAlbumCmp, which is what makes the home card
   and the artist page agree -- album and year are plain lookups in the shared libTF arrays, where
   the albKey() this used to call is interop and had to be bounded at 24 tracks, a bound that hid
   the newest album of anyone prolific. */
function artistCands(name, fallback) {
  if (artistCandCache.hasOwnProperty(name)) return artistCandCache[name];
  var list = artistTracksMap ? artistTracksMap[name] : null,
    albums = [],
    out = [],
    seen = {},
    i,
    h,
    k,
    e;
  if (!list) return fallback ? [fallback] : []; // map not built yet -> guess, but don't cache the guess
  var lib = libItems(); // the map holds indices now, not handles
  var albs = libTF("album"),
    yrs = libTF("year");
  for (i = 0; i < list.length; i++) {
    h = lib ? lib[list[i]] : null;
    if (!h) continue;
    k = albs[list[i]] || "Unknown Album"; // same key loadArtist groups on
    if (seen[k]) continue;
    seen[k] = 1;
    e = { handle: h, seq: albums.length, year: yrs[list[i]] };
    e.yr = artAlbumYear(e);
    albums.push(e);
  }
  albums.sort(artAlbumCmp);
  for (i = 0; i < albums.length && i < COVER_CANDS; i++)
    out.push(albums[i].handle);
  if (!out.length && fallback) out.push(fallback);
  artistCandCache[name] = out;
  return out;
}
// the bulk warm pass's cheap guess -- no candidate scan, no album dedupe
function artistFirst(name, fallback) {
  var l = artistTracksMap ? artistTracksMap[name] : null,
    lib = l && l.length ? libItems() : null;
  return lib && lib[l[0]] ? lib[l[0]] : fallback;
}
function artistCover(name, fallback) {
  var c = artistCands(name, fallback),
    p = coverPick("ar|" + name, c, 1);
  if (p.list.length) return p.list[0];
  return c.length ? c[0] : fallback || null; // still choosing -> the old first-track guess
}
// false while the scan can still move the choice: baking a card now would freeze its placeholder
function artistCoverReady(name, fallback) {
  return coverPick("ar|" + name, artistCands(name, fallback), 1).done;
}
/* Newest release first, oldest last. $year(%date%) is the only granularity the library pass
   already has, so albums sharing a year keep the order the library gave them, and one with
   no usable year sorts last rather than as year zero. */
function artAlbumYear(a) {
  var y = parseInt(a.year, 10);
  return isFinite(y) && y > 0 ? y : -1;
}
function artAlbumCmp(a, b) {
  return b.yr - a.yr || a.seq - b.seq;
}
/* The artist's tracks come from the map getArtistList already built, not from a second pass
   comparing strings. That pass is what made a collaboration a dead end: the grid offered
   "JISOO & ZAYN" as one card, and clicking JISOO found no track tagged exactly "JISOO". */
function loadArtist(name) {
  viewArtist = name;
  artScroll = artScrollT = 0;
  artistAlbums = [];
  var lib = libItems();
  if (!lib || !lib.Count) return;
  getArtistList(); // builds artistTracksMap alongside the list
  var idx = artistTracksMap ? artistTracksMap[name] : null;
  if (!idx || !idx.length) return;
  var albs = libTF("album"),
    titles = libTF("title"),
    lens = libTF("len"),
    yrs = libTF("year");
  var map = {},
    order = [],
    n,
    i;
  for (n = 0; n < idx.length; n++) {
    i = idx[n];
    var al = albs[i] || "Unknown Album";
    if (!map[al]) {
      map[al] = { album: al, handle: lib[i], year: yrs[i], tracks: [] };
      order.push(al);
    }
    map[al].tracks.push({ title: titles[i], dur: lens[i], handle: lib[i] });
  }
  for (var j = 0; j < order.length; j++) {
    var a = map[order[j]];
    a.seq = j; // library order, the tie-break inside a year
    a.yr = artAlbumYear(a);
    artistAlbums.push(a);
  }
  artistAlbums.sort(artAlbumCmp);
}

/* ---- All Songs library view: one index of every library track, built once and
   invalidated by the library callbacks, expanded into a flat ROW list of headers and
   tracks in display order, each carrying its own height and precomputed y. Grouping
   only re-sorts the index and never re-reads the library; rows are {k:'g1'|'g2'|'t'},
   and headers also carry kind:'artist'|'album'. */
var songsIdx = null,
  songsRows = null,
  songsTracks = null,
  songsContentH = 0,
  songsTotalSec = 0;
var songsGroup = "none",
  songsScroll = 0,
  songsScrollT = 0,
  SONGS_MAXPX = 0;
var sgMenuOpen = false,
  SG_HB = [],
  HB_SG = null,
  HB_ALLSONGS = null,
  HB_RGNORM = null;
var SONGS_GROUPS = [
  ["No grouping", "none"],
  ["By artist", "artist"],
  ["By album", "album"],
  ["By artist & album", "both"],
];
/* ---- group-list metrics: one indent step per nesting level (SG_IND) and one shared
   vertical rhythm per header -- GAP above, where the divider sits, then artwork, then
   PADB below -- with header heights DERIVED from those parts so every tier lands on the
   same grid. SG_H1B is the artist banner, and SG_CROP is the over-paint band hiding the
   top partial row, which must exceed the tallest thing a row paints above its own top
   edge. */
var SG_IND = 32,
  SG_GAP1 = 24,
  SG_GAP2 = 14,
  SG_PADB1 = 12,
  SG_PADB2 = 10;
var SG_ART1 = 56,
  SG_ART2 = 44,
  SG_TGAP = 18,
  SG_SLABP = 10;
var SG_H1 = SG_GAP1 + SG_ART1 + SG_PADB1; // 92  top-level header
var SG_H1B = SG_GAP1 + SG_SLABP * 2 + SG_ART1 + SG_PADB1; // 112 artist banner (slab around artwork)
var SG_H2 = SG_GAP2 + SG_ART2 + SG_PADB2; // 68  nested header
var SG_TRH = 44,
  SHEAD = 312,
  SG_CROP = 96;
function getSongsIdx() {
  if (songsIdx) return songsIdx;
  var lib = libItems();
  var out = [];
  songsTotalSec = 0;
  if (lib && lib.Count) {
    var ti = libTF("title"),
      ar = libTF("artist"),
      aa = libTF("artistName"),
      al = libTF("album"),
      ln = libTF("len"),
      ls = libTF("lensec"),
      ak = libTF("albkey"),
      tn = libTF("trackno"),
      yr = libTF("year");
    for (var i = 0; i < ti.length; i++) {
      songsTotalSec += parseInt(ls[i], 10) || 0;
      var eT = ti[i] || "",
        eR = ar[i] || "",
        eA = aa[i] || "Unknown Artist",
        eL = al[i] || "Unknown Album";
      // sort keys are lowercased once here instead of on every comparison inside cmpStr; a sort
      // does n*log(n) comparisons, so doing it per-comparison scales as badly as the sort itself
      out.push({
        h: lib[i],
        title: eT,
        artist: eR,
        aartist: eA,
        album: eL,
        len: ln[i],
        artkey: ak[i],
        year: yr[i] || "",
        tn: parseInt(tn[i], 10) || 0,
        kT: eT.toLowerCase(),
        kR: eR.toLowerCase(),
        kA: eA.toLowerCase(),
        kL: eL.toLowerCase(),
      });
    }
  }
  songsIdx = out;
  return out;
}
/* Build steps for the All Songs view. The nine title-formatting passes are the bulk of the work
   and each is atomic, so they run one per tick rather than back to back; libTF memoises them, so
   getSongsIdx then finds everything cached and only has to assemble. */
var SONGS_FIELDS = [
  "title",
  "artist",
  "artistName",
  "album",
  "len",
  "lensec",
  "albkey",
  "trackno",
  "year",
];
function songsSteps() {
  var steps = [],
    i;
  for (i = 0; i < SONGS_FIELDS.length; i++)
    steps.push(
      (function (f) {
        return function () {
          libTF(f);
        };
      })(SONGS_FIELDS[i]),
    );
  steps.push(function () {
    getSongsIdx();
  }); // assembly only -- every field is cached by now
  steps.push(function () {
    buildSongsRows();
  }); // sort (atomic) + row layout
  steps.push(function () {
    if (!rgStat) rgCompute();
  }); // ReplayGain status for the Normalize pill
  return steps;
}
function songsReady() {
  return !!songsRows;
}
function cmpStr(a, b) {
  a = String(a).toLowerCase();
  b = String(b).toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
}
function cmpK(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
} // operands already lowercased once at index time
function cmpTrk(a, b) {
  return a.tn - b.tn || cmpStr(a.title, b.title);
} // within an album: disc order, then title
function buildSongsRows() {
  var idx = getSongsIdx().slice(0),
    g = songsGroup,
    rows = [],
    tracks = [],
    i;
  // compares the lowercase keys precomputed in getSongsIdx -- identical ordering to cmpStr, but
  // without re-lowercasing both operands on every one of the n*log(n) comparisons
  if (g === "artist")
    idx.sort(function (a, b) {
      return cmpK(a.kA, b.kA) || cmpK(a.kL, b.kL) || cmpTrk(a, b);
    });
  else if (g === "album")
    idx.sort(function (a, b) {
      return cmpK(a.kL, b.kL) || cmpK(a.kA, b.kA) || cmpTrk(a, b);
    });
  else if (g === "both")
    idx.sort(function (a, b) {
      return cmpK(a.kA, b.kA) || cmpK(a.kL, b.kL) || cmpTrk(a, b);
    });
  else
    idx.sort(function (a, b) {
      return cmpK(a.kT, b.kT) || cmpK(a.kR, b.kR);
    });
  var curA = null,
    curAl = null,
    ref1 = null,
    ref2 = null,
    n = 0,
    trH = g === "none" ? M.rowH : SG_TRH;
  var h1 = g === "both" ? SG_H1B : SG_H1;
  for (i = 0; i < idx.length; i++) {
    var t = idx[i];
    if (g === "artist") {
      if (t.aartist !== curA) {
        curA = t.aartist;
        n = 0;
        ref1 = {
          k: "g1",
          kind: "artist",
          label: t.aartist,
          sub: "",
          h: h1,
          handle: t.h,
          seed: t.aartist,
          count: 0,
          albums: 0,
          cands: [],
          ckey: "",
        };
        rows.push(ref1);
      }
    } else if (g === "album") {
      if (t.artkey !== curAl) {
        curAl = t.artkey;
        n = 0;
        ref1 = {
          k: "g1",
          kind: "album",
          label: t.album,
          sub: t.aartist + (t.year ? " " + CH_DOT + " " + t.year : ""),
          h: h1,
          handle: t.h,
          seed: t.artkey,
          count: 0,
          albums: 0,
        };
        rows.push(ref1);
      }
    } else if (g === "both") {
      if (t.aartist !== curA) {
        curA = t.aartist;
        curAl = null;
        ref2 = null;
        ref1 = {
          k: "g1",
          kind: "artist",
          label: t.aartist,
          sub: "",
          h: h1,
          handle: t.h,
          seed: t.aartist,
          count: 0,
          albums: 0,
          cands: [],
          ckey: "",
        };
        rows.push(ref1);
      }
      if (t.artkey !== curAl) {
        curAl = t.artkey;
        n = 0;
        ref2 = {
          k: "g2",
          kind: "album",
          label: t.album,
          sub: t.year || "",
          h: SG_H2,
          handle: t.h,
          seed: t.artkey,
          count: 0,
        };
        rows.push(ref2);
        if (ref1) ref1.albums++;
      }
    }
    n++;
    tracks.push(t);
    // one candidate per album for the artist header's avatar -- the first with art wins (rowCover)
    if (
      ref1 &&
      ref1.cands &&
      ref1.ckey !== t.artkey &&
      ref1.cands.length < COVER_CANDS
    ) {
      ref1.ckey = t.artkey;
      ref1.cands.push(t.h);
    }
    rows.push({
      k: "t",
      t: t,
      n: g === "none" ? tracks.length : n,
      ti: tracks.length - 1,
      h: trH,
    });
    if (ref1) ref1.count++;
    if (ref2) ref2.count++;
  }
  var yy = 0;
  for (i = 0; i < rows.length; i++) {
    rows[i].y = yy;
    yy += rows[i].h;
  }
  // link each row to its top-level header + record where the group ends, so the connector
  // rail still draws once the header itself has scrolled off the top
  var last = -1;
  for (i = 0; i < rows.length; i++) {
    if (rows[i].k === "g1") {
      if (last >= 0) rows[last].y1 = rows[i].y;
      last = i;
    } else if (last >= 0) rows[i].g1i = last;
  }
  if (last >= 0) rows[last].y1 = yy;
  songsRows = rows;
  songsTracks = tracks;
  songsContentH = yy + 24;
}
// first row whose bottom is below the scroll position (binary search: thousands of rows)
function songsFirstAt(py) {
  var lo = 0,
    hi = songsRows.length - 1,
    res = songsRows.length;
  while (lo <= hi) {
    var m = (lo + hi) >> 1;
    if (songsRows[m].y + songsRows[m].h > py) {
      res = m;
      hi = m - 1;
    } else lo = m + 1;
  }
  return res;
}
function setSongsGroup(g) {
  if (g !== songsGroup) {
    songsGroup = g;
    songsRows = null;
    songsScroll = songsScrollT = 0;
  }
  sgMenuOpen = false;
  repaintAll();
}
function playSongsRow(ti) {
  if (!songsTracks) return;
  var hs = [];
  for (var i = 0; i < songsTracks.length; i++) hs.push(songsTracks[i].h);
  playHandleList(hs, ti);
}

var plCacheMap = {},
  plMetaMap = {};
function getItems(pi) {
  if (!plCacheMap[pi]) {
    plCacheMap[pi] = plman.GetPlaylistItems(pi);
  }
  return plCacheMap[pi];
}
function getMeta(pi) {
  if (!plMetaMap[pi]) {
    var list = getItems(pi),
      secs = TF.lensec.EvalWithMetadbs(list),
      tot = 0;
    for (var i = 0; i < secs.length; i++) tot += parseInt(secs[i], 10) || 0;
    plMetaMap[pi] = {
      title: TF.title.EvalWithMetadbs(list),
      artist: TF.artist.EvalWithMetadbs(list),
      album: TF.album.EvalWithMetadbs(list),
      len: TF.len.EvalWithMetadbs(list),
      artkey: TF.albkey.EvalWithMetadbs(list),
      totalSec: tot,
      keys: null,
    };
  }
  return plMetaMap[pi];
}
/* Build steps for a playlist. getItems materialises the whole item list and each TF pass runs
   over it, so on a large playlist doing these back to back is exactly the stall being avoided --
   one per tick instead. plMetaMap is only published once every field is in, so a synchronous
   getMeta() elsewhere still sees either nothing or a complete record, never a half-built one. */
function metaSteps(pi) {
  var list = null,
    m = {
      title: null,
      artist: null,
      album: null,
      len: null,
      artkey: null,
      totalSec: 0,
      keys: null,
    };
  return [
    function () {
      list = getItems(pi);
    },
    function () {
      m.title = TF.title.EvalWithMetadbs(list);
    },
    function () {
      m.artist = TF.artist.EvalWithMetadbs(list);
    },
    function () {
      m.album = TF.album.EvalWithMetadbs(list);
    },
    function () {
      m.len = TF.len.EvalWithMetadbs(list);
    },
    function () {
      m.artkey = TF.albkey.EvalWithMetadbs(list);
    },
    function () {
      var s = TF.lensec.EvalWithMetadbs(list),
        t = 0,
        i;
      for (i = 0; i < s.length; i++) t += parseInt(s[i], 10) || 0;
      m.totalSec = t;
    },
    function () {
      if (!plMetaMap[pi]) plMetaMap[pi] = m;
    }, // a sync getMeta() may have won the race
  ];
}
function metaReady(pi) {
  return !!plMetaMap[pi];
}

// jobs={} cancels any build in flight: jobStep finds no entry for its key and simply stops, so a
// job that started against the old data can never publish it
function invalidateItems() {
  plCacheMap = {};
  plMetaMap = {};
  plCoverCache = {};
  coverPickCache = {};
  mosaicCache = {};
  warmed = {};
  plOrderMap = {};
  plNameCache = {};
  plCountCache = {};
  plCardCache = {};
  qMetaCache = {};
  visPlCache = null;
  warmJob = null;
  jobs = {};
  gates = {};
  rowGate = {};
  shelfHandles = null;
}

/* ---- Playlist view sort: only reorders how rows are DISPLAYED. Native item indices (playback,
   row menu, drag targets) are untouched, so order[displayRow] maps to the real item index. */
var plSort = "artist",
  plSortDir = "asc",
  plSortMenuOpen = false,
  PL_SORT_HB = [],
  HB_PLSORT = null,
  HB_PLSORTDIR = null;
var PL_SORTS = [
  ["Title", "title"],
  ["Artist", "artist"],
  ["Album", "album"],
];
var plOrderMap = {};
// Lowercase sort keys built once per playlist and reused across re-sorts, for the same reason as
// the All Songs index: cmpStr would otherwise lowercase both operands on every comparison.
function plKeys(pi) {
  var meta = getMeta(pi);
  if (!meta.keys) {
    var n = meta.title.length,
      t = [],
      a = [],
      l = [],
      i;
    for (i = 0; i < n; i++) {
      t.push(String(meta.title[i]).toLowerCase());
      a.push(String(meta.artist[i]).toLowerCase());
      l.push(String(meta.album[i]).toLowerCase());
    }
    meta.keys = { t: t, a: a, l: l };
  }
  return meta.keys;
}
function buildPlOrder(pi) {
  var meta = getMeta(pi),
    k = plKeys(pi),
    n = meta.title.length,
    order = [],
    i;
  for (i = 0; i < n; i++) order.push(i);
  if (plSort === "title")
    order.sort(function (a, b) {
      return cmpK(k.t[a], k.t[b]) || cmpK(k.a[a], k.a[b]);
    });
  else if (plSort === "album")
    order.sort(function (a, b) {
      return (
        cmpK(k.l[a], k.l[b]) || cmpK(k.a[a], k.a[b]) || cmpK(k.t[a], k.t[b])
      );
    });
  else
    order.sort(function (a, b) {
      return (
        cmpK(k.a[a], k.a[b]) || cmpK(k.l[a], k.l[b]) || cmpK(k.t[a], k.t[b])
      );
    });
  if (plSortDir === "desc") order.reverse();
  return order;
}
function getPlOrder(pi) {
  var meta = getMeta(pi),
    n = meta.title.length,
    c = plOrderMap[pi];
  if (!c || c.sort !== plSort || c.dir !== plSortDir || c.n !== n) {
    c = { sort: plSort, dir: plSortDir, n: n, order: buildPlOrder(pi) };
    plOrderMap[pi] = c;
  }
  return c.order;
}
function setPlSort(s) {
  plSort = s;
  plSortMenuOpen = false;
  repaintAll();
}
function togglePlSortDir() {
  plSortDir = plSortDir === "asc" ? "desc" : "asc";
  repaintAll();
}
