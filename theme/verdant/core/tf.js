/* verdant/core/tf.js -- title-format objects, compiled once. Loaded by main.js; every
   module shares one global scope, so load order is set there. */

/* ------------------------- title formats ------------------------- */
var TF = {
  title: fb.TitleFormat("%title%"),
  artist: fb.TitleFormat("[%artist%]"),
  album: fb.TitleFormat("[%album%]"),
  len: fb.TitleFormat("%length%"),
  npTitle: fb.TitleFormat("[%title%]"),
  npArtist: fb.TitleFormat("[%artist%]"),
  albkey: fb.TitleFormat("%album artist% - %album%"),
  artistName: fb.TitleFormat("%album artist%"),
  year: fb.TitleFormat("$year(%date%)"),
  lensec: fb.TitleFormat("%length_seconds%"),
  trackno: fb.TitleFormat("%tracknumber%"),
  lastmod: fb.TitleFormat("%last_modified%"), // metadb-served, so data/artdisk.js can stamp an entry with no I/O
  rg: fb.TitleFormat("$if(%replaygain_track_gain%,1,0)"), // '1' once a loudness scan has tagged the file
};

/* ---- credited artists, as separate values ---- %album artist% flattens a multi-value
   tag into one string that has to be guessed apart again, so $meta_sep is used instead:
   it joins the values with U+001F, a delimiter no tag can contain. $if2 keeps the
   fallback %album artist% performs implicitly, and the try/catch covers older builds
   without the function, where libTF yields nothing and data/library.js falls back to
   artistName. */
var ART_MV = String.fromCharCode(31); // U+001F unit separator: no tag value can contain it
try {
  TF.artistMulti = fb.TitleFormat(
    "$if2($meta_sep(album artist," +
      ART_MV +
      "),$meta_sep(artist," +
      ART_MV +
      "))",
  );
} catch (e) {
  TF.artistMulti = null;
}
