/* verdant/data/playback.js -- playback order, the shuffle engine, and the play* entry points
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* ---- output ceiling --------------------------------------------------------
   The slider's full position is VOL_CEIL dB, not foobar's 0 dB, so the whole range sits below
   what foobar calls maximum. With enough gain downstream the top of the old scale is unusable
   anyway, and the travel is better spent on the volumes actually in use.
   -12.04 dB is a quarter of the AMPLITUDE (two halvings); a quarter of the PERCEIVED loudness is
   nearer -20 dB, and 0 gives foobar's own range back. The curve itself is untouched -- still
   10 dB per halving of the slider, only shifted down -- so the control feels exactly as before. */
var VOL_CEIL=-12.04;
function vol2pos(v){ return Math.pow(2, (v-VOL_CEIL)/10); }                                        // dB(-100..VOL_CEIL) -> 0..1
function pos2vol(p){ return p<=0?-100:Math.max(-100,Math.min(VOL_CEIL,10*Math.log(p)/Math.LN2+VOL_CEIL)); } // 0..1 -> dB
/* foobar remembers its volume across restarts and its own menu/keys are not bound by the ceiling,
   so a session left louder than VOL_CEIL is pulled back down once at load. Only at load: fighting
   foobar's native controls on every change would make them look broken. */
function capVolume(){ try{ if(fb.Volume>VOL_CEIL) fb.Volume=VOL_CEIL; }catch(e){} }
function readOrder(){ try{ return plman.PlaybackOrder; }catch(e){ return 0; } }
function setOrder(o){ try{ plman.PlaybackOrder=o; }catch(e){} }
// Repeat maps to native PlaybackOrder; shuffle is ours (a hidden shuffled copy -> accurate "next up").
var pbShuffle=true, pbRepeat=0;   // shuffle defaults ON. pbRepeat: 0 off | 1 all | 2 one
function applyPlaybackOrder(){ setOrder(pbRepeat===2?2:(pbRepeat===1?1:0)); }   // native handles repeat only
function syncOrderFromFb(){ var o=readOrder(); pbRepeat=(o===2)?2:(o===1?1:0); }
function toggleShuffle(){
  pbShuffle=!pbShuffle;
  if(fb.IsPlaying||fb.IsPaused){ if(pbShuffle) shuffleEnterFromCurrent(); else shuffleExitToSource(); }
  applyPlaybackOrder(); repaintAll();
}
function cycleRepeat(){ pbRepeat=(pbRepeat+1)%3; applyPlaybackOrder(); }

var ROUTE='__verdant_np__'; // hidden playlist used to play library tracks (artist page / search)
/* ---- shuffle engine: plays from a hidden shuffled copy so "next up" is the real order.
   Reshuffles whenever shuffle is toggled on, or a playlist starts while shuffle is on. */
var SHUF='__verdant_shuffle__', shufSrcName='', lastShufIdx=-1;   // shufSrcName = the real source playlist
function isHiddenPl(nm){ return nm===ROUTE || nm===SHUF; }
function playlistOfName(nm){ for(var i=0;i<plman.PlaylistCount;i++) if(plman.GetPlaylistName(i)===nm) return i; return -1; }
function handleArray(pi){ var it=getItems(pi), a=[]; if(it){ for(var i=0;i<it.Count;i++) a.push(it[i]); } return a; }
function sameHandle(a,b){ return !!(a&&b&&a.Path===b.Path); }
function indexOfHandle(arr,h){ if(!h) return -1; for(var i=0;i<arr.length;i++) if(sameHandle(arr[i],h)) return i; return -1; }
function shuffleArr(a){ for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)), t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
function playShuffled(pi,startHandle,name,preservePos){   // build hidden shuffled copy of pi (start first) and play it
  var arr=handleArray(pi); if(!arr.length) return;
  shuffleArr(arr);
  if(startHandle){ var ci=indexOfHandle(arr,startHandle); if(ci>=0) arr.splice(ci,1); arr.unshift(startHandle); }
  if(name!==undefined && !isHiddenPl(name)) shufSrcName=name;
  var pl=plman.FindOrCreatePlaylist(SHUF,true);
  try{ plman.ClearPlaylist(pl); }catch(e){}
  var hl=fb.CreateHandleList(); for(var i=0;i<arr.length;i++) hl.Add(arr[i]);
  plman.InsertPlaylistItems(pl,0,hl,false);
  var savedActive=plman.ActivePlaylist, wasActive=(fb.IsPlaying||fb.IsPaused), pos=fb.PlaybackTime;
  plman.ExecutePlaylistDefaultAction(pl,0);
  try{ plman.ActivePlaylist=savedActive; }catch(e){}   // keep the user's viewed playlist, not the hidden one
  if(preservePos && wasActive && pos>0){ try{ fb.PlaybackTime=pos; }catch(e){} }
  lastShufIdx=0; invalidateItems();
}
// on loop-around, reshuffle the tail in place so the next pass differs (item 0 stays put, no restart)
function reshuffleTail(shufPi){
  var it=getItems(shufPi), n=it.Count; if(n<=2) return;
  var tail=[], i; for(i=1;i<n;i++) tail.push(it[i]);
  shuffleArr(tail);
  plman.ClearPlaylistSelection(shufPi);
  for(i=1;i<n;i++) plman.SetPlaylistSelectionSingle(shufPi,i,true);
  plman.RemovePlaylistSelection(shufPi);
  var hl=fb.CreateHandleList(); for(i=0;i<tail.length;i++) hl.Add(tail[i]);
  plman.InsertPlaylistItems(shufPi,1,hl,false);
  invalidateItems();
}
function shuffleEnterFromCurrent(){   // shuffle ON mid-playback: reshuffle the source, keep the current track
  var loc=playingLoc();
  var src=(loc&&loc.IsValid)?loc.PlaylistIndex:plman.ActivePlaylist; if(src<0) return;
  playShuffled(src,NP,plman.GetPlaylistName(src),true);
}
function shuffleExitToSource(){   // shuffle OFF: resume the real playlist at the current track, in order
  var si=playlistOfName(shufSrcName); if(si<0) return;
  var it=getItems(si), idx=0; if(it){ for(var i=0;i<it.Count;i++) if(sameHandle(it[i],NP)){ idx=i; break; } }
  var savedActive=plman.ActivePlaylist, wasActive=(fb.IsPlaying||fb.IsPaused), pos=fb.PlaybackTime;
  plman.ExecutePlaylistDefaultAction(si,idx);
  try{ plman.ActivePlaylist=savedActive; }catch(e){}
  if(wasActive && pos>0){ try{ fb.PlaybackTime=pos; }catch(e){} }
}
function playPlaylistItem(pl,item){   // clicking a track: shuffle-aware
  if(pbShuffle) playShuffled(pl,getItems(pl)[item],plman.GetPlaylistName(pl),false);
  else plman.ExecutePlaylistDefaultAction(pl,item);
}
/* Queue rows jump straight to the track -- deliberately NOT playPlaylistItem(), which would
   reshuffle the hidden playlist and throw away the running order the user is looking at. */
function playQueueNext(pl,item){ try{ plman.ExecutePlaylistDefaultAction(pl,item); }catch(e){} }
// manually-queued row: play it and drop it from the queue, it is no longer "up next"
function playQueueItem(qi){
  var c=null; try{ c=plman.GetPlaybackQueueContents(); }catch(e){ c=null; }
  if(!c || !c.length || qi>=c.length) return;
  var it=c[qi], pi=it.PlaylistIndex, ii=it.PlaylistItemIndex;
  try{ plman.RemoveItemFromPlaybackQueue(qi); }catch(e){}
  if(pi>=0 && ii>=0) playQueueNext(pi,ii);
  else if(it.Handle) playHandleList([it.Handle],0);   // queued from outside any playlist
}
// is the now-playing track this playlist's shuffled source? (for highlighting the right row)
function npIsShuffleOf(name){ return pbShuffle && NP && name===shufSrcName; }
