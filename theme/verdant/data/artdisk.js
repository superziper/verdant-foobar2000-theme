/* verdant/data/artdisk.js -- album art, cached on disk so it survives a restart. Loaded
   by main.js; every module shares one global scope, so load order is set there. */

/* ---- the tier below artCache ---- data/art.js keeps decoded covers in RAM, which is gone the moment foobar2000 closes, and foobar's media library caches TAGS and never artwork, so every launch re-read every cover from the source at ~48ms of CPU each (28ms to decode a 3000px source, 19.6ms to resize it on the script thread) plus whatever the storage costs:
     L1  artCache  decoded bitmap, already in hand       ~0ms
     L2  here      read ~31KB + decode a 500px JPEG     ~1ms   <- this file
     L3  the source read + decode + resize             ~48ms + I/O
   An L2 hit also skips the on-thread resize entirely, since what is stored is already no wider than ART_MAXPX, which is the ~19.6ms a cover used to cost the script thread and why a warm launch stops stalling. This does NOT replace artCache and nothing on the drawing path knows it exists; staleness, the size budget and the one case nothing can see -- an external cover swapped under an unchanged audio file, see artDiskDropHandles -- are all described further down where they live. */

/* ---- where it lives ---- A SIBLING of the theme folder, never inside it:
   tools/deploy.ps1 and tools/install.ps1 both robocopy profile/verdant with /MIR, which
   purges anything there that is not in the repo, and the profile root is also where the
   bundled component already writes its own cache, so all Verdant state sits in one
   place. ART_MAXPX is in the directory name on purpose, because it is the one constant
   that makes a cached file WRONG rather than merely different, so changing it orphans
   the old tree instead of poisoning the new one (ART_DOWNSCALE is not in the name: it
   changes quality, not size). */
var artDiskProf_ = "",
  artDiskRoot_ = null,
  artDiskIdx = null,
  artDiskDead = false; // index: key -> {img,stamp,col,bytes,at}
/* Two gates, because the two directions fail independently. LIVE covers reading and
   index bookkeeping and is narrower than merely having an index, since the index is
   loaded when the setting is OFF too, so the Settings page can still report what an
   earlier session left on disk and Clear can still reclaim it; WRITABLE is live AND not
   given up on, so a full disk or a read-only profile stops new covers being written
   while the covers already there stay perfectly readable. */
function artDiskLive() {
  return ARTDISK_ON && !!artDiskIdx;
}
function artDiskWritable() {
  return artDiskLive() && !artDiskDead;
}

/* ---- nothing in here may take the panel down ---- Every background pass in this file
   is entered from a timer, and an exception out of a timer callback is not something
   JSplitter contains: it ends the script, and the script is the whole panel, until a
   reload. None of the passes below is expected to throw, which is exactly why they are
   wrapped -- it logs and returns, and deliberately does NOT stand the cache down, since
   one bad sweep is no reason to stop serving art that is sitting there and loading
   fine. */
function artDiskSafe(what, fn) {
  try {
    fn();
  } catch (e) {
    console.log(
      "Verdant: artwork cache -- " +
        what +
        " failed and was skipped (" +
        e +
        ")",
    );
  }
}
function artDiskLater(what, fn, ms) {
  return window.SetTimeout(function () {
    artDiskSafe(what, fn);
  }, ms);
}

/* fb.ProfilePath is not documented to say which form it returns, and foobar hands profile paths
   out in its own URI form elsewhere -- presence.cpp has to strip exactly this. Normalising both
   ends costs nothing, and a wrong guess here would put the cache somewhere surprising. */
function artDiskProfile() {
  var p = "";
  try {
    p = fb.ProfilePath || "";
  } catch (e) {
    p = "";
  }
  if (!p) return "";
  if (p.substring(0, 7).toLowerCase() === "file://") p = p.substring(7);
  var c = p.charAt(p.length - 1);
  if (c !== "\\" && c !== "/") p += "\\";
  return p;
}
// utils.CreateFolder is not documented to create intermediate levels, so each one is made in turn.
// It is harmless on a folder that already exists.
function artDiskMkdir(path) {
  try {
    utils.CreateFolder(path);
  } catch (e) {}
}
function artDiskIndexPath() {
  return artDiskRoot_ + "index.txt";
}
/* The file name is DERIVED from the key, never read out of the index, which is what
   keeps the delete paths safe: index.txt is a plain text file a user may hand-edit and
   a path taken from it could point anywhere at all, while an MD5 can only ever name a
   file inside the cache. The first byte shards the tree, so a large library does not
   land 10,000 files in one directory. */
function artDiskHash(key) {
  try {
    return utils.MD5(key) || "";
  } catch (e) {
    return "";
  }
}
function artDiskFile(key) {
  var h = artDiskHash(key);
  return h ? artDiskRoot_ + h.substring(0, 2) + "\\" + h + ".jpg" : "";
}
function artDiskShard(key) {
  var h = artDiskHash(key);
  return h ? artDiskRoot_ + h.substring(0, 2) : "";
}

/* ---- the index ---- One line per album, tab separated: key img stamp colour bytes atime src agg
     key     the albKey ('%album artist% - %album%'), escaped below
     img     1 = a file is on disk, 0 = this album HAS no art (see artDiskPut)
     stamp   '%last_modified%|<FileSize>' of the track the art came from, both from the metadb
     colour  the dominant colour, once artHue has had reason to compute one; '-' until then
     bytes   file size, so a size budget can be evaluated without stat-ing every file
     atime   last use, for LRU eviction
     src     the EXTERNAL file the art came from, or empty when it is embedded (see artDiskExternal)
     agg     '<track count>|<newest %last_modified%>' across the album (see artDiskLibScan)
   Lines written before agg existed have six fields instead of seven and parse as embedded, which is what they were validated as when written; only the key can contain anything awkward, so only the key is escaped, percent-style, because it round trips exactly and leaves an ordinary key readable in the file. */
/* Every map in this file is keyed by an album key, and album keys come from tags and
   from index.txt, a plain text file a user can edit, so a key can be the string
   'hasOwnProperty' or '__proto__' -- the first SHADOWS the method, so the next
   membership test throws TypeError instead of answering, and the second is swallowed by
   the prototype setter and never becomes an entry at all. So every map here is
   prototype-less, which makes '__proto__' an ordinary key, and every membership test
   goes through artDiskOwn, which calls the method off Object.prototype rather than off
   the map and cannot be shadowed by anything the map contains. */
function artDiskMap() {
  return Object.create(null);
}
var artDiskOwn_ = Object.prototype.hasOwnProperty;
function artDiskOwn(m, k) {
  return !!m && artDiskOwn_.call(m, k);
}

function artDiskEsc(s) {
  return String(s)
    .replace(/%/g, "%25")
    .replace(/\t/g, "%09")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}
function artDiskUnesc(s) {
  return s
    .replace(/%09/g, "\t")
    .replace(/%0D/g, "\r")
    .replace(/%0A/g, "\n")
    .replace(/%25/g, "%");
}
function artDiskNow() {
  return Math.round(Date.now() / 1000);
}

var ARTDISK_HEAD = "#verdant-artcache 3"; // 2 added src, 3 added agg; older lines parse fine
function artDiskParse() {
  var txt = "";
  try {
    txt = utils.ReadTextFile(artDiskIndexPath());
  } catch (e) {
    txt = "";
  }
  if (!txt) return;
  var lines = txt.split("\n"),
    n = 0,
    b = 0,
    i,
    ln,
    f,
    key;
  for (i = 0; i < lines.length; i++) {
    ln = lines[i];
    if (!ln) continue;
    if (ln.charAt(ln.length - 1) === "\r") ln = ln.substring(0, ln.length - 1);
    if (!ln || ln.charAt(0) === "#") continue;
    f = ln.split("\t");
    if (f.length < 6) continue; // truncated by a kill mid-write: skip it, refetch
    key = artDiskUnesc(f[0]);
    if (!key) continue;
    artDiskIdx[key] = {
      img: f[1] === "1",
      stamp: f[2],
      col: f[3] === "-" ? -1 : parseInt(f[3], 10),
      bytes: parseInt(f[4], 10) || 0,
      at: parseInt(f[5], 10) || 0,
      src: f.length > 6 ? artDiskUnesc(f[6]) : "",
      agg: f.length > 7 ? artDiskUnesc(f[7]) : "",
    };
    b += artDiskIdx[key].bytes;
    n++;
  }
  artDiskCount = n;
  artDiskBytes = b;
}
/* Written by full rewrite on a timer rather than appended to: the index is small, about
   120 bytes an album and so ~48KB for a 400-album library, a rewrite compacts it for
   free, and there is only one code path to get wrong. The cost is that being killed
   loses up to ARTDISK_FLUSH_MS of entries, which costs one refetch each and never a
   wrong pixel. */
var artDiskFT = null,
  artDiskCount = 0,
  artDiskBytes = 0,
  ARTDISK_FLUSH_MS = 4000;
function artDiskTouch() {
  if (artDiskIdx && !artDiskFT)
    artDiskFT = artDiskLater("index write", artDiskFlush, ARTDISK_FLUSH_MS);
}
function artDiskFlush() {
  if (artDiskFT) {
    window.ClearTimeout(artDiskFT);
    artDiskFT = null;
  }
  if (!artDiskIdx) return;
  var out = [ARTDISK_HEAD],
    k,
    e,
    n = 0,
    b = 0;
  for (k in artDiskIdx) {
    if (!artDiskOwn(artDiskIdx, k)) continue;
    e = artDiskIdx[k];
    out.push(
      artDiskEsc(k) +
        "\t" +
        (e.img ? "1" : "0") +
        "\t" +
        e.stamp +
        "\t" +
        (e.col === -1 ? "-" : String(e.col)) +
        "\t" +
        e.bytes +
        "\t" +
        e.at +
        "\t" +
        artDiskEsc(e.src || "") +
        "\t" +
        artDiskEsc(e.agg || ""),
    );
    n++;
    b += e.bytes;
  }
  artDiskCount = n;
  artDiskBytes = b; // the running totals, corrected against what was actually written
  try {
    utils.WriteTextFile(artDiskIndexPath(), out.join("\r\n") + "\r\n");
  } catch (e2) {}
}

/* ---- startup ----
   Called from app.js once everything is loaded, so ART_MAXPX and the rest are already there.
   Parsing runs inline rather than deferred: at this size it is a frame, and a cache that is not
   ready for the first paint is a cache the first paint misses entirely. */
/* Called from app.js's init tail, where a throw would abort every line after it -- the memory
   watchdog and the Discord sync among them. Guarded for that reason, not because it is expected
   to fail. */
function artDiskInit() {
  artDiskSafe("startup", artDiskStart);
}
function artDiskStart() {
  artDiskProf_ = artDiskProfile();
  if (!artDiskProf_) return; // no profile path: stay off, stay silent
  artDiskRoot_ = artDiskProf_ + "verdant-cache\\v1-" + ART_MAXPX + "\\";
  // Reading an index a previous session wrote costs one file read and no network, and it is what
  // lets the page answer "how much is on disk" while the cache is off. Creating the folder is a
  // different matter: a switched-off feature has no business leaving directories behind, so that
  // waits until something is actually going to be written into it.
  if (ARTDISK_ON) artDiskMkRoot();
  artDiskIdx = artDiskMap();
  artDiskParse();
  if (ARTDISK_ON) {
    artDiskPrefillHue();
    artDiskSweepLater();
  }
}
// Both levels, because utils.CreateFolder is not documented to create intermediates.
function artDiskMkRoot() {
  artDiskMkdir(artDiskProf_ + "verdant-cache");
  artDiskMkdir(artDiskRoot_);
}
/* Every colour the index already knows, handed to artHue before anything is drawn,
   since artHue otherwise cannot answer until a full bitmap has arrived AND
   GetColourScheme has run over it, so an artist header opens on the placeholder
   gradient and corrects itself a moment later. hueCache is dropped by
   on_metadb_changed, which is correct -- after a tag edit the colours should be
   recomputed from the art, and they are simply recomputed from L2 rather than from the
   source. */
function artDiskPrefillHue() {
  var k, e;
  for (k in artDiskIdx) {
    if (!artDiskOwn(artDiskIdx, k)) continue;
    e = artDiskIdx[k];
    if (e.img && e.col !== -1 && !artDiskOwn(hueCache, k)) hueCache[k] = e.col;
  }
}
// artHue computes one of these the first time something needs it; keep it, so next launch is free
function artDiskNoteColour(key, col) {
  if (!artDiskLive()) return;
  var e = artDiskIdx[key];
  if (!e || !e.img || e.col === col) return;
  e.col = col;
  artDiskTouch();
}

/* ---- reading ----
   artDiskGet is the whole lookup: an in-memory hash hit, no I/O at all, so startArt can choose a
   tier without touching the disk. 'neg' means this album was looked at and genuinely has no
   artwork -- remembering that is worth as much as remembering the covers, because a miss is the
   EXPENSIVE case: foobar walks the folder for cover.jpg, folder.jpg and the rest before giving up,
   and over WebDAV that is several round trips to learn nothing. */
function artDiskGet(h, key) {
  if (!artDiskLive()) return null;
  var e = artDiskIdx[key];
  if (!e) return null;
  if (!artDiskStampOK(e, h)) {
    artDiskDrop(key);
    return null;
  } // the file moved on: refetch, once
  /* atime orders LRU eviction, so it has to survive a restart -- but dirtying the index on every
     read would mean rewriting it every few seconds for the whole of a browse. An hour's resolution
     is far finer than eviction needs and costs a flush almost never. */
  var now = artDiskNow();
  if (now - e.at >= ARTDISK_AT_COARSE) artDiskTouch();
  e.at = now;
  return e.img ? "img" : "neg";
}
var ARTDISK_AT_COARSE = 3600;
/* Exactly one of artDone or startArtSource must run, exactly once. artDone decrements artInFlight
   and pumps the queue, so a double call drives it negative and over-admits, while a missed call
   leaves it high -- and pumpArt's `artInFlight < artInflightCap()` gate then stops dispatching
   FOREVER, with no error anywhere and a UI stuck on placeholders. The `done` latch is cheap
   insurance against a promise that settles twice. */
function artDiskRead(h, key) {
  var done = false,
    path = artDiskFile(key);
  if (!path) {
    startArtSource(h, key);
    return;
  }
  function fallback() {
    if (done) return;
    done = true;
    artStatBad++;
    artDiskForget(key); // the file is gone or unreadable: fetch it again, once
    startArtSource(h, key);
  }
  try {
    gdi.LoadImageAsyncV2(0, path).then(function (img) {
      if (done) return;
      if (!img) {
        fallback();
        return;
      }
      done = true;
      artStatCache++;
      artDone(key, img);
      artWarmRepaint();
    }, fallback);
  } catch (e) {
    fallback();
  }
}
/* Drops the entry and leaves the file, which is right for its one caller, artDiskRead's
   fallback, where the file has just failed to load and is probably not there at all. If
   it IS there it is now an orphan, harmless because nothing can reach a file with no
   entry naming it, and the sweep collects it; use artDiskDrop to invalidate an entry
   whose file is real and has to go. */
function artDiskForget(key) {
  if (!artDiskOwn(artDiskIdx, key)) return;
  artDiskCount--;
  artDiskBytes -= artDiskIdx[key].bytes;
  delete artDiskIdx[key];
  artDiskTouch();
}

/* ---- writing ---- The stamp is read from the metadb, never from the file:
   %last_modified%, FbMetadbHandle's own FileSize and the path are all already in
   foobar's library database, so building one costs no I/O and, the point, no network.
   Entries written before the path field existed have two fields instead of three, and
   the parser takes them as they are while artDiskStampOK treats them as unverifiable
   rather than as wrong. */
function artDiskStamp(h) {
  var ph = artDiskPathHash(h),
    lm = "",
    sz = 0;
  try {
    lm = TF.lastmod.EvalWithMetadb(h);
  } catch (e) {
    lm = "";
  }
  try {
    sz = h.FileSize || 0;
  } catch (e2) {
    sz = 0;
  }
  return (ph || "-") + "|" + lm + "|" + sz;
}
/* ---- art that lives in its own file ---- Not every library embeds its artwork, and
   for a cover.jpg beside the tracks the embedded stamp above is blind in the one way
   that matters: replacing the cover file touches no audio file, so nothing in the entry
   changes and the old cover is served forever. GetAlbumArtAsyncV2 resolves with a path
   as well as an image, which is what makes the two cases separable, so it is recorded
   at write time and external entries are stamped from the COVER FILE's own modification
   time and size -- the same file whichever track of the album asked (see
   artDiskStampOK). */
function artDiskNorm(p) {
  var s = String(p || "");
  if (s.substring(0, 7).toLowerCase() === "file://") s = s.substring(7);
  return s;
}
// '' means embedded: the art came out of the audio file, so the track IS the art's file.
function artDiskExternal(h, src) {
  var a = artDiskNorm(src);
  if (!a) return "";
  var t = "";
  try {
    t = artDiskNorm(h.Path);
  } catch (e) {
    return "";
  }
  if (!t) return "";
  return a.toLowerCase() === t.toLowerCase() ? "" : a;
}
/* The leading '-' is deliberate and load-bearing: it is the no-track-hash marker
   artDiskStampOK already treats as unverifiable, so an external entry costs no I/O on
   the READ path. Checking it needs a real stat, and a stat on a NAS is a network round
   trip, so it happens once a session in the sweep rather than for every cover on every
   paint. */
function artDiskStampFile(path) {
  var lm = 0,
    sz = 0;
  try {
    lm = utils.GetLastModified(path) || 0;
  } catch (e) {
    lm = 0;
  }
  try {
    sz = utils.GetFileSize(path) || 0;
  } catch (e2) {
    sz = 0;
  }
  return "-|" + lm + "|" + sz;
}
/* Conservative on purpose: it only reports a cover stale when it can positively show that it
   changed. A stat that throws, or that answers with nothing at all, is a storage hiccup -- on a
   network share an everyday one -- and dropping a perfectly good cover on the strength of it would
   turn a blip into a re-download. */
function artDiskFileStampOK(e) {
  if (!e || !e.src) return true;
  var there = false;
  try {
    there = !!utils.IsFile(e.src);
  } catch (e1) {
    return true;
  } // cannot tell: leave it alone
  if (!there) return false; // the cover file is gone
  var now = artDiskStampFile(e.src);
  if (now === "-|0|0") return true; // stat told us nothing: do not act
  return e.stamp === now;
}
/* A resolved fetch with no image means foobar looked and found nothing, so that is
   remembered; a REJECTED fetch is not, since it may be a transient read error, which on
   a network library is exactly what a blip looks like. Persisting it would cache no-
   art-for-this-album forever on the strength of one bad moment, so a rejection is left
   to L1 for the session and retried next launch. */
var artDiskQ = [],
  artDiskQT = null,
  ARTDISK_SLICE = 4,
  ARTDISK_WRITE_MS = 100,
  artDiskFails = 0;
function artDiskPut(h, key, img, src) {
  if (!artDiskWritable() || artDiskOwn(artDiskIdx, key)) return;
  var ext = artDiskExternal(h, src);
  var stamp = ext ? artDiskStampFile(ext) : artDiskStamp(h);
  if (!img) {
    artDiskIdx[key] = {
      img: false,
      stamp: stamp,
      col: -1,
      bytes: 0,
      at: artDiskNow(),
      src: ext,
      agg: "",
    };
    artDiskCount++;
    artDiskTouch();
    return;
  }
  artDiskQ.push([key, img, stamp, ext]);
  if (!artDiskQT)
    artDiskQT = artDiskLater("cover write", artDiskDrain, ARTDISK_WRITE_MS);
}
/* Encoding is cheap -- a 500px JPEG measured at 0.46ms -- but SaveAs is synchronous on the script
   thread and this thread also draws, so writes go a few per tick rather than inside the arrival
   callback. The queue holds a reference to a bitmap that is already in artCache, so it costs no
   extra memory unless artCache evicts it first; the slice is sized so the queue stays short. */
function artDiskDrain() {
  artDiskQT = null;
  var n = 0,
    it;
  while (artDiskQ.length && n < ARTDISK_SLICE) {
    it = artDiskQ.shift();
    n++;
    artDiskWrite(it[0], it[1], it[2], it[3]);
  }
  artDiskEnforce(); // once per slice: the sort it may trigger is not worth doing per file
  if (artDiskQ.length)
    artDiskQT = artDiskLater("cover write", artDiskDrain, ARTDISK_WRITE_MS);
}
/* A write that fails is not recorded, so the album is simply fetched again next time. Ten failures
   in a row is not bad luck though -- it is a full disk, a read-only profile, or a path that cannot
   be created -- and retrying every cover for the rest of the session would cost real thread time
   for nothing, so the tier stands down and leaves artCache to do what it always did. */
var ARTDISK_MAXFAIL = 10;
function artDiskWrite(key, img, stamp, src) {
  var path = artDiskFile(key);
  if (!path) return;
  var ok = false;
  try {
    artDiskMkdir(artDiskShard(key));
    ok = img.SaveAs(path, "image/jpeg") !== false;
  } catch (e) {
    ok = false;
  }
  if (!ok) {
    if (++artDiskFails >= ARTDISK_MAXFAIL) {
      console.log(
        "Verdant: not caching new artwork -- " +
          ARTDISK_MAXFAIL +
          " writes failed in a row (" +
          artDiskRoot_ +
          "). Covers already cached are still being used.",
      );
      artDiskDead = true;
      artDiskStop();
    }
    return;
  }
  artDiskFails = 0;
  var bytes = 0;
  try {
    bytes = utils.GetFileSize(path) || 0;
  } catch (e2) {
    bytes = 0;
  }
  artDiskIdx[key] = {
    img: true,
    stamp: stamp,
    col: -1,
    bytes: bytes,
    at: artDiskNow(),
    src: src || "",
    agg: "",
  };
  artDiskCount++;
  artDiskBytes += bytes;
  artDiskTouch();
}
/* Stops the tier for this session without touching a single file. Dropping the queue matters:
   those are encodes nobody asked for any more, and they would otherwise keep landing on the script
   thread after the reason for them is gone. artCache is deliberately left alone -- it is still
   perfectly valid, and clearing it would drop every visible cover to a placeholder and re-gate
   every section, which is a visible fault where there was none. */
function artDiskStop() {
  artDiskFlush();
  if (artDiskQT) {
    window.ClearTimeout(artDiskQT);
    artDiskQT = null;
  }
  if (artDiskEvictT) {
    window.ClearTimeout(artDiskEvictT);
    artDiskEvictT = null;
  }
  if (artDiskSweepT) {
    window.ClearTimeout(artDiskSweepT);
    artDiskSweepT = null;
  }
  artDiskQ = [];
  artDiskEvictJob = null;
  artDiskSweepJob = null;
}
/* Switching off stops reads and writes and drops the pending encodes -- work nobody asked for any
   more, which would otherwise keep landing on the script thread after the reason for it is gone.
   It does NOT forget what is on disk: the index stays loaded so the size is still reportable and
   still clearable. artCache is deliberately untouched, which is what makes the toggle invisible on
   screen rather than a settings click that drops every cover to a placeholder. */
function artDiskSuspend() {
  artDiskStop();
}
// Switching back on does NOT re-scan anything: the cache simply fills again as you browse. The
// folder may not exist yet, because it was never created while the setting was off.
function artDiskResume() {
  artDiskDead = false;
  if (!artDiskIdx) {
    artDiskInit();
    return;
  }
  artDiskMkRoot();
  artDiskPrefillHue();
  artDiskSweepLater();
}

/* ---- what actually happened, per launch ---- Issue #2 asks whether the artwork on
   screen is coming from the cache or whether the library is being read again every
   launch, and the only honest answer is a count, so the three tiers each keep one and
   one line of console says how the launch went. This is also the measurement for a
   library on a NAS, where every cover served from the source is a round trip for
   roughly 1.7MB, so from-the-library is the number that costs; it reports once the art
   queues have gone quiet, because a count taken while the warm pass is still running is
   a snapshot of a race. */
var artStatCache = 0,
  artStatNeg = 0,
  artStatSrc = 0,
  artStatSrcMs = 0,
  artStatBad = 0;
var ARTSTAT_MS = 6000,
  artStatT = null,
  artStatDone = false;
function artStatLater() {
  if (artStatDone || artStatT) return;
  artStatT = artDiskLater("startup summary", artStatReport, ARTSTAT_MS);
}
function artStatReport() {
  artStatT = null;
  // still fetching: come back once it has settled, or the numbers describe a moment, not a launch
  if (
    artInFlight ||
    artQueue.length ||
    artGateQueue.length ||
    artWarmQueue.length
  ) {
    artStatLater();
    return;
  }
  artStatDone = true;
  var total = artStatCache + artStatNeg + artStatSrc;
  if (!total) return; // nothing was asked for: nothing worth saying
  var msg =
    "Verdant: artwork -- " +
    fmtNum(artStatCache) +
    " from the disk cache, " +
    fmtNum(artStatSrc) +
    " read from the library";
  if (artStatSrc) msg += " in " + (artStatSrcMs / 1000).toFixed(1) + "s";
  if (artStatNeg)
    msg += ", " + fmtNum(artStatNeg) + " already known to have none";
  if (artStatBad) msg += ", " + fmtNum(artStatBad) + " cache files unreadable";
  if (!ARTDISK_ON) msg += "  (the disk cache is switched off)";
  console.log(msg + ".");
}

/* ---- what the Settings page shows ----
   Both are running totals kept by the writers above and corrected on every flush, so the page can
   ask on every paint without stat-ing a single file. The count includes albums remembered as
   having NO art, which is why it says albums rather than covers. */
function artDiskUsage() {
  return artDiskBytes;
}
function artDiskUsageText() {
  if (!artDiskIdx)
    return "The cache could not be opened, so covers are kept in memory only.";
  if (artDiskDead)
    return "Not caching new covers -- writes keep failing; see the console.";
  if (!ARTDISK_ON)
    return artDiskBytes
      ? "Covers are kept in memory only. " +
          fmtBytes(artDiskBytes) +
          " is still on disk."
      : "Covers are kept in memory only, and reload on every launch.";
  if (!artDiskCount) return "Nothing cached yet";
  var lim = artDiskLimit();
  return (
    "Using " +
    fmtBytes(artDiskBytes) +
    " for " +
    fmtNum(artDiskCount) +
    " albums" +
    (lim ? ", of " + fmtBytes(lim) + " allowed." : ".")
  );
}

/* ---- deleting ---- JSplitter has no delete API at all, so this is the one place in
   the theme that reaches for the Windows scripting host, and it is also the only code
   in Verdant that destroys anything, so it is deliberately paranoid about where it is
   pointed. Nothing here takes a path from index.txt: every path acted on is either the
   root artDiskInit built out of fb.ProfilePath or one rebuilt from a key's MD5 and
   matched against the exact shape such a path must have, with one guard per thing that
   can be destroyed -- artDiskRootSane for the whole tree, artDiskDeletable for one
   file, artDiskSibSane for an orphaned sibling tree. */
var artDiskFSO = null,
  artDiskFSOTried = false;
function artDiskFS() {
  if (!artDiskFSOTried) {
    artDiskFSOTried = true;
    try {
      artDiskFSO = new ActiveXObject("Scripting.FileSystemObject");
    } catch (e) {
      artDiskFSO = null;
    }
  }
  return artDiskFSO;
}
function artDiskRootSane() {
  return !!artDiskRoot_ && artDiskRoot_.indexOf("verdant-cache\\v1-") > 0;
}
/* One file. The path is rebuilt from the key's MD5 and then checked to be exactly
   <root><2 hex>\<32 hex>.jpg, so the only thing this can remove is a file this module named
   itself: not index.txt, not anything a '..' in a hand-edited key could reach, and nothing at all
   under a root that has stopped looking like the one artDiskInit built. */
function artDiskDeletable(path) {
  if (!artDiskRootSane() || !path) return false;
  /* Case-insensitively, because Windows paths are, and because the paths handed to this do not all
     come from the same place: one is built here out of fb.ProfilePath, another comes back from
     utils.Glob carrying whatever case the filesystem recorded. A case-SENSITIVE prefix test lets
     nothing extra through -- it just answers false for a perfectly valid path whose drive letter
     came back lowercased, which quietly stops the orphan sweep ever collecting anything. */
  var p = String(path);
  if (
    p.substring(0, artDiskRoot_.length).toLowerCase() !==
    artDiskRoot_.toLowerCase()
  )
    return false;
  return /^[0-9a-f]{2}\\[0-9a-f]{32}\.jpg$/i.test(
    p.substring(artDiskRoot_.length),
  );
}
function artDiskDelFile(key) {
  var fs = artDiskFS();
  if (!fs) return false;
  var path = artDiskFile(key);
  if (!artDiskDeletable(path)) return false;
  try {
    if (fs.FileExists(path)) fs.DeleteFile(path, true);
    return true;
  } catch (e) {
    return false;
  }
}
// Invalidation, as opposed to artDiskForget's "the file was already gone": entry and file both.
function artDiskDrop(key) {
  if (!artDiskOwn(artDiskIdx, key)) return;
  if (artDiskIdx[key].img) artDiskDelFile(key);
  artDiskForget(key);
}
/* The whole tree, not just the files the index knows about, since a reclaim-my-disk
   action that left orphans behind would be a lie about the number it was just showing;
   the folder is the one this module built from fb.ProfilePath, never a path from the
   index, and artDiskRootSane is the last word on that. Covers already in artCache stay
   there and stay on screen, because clearing the disk tier is not meant to be visible
   and those albums are simply written again the next time they are missed. */
function artDiskClear() {
  if (!artDiskRootSane()) return false;
  if (artDiskQT) {
    window.ClearTimeout(artDiskQT);
    artDiskQT = null;
  }
  if (artDiskFT) {
    window.ClearTimeout(artDiskFT);
    artDiskFT = null;
  }
  artDiskQ = [];
  var fs = artDiskFS(),
    ok = false;
  if (fs) {
    try {
      var dir = artDiskRoot_.substring(0, artDiskRoot_.length - 1); // FSO wants no trailing separator
      if (fs.FolderExists(dir)) fs.DeleteFolder(dir, true);
      ok = true;
    } catch (e) {
      ok = false;
    }
  }
  if (!ok)
    console.log(
      "Verdant: could not clear the artwork cache at " + artDiskRoot_,
    );
  if (ARTDISK_ON) artDiskMkRoot(); // off: do not leave a fresh empty folder behind
  artDiskCount = 0;
  artDiskBytes = 0;
  if (artDiskIdx) {
    artDiskIdx = artDiskMap();
    if (ARTDISK_ON) artDiskFlush();
  }
  return ok;
}

/* ---- keeping it honest -----------------------------------------------------------------------
   Three mechanisms, because they catch different things and no one of them catches everything:

     1. the library callbacks   a track removed or re-tagged IN foobar -- caught immediately
     2. the stamp               a file that changed behind foobar's back -- caught on next read
     3. the sweep               whatever the first two missed -- once per session

   What none of them catches is worth saying plainly, because it is the case a user is most likely
   to create on purpose: replacing an EXTERNAL cover file, swapping folder.jpg for a better scan,
   touches neither the audio file's timestamp nor foobar's library, so there is nothing for any of
   the three to notice. That one needs Clear on the Settings page, and it is a large part of why
   that button is there. */

/* ---- invalidation from the library ---- Called from app.js's on_library_items_removed
   and _changed, and deliberately BEFORE libChanged(), because albKey() answers out of
   albKeyCache and still holds the key each handle had BEFORE the edit, and that OLD key
   names the index entry that has to go. An album is dropped whole even when only one of
   its tracks was touched, since no API says which file foobar read the art from and the
   cost of being wrong is one refetch against a cover that never corrects itself; this
   runs with the cache switched OFF too, which is why it gates on artDiskIdx rather than
   artDiskLive. */
function artDiskDropHandles(handles) {
  var hit = 0;
  artDiskSafe("library invalidation", function () {
    hit = artDiskDropped(handles);
  });
  return hit;
}
function artDiskDropped(handles) {
  if (!artDiskIdx || !handles) return 0;
  var n = 0;
  try {
    n = handles.Count !== undefined ? handles.Count : handles.length;
  } catch (e) {
    n = 0;
  }
  if (!n) return 0;
  var i,
    h,
    k,
    seen = artDiskMap(),
    hit = 0;
  for (i = 0; i < n; i++) {
    h = null;
    try {
      h = handles[i];
    } catch (e2) {
      h = null;
    }
    if (!h) continue;
    k = "";
    try {
      k = albKey(h);
    } catch (e3) {
      continue;
    }
    if (!k || artDiskOwn(seen, k)) continue;
    seen[k] = 1;
    if (artDiskOwn(artDiskIdx, k)) {
      artDiskDrop(k);
      hit++;
    }
  }
  return hit;
}

/* ---- the stamp ---- It answers one question, whether the file this cover came from is
   still the file it came from, from a hash of the track's path plus its %last_modified%
   and size, all out of foobar's library database, so checking costs no I/O and no
   network. The path hash is there because startArt is handed whatever handle its caller
   happened to hold, which for a ten-track album differs from launch to launch, so a
   stamp from a DIFFERENT track is not evidence of anything and is ignored -- only the
   same track's own timestamp and size can condemn an entry. */
function artDiskPathHash(h) {
  var p = "";
  try {
    p = h.Path || "";
  } catch (e) {
    return "";
  }
  if (!p) return "";
  var x = artDiskHash(p);
  return x ? x.substring(0, 8) : "";
}
/* True means "no reason to doubt it", and every uncertain case answers true on purpose. A cache is
   allowed to be a little stale; throwing away a good cover on a guess costs a refetch for nothing,
   and on the slow library this whole file exists for, that refetch is the exact cost being avoided. */
function artDiskStampOK(e, h) {
  if (!e || !e.stamp || !h) return true;
  var f = e.stamp.split("|");
  if (f.length < 3 || f[0] === "-") return true; // written before stamps carried a path: unverifiable
  var ph = artDiskPathHash(h);
  if (!ph || ph !== f[0]) return true; // another track of the same album: no information,
  // and no title-format eval spent finding that out
  var lm = "";
  try {
    lm = TF.lastmod.EvalWithMetadb(h);
  } catch (e2) {
    return true;
  }
  var sz = 0;
  try {
    sz = h.FileSize || 0;
  } catch (e3) {
    return true;
  }
  return lm === f[1] && String(sz) === f[2];
}

/* ---- the size budget ---- A ceiling on the bytes the index accounts for, evaluated
   after each write slice, and eviction is least recently used, since artDiskGet stamps
   at on every hit so what goes is what has gone longest without being looked at. It
   evicts down to a LOW mark rather than to the ceiling itself, because sitting exactly
   at the ceiling puts every write afterwards over budget again, and the pass is sliced
   because at a 1GB limit that 10% is some 1,600 files and an FSO delete is synchronous
   on the thread that also draws. */
var ARTDISK_LOW = 0.9,
  ARTDISK_EVICT_SLICE = 16,
  ARTDISK_EVICT_MS = 120;
var artDiskEvictJob = null,
  artDiskEvictT = null;
function artDiskLimit() {
  return ARTDISK_MB > 0 ? ARTDISK_MB * 1048576 : 0;
}
function artDiskEnforce() {
  var lim = artDiskLimit();
  if (!lim || !artDiskIdx || artDiskEvictT || artDiskBytes <= lim) return;
  var keys = [],
    k;
  for (k in artDiskIdx) {
    if (artDiskOwn(artDiskIdx, k) && artDiskIdx[k].bytes > 0) keys.push(k);
  }
  keys.sort(function (a, b) {
    return artDiskIdx[a].at - artDiskIdx[b].at;
  });
  artDiskEvictJob = {
    list: keys,
    i: 0,
    low: Math.round(lim * ARTDISK_LOW),
    lim: lim,
    freed: 0,
    n: 0,
  };
  artDiskEvictStep();
}
function artDiskEvictStep() {
  artDiskEvictT = null;
  var j = artDiskEvictJob;
  if (!j || !artDiskIdx) {
    artDiskEvictJob = null;
    return;
  }
  var n = 0,
    k;
  while (
    j.i < j.list.length &&
    artDiskBytes > j.low &&
    n < ARTDISK_EVICT_SLICE
  ) {
    k = j.list[j.i++];
    n++;
    if (!artDiskOwn(artDiskIdx, k)) continue; // already gone: dropped by the sweep or a callback
    j.freed += artDiskIdx[k].bytes;
    j.n++;
    artDiskDrop(k);
  }
  if (j.i < j.list.length && artDiskBytes > j.low) {
    artDiskEvictT = artDiskLater(
      "eviction",
      artDiskEvictStep,
      ARTDISK_EVICT_MS,
    );
    return;
  }
  if (j.n)
    console.log(
      "Verdant: artwork cache at its " +
        fmtBytes(j.lim) +
        " limit -- removed " +
        fmtNum(j.n) +
        (j.n === 1 ? " cover" : " covers") +
        " not seen in the longest (" +
        fmtBytes(j.freed) +
        " reclaimed)",
    );
  artDiskEvictJob = null;
}

/* ---- the sweep ---- Once per session, a few seconds after startup rather than during it, because it needs the library's album keys and forcing that evaluation on the launch path would spend the first paint's budget on housekeeping. Four jobs, of which only the first can do real damage -- a library that answers with nothing would make every key look dead, so an empty answer is refused:
     1. entries whose album is gone from the library, or is no longer made of the same files
     2. external cover files replaced, resized or deleted since they were cached, which no callback can see; one stat per external entry, so a NAS pays it once a session instead of once a cover
     3. files with no entry pointing at them, from a write that landed after the last flush
     4. sibling v<n>-<px> trees left behind by a change to ART_MAXPX (see the note at the top) */
var ARTDISK_SWEEP_MS = 8000,
  ARTDISK_SWEEP_SLICE = 40,
  ARTDISK_SWEEP_STEP_MS = 140;
var artDiskSwept = false,
  artDiskSweepT = null,
  artDiskSweepJob = null;
function artDiskSweepLater() {
  if (artDiskSwept || artDiskSweepT) return;
  artDiskSweepT = artDiskLater("sweep", artDiskSweepRun, ARTDISK_SWEEP_MS);
}
function artDiskSweepRun() {
  artDiskSweepT = null;
  if (artDiskSwept || !artDiskLive() || !artDiskRootSane()) return;
  artDiskSwept = true; // once per session either way: a retry loop here would
  // re-walk the tree every few seconds for no new answer
  artDiskSweepSiblings();
  var scan = artDiskLibScan(),
    files = artDiskOrphanFiles(),
    ext = artDiskExternalKeys();
  var keys = scan.dead.concat(scan.changed),
    ndead = scan.dead.length;
  if (!keys.length && !files.length && !ext.length) return;
  artDiskSweepJob = {
    keys: keys,
    files: files,
    ext: ext,
    ndead: ndead,
    ki: 0,
    fi: 0,
    ei: 0,
    nk: 0,
    nc: 0,
    nf: 0,
    nx: 0,
    bytes: 0,
  };
  artDiskSweepStep();
}
// Every entry whose art sits in its own file. Collected up front because the stat is the slow
// part and the slices below are what keep it off the drawing thread.
function artDiskExternalKeys() {
  var out = [],
    k;
  for (k in artDiskIdx) {
    if (artDiskOwn(artDiskIdx, k) && artDiskIdx[k].src) out.push(k);
  }
  return out;
}
/* ---- is each cached album still the album that was cached? ---- The key is '%album
   artist% - %album%', so replacing an album with a different release under the same
   artist and title produces the SAME key and the lookup hits; the stamp and the library
   callbacks normally catch that, but not when the files were swapped while foobar was
   closed AND the new filenames differ, since a stamp from a different track is
   deliberately treated as no evidence. The aggregate closes it with the track count and
   the newest %last_modified%, both out of the library database, so the check costs no
   file I/O and rides the batched title-format pass the dead-key check already makes; it
   cannot be built when a cover is written, so the sweep refreshes it once a session,
   and an entry with no aggregate yet is RECORDED rather than judged. */
function artDiskLibScan() {
  var out = { dead: [], changed: [] },
    lib = null,
    keys = null,
    mods = null,
    i,
    k,
    m,
    a,
    e,
    now;
  try {
    lib = libItems();
  } catch (e0) {
    lib = null;
  }
  if (!lib || !lib.Count) return out; // nothing to compare against: do not act
  try {
    keys = libTF("albkey");
  } catch (e1) {
    keys = null;
  }
  if (!keys || !keys.length) return out; // the same guard, on the other half of the answer
  try {
    mods = libTF("lastmod");
  } catch (e2) {
    mods = null;
  }

  var agg = artDiskMap();
  for (i = 0; i < keys.length; i++) {
    k = keys[i];
    if (!k) continue;
    m = mods && i < mods.length ? String(mods[i] || "") : "";
    if (!artDiskOwn(agg, k)) agg[k] = [1, m];
    else {
      a = agg[k];
      a[0]++;
      if (m > a[1]) a[1] = m;
    }
  }
  for (k in artDiskIdx) {
    if (!artDiskOwn(artDiskIdx, k)) continue;
    if (!artDiskOwn(agg, k)) {
      out.dead.push(k);
      continue;
    }
    a = agg[k];
    e = artDiskIdx[k];
    now = a[0] + "|" + a[1];
    if (!e.agg) {
      e.agg = now;
      artDiskTouch();
      continue;
    } // first sight: record it, do not judge it
    if (e.agg !== now) out.changed.push(k);
  }
  return out;
}
// kept as its own name because it says what it answers; the sweep uses the full scan.
function artDiskDeadKeys() {
  return artDiskLibScan().dead;
}
/* Enumerated with utils.Glob, not the FileSystemObject, whose Folders and Files are
   IEnumVARIANT collections that JScript walks with new Enumerator -- and this is
   SpiderMonkey, where no such constructor exists. Glob takes exclude and include
   attribute masks, so one call lists the shard directories and one call per shard lists
   its files, and every path still has to pass artDiskDeletable, so a Glob that returned
   something unexpected cannot turn into a delete outside the cache. */
var FILE_ATTR_DIR = 0x10;
function artDiskGlob(pattern, exc, inc) {
  var a = null;
  try {
    a = utils.Glob(pattern, exc, inc);
  } catch (e) {
    a = null;
  }
  return a && a.length !== undefined ? a : [];
}
function artDiskBase(p) {
  var s = String(p);
  if (s.charAt(s.length - 1) === "\\") s = s.substring(0, s.length - 1);
  var i = s.lastIndexOf("\\");
  return i < 0 ? s : s.substring(i + 1);
}
function artDiskOrphanFiles() {
  var out = [],
    want = artDiskMap(),
    k,
    p,
    i,
    j;
  if (!artDiskRootSane()) return out;
  for (k in artDiskIdx) {
    if (!artDiskOwn(artDiskIdx, k) || !artDiskIdx[k].img) continue;
    p = artDiskFile(k);
    if (p) want[p.toLowerCase()] = 1;
  }
  var shards = artDiskGlob(artDiskRoot_ + "*", 0, FILE_ATTR_DIR),
    nm,
    files;
  for (i = 0; i < shards.length; i++) {
    nm = artDiskBase(shards[i]);
    if (!/^[0-9a-f]{2}$/i.test(nm)) continue; // not a shard this module made: leave it alone
    files = artDiskGlob(artDiskRoot_ + nm + "\\*.jpg", FILE_ATTR_DIR, 0);
    for (j = 0; j < files.length; j++) {
      p = String(files[j]);
      if (!artDiskDeletable(p)) continue; // the same guard the deletes use
      if (!artDiskOwn(want, p.toLowerCase())) out.push(p);
    }
  }
  return out;
}
function artDiskSweepStep() {
  var j = artDiskSweepJob;
  if (!j || !artDiskIdx) {
    artDiskSweepJob = null;
    return;
  }
  var n = 0,
    fs = artDiskFS(),
    k,
    p;
  while (j.ki < j.keys.length && n < ARTDISK_SWEEP_SLICE) {
    var wasDead = j.ki < j.ndead;
    k = j.keys[j.ki++];
    n++;
    if (!artDiskOwn(artDiskIdx, k)) continue;
    j.bytes += artDiskIdx[k].bytes;
    if (wasDead) j.nk++;
    else j.nc++; // gone from the library, vs the same album but not the same files
    artDiskDrop(k);
  }
  while (j.ei < j.ext.length && n < ARTDISK_SWEEP_SLICE) {
    k = j.ext[j.ei++];
    n++;
    if (!artDiskOwn(artDiskIdx, k)) continue;
    if (artDiskFileStampOK(artDiskIdx[k])) continue;
    j.bytes += artDiskIdx[k].bytes;
    j.nx++;
    artDiskDrop(k); // the cover changed: drop it, and it is fetched once more
  }
  while (fs && j.fi < j.files.length && n < ARTDISK_SWEEP_SLICE) {
    p = j.files[j.fi++];
    n++;
    if (!artDiskDeletable(p)) continue;
    try {
      if (fs.FileExists(p)) {
        j.bytes += utils.GetFileSize(p) || 0;
        fs.DeleteFile(p, true);
        j.nf++;
      }
    } catch (e) {}
  }
  if (
    j.ki < j.keys.length ||
    j.ei < j.ext.length ||
    (fs && j.fi < j.files.length)
  ) {
    artDiskLater("sweep", artDiskSweepStep, ARTDISK_SWEEP_STEP_MS);
    return;
  }
  if (j.nk || j.nc || j.nf || j.nx)
    console.log(
      "Verdant: artwork cache swept -- " +
        fmtNum(j.nk) +
        " gone from the library, " +
        fmtNum(j.nc) +
        " replaced, " +
        fmtNum(j.nx) +
        " with a changed cover file, " +
        fmtNum(j.nf) +
        " orphaned " +
        (j.nf === 1 ? "file" : "files") +
        " (" +
        fmtBytes(j.bytes) +
        " reclaimed)",
    );
  artDiskSweepJob = null;
}
/* ART_MAXPX is in the directory name so that raising the cap orphans the old tree
   instead of serving soft images out of it, but orphaning is only half an answer, since
   the files are still there and nothing counts or clears them. DeleteFolder is
   recursive, so the guard is stricter than the one on a single file: the name must be
   exactly v<digits>-<digits>, it must sit directly inside the verdant-cache folder this
   module built out of fb.ProfilePath, and it must not be the tree in use. */
function artDiskSibSane(dir) {
  if (!artDiskProf_ || !dir || !artDiskRoot_) return false;
  var base = (artDiskProf_ + "verdant-cache\\").toLowerCase(),
    d = String(dir);
  if (d.charAt(d.length - 1) === "\\") d = d.substring(0, d.length - 1);
  if (d.toLowerCase().substring(0, base.length) !== base) return false;
  var nm = d.substring(base.length);
  if (!/^v\d+-\d+$/.test(nm)) return false;
  return base + nm.toLowerCase() + "\\" !== artDiskRoot_.toLowerCase();
}
function artDiskSweepSiblings() {
  var fs = artDiskFS();
  if (!fs || !artDiskProf_) return 0;
  var dirs = artDiskGlob(artDiskProf_ + "verdant-cache\\*", 0, FILE_ATTR_DIR),
    i,
    d,
    gone = 0;
  for (i = 0; i < dirs.length; i++) {
    d = String(dirs[i]);
    if (d.charAt(d.length - 1) === "\\") d = d.substring(0, d.length - 1);
    if (!artDiskSibSane(d)) continue;
    try {
      if (fs.FolderExists(d)) {
        fs.DeleteFolder(d, true);
        gone++;
      }
    } catch (e) {}
  }
  if (gone)
    console.log(
      "Verdant: removed " +
        fmtNum(gone) +
        " artwork cache " +
        (gone === 1 ? "tree" : "trees") +
        " left by an earlier cover size",
    );
  return gone;
}
