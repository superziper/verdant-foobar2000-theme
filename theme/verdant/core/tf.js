/* verdant/core/tf.js -- title-format objects, compiled once
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* ------------------------- title formats ------------------------- */
var TF = {
  title:fb.TitleFormat('%title%'), artist:fb.TitleFormat('[%artist%]'),
  album:fb.TitleFormat('[%album%]'), len:fb.TitleFormat('%length%'),
  npTitle:fb.TitleFormat('[%title%]'), npArtist:fb.TitleFormat('[%artist%]'),
  albkey:fb.TitleFormat('%album artist% - %album%'), artistName:fb.TitleFormat('%album artist%'),
  year:fb.TitleFormat('$year(%date%)'), lensec:fb.TitleFormat('%length_seconds%'),
  trackno:fb.TitleFormat('%tracknumber%'),
  rg:fb.TitleFormat('$if(%replaygain_track_gain%,1,0)')   // '1' once a loudness scan has tagged the file
};

/* ---- credited artists, as separate values ----
   %album artist% flattens a multi-value tag into one string, which then has to be guessed apart
   again. $meta_sep hands the values over already separated, joined by a delimiter no tag can
   contain (U+001F, the ASCII unit separator) -- so for the tags that are properly multi-value
   there is nothing to parse and nothing to get wrong.

   $if2 keeps the fallback %album artist% performs implicitly: read the album artist, and where
   a file has none, fall back to the track artist. $meta_sep reads the RAW tag and would
   otherwise return nothing for those files, dropping them off the artist grid entirely.

   Built in a try/catch because it is the one format here using a function older builds might
   not have: if it cannot be compiled, libTF yields nothing for it and data/library.js falls
   back to artistName, which is exactly the behaviour this replaces. */
var ART_MV=String.fromCharCode(31);   // U+001F unit separator: no tag value can contain it
try{ TF.artistMulti=fb.TitleFormat('$if2($meta_sep(album artist,'+ART_MV+'),$meta_sep(artist,'+ART_MV+'))'); }
catch(e){ TF.artistMulti=null; }
