/* verdant/data/artdisk.js -- album art, cached on disk so it survives a restart
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* ---- the tier below artCache -------------------------------------------------------------
   data/art.js keeps decoded covers in RAM, which is the fastest thing there is -- and which is
   gone the moment foobar2000 closes. foobar's media library caches TAGS, never artwork, so every
   launch re-read every cover from the source: measured at ~48ms of CPU per cover (28ms to decode
   a 3000px source, 19.6ms to resize it, and that resize runs ON the script thread inside the
   arrival callback), plus whatever the storage costs. On a WebDAV or SMB library that last part
   is a network round trip for ~1.7MB per album, on every single launch.

   This module adds a middle tier. It does NOT replace artCache, and nothing on the drawing path
   knows it exists -- getArtK, getThumb, maskedArt, mosaicImg and artHue all read artCache and
   artCache only. It lives inside startArt, which already ran off the hit path, so with the cache
   off the behaviour is byte for byte what it was before:

     L1  artCache        decoded bitmap, already in hand        ~0ms
     L2  here            read ~31KB + decode a 500px JPEG       ~1ms     <- this file
     L3  the source      read + decode + resize                 ~48ms + I/O

   An L2 hit also skips the on-thread resize entirely, because what is stored is already no wider
   than ART_MAXPX -- so the `img.Width>ART_MAXPX` branch in startArtSource never fires. That is
   the ~19.6ms a cover used to cost the script thread, and it is why a warm launch stops stalling.

   Staleness and size are both handled, and both are described where they live, further down: the
   library callbacks and the stamp between them decide when an entry is wrong, the LRU budget
   decides when there are too many, and a sweep a few seconds after startup collects what neither
   noticed. The one case nothing can see is an external cover file swapped under an unchanged audio
   file; see the note above artDiskDropHandles. */

/* ---- where it lives ----
   A SIBLING of the theme folder, never inside it: tools\deploy.ps1 and tools\install.ps1 both
   robocopy profile\verdant\ with /MIR, which purges anything there that is not in the repo -- a
   cache under it would be deleted on every dev sync and every reinstall.

   The profile root is also where the bundled component already writes its own cache
   (verdant-drp-art.txt, see native\foo_verdant\src\presence.cpp), so all Verdant state sits in one
   place and follows a portable install.

   ART_MAXPX is in the directory name on purpose. It is the one constant that makes a cached file
   WRONG rather than merely different -- a 500px file served after the cap was raised to 800 is a
   soft image with nothing to notice it -- so changing it orphans the old tree instead of poisoning
   the new one. (ART_DOWNSCALE is not in the name: it changes quality, not size, and the result is
   downscaled again before it is ever drawn.) */
var artDiskProf_='', artDiskRoot_=null, artDiskIdx=null, artDiskDead=false;   // index: key -> {img,stamp,col,bytes,at}
/* Two gates, because the two directions fail independently.

   LIVE covers reading and index bookkeeping. It is a narrower thing than merely having an index:
   the index is also loaded when the setting is OFF, so the Settings page can still report what an
   earlier session left on disk and Clear can still reclaim it. Without that, switching off strands
   the files with nothing in the UI able to see or remove them.

   WRITABLE is live AND not given up on. A disk that has filled up, or a profile that turned out to
   be read-only, stops new covers being written -- but it does not stop the covers already there
   from being perfectly readable, and throwing those away too would turn a storage problem into a
   performance regression. So artDiskDead holds back writes only. */
function artDiskLive(){ return ARTDISK_ON && !!artDiskIdx; }
function artDiskWritable(){ return artDiskLive() && !artDiskDead; }

/* ---- nothing in here may take the panel down ----
   Every background pass in this file is entered from a timer, and an exception out of a timer
   callback is not something JSplitter contains: it ends the script, and the script is the whole
   panel -- no artwork, no transport, no lists -- until a reload. Housekeeping for a CACHE has no
   business being able to do that, and the covers already on disk read perfectly well either way.

   None of the passes below is expected to throw. That is exactly why they are wrapped: the failure
   worth guarding against is the one nobody predicted, and the cost of being wrong about it is the
   user's entire interface rather than one missing cover.

   It logs and returns. It deliberately does NOT stand the cache down -- one bad sweep is no reason
   to stop serving art that is sitting there and loading fine. */
function artDiskSafe(what,fn){
  try{ fn(); }
  catch(e){ console.log('Verdant: artwork cache -- '+what+' failed and was skipped ('+e+')'); }
}
function artDiskLater(what,fn,ms){
  return window.SetTimeout(function(){ artDiskSafe(what,fn); },ms);
}

/* fb.ProfilePath is not documented to say which form it returns, and foobar hands profile paths
   out in its own URI form elsewhere -- presence.cpp has to strip exactly this. Normalising both
   ends costs nothing, and a wrong guess here would put the cache somewhere surprising. */
function artDiskProfile(){
  var p='';
  try{ p=fb.ProfilePath||''; }catch(e){ p=''; }
  if(!p) return '';
  if(p.substring(0,7).toLowerCase()==='file://') p=p.substring(7);
  var c=p.charAt(p.length-1);
  if(c!=='\\' && c!=='/') p+='\\';
  return p;
}
// utils.CreateFolder is not documented to create intermediate levels, so each one is made in turn.
// It is harmless on a folder that already exists.
function artDiskMkdir(path){ try{ utils.CreateFolder(path); }catch(e){} }
function artDiskIndexPath(){ return artDiskRoot_+'index.txt'; }
/* The file name is DERIVED from the key, never read out of the index. That is what keeps the
   delete paths safe: index.txt is a plain text file a user may hand-edit, and a
   path taken from it could point anywhere at all. An MD5 can only ever name a file inside the
   cache. The first byte shards the tree, so a large library does not land 10,000 files in one
   directory. */
function artDiskHash(key){ try{ return utils.MD5(key)||''; }catch(e){ return ''; } }
function artDiskFile(key){ var h=artDiskHash(key); return h?(artDiskRoot_+h.substring(0,2)+'\\'+h+'.jpg'):''; }
function artDiskShard(key){ var h=artDiskHash(key); return h?(artDiskRoot_+h.substring(0,2)):''; }

/* ---- the index ----
   One line per album, tab separated:   key  img  stamp  colour  bytes  atime
     key     the albKey ('%album artist% - %album%'), escaped below
     img     1 = a file is on disk, 0 = this album HAS no art (see artDiskPut)
     stamp   '%last_modified%|<FileSize>' of the track the art came from -- both read from the
             metadb, so validating against it later costs nothing and touches no network
     colour  the dominant colour, once artHue has had reason to compute one; '-' until then
     bytes   file size, so a size budget can be evaluated without stat-ing every file
     atime   last use, for LRU eviction later
     src     the EXTERNAL file the art came from (a cover.jpg beside the tracks), or empty when
             the art is embedded in the audio file. Which of the two it is decides how the entry
             is validated, so it has to be recorded rather than guessed -- see artDiskExternal.
     agg     '<track count>|<newest %last_modified%>' across the album, as the library last
             reported it. Any change to the album's files moves it -- see artDiskLibScan.
   Lines written before this field existed have six fields instead of seven; they parse as
   embedded, which is what they were validated as when they were written.
   Only the key can contain anything awkward, so only the key is escaped -- percent-style, because
   it round trips exactly and leaves an ordinary key perfectly readable in the file. */
/* Every map in this file is keyed by an album key, and album keys come from tags -- and, the part
   that actually matters, from index.txt, which is a plain text file a user can edit. So a key can
   be the string 'hasOwnProperty', or '__proto__'. Both break an ordinary object used as a map, in
   ways that are not obvious: the first SHADOWS the method, so the next membership test in this
   file throws TypeError instead of answering; the second is swallowed by the prototype setter and
   never becomes an entry at all. Neither needs a malicious file, only an odd one.

   So every map here is prototype-less, which makes '__proto__' an ordinary key, and every
   membership test goes through artDiskOwn, which calls the method off Object.prototype rather than
   off the map and cannot be shadowed by anything the map contains. */
function artDiskMap(){ return Object.create(null); }
var artDiskOwn_=Object.prototype.hasOwnProperty;
function artDiskOwn(m,k){ return !!m && artDiskOwn_.call(m,k); }

function artDiskEsc(s){ return String(s).replace(/%/g,'%25').replace(/\t/g,'%09').replace(/\r/g,'%0D').replace(/\n/g,'%0A'); }
function artDiskUnesc(s){ return s.replace(/%09/g,'\t').replace(/%0D/g,'\r').replace(/%0A/g,'\n').replace(/%25/g,'%'); }
function artDiskNow(){ return Math.round(Date.now()/1000); }

var ARTDISK_HEAD='#verdant-artcache 3';   // 2 added src, 3 added agg; older lines parse fine
function artDiskParse(){
  var txt='';
  try{ txt=utils.ReadTextFile(artDiskIndexPath()); }catch(e){ txt=''; }
  if(!txt) return;
  var lines=txt.split('\n'), n=0, b=0, i, ln, f, key;
  for(i=0;i<lines.length;i++){
    ln=lines[i];
    if(!ln) continue;
    if(ln.charAt(ln.length-1)==='\r') ln=ln.substring(0,ln.length-1);
    if(!ln || ln.charAt(0)==='#') continue;
    f=ln.split('\t');
    if(f.length<6) continue;                       // truncated by a kill mid-write: skip it, refetch
    key=artDiskUnesc(f[0]);
    if(!key) continue;
    artDiskIdx[key]={ img:(f[1]==='1'), stamp:f[2], col:(f[3]==='-'?-1:parseInt(f[3],10)),
                      bytes:(parseInt(f[4],10)||0), at:(parseInt(f[5],10)||0),
                      src:(f.length>6?artDiskUnesc(f[6]):''),
                      agg:(f.length>7?artDiskUnesc(f[7]):'') };
    b+=artDiskIdx[key].bytes;
    n++;
  }
  artDiskCount=n; artDiskBytes=b;
}
/* Written by full rewrite on a timer rather than appended to. The index is small (about 120 bytes
   an album, so ~48KB for a 400-album library), a rewrite compacts it for free, and there is only
   one code path to get wrong. The cost is that being killed loses up to ARTDISK_FLUSH_MS of
   entries -- which costs one refetch each, never a wrong pixel. */
var artDiskFT=null, artDiskCount=0, artDiskBytes=0, ARTDISK_FLUSH_MS=4000;
function artDiskTouch(){ if(artDiskIdx && !artDiskFT) artDiskFT=artDiskLater('index write',artDiskFlush,ARTDISK_FLUSH_MS); }
function artDiskFlush(){
  if(artDiskFT){ window.ClearTimeout(artDiskFT); artDiskFT=null; }
  if(!artDiskIdx) return;
  var out=[ARTDISK_HEAD], k, e, n=0, b=0;
  for(k in artDiskIdx){
    if(!artDiskOwn(artDiskIdx,k)) continue;
    e=artDiskIdx[k];
    out.push(artDiskEsc(k)+'\t'+(e.img?'1':'0')+'\t'+e.stamp+'\t'+(e.col===-1?'-':String(e.col))
             +'\t'+e.bytes+'\t'+e.at+'\t'+artDiskEsc(e.src||'')+'\t'+artDiskEsc(e.agg||''));
    n++; b+=e.bytes;
  }
  artDiskCount=n; artDiskBytes=b;   // the running totals, corrected against what was actually written
  try{ utils.WriteTextFile(artDiskIndexPath(),out.join('\r\n')+'\r\n'); }catch(e2){}
}

/* ---- startup ----
   Called from app.js once everything is loaded, so ART_MAXPX and the rest are already there.
   Parsing runs inline rather than deferred: at this size it is a frame, and a cache that is not
   ready for the first paint is a cache the first paint misses entirely. */
/* Called from app.js's init tail, where a throw would abort every line after it -- the memory
   watchdog and the Discord sync among them. Guarded for that reason, not because it is expected
   to fail. */
function artDiskInit(){ artDiskSafe('startup',artDiskStart); }
function artDiskStart(){
  artDiskProf_=artDiskProfile();
  if(!artDiskProf_) return;                                // no profile path: stay off, stay silent
  artDiskRoot_=artDiskProf_+'verdant-cache\\v1-'+ART_MAXPX+'\\';
  // Reading an index a previous session wrote costs one file read and no network, and it is what
  // lets the page answer "how much is on disk" while the cache is off. Creating the folder is a
  // different matter: a switched-off feature has no business leaving directories behind, so that
  // waits until something is actually going to be written into it.
  if(ARTDISK_ON) artDiskMkRoot();
  artDiskIdx=artDiskMap();
  artDiskParse();
  if(ARTDISK_ON){ artDiskPrefillHue(); artDiskSweepLater(); }
}
// Both levels, because utils.CreateFolder is not documented to create intermediates.
function artDiskMkRoot(){ artDiskMkdir(artDiskProf_+'verdant-cache'); artDiskMkdir(artDiskRoot_); }
/* Every colour the index already knows, handed to artHue before anything is drawn. artHue
   otherwise cannot answer until a full bitmap has arrived AND GetColourScheme has run over it, so
   an artist header opens on the placeholder gradient and corrects itself a moment later. These
   entries make it right in the first paint, with no image decoded at all.
   hueCache is dropped by on_metadb_changed, which is correct: after a tag edit the colours should
   be recomputed from the art. They are simply recomputed from L2 rather than from the source. */
function artDiskPrefillHue(){
  var k, e;
  for(k in artDiskIdx){
    if(!artDiskOwn(artDiskIdx,k)) continue;
    e=artDiskIdx[k];
    if(e.img && e.col!==-1 && !artDiskOwn(hueCache,k)) hueCache[k]=e.col;
  }
}
// artHue computes one of these the first time something needs it; keep it, so next launch is free
function artDiskNoteColour(key,col){
  if(!artDiskLive()) return;
  var e=artDiskIdx[key];
  if(!e || !e.img || e.col===col) return;
  e.col=col; artDiskTouch();
}

/* ---- reading ----
   artDiskGet is the whole lookup: an in-memory hash hit, no I/O at all, so startArt can choose a
   tier without touching the disk. 'neg' means this album was looked at and genuinely has no
   artwork -- remembering that is worth as much as remembering the covers, because a miss is the
   EXPENSIVE case: foobar walks the folder for cover.jpg, folder.jpg and the rest before giving up,
   and over WebDAV that is several round trips to learn nothing. */
function artDiskGet(h,key){
  if(!artDiskLive()) return null;
  var e=artDiskIdx[key];
  if(!e) return null;
  if(!artDiskStampOK(e,h)){ artDiskDrop(key); return null; }   // the file moved on: refetch, once
  /* atime orders LRU eviction, so it has to survive a restart -- but dirtying the index on every
     read would mean rewriting it every few seconds for the whole of a browse. An hour's resolution
     is far finer than eviction needs and costs a flush almost never. */
  var now=artDiskNow();
  if(now-e.at>=ARTDISK_AT_COARSE) artDiskTouch();
  e.at=now;
  return e.img?'img':'neg';
}
var ARTDISK_AT_COARSE=3600;
/* Exactly one of artDone or startArtSource must run, exactly once. artDone decrements artInFlight
   and pumps the queue, so a double call drives it negative and over-admits, while a missed call
   leaves it high -- and pumpArt's `artInFlight < artInflightCap()` gate then stops dispatching
   FOREVER, with no error anywhere and a UI stuck on placeholders. The `done` latch is cheap
   insurance against a promise that settles twice. */
function artDiskRead(h,key){
  var done=false, path=artDiskFile(key);
  if(!path){ startArtSource(h,key); return; }
  function fallback(){
    if(done) return; done=true;
    artStatBad++;
    artDiskForget(key);                 // the file is gone or unreadable: fetch it again, once
    startArtSource(h,key);
  }
  try{
    gdi.LoadImageAsyncV2(0,path).then(function(img){
      if(done) return;
      if(!img){ fallback(); return; }
      done=true;
      artStatCache++;
      artDone(key,img); artWarmRepaint();
    },fallback);
  }catch(e){ fallback(); }
}
/* Drops the entry and leaves the file, which is right for its one caller: artDiskRead's fallback,
   where the file has just failed to load and is probably not there at all. If it IS there it is now
   an orphan -- harmless, because nothing can reach a file with no entry naming it -- and the sweep
   collects it. Use artDiskDrop to invalidate an entry whose file is real and has to go. */
function artDiskForget(key){
  if(!artDiskOwn(artDiskIdx,key)) return;
  artDiskCount--; artDiskBytes-=artDiskIdx[key].bytes;
  delete artDiskIdx[key]; artDiskTouch();
}

/* ---- writing ----
   The stamp is read from the metadb, never from the file: %last_modified%, FbMetadbHandle's own
   FileSize and the path are all already in foobar's library database, so building one costs no I/O
   and -- the point -- no network. What the three fields are for is in artDiskStampOK, below.
   Entries written before the path field existed have two fields instead of three; the parser takes
   them as they are and artDiskStampOK treats them as unverifiable rather than as wrong. */
function artDiskStamp(h){
  var ph=artDiskPathHash(h), lm='', sz=0;
  try{ lm=TF.lastmod.EvalWithMetadb(h); }catch(e){ lm=''; }
  try{ sz=h.FileSize||0; }catch(e2){ sz=0; }
  return (ph||'-')+'|'+lm+'|'+sz;
}
/* ---- art that lives in its own file ----
   Not every library embeds its artwork. The common alternative is a cover.jpg (or folder.jpg,
   front.jpg, <album>.jpg -- foobar's own pattern list decides) sitting beside the tracks, and for
   those libraries the embedded-art stamp above is blind in the one way that matters: replacing the
   cover file does not touch any audio file, so nothing in the entry changes and the old cover is
   served for ever. The remedy used to be Clear, by hand, which is no remedy at all for someone who
   does not know the cache exists.

   GetAlbumArtAsyncV2 resolves with a path as well as an image -- the image file when the art is
   external, the track itself when it is embedded (JSplitter: ArtPromiseResult.path). That single
   fact is what makes the two cases separable, so it is recorded at write time and never guessed.

   External entries are stamped from the COVER FILE's own modification time and size, which is
   strictly better than the embedded stamp: the same cover.jpg is named no matter which track of
   the album happened to ask for it, so the stamp is always meaningful rather than being skipped
   whenever a different track comes up (see artDiskStampOK). */
function artDiskNorm(p){
  var s=String(p||'');
  if(s.substring(0,7).toLowerCase()==='file://') s=s.substring(7);
  return s;
}
// '' means embedded: the art came out of the audio file, so the track IS the art's file.
function artDiskExternal(h,src){
  var a=artDiskNorm(src);
  if(!a) return '';
  var t='';
  try{ t=artDiskNorm(h.Path); }catch(e){ return ''; }
  if(!t) return '';
  return (a.toLowerCase()===t.toLowerCase())?'':a;
}
/* The leading '-' is deliberate and load-bearing: it is the "no track hash" marker artDiskStampOK
   already treats as unverifiable, so an external entry costs no I/O on the READ path. Checking it
   needs a real stat, and a stat on a NAS is a network round trip -- small next to re-reading 1.7MB
   of JPEG, but not nothing, and certainly not something to do for every cover on every paint. It
   happens once a session in the sweep instead. */
function artDiskStampFile(path){
  var lm=0, sz=0;
  try{ lm=utils.GetLastModified(path)||0; }catch(e){ lm=0; }
  try{ sz=utils.GetFileSize(path)||0; }catch(e2){ sz=0; }
  return '-|'+lm+'|'+sz;
}
/* Conservative on purpose: it only reports a cover stale when it can positively show that it
   changed. A stat that throws, or that answers with nothing at all, is a storage hiccup -- on a
   network share an everyday one -- and dropping a perfectly good cover on the strength of it would
   turn a blip into a re-download. */
function artDiskFileStampOK(e){
  if(!e || !e.src) return true;
  var there=false;
  try{ there=!!utils.IsFile(e.src); }catch(e1){ return true; }   // cannot tell: leave it alone
  if(!there) return false;                                        // the cover file is gone
  var now=artDiskStampFile(e.src);
  if(now==='-|0|0') return true;                                  // stat told us nothing: do not act
  return e.stamp===now;
}
/* A resolved fetch with no image means foobar looked and found nothing, so that is remembered.
   A REJECTED fetch is not: it may be a transient read error, and on a network library that is
   exactly what a blip looks like. Persisting it would cache "this album has no art" forever on the
   strength of one bad moment, so a rejection is left to L1 for the session and retried next
   launch -- the behaviour that existed before this file. */
var artDiskQ=[], artDiskQT=null, ARTDISK_SLICE=4, ARTDISK_WRITE_MS=100, artDiskFails=0;
function artDiskPut(h,key,img,src){
  if(!artDiskWritable() || artDiskOwn(artDiskIdx,key)) return;
  var ext=artDiskExternal(h,src);
  var stamp=ext?artDiskStampFile(ext):artDiskStamp(h);
  if(!img){ artDiskIdx[key]={img:false,stamp:stamp,col:-1,bytes:0,at:artDiskNow(),src:ext,agg:''}; artDiskCount++; artDiskTouch(); return; }
  artDiskQ.push([key,img,stamp,ext]);
  if(!artDiskQT) artDiskQT=artDiskLater('cover write',artDiskDrain,ARTDISK_WRITE_MS);
}
/* Encoding is cheap -- a 500px JPEG measured at 0.46ms -- but SaveAs is synchronous on the script
   thread and this thread also draws, so writes go a few per tick rather than inside the arrival
   callback. The queue holds a reference to a bitmap that is already in artCache, so it costs no
   extra memory unless artCache evicts it first; the slice is sized so the queue stays short. */
function artDiskDrain(){
  artDiskQT=null;
  var n=0, it;
  while(artDiskQ.length && n<ARTDISK_SLICE){
    it=artDiskQ.shift(); n++;
    artDiskWrite(it[0],it[1],it[2],it[3]);
  }
  artDiskEnforce();          // once per slice: the sort it may trigger is not worth doing per file
  if(artDiskQ.length) artDiskQT=artDiskLater('cover write',artDiskDrain,ARTDISK_WRITE_MS);
}
/* A write that fails is not recorded, so the album is simply fetched again next time. Ten failures
   in a row is not bad luck though -- it is a full disk, a read-only profile, or a path that cannot
   be created -- and retrying every cover for the rest of the session would cost real thread time
   for nothing, so the tier stands down and leaves artCache to do what it always did. */
var ARTDISK_MAXFAIL=10;
function artDiskWrite(key,img,stamp,src){
  var path=artDiskFile(key);
  if(!path) return;
  var ok=false;
  try{
    artDiskMkdir(artDiskShard(key));
    ok=(img.SaveAs(path,'image/jpeg')!==false);
  }catch(e){ ok=false; }
  if(!ok){
    if(++artDiskFails>=ARTDISK_MAXFAIL){
      console.log('Verdant: not caching new artwork -- '+ARTDISK_MAXFAIL+' writes failed in a row ('+artDiskRoot_
                  +'). Covers already cached are still being used.');
      artDiskDead=true; artDiskStop();
    }
    return;
  }
  artDiskFails=0;
  var bytes=0;
  try{ bytes=utils.GetFileSize(path)||0; }catch(e2){ bytes=0; }
  artDiskIdx[key]={img:true,stamp:stamp,col:-1,bytes:bytes,at:artDiskNow(),src:src||'',agg:''};
  artDiskCount++; artDiskBytes+=bytes;
  artDiskTouch();
}
/* Stops the tier for this session without touching a single file. Dropping the queue matters:
   those are encodes nobody asked for any more, and they would otherwise keep landing on the script
   thread after the reason for them is gone. artCache is deliberately left alone -- it is still
   perfectly valid, and clearing it would drop every visible cover to a placeholder and re-gate
   every section, which is a visible fault where there was none. */
function artDiskStop(){
  artDiskFlush();
  if(artDiskQT){ window.ClearTimeout(artDiskQT); artDiskQT=null; }
  if(artDiskEvictT){ window.ClearTimeout(artDiskEvictT); artDiskEvictT=null; }
  if(artDiskSweepT){ window.ClearTimeout(artDiskSweepT); artDiskSweepT=null; }
  artDiskQ=[]; artDiskEvictJob=null; artDiskSweepJob=null;
}
/* Switching off stops reads and writes and drops the pending encodes -- work nobody asked for any
   more, which would otherwise keep landing on the script thread after the reason for it is gone.
   It does NOT forget what is on disk: the index stays loaded so the size is still reportable and
   still clearable. artCache is deliberately untouched, which is what makes the toggle invisible on
   screen rather than a settings click that drops every cover to a placeholder. */
function artDiskSuspend(){ artDiskStop(); }
// Switching back on does NOT re-scan anything: the cache simply fills again as you browse. The
// folder may not exist yet, because it was never created while the setting was off.
function artDiskResume(){
  artDiskDead=false;
  if(!artDiskIdx){ artDiskInit(); return; }
  artDiskMkRoot(); artDiskPrefillHue(); artDiskSweepLater();
}

/* ---- what actually happened, per launch -----------------------------------------------------
   Issue #2 asks a question this file cannot answer by assertion: is the artwork on screen coming
   from the cache, or is the library being read again every launch? The only honest answer is a
   count, so the three tiers each keep one, and one line of console says how the launch went.

   This is also the measurement for a library on a NAS. Every cover served from the source is a
   read over whatever the library sits on -- for the reporter, a WebDAV round trip for roughly
   1.7MB. The transport is incidental: `from the library` is the number that costs, and it is the
   number to watch. Zero of them is zero requests, over any transport.

   It reports once, when the art queues have gone quiet, because a count taken while the warm pass
   is still running would just be a snapshot of a race. */
var artStatCache=0, artStatNeg=0, artStatSrc=0, artStatSrcMs=0, artStatBad=0;
var ARTSTAT_MS=6000, artStatT=null, artStatDone=false;
function artStatLater(){
  if(artStatDone || artStatT) return;
  artStatT=artDiskLater('startup summary',artStatReport,ARTSTAT_MS);
}
function artStatReport(){
  artStatT=null;
  // still fetching: come back once it has settled, or the numbers describe a moment, not a launch
  if(artInFlight || artQueue.length || artGateQueue.length || artWarmQueue.length){ artStatLater(); return; }
  artStatDone=true;
  var total=artStatCache+artStatNeg+artStatSrc;
  if(!total) return;                       // nothing was asked for: nothing worth saying
  var msg='Verdant: artwork -- '+fmtNum(artStatCache)+' from the disk cache, '
          +fmtNum(artStatSrc)+' read from the library';
  if(artStatSrc) msg+=' in '+(artStatSrcMs/1000).toFixed(1)+'s';
  if(artStatNeg) msg+=', '+fmtNum(artStatNeg)+' already known to have none';
  if(artStatBad) msg+=', '+fmtNum(artStatBad)+' cache files unreadable';
  if(!ARTDISK_ON) msg+='  (the disk cache is switched off)';
  console.log(msg+'.');
}

/* ---- what the Settings page shows ----
   Both are running totals kept by the writers above and corrected on every flush, so the page can
   ask on every paint without stat-ing a single file. The count includes albums remembered as
   having NO art, which is why it says albums rather than covers. */
function artDiskUsage(){ return artDiskBytes; }
function artDiskUsageText(){
  if(!artDiskIdx)    return 'The cache could not be opened, so covers are kept in memory only.';
  if(artDiskDead)    return 'Not caching new covers -- writes keep failing; see the console.';
  if(!ARTDISK_ON)    return artDiskBytes ? ('Covers are kept in memory only. '+fmtBytes(artDiskBytes)+' is still on disk.')
                                         : 'Covers are kept in memory only, and reload on every launch.';
  if(!artDiskCount)  return 'Nothing cached yet -- covers are added as you browse.';
  var lim=artDiskLimit();
  return 'Using '+fmtBytes(artDiskBytes)+' for '+fmtNum(artDiskCount)+' albums'
         +(lim?(', of '+fmtBytes(lim)+' allowed.'):'.');
}

/* ---- deleting ----
   JSplitter has no delete API at all (CreateFolder and CopyFolder, but nothing that removes), so
   this is the one place in the theme that reaches for the Windows scripting host -- the same
   escape hatch ui/chrome.js already uses for UI Wizard. It is also the only code in Verdant that
   destroys anything, so it is deliberately paranoid about where it is pointed.

   Note what is NOT trusted: nothing here takes a path from index.txt. That file is plain text a
   user may hand-edit, and a path read out of it could name anything on the disk. Every path acted
   on is either the root artDiskInit built out of fb.ProfilePath, or one rebuilt from a key's MD5
   and then matched against the exact shape such a path must have. There are three guards, one per
   thing that can be destroyed, and each is the last word on its own: artDiskRootSane for the whole
   tree, artDiskDeletable for one file, artDiskSibSane for an orphaned sibling tree. */
var artDiskFSO=null, artDiskFSOTried=false;
function artDiskFS(){
  if(!artDiskFSOTried){
    artDiskFSOTried=true;
    try{ artDiskFSO=new ActiveXObject('Scripting.FileSystemObject'); }catch(e){ artDiskFSO=null; }
  }
  return artDiskFSO;
}
function artDiskRootSane(){ return !!artDiskRoot_ && artDiskRoot_.indexOf('verdant-cache\\v1-')>0; }
/* One file. The path is rebuilt from the key's MD5 and then checked to be exactly
   <root><2 hex>\<32 hex>.jpg, so the only thing this can remove is a file this module named
   itself: not index.txt, not anything a '..' in a hand-edited key could reach, and nothing at all
   under a root that has stopped looking like the one artDiskInit built. */
function artDiskDeletable(path){
  if(!artDiskRootSane() || !path) return false;
  /* Case-insensitively, because Windows paths are, and because the paths handed to this do not all
     come from the same place: one is built here out of fb.ProfilePath, another comes back from
     utils.Glob carrying whatever case the filesystem recorded. A case-SENSITIVE prefix test lets
     nothing extra through -- it just answers false for a perfectly valid path whose drive letter
     came back lowercased, which quietly stops the orphan sweep ever collecting anything. */
  var p=String(path);
  if(p.substring(0,artDiskRoot_.length).toLowerCase()!==artDiskRoot_.toLowerCase()) return false;
  return /^[0-9a-f]{2}\\[0-9a-f]{32}\.jpg$/i.test(p.substring(artDiskRoot_.length));
}
function artDiskDelFile(key){
  var fs=artDiskFS(); if(!fs) return false;
  var path=artDiskFile(key);
  if(!artDiskDeletable(path)) return false;
  try{ if(fs.FileExists(path)) fs.DeleteFile(path,true); return true; }catch(e){ return false; }
}
// Invalidation, as opposed to artDiskForget's "the file was already gone": entry and file both.
function artDiskDrop(key){
  if(!artDiskOwn(artDiskIdx,key)) return;
  if(artDiskIdx[key].img) artDiskDelFile(key);
  artDiskForget(key);
}
/* The whole tree, not just the files the index knows about -- a reclaim-my-disk action that left
   orphans behind would be a lie about the number it was just showing. The folder is the one this
   module built from fb.ProfilePath, never a path from the index, and artDiskRootSane is the last
   word on that.
   Covers already in artCache stay there and stay on screen: clearing the disk tier is not meant
   to be visible, and those albums are simply written again the next time they are missed. */
function artDiskClear(){
  if(!artDiskRootSane()) return false;
  if(artDiskQT){ window.ClearTimeout(artDiskQT); artDiskQT=null; }
  if(artDiskFT){ window.ClearTimeout(artDiskFT); artDiskFT=null; }
  artDiskQ=[];
  var fs=artDiskFS(), ok=false;
  if(fs){
    try{
      var dir=artDiskRoot_.substring(0,artDiskRoot_.length-1);   // FSO wants no trailing separator
      if(fs.FolderExists(dir)) fs.DeleteFolder(dir,true);
      ok=true;
    }catch(e){ ok=false; }
  }
  if(!ok) console.log('Verdant: could not clear the artwork cache at '+artDiskRoot_);
  if(ARTDISK_ON) artDiskMkRoot();   // off: do not leave a fresh empty folder behind
  artDiskCount=0; artDiskBytes=0;
  if(artDiskIdx){ artDiskIdx=artDiskMap(); if(ARTDISK_ON) artDiskFlush(); }
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

/* ---- invalidation from the library ----
   Called from app.js's on_library_items_removed / _changed, and deliberately BEFORE libChanged():
   albKey() answers out of albKeyCache, which is keyed by file path and still holds the key each
   handle had BEFORE the edit. That OLD key names the index entry that has to go. Once libChanged()
   and on_metadb_changed have dropped albKeyCache the same handle answers with its new key, and the
   stale entry is unreachable from then on -- a wrong cover kept forever for an album that is still
   in the library under a slightly different name.

   An album is dropped whole even when only one of its tracks was touched. The art may well have
   come from the track that went away, and there is no API that says which file foobar read it
   from, so the cheap certain thing beats the clever uncertain one: the cost of being wrong here is
   one refetch, and the cost of being wrong the other way is a cover that never corrects itself.

   This runs with the cache switched OFF too, which is the point of gating on artDiskIdx rather
   than artDiskLive: the files are still on disk, and a stale cover left behind now would be served
   the moment the setting goes back on. */
function artDiskDropHandles(handles){
  var hit=0;
  artDiskSafe('library invalidation',function(){ hit=artDiskDropped(handles); });
  return hit;
}
function artDiskDropped(handles){
  if(!artDiskIdx || !handles) return 0;
  var n=0;
  try{ n=(handles.Count!==undefined)?handles.Count:handles.length; }catch(e){ n=0; }
  if(!n) return 0;
  var i, h, k, seen=artDiskMap(), hit=0;
  for(i=0;i<n;i++){
    h=null;
    try{ h=handles[i]; }catch(e2){ h=null; }
    if(!h) continue;
    k='';
    try{ k=albKey(h); }catch(e3){ continue; }
    if(!k || artDiskOwn(seen,k)) continue;
    seen[k]=1;
    if(artDiskOwn(artDiskIdx,k)){ artDiskDrop(k); hit++; }
  }
  return hit;
}

/* ---- the stamp ----
   It answers one question: is the file this cover came from still the file it came from. Three
   fields -- a hash of the track's path, its %last_modified% and its size -- and all three come out
   of foobar's library database, so checking one costs no I/O and, the whole point, no network.

   The path hash is in there because of something that would otherwise make the stamp worse than
   useless. startArt is handed whatever handle its caller happened to be holding, which for a
   ten-track album is any one of ten tracks, and which one it is differs from launch to launch (see
   requestArt's callers: a playlist walk, a cover pick, a warm pass). A stamp tied to one track
   would therefore mismatch on almost every launch, condemning a perfectly good cover and writing
   it again -- a cache that never hits and does extra work for the privilege. So a stamp from a
   DIFFERENT track is not evidence of anything and is ignored. Only the same track's own timestamp
   and size can condemn an entry. */
function artDiskPathHash(h){
  var p='';
  try{ p=h.Path||''; }catch(e){ return ''; }
  if(!p) return '';
  var x=artDiskHash(p);
  return x?x.substring(0,8):'';
}
/* True means "no reason to doubt it", and every uncertain case answers true on purpose. A cache is
   allowed to be a little stale; throwing away a good cover on a guess costs a refetch for nothing,
   and on the slow library this whole file exists for, that refetch is the exact cost being avoided. */
function artDiskStampOK(e,h){
  if(!e || !e.stamp || !h) return true;
  var f=e.stamp.split('|');
  if(f.length<3 || f[0]==='-') return true;      // written before stamps carried a path: unverifiable
  var ph=artDiskPathHash(h);
  if(!ph || ph!==f[0]) return true;              // another track of the same album: no information,
                                                 // and no title-format eval spent finding that out
  var lm='';
  try{ lm=TF.lastmod.EvalWithMetadb(h); }catch(e2){ return true; }
  var sz=0;
  try{ sz=h.FileSize||0; }catch(e3){ return true; }
  return lm===f[1] && String(sz)===f[2];
}

/* ---- the size budget ----
   A ceiling on the bytes the index accounts for, evaluated after each write slice. Eviction is
   least recently used: artDiskGet stamps `at` on every hit, so what goes is what has gone longest
   without being looked at.

   It evicts down to a LOW mark rather than to the ceiling itself. Sitting exactly at the ceiling,
   every write afterwards is over budget again and re-sorts the whole index to free one file; at 90%
   a single pass buys thousands of writes of headroom. The pass is sliced because at a 1GB limit
   that 10% is some 1,600 files, and an FSO delete is synchronous on the thread that also draws. */
var ARTDISK_LOW=0.9, ARTDISK_EVICT_SLICE=16, ARTDISK_EVICT_MS=120;
var artDiskEvictJob=null, artDiskEvictT=null;
function artDiskLimit(){ return ARTDISK_MB>0?ARTDISK_MB*1048576:0; }
function artDiskEnforce(){
  var lim=artDiskLimit();
  if(!lim || !artDiskIdx || artDiskEvictT || artDiskBytes<=lim) return;
  var keys=[], k;
  for(k in artDiskIdx){
    if(artDiskOwn(artDiskIdx,k) && artDiskIdx[k].bytes>0) keys.push(k);
  }
  keys.sort(function(a,b){ return artDiskIdx[a].at-artDiskIdx[b].at; });
  artDiskEvictJob={list:keys,i:0,low:Math.round(lim*ARTDISK_LOW),lim:lim,freed:0,n:0};
  artDiskEvictStep();
}
function artDiskEvictStep(){
  artDiskEvictT=null;
  var j=artDiskEvictJob;
  if(!j || !artDiskIdx){ artDiskEvictJob=null; return; }
  var n=0, k;
  while(j.i<j.list.length && artDiskBytes>j.low && n<ARTDISK_EVICT_SLICE){
    k=j.list[j.i++]; n++;
    if(!artDiskOwn(artDiskIdx,k)) continue;       // already gone: dropped by the sweep or a callback
    j.freed+=artDiskIdx[k].bytes; j.n++;
    artDiskDrop(k);
  }
  if(j.i<j.list.length && artDiskBytes>j.low){
    artDiskEvictT=artDiskLater('eviction',artDiskEvictStep,ARTDISK_EVICT_MS);
    return;
  }
  if(j.n) console.log('Verdant: artwork cache at its '+fmtBytes(j.lim)+' limit -- removed '+fmtNum(j.n)
                      +(j.n===1?' cover':' covers')+' not seen in the longest ('+fmtBytes(j.freed)+' reclaimed)');
  artDiskEvictJob=null;
}

/* ---- the sweep ----
   Once per session, a few seconds after startup rather than during it. It needs the library's
   album keys, and forcing that evaluation on the launch path would spend the first paint's budget
   on housekeeping -- the very time this cache exists to save. By the time it runs the home view
   has usually warmed libTF anyway, so the list costs nothing.

   Three jobs:
     1. entries whose album is gone from the library, or whose album is still there but is no
        longer made of the same files -- a replaced release under the same artist and title
     2. external cover files that have been replaced, resized or deleted since they were cached --
        the case no callback and no metadb field can see, because swapping a cover.jpg touches no
        audio file and tells foobar nothing. One stat per external entry, here rather than on the
        paint path, so a NAS pays it once a session instead of once a cover
     3. files with no entry pointing at them -- a write that landed after the last flush and then a
        kill, or an entry artDiskForget dropped because the file would not load
     4. sibling v<n>-<px> trees left behind by a change to ART_MAXPX (see the note at the top)

   Job 1 is the one that could do real damage, so it is the one with a guard: if the library answers
   with nothing -- not loaded yet, or an error -- then EVERY key looks dead and this would delete
   the entire cache. A library that is genuinely empty has nothing cached either, so refusing to act
   on an empty answer costs nothing and removes the only way this goes badly wrong. */
var ARTDISK_SWEEP_MS=8000, ARTDISK_SWEEP_SLICE=40, ARTDISK_SWEEP_STEP_MS=140;
var artDiskSwept=false, artDiskSweepT=null, artDiskSweepJob=null;
function artDiskSweepLater(){
  if(artDiskSwept || artDiskSweepT) return;
  artDiskSweepT=artDiskLater('sweep',artDiskSweepRun,ARTDISK_SWEEP_MS);
}
function artDiskSweepRun(){
  artDiskSweepT=null;
  if(artDiskSwept || !artDiskLive() || !artDiskRootSane()) return;
  artDiskSwept=true;                      // once per session either way: a retry loop here would
                                          // re-walk the tree every few seconds for no new answer
  artDiskSweepSiblings();
  var scan=artDiskLibScan(), files=artDiskOrphanFiles(), ext=artDiskExternalKeys();
  var keys=scan.dead.concat(scan.changed), ndead=scan.dead.length;
  if(!keys.length && !files.length && !ext.length) return;
  artDiskSweepJob={keys:keys,files:files,ext:ext,ndead:ndead,ki:0,fi:0,ei:0,nk:0,nc:0,nf:0,nx:0,bytes:0};
  artDiskSweepStep();
}
// Every entry whose art sits in its own file. Collected up front because the stat is the slow
// part and the slices below are what keep it off the drawing thread.
function artDiskExternalKeys(){
  var out=[], k;
  for(k in artDiskIdx){
    if(artDiskOwn(artDiskIdx,k) && artDiskIdx[k].src) out.push(k);
  }
  return out;
}
/* ---- is each cached album still the album that was cached? ----
   The key is '%album artist% - %album%', so replacing an album with a different release that
   carries the same artist and title produces the SAME key, and the lookup hits. The stamp normally
   catches that, and the library callbacks almost always do -- but one combination defeats both:
   the files were swapped while foobar was closed, so no callback ever reached the panel, AND the
   new filenames differ from the old, so the stamp's path hash does not match. A stamp from a
   different track is deliberately treated as no evidence (see artDiskStampOK), so without this the
   old cover would be served indefinitely.

   The aggregate closes it: how many tracks the album has, and the newest %last_modified% among
   them. Add a track, remove one, rename one, replace one, re-tag one, and the pair moves. Both
   halves come out of foobar's library database, so the entire check costs no file I/O and no
   network -- it rides along on the same batched title-format pass the dead-key check already makes.
   The timestamps are foobar's 'YYYY-MM-DD HH:MM:SS', which compares correctly as text, so finding
   the newest needs no date parsing.

   It cannot be built when a cover is written: one handle has no idea what else is on its album, and
   finding out would mean walking the library once per cover. So the sweep both checks the aggregate
   and refreshes it, once a session. An entry that has no aggregate yet is RECORDED, never judged --
   otherwise every entry cached before this existed would be discarded on the first run, which is a
   full refetch of the library to find out that nothing had changed. */
function artDiskLibScan(){
  var out={dead:[],changed:[]}, lib=null, keys=null, mods=null, i, k, m, a, e, now;
  try{ lib=libItems(); }catch(e0){ lib=null; }
  if(!lib || !lib.Count) return out;              // nothing to compare against: do not act
  try{ keys=libTF('albkey'); }catch(e1){ keys=null; }
  if(!keys || !keys.length) return out;           // the same guard, on the other half of the answer
  try{ mods=libTF('lastmod'); }catch(e2){ mods=null; }

  var agg=artDiskMap();
  for(i=0;i<keys.length;i++){
    k=keys[i];
    if(!k) continue;
    m=(mods && i<mods.length)?String(mods[i]||''):'';
    if(!artDiskOwn(agg,k)) agg[k]=[1,m];
    else { a=agg[k]; a[0]++; if(m>a[1]) a[1]=m; }
  }
  for(k in artDiskIdx){
    if(!artDiskOwn(artDiskIdx,k)) continue;
    if(!artDiskOwn(agg,k)){ out.dead.push(k); continue; }
    a=agg[k]; e=artDiskIdx[k]; now=a[0]+'|'+a[1];
    if(!e.agg){ e.agg=now; artDiskTouch(); continue; }   // first sight: record it, do not judge it
    if(e.agg!==now) out.changed.push(k);
  }
  return out;
}
// kept as its own name because it says what it answers; the sweep uses the full scan.
function artDiskDeadKeys(){ return artDiskLibScan().dead; }
/* Enumerated with utils.Glob, not the FileSystemObject: FSO's Folders and Files are IEnumVARIANT
   collections, which JScript walks with `new Enumerator` -- and this is SpiderMonkey, where no such
   constructor exists. Glob takes exclude and include attribute masks, so one call lists the shard
   directories and one call per shard lists its files.
   Every path still has to pass artDiskDeletable before anything happens to it, so a Glob that
   returned something unexpected cannot turn into a delete outside the cache. */
var FILE_ATTR_DIR=0x10;
function artDiskGlob(pattern,exc,inc){
  var a=null;
  try{ a=utils.Glob(pattern,exc,inc); }catch(e){ a=null; }
  return (a && a.length!==undefined)?a:[];
}
function artDiskBase(p){
  var s=String(p);
  if(s.charAt(s.length-1)==='\\') s=s.substring(0,s.length-1);
  var i=s.lastIndexOf('\\');
  return i<0?s:s.substring(i+1);
}
function artDiskOrphanFiles(){
  var out=[], want=artDiskMap(), k, p, i, j;
  if(!artDiskRootSane()) return out;
  for(k in artDiskIdx){
    if(!artDiskOwn(artDiskIdx,k) || !artDiskIdx[k].img) continue;
    p=artDiskFile(k);
    if(p) want[p.toLowerCase()]=1;
  }
  var shards=artDiskGlob(artDiskRoot_+'*',0,FILE_ATTR_DIR), nm, files;
  for(i=0;i<shards.length;i++){
    nm=artDiskBase(shards[i]);
    if(!/^[0-9a-f]{2}$/i.test(nm)) continue;      // not a shard this module made: leave it alone
    files=artDiskGlob(artDiskRoot_+nm+'\\*.jpg',FILE_ATTR_DIR,0);
    for(j=0;j<files.length;j++){
      p=String(files[j]);
      if(!artDiskDeletable(p)) continue;          // the same guard the deletes use
      if(!artDiskOwn(want,p.toLowerCase())) out.push(p);
    }
  }
  return out;
}
function artDiskSweepStep(){
  var j=artDiskSweepJob;
  if(!j || !artDiskIdx){ artDiskSweepJob=null; return; }
  var n=0, fs=artDiskFS(), k, p;
  while(j.ki<j.keys.length && n<ARTDISK_SWEEP_SLICE){
    var wasDead=(j.ki<j.ndead);
    k=j.keys[j.ki++]; n++;
    if(!artDiskOwn(artDiskIdx,k)) continue;
    j.bytes+=artDiskIdx[k].bytes;
    if(wasDead) j.nk++; else j.nc++;      // gone from the library, vs the same album but not the same files
    artDiskDrop(k);
  }
  while(j.ei<j.ext.length && n<ARTDISK_SWEEP_SLICE){
    k=j.ext[j.ei++]; n++;
    if(!artDiskOwn(artDiskIdx,k)) continue;
    if(artDiskFileStampOK(artDiskIdx[k])) continue;
    j.bytes+=artDiskIdx[k].bytes; j.nx++;
    artDiskDrop(k);                        // the cover changed: drop it, and it is fetched once more
  }
  while(fs && j.fi<j.files.length && n<ARTDISK_SWEEP_SLICE){
    p=j.files[j.fi++]; n++;
    if(!artDiskDeletable(p)) continue;
    try{
      if(fs.FileExists(p)){ j.bytes+=(utils.GetFileSize(p)||0); fs.DeleteFile(p,true); j.nf++; }
    }catch(e){}
  }
  if(j.ki<j.keys.length || j.ei<j.ext.length || (fs && j.fi<j.files.length)){
    artDiskLater('sweep',artDiskSweepStep,ARTDISK_SWEEP_STEP_MS);
    return;
  }
  if(j.nk||j.nc||j.nf||j.nx) console.log('Verdant: artwork cache swept -- '+fmtNum(j.nk)+' gone from the library, '
                             +fmtNum(j.nc)+' replaced, '+fmtNum(j.nx)+' with a changed cover file, '
                             +fmtNum(j.nf)+' orphaned '+(j.nf===1?'file':'files')+' ('+fmtBytes(j.bytes)+' reclaimed)');
  artDiskSweepJob=null;
}
/* ART_MAXPX is in the directory name so that raising the cap orphans the old tree instead of
   serving soft images out of it. Orphaning it is only half an answer though -- the files are still
   there, and nothing counts them or clears them. This collects them.

   DeleteFolder is recursive, so the guard is stricter than the one on a single file: the name must
   be exactly v<digits>-<digits>, it must sit directly inside the verdant-cache folder this module
   built out of fb.ProfilePath, and it must not be the tree in use. Anything else is left alone,
   including a folder someone put there by hand. */
function artDiskSibSane(dir){
  if(!artDiskProf_ || !dir || !artDiskRoot_) return false;
  var base=(artDiskProf_+'verdant-cache\\').toLowerCase(), d=String(dir);
  if(d.charAt(d.length-1)==='\\') d=d.substring(0,d.length-1);
  if(d.toLowerCase().substring(0,base.length)!==base) return false;
  var nm=d.substring(base.length);
  if(!/^v\d+-\d+$/.test(nm)) return false;
  return (base+nm.toLowerCase()+'\\')!==artDiskRoot_.toLowerCase();
}
function artDiskSweepSiblings(){
  var fs=artDiskFS();
  if(!fs || !artDiskProf_) return 0;
  var dirs=artDiskGlob(artDiskProf_+'verdant-cache\\*',0,FILE_ATTR_DIR), i, d, gone=0;
  for(i=0;i<dirs.length;i++){
    d=String(dirs[i]);
    if(d.charAt(d.length-1)==='\\') d=d.substring(0,d.length-1);
    if(!artDiskSibSane(d)) continue;
    try{ if(fs.FolderExists(d)){ fs.DeleteFolder(d,true); gone++; } }catch(e){}
  }
  if(gone) console.log('Verdant: removed '+fmtNum(gone)+' artwork cache '+(gone===1?'tree':'trees')
                       +' left by an earlier cover size');
  return gone;
}
