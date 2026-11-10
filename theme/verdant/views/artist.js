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
var ART_BLOCKH=84, ART_TRACKH=40, ART_BLOCKGAP=22, ART_HEADH=236, ART_GRADH=220;
function artBlockH(al){ return ART_BLOCKH+al.tracks.length*ART_TRACKH+ART_BLOCKGAP; }

function drawArtist(gr,r){
  HB_TR=[];
  var pad=M.cpad, x0=r.x+pad, w=r.w-pad*2, rx=x0+w, i, b, t;
  var rowsTop=r.y+ART_HEADH, cropY=r.y+r.h, viewH=Math.max(0,cropY-rowsTop);

  // ---- layout + the eased pixel offset, the same model as every other list ----
  var tops=[], contentH=0;
  for(b=0;b<artistAlbums.length;b++){ tops.push(contentH); contentH+=artBlockH(artistAlbums[b]); }
  ART_MAXPX=Math.max(0,contentH-viewH);
  artScroll=clampPx(artScroll,ART_MAXPX); artScrollT=clampPx(artScrollT,ART_MAXPX);

  /* ---- discography, drawn FIRST ----
     The header is painted over it afterwards, so a block scrolling up simply disappears under
     the header instead of needing a second mask. Blocks fully under it are skipped rather than
     drawn and covered; the one straddling the line is drawn whole, which is what makes a
     partially scrolled album read as continuous rather than snapping into place. */
  for(b=0;b<artistAlbums.length;b++){
    var al=artistAlbums[b], bh=artBlockH(al), by=rowsTop+tops[b]-artScroll;
    if(by>=cropY) break;
    if(by+bh<=rowsTop) continue;
    drawRounded(gr,x0,by,72,6,al.handle,al.album);
    tL(gr,al.album,FONT.sect2,COL.text,x0+88,by+6,w-88,26);
    tL(gr,(al.year||'')+' '+CH_DOT+' '+al.tracks.length+' songs',FONT.meta,COL.text2,x0+88,by+38,w-88,20);
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
      tL(gr,String(t+1),FONT.rowNum,COL.text2,x0,ty,26,ART_TRACKH);
      tL(gr,tr.title,FONT.rowTitle,COL.text,x0+36,ty,w-36-64,ART_TRACKH);
      tR(gr,tr.dur,FONT.rowCell,COL.text2,rx-60,ty,60,ART_TRACKH);
      HB_TR.push({x0:x0-8,y0:hy0,x1:rx+8,y1:hy1,lib:true,block:b,idx:t});
    }
  }
  gr.FillSolidRect(r.x,cropY,r.w,M.pad+2,COL.black);   // gutter below the panel

  // ---- header, on top of whatever scrolled under it ----
  // artwork = the artist's first album that actually HAS art. artistAlbums is already one entry
  // per album, so it is the candidate list directly -- no scan, no dedupe (art loads async)
  var cands=[]; for(i=0;i<artistAlbums.length && i<COVER_CANDS;i++) if(artistAlbums[i].handle) cands.push(artistAlbums[i].handle);
  var picked=coverPick('av|'+viewArtist,cands,1);
  var cover=picked.list.length?picked.list[0]:(cands.length?cands[0]:null);
  gr.FillGradRect(r.x,r.y,r.w,ART_GRADH,90,blend(artHue(cover,viewArtist),COL.base,0.44),COL.base,1.0);
  // the gradient resolves to COL.base at its foot, so the strip between it and the first row is
  // a seamless continuation -- and it belongs to the header, not to the scrolling content
  gr.FillSolidRect(r.x,r.y+ART_GRADH,r.w,rowsTop-(r.y+ART_GRADH),COL.base);
  var art=150, ay=r.y+34;
  drawCircle(gr,x0,ay,art,cover,viewArtist);
  var tx=x0+art+24, tw=w-art-24, songs=0;
  for(i=0;i<artistAlbums.length;i++) songs+=artistAlbums[i].tracks.length;
  tL(gr,'ARTIST',FONT.eyebrow,COL.text,tx,ay+10,tw,18);
  tL(gr,viewArtist,FONT.title,COL.text,tx,ay+30,tw,70);
  tL(gr,artistAlbums.length+' albums '+CH_DOT+' '+songs+' songs in your library',FONT.meta,COL.text2,tx,ay+112,tw,22);

  drawScrollbar(gr,rx+8,rowsTop,viewH,artScroll,ART_MAXPX,viewH,contentH,hv(r.x,r.y,r.x+r.w,cropY)||drag==='scroll');
}
