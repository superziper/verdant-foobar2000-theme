/* verdant/data/lyrfetch.js -- lyrics from LRCLIB, for the tracks that have none of
   their own. Loaded by main.js; every module shares one global scope, so load order is
   set there. */

/* The last tier of data/lyrics.js: a .lrc beside the track wins, the track's own tags win next, and only when BOTH are empty does anything here run. That ordering is what keeps this feature from overwriting or second-guessing a lyric the user already has; three further limits, all deliberate:
     - it runs only from loadLyrics, so nothing is fetched in the background or for tracks nobody looked at
     - one request in flight, ever, since the user can only read one lyric at a time anyway
     - a miss is REMEMBERED, so a track with genuinely no lyrics online is asked about once a month rather than every play
   LRCLIB: free, needs no key, and the same source the user's own download pipeline uses. */

var LYF_BASE = "https://lrclib.net/api";
/* Identifies the client, as LRCLIB asks, and nothing else -- no track history, no user,
   no path. The repository stands in for a contact address, and there is no version
   string because a number here would quietly rot every time the theme is released. */
var LYF_UA =
  "Verdant (foobar2000 theme; +https://github.com/superziper/verdant-foobar2000-theme)";
var LYF_GATE = 5; // seconds a candidate's duration may differ from the track's
var LYF_MISS_DAYS = 30; // how long "nothing online" is believed before asking again
var LYF_BACKOFF_MS = 600000; // 10 min of silence after the server says it has had enough
var LYF_FLUSH_MS = 5000;

var lyfTask = 0; // the one in-flight task id; 0 when idle
var lyfKind = ""; // 'get' | 'search' -- which endpoint the in-flight task is
var lyfQ = null; // {path,artist,title,album,dur} the request belongs to
var lyfState = ""; // '' not asked | 'off' | 'busy' | 'none' | 'err' | 'wait'
var lyfForce = false; // an explicit "Fetch now": ignores both the switch and the miss file
var lyfUntil = 0; // backoff deadline
var lyfMiss = null; // md5(path) -> day number
var lyfMissDirty = false,
  lyfFlushT = null;

function lyrShown() {
  return rightTab === "lyrics" || (fsMode && fsView === "lyrics");
}
function lyfDay() {
  return Math.floor(Date.now() / 86400000);
}
function lyfSafe(what, fn) {
  try {
    return fn();
  } catch (e) {
    try {
      console.log(
        "Verdant: lyrics fetch -- " +
          what +
          " failed and was skipped (" +
          e +
          ")",
      );
    } catch (e2) {}
    return null;
  }
}

/* ------------------------- the miss file ------------------------- */
/* Paths are HASHED, not stored: the file sits in the profile folder in plain text, and
   a library path can say a great deal about its owner. A hash answers the only question
   this file is for, which is whether this one has been asked about already, and nothing
   else -- the same reasoning as the art index. */
function lyfDir() {
  var p = lyfSafe("profile path", function () {
    return artDiskProfile();
  });
  return p ? p + "verdant-cache\\" : "";
}
function lyfMissPath() {
  var d = lyfDir();
  return d ? d + "lyrics-miss.txt" : "";
}
function lyfHash(path) {
  return (
    lyfSafe("hash", function () {
      return utils.MD5(String(path).toLowerCase());
    }) || ""
  );
}
function lyfMissLoad() {
  lyfMiss = Object.create(null);
  var p = lyfMissPath();
  if (!p) return;
  var raw = lyfSafe("miss read", function () {
    return utils.IsFile(p) ? utils.ReadUTF8(p) : "";
  });
  if (!raw) return;
  var lines = String(raw).split(/\r?\n/),
    today = lyfDay(),
    i,
    f,
    d;
  for (i = 0; i < lines.length; i++) {
    if (!lines[i] || lines[i].charAt(0) === "#") continue;
    f = lines[i].split("\t");
    if (f.length < 2 || !/^[0-9a-f]{32}$/i.test(f[0])) continue;
    d = parseInt(f[1], 10);
    if (!isFinite(d) || today - d >= LYF_MISS_DAYS) continue; // expired entries are simply not loaded
    lyfMiss[f[0]] = d;
  }
}
function lyfMissed(path) {
  if (!lyfMiss) lyfMissLoad();
  var h = lyfHash(path);
  if (!h) return false;
  var d = lyfMiss[h];
  return d !== undefined && lyfDay() - d < LYF_MISS_DAYS;
}
function lyfMissAdd(path) {
  if (!lyfMiss) lyfMissLoad();
  var h = lyfHash(path);
  if (!h) return;
  lyfMiss[h] = lyfDay();
  lyfMissDirty = true;
  lyfFlushLater();
}
/* Removing a remembered miss is what makes "Fetch now" and a manual Remove mean what they say:
   without it the next automatic look-up would be skipped for a month on the strength of an answer
   the user has explicitly asked to be re-taken. */
function lyfMissDrop(path) {
  if (!lyfMiss) lyfMissLoad();
  var h = lyfHash(path);
  if (!h || lyfMiss[h] === undefined) return;
  delete lyfMiss[h];
  lyfMissDirty = true;
  lyfFlushLater();
}
// Same reasoning as on_http_request_done: a throw out of a timer callback ends the panel, and
// losing a remembered miss is not a reason for that to happen.
function lyfFlushLater() {
  if (lyfFlushT) return;
  lyfFlushT = window.SetTimeout(function () {
    lyfFlushT = null;
    lyfSafe("miss flush", function () {
      lyfFlush();
    });
  }, LYF_FLUSH_MS);
}
function lyfFlush() {
  if (!lyfMissDirty || !lyfMiss) return;
  var p = lyfMissPath();
  if (!p) {
    lyfMissDirty = false;
    return;
  }
  var out = ["#verdant-lyrmiss 1"],
    k;
  for (k in lyfMiss) {
    if (Object.prototype.hasOwnProperty.call(lyfMiss, k))
      out.push(k + "\t" + lyfMiss[k]);
  }
  lyfSafe("miss write", function () {
    utils.CreateFolder(lyfDir());
    utils.WriteTextFile(p, out.join("\r\n") + "\r\n", false);
  });
  lyfMissDirty = false;
}

/* ------------------------- asking ------------------------- */
function lyfCancel() {
  lyfTask = 0;
  lyfKind = "";
  lyfQ = null;
  lyfForce = false;
  if (lyfState === "busy") lyfState = "";
}
/* Re-ask for the track on screen. loadLyrics is keyed by path and would otherwise not run again
   until the track changed, which would leave the pane claiming there are no lyrics for as long as
   this one plays. */
function lyfRetry() {
  lyfState = "";
  lyricsFor = null;
}
function lyfNow() {
  if (!NP) return;
  lyfMissDrop(NP.Path);
  lyfForce = true;
  lyfState = "";
  lyricsFor = null;
  repaintAll();
}
/* Status line for the pane. Separate from the state itself so the two views cannot drift into
   describing the same situation differently. */
function lyfStatusText() {
  if (lyfState === "busy") return "Looking for lyrics online...";
  if (lyfState === "none") return "No lyrics for this track online either.";
  if (lyfState === "err") return "Could not reach the lyrics service.";
  if (lyfState === "wait")
    return "Lyrics service is busy -- will try again later.";
  if (lyfState === "off") return "Online lyrics lookup is off.";
  return "No .lrc or .txt beside this track, and none in its tags.";
}
function lyfTF(tf, h) {
  var v = "";
  try {
    v = tf.EvalWithMetadb(h) || "";
  } catch (e) {
    v = "";
  }
  return String(v).trim();
}
/* Called by loadLyrics when a track has nothing local. Everything that would make a request
   pointless is checked HERE rather than at the callback, because the cheapest request is the one
   never sent. */
function lyfWant(h, path) {
  var force = lyfForce;
  lyfForce = false;
  if (!h || !path) {
    lyfState = "";
    return;
  }
  if (!LYR_FETCH_ON && !force) {
    lyfState = "off";
    return;
  }
  if (lyfTask) {
    lyfState = "busy";
    return;
  } // one at a time; this track gets its turn later
  if (Date.now() < lyfUntil && !force) {
    lyfState = "wait";
    return;
  }
  if (!force && lyfMissed(path)) {
    lyfState = "none";
    return;
  }

  var artist = lyfTF(TF.artist, h),
    title = lyfTF(TF.title, h);
  if (!artist || !title) {
    lyfState = "none";
    return;
  } // nothing to search on
  var dur = parseInt(lyfTF(TF.lensec, h), 10);
  if (!isFinite(dur) || dur <= 0) dur = 0;
  lyfQ = {
    path: path,
    artist: artist,
    title: title,
    album: lyfTF(TF.album, h),
    dur: dur,
  };
  lyfSend("get");
}
function lyfUrl(kind) {
  var q = lyfQ,
    u;
  if (kind === "get") {
    u =
      LYF_BASE +
      "/get?artist_name=" +
      encodeURIComponent(q.artist) +
      "&track_name=" +
      encodeURIComponent(q.title);
    if (q.album) u += "&album_name=" + encodeURIComponent(q.album);
    if (q.dur) u += "&duration=" + q.dur;
    return u;
  }
  return (
    LYF_BASE +
    "/search?artist_name=" +
    encodeURIComponent(q.artist) +
    "&track_name=" +
    encodeURIComponent(q.title)
  );
}
function lyfSend(kind) {
  if (!lyfQ) return;
  var hdr = JSON.stringify({
    "User-Agent": LYF_UA,
    Accept: "application/json",
  });
  var id = lyfSafe("request", function () {
    return utils.HTTPRequestAsync(0, lyfUrl(kind), hdr);
  });
  if (!id) {
    lyfState = "err";
    lyfQ = null;
    return;
  }
  lyfTask = id;
  lyfKind = kind;
  lyfState = "busy";
}

/* ------------------------- answering ------------------------- */
/* Synced beats plain, then closest duration, and the duration GATE is the important
   half: LRCLIB will happily return a different song of the same name, and a lyric that
   is 90 seconds too long rolls confidently through the wrong words. A candidate outside
   the gate is dropped rather than demoted, so if nothing is left, the honest answer is
   that nothing was found. */
function lyfPick(arr, dur) {
  var best = null,
    bs = -1,
    i,
    c,
    txt,
    cd,
    off,
    s;
  for (i = 0; i < arr.length; i++) {
    c = arr[i];
    if (!c) continue;
    /* LRCLIB marks instrumentals, and that flag is worth more than the empty lyric field that
       usually comes with it: a search for "Song - Instrumental" can return the VOCAL cut, whose
       duration is often identical, so the duration gate would wave it straight through and the
       pane would roll a full set of words over a track that has none. */
    if (c.instrumental === true) continue;
    txt = c.syncedLyrics || c.plainLyrics;
    if (!txt || !/\S/.test(String(txt))) continue;
    cd = Number(c.duration || 0);
    off = dur && cd ? Math.abs(cd - dur) : 0;
    if (dur && cd && off > LYF_GATE) continue;
    s =
      (c.syncedLyrics ? 1000 : 0) + (100 - Math.min(100, Math.round(off * 10)));
    if (s > bs) {
      bs = s;
      best = c;
    }
  }
  return best;
}
/* A fetched lyric is SHOWN, not saved: nothing is written to the music folder until the
   user presses Save in the editor, so the pane can say not-saved-yet and mean it, at
   the cost of re-fetching a never-saved lyric on every play. The marker lines are built
   into the text here rather than at save time, so they are what the editor opens on and
   what Save therefore keeps, which is what makes the badge survive with no bookkeeping
   anywhere else. */
function lyfBody(text, prov) {
  var body = String(text).replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n");
  return "[re:Verdant]\r\n[source:" + prov + "]\r\n" + body;
}
/* The reply may belong to a track the user has already left, in which case there is nothing to
   show and -- now that nothing is written either -- nothing at all to do with it. */
function lyfApply(path, text, prov) {
  if (path !== lyricsFor) return;
  lyFile = ""; // nothing on disk yet; Save decides where it lands
  lySource = "fetched";
  lyFetched = lyfBody(text, prov); // the exact text the editor will open on
  lyrics = parseLyrics(lyFetched);
  lyReset();
  lyfState = "";
}
function lyfMisscount(path) {
  if (path) lyfMissAdd(path);
  if (path === lyricsFor) lyfState = "none";
}
/* A want that arrived while the single lane was busy never got to ask -- loadLyrics is keyed by
   path and will not run again for that track, so without this the pane would sit on "Looking for
   lyrics online..." for as long as the track played. The lane is free now, so let it ask. */
function lyfHttpDone(task_id, success, response_text, status) {
  if (!lyfHandle(task_id, success, response_text, status)) return;
  if (!lyfTask && lyfState === "busy") {
    lyfRetry();
    if (lyrShown()) repaintAll();
  }
}
function lyfHandle(task_id, success, response_text, status) {
  if (!task_id || task_id !== lyfTask) return false; // not ours, or already cancelled
  var kind = lyfKind,
    q = lyfQ;
  lyfTask = 0;
  lyfKind = "";
  if (!q) {
    lyfState = "";
    return true;
  }

  /* 429/503 is the server asking to be left alone. Respected for everything, including the track
     on screen, and NOT recorded as a miss -- the answer was never about this track's lyrics. */
  if (status === 429 || status === 503) {
    lyfUntil = Date.now() + LYF_BACKOFF_MS;
    lyfQ = null;
    if (q.path === lyricsFor) lyfState = "wait";
    if (lyrShown()) repaintAll();
    return true;
  }
  if (!success || status === 404 || !response_text) {
    if (kind === "get" && status === 404) {
      lyfSend("search");
      if (lyrShown()) repaintAll();
      return true;
    }
    lyfQ = null;
    if (!success && status !== 404) {
      if (q.path === lyricsFor) lyfState = "err";
    } else lyfMisscount(q.path);
    if (lyrShown()) repaintAll();
    return true;
  }

  var data = null;
  try {
    data = JSON.parse(response_text);
  } catch (e) {
    data = null;
  }
  var picked = null;
  if (data) {
    if (Object.prototype.toString.call(data) === "[object Array]")
      picked = lyfPick(data, q.dur);
    else picked = lyfPick([data], q.dur);
  }
  /* An exact match that says "this track is instrumental" is a definitive answer, not a near miss.
     Searching after it would be asking the same server the same question less precisely, and the
     library this was built against has 204 instrumentals -- that is 204 pointless second requests
     and 204 chances to come back with the vocal cut's lyrics instead. */
  if (data && data.instrumental === true && kind === "get") {
    lyfQ = null;
    lyfMisscount(q.path);
    if (lyrShown()) repaintAll();
    return true;
  }
  if (!picked && kind === "get") {
    lyfSend("search");
    if (lyrShown()) repaintAll();
    return true;
  }

  lyfQ = null;
  if (!picked) {
    lyfMisscount(q.path);
    if (lyrShown()) repaintAll();
    return true;
  }
  var text = picked.syncedLyrics || picked.plainLyrics;
  lyfApply(q.path, String(text), "LRCLIB");
  if (lyrShown()) repaintAll();
  return true;
}
