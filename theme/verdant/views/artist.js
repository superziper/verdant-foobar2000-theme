/* verdant/views/artist.js -- artist view: header + scrolling discography
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* Album blocks are VARIABLE height -- an album header, then one row per track, then a gap -- so
   this view cannot index its scroll by row the way the playlist does. It used to index by album
   instead, which is why one wheel notch jumped a whole album and why there was no scrollbar: a
   block index has no proportional thumb to draw. The cumulative top of every block is computed
   up front and the offset is in PIXELS against that, which is what the other lists do and what
   makes the scrolling continuous, eased and measurable.

   Recomputed per frame rather than cached: it is one pass over tens of albums doing arithmetic on
   constants, and loadArtist is the only thing that can change the result, so a cache would be
   more bookkeeping than the sums it saves. */

/* Release block geometry. Each release reads as its own small page -- cover, title, metadata and
   a play button, over a column header and its tracks -- because a discography is a list OF LISTS,
   and what was wrong before was that nothing said where one release ended and the next began.
   A separator earns its keep only with space either side of it, so the gap between releases is
   split: the tail below the last track, the rule, then the lead-in to the next cover. */
var ART_COVER=112,      // album cover inside a release block
    ART_HDRH=112,       // cover height; the title/meta column is centred against it
    ART_COLGAP=30,      // cover foot -> column header
    ART_COLH=46,        // column header text + its rule
    ART_TRACKH=44,      // one track row
    ART_TAILGAP=30,     // last track -> the separator
    ART_SEPGAP=34,      // separator -> the next release
    ART_HEADH=248;      // page header: gradient, artist art, name, totals
var ART_GRADH=220, ART_NUMW=30, ART_DURW=64, ART_CGAP=16;
var ART_BLOCKH=ART_HDRH+ART_COLGAP+ART_COLH;      // block top -> first track
var ART_BLOCKGAP=ART_TAILGAP+ART_SEPGAP;          // last track -> next block top
function artBlockH(al){ return ART_BLOCKH+al.tracks.length*ART_TRACKH+ART_BLOCKGAP; }

/* foobar has no release-type tag, so it is inferred from length -- the same rule of thumb the
   streaming services use, and the one a listener already reads this way. Wrong only for the
   genuinely odd release (a two-track single, a six-track album), where it is a label on a page
   that states the exact song count right beside it. */
function artRelType(n){ return n<=1?'Single':(n<=6?'EP':'Album'); }
function artRelMeta(al){
  var n=al.tracks.length, parts=[artRelType(n)];
  if(al.year) parts.push(al.year);
  parts.push(n+(n===1?' song':' songs'));
  return parts.join('  '+CH_DOT+'  ');
}
function drawArtist(gr,r){
  HB_TR=[];
  var pad=M.cpad, x0=r.x+pad, w=r.w-pad*2, rx=x0+w, i, b, t;
  var rowsTop=r.y+ART_HEADH, cropY=r.y+r.h, viewH=Math.max(0,cropY-rowsTop);
  var titleX=x0+ART_NUMW+ART_CGAP, titleW=Math.max(60,rx-titleX-ART_DURW-ART_CGAP);

  // ---- layout + the eased pixel offset, the same model as every other list ----
  var tops=[], contentH=0;
  for(b=0;b<artistAlbums.length;b++){ tops.push(contentH); contentH+=artBlockH(artistAlbums[b]); }
  ARTIST_MAXPX=Math.max(0,contentH-viewH);
  artScroll=clampPx(artScroll,ARTIST_MAXPX); artScrollT=clampPx(artScrollT,ARTIST_MAXPX);

  /* ---- discography, drawn FIRST ----
     The header is painted over it afterwards, so a block scrolling up simply disappears under
     the header instead of needing a second mask. Blocks fully under it are skipped rather than
     drawn and covered; the one straddling the line is drawn whole, which is what makes a
     partially scrolled album read as continuous rather than snapping into place. */
  for(b=0;b<artistAlbums.length;b++){
    var al=artistAlbums[b], bh=artBlockH(al), by=rowsTop+tops[b]-artScroll;
    if(by>=cropY) break;
    if(by+bh<=rowsTop) continue;
    /* release header: cover, with the title and metadata centred as a pair against its height.
       Two lines pinned to the top edge of a 112px cover leave the weight in the wrong place. */
    var tx=x0+ART_COVER+24, tw=Math.max(60,rx-tx);
    var blkY=by+Math.round((ART_HDRH-(32+6+22))/2);
    drawRounded(gr,x0,by,ART_COVER,8,al.handle,al.album);
    tL(gr,al.album,FONT.sect2,COL.text,tx,blkY,tw,32);
    tL(gr,artRelMeta(al),FONT.meta,COL.text2,tx,blkY+38,tw,22);
    // column header, per release -- a discography is a list of lists, so each one carries the
    // same headings the playlist and All Songs views use
    var cy=by+ART_HDRH+ART_COLGAP;
    tL(gr,'#',FONT.head,COL.text2,x0,cy,ART_NUMW,20);
    tL(gr,'TITLE',FONT.head,COL.text2,titleX,cy,titleW,20);
    drawIcon(gr,'clock',COL.text2,rx-16,cy,16,20,15);
    if(cy+26>rowsTop && cy+26<cropY) gr.DrawLine(x0,cy+26,rx,cy+26,1,COL.line);
    for(t=0;t<al.tracks.length;t++){
      var ty=by+ART_BLOCKH+t*ART_TRACKH;
      if(ty>=cropY) break;
      if(ty+ART_TRACKH<=rowsTop) continue;
      var tr=al.tracks[t];
      // Hover and click are clamped to the visible band: a row painted over by the header must
      // not answer the mouse up there either. The highlight itself is drawn at full height and
      // cropped by the header, so a straddling row doesn't show a cut edge.
      var hy0=Math.max(ty,rowsTop), hy1=Math.min(ty+ART_TRACKH,cropY);
      if(hy1<=hy0) continue;
      if(hv(x0-8,hy0,rx+8,hy1)) gr.FillRoundRect(x0-8,ty,(rx+8)-(x0-8),ART_TRACKH,4,4,COL.rowHover);
      tL(gr,String(t+1),FONT.rowNum,COL.text2,x0,ty,ART_NUMW,ART_TRACKH);
      tL(gr,tr.title,FONT.rowTitle,COL.text,titleX,ty,titleW,ART_TRACKH);
      tR(gr,tr.dur,FONT.rowCell,COL.text2,rx-ART_DURW,ty,ART_DURW,ART_TRACKH);
      HB_TR.push({x0:x0-8,y0:hy0,x1:rx+8,y1:hy1,lib:true,block:b,idx:t});
    }
    // separator, between releases only: there is nothing after the last one to divide it from
    var sy=by+ART_BLOCKH+al.tracks.length*ART_TRACKH+ART_TAILGAP;
    if(b<artistAlbums.length-1 && sy>rowsTop && sy<cropY) gr.DrawLine(x0,sy,rx,sy,1,COL.line);
  }
  gr.FillSolidRect(r.x,cropY,r.w,M.pad+2,COL.black);   // gutter below the panel

  // ---- header, on top of whatever scrolled under it ----
  // artwork = the artist's first album that actually HAS art. artistAlbums is already one entry
  // per album, so it is the candidate list directly -- no scan, no dedupe (art loads async)
  var cands=[]; for(i=0;i<artistAlbums.length && i<COVER_CANDS;i++) if(artistAlbums[i].handle) cands.push(artistAlbums[i].handle);
  var picked=coverPick('av|'+viewArtist,cands,1);
  var cover=picked.list.length?picked.list[0]:(cands.length?cands[0]:null);
  gr.FillGradRect(r.x,r.y,r.w,ART_GRADH,90,blend(artHue(cover,viewArtist),COL.base,0.44),COL.base,1.0);
  // the gradient resolves to COL.base at its foot, so the strip between it and the first release
  // is a seamless continuation -- and it belongs to the header, not to the scrolling content
  gr.FillSolidRect(r.x,r.y+ART_GRADH,r.w,rowsTop-(r.y+ART_GRADH),COL.base);
  var art=150, ay=r.y+34;
  drawCircle(gr,x0,ay,art,cover,viewArtist);
  var htx=x0+art+24, htw=w-art-24, songs=0;
  for(i=0;i<artistAlbums.length;i++) songs+=artistAlbums[i].tracks.length;
  tL(gr,'ARTIST',FONT.eyebrow,COL.text,htx,ay+10,htw,18);
  tL(gr,viewArtist,FONT.title,COL.text,htx,ay+30,htw,70);
  tL(gr,artistAlbums.length+' albums '+CH_DOT+' '+songs+' songs in your library',FONT.meta,COL.text2,htx,ay+112,htw,22);

  drawScrollbar(gr,rx+8,rowsTop,viewH,artScroll,ARTIST_MAXPX,viewH,contentH,hv(r.x,r.y,r.x+r.w,cropY)||drag==='scroll');
}
