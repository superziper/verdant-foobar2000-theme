/* verdant/views/cards.js -- playlist + artist cards, shared by home and search
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

/* Nothing may be painted outside [clipL,clipR): RepaintRect does not clip drawing, so anything
   spilling past the panel would be stranded on the neighbouring one by a panel-scoped repaint.
   Edge cards are therefore blitted through a bitmap with a source rect instead of being drawn
   wide and masked over afterwards. Hover and hit target clip to the same band. */
function drawPlaylistCard(gr,x,y,w,i,clipL,clipR){
  var h=w+56;
  var hx0=(clipL!==undefined&&x<clipL)?clipL:x, hx1=(clipR!==undefined&&x+w>clipR)?clipR:x+w;
  if(hx1<=hx0) return;
  var cardHov=hv(hx0,y,hx1,y+h), clipped=(hx0>x)||(hx1<x+w);
  var im=cardHov?null:plCardImg(i,w);
  if(!im && clipped) im=renderPlCard(i,w,cardHov);   // hovered, or art still loading, at an edge
  if(im) gr.DrawImage(im,hx0,y,hx1-hx0,h,hx0-x,0,hx1-hx0,h);
  else paintPlCard(gr,x,y,w,i,cardHov);
  var dx=x+w-32;
  if(cardHov && dx>=hx0 && dx+32<=hx1) drawDots(gr,dx,y+(w-24)+16,i);
  HB_CARD.push({x0:hx0,y0:y,x1:hx1,y1:y+h,kind:'pl',id:i});
}
/* ---- artist card ----
   Circle, then the name wrapped over up to ART_NAME_LINES lines. There is no "Artist" caption
   under it: every card in this grid is an artist, so the word was the same on all of them and
   bought nothing but a line of height.

   The card is a FIXED height, because the grid tiles on a uniform row pitch and a per-card
   height would make rows ragged. So it is sized for the tallest name it will ever show, and the
   name is CENTRED in that block rather than hung from the top of it -- a one-line name pinned to
   the top leaves a two-line hole underneath, which reads as a rendering fault rather than as a
   short name.

   Height is derived from the FONT rather than a constant, since the whole card scales with
   UISCALE; artTextH is memoised because it is asked for once per card per frame and the answer
   only changes when the font table is rebuilt (applyUIScale clears it). */
var ART_NAME_LINES=3, artTextH_=0;
function artTextH(gr){ if(!artTextH_) artTextH_=ART_NAME_LINES*lineH(gr,FONT.card)+18; return artTextH_; }
function artCardH(gr,w){ return w-6+artTextH(gr); }   // w-6 is where the name starts: 12 + (w-24) + 6
/* Wrap to at most ART_NAME_LINES. On overflow the remaining lines are glued onto the last one so
   it is deliberately too wide, and the end-ellipsis flag on tCE does the trimming -- a line that
   WRAPPED always fits by construction, so asking for an ellipsis is otherwise a no-op and a
   truncated name would end mid-word with no sign that anything was cut. */
function artNameLines(gr,s,w){
  var wr=null;
  try{ wr=gr.EstimateLineWrap(s,FONT.card,w); }catch(e){ wr=null; }
  if(!wr || !wr.length) return [s];
  var all=[], i;
  for(i=0;i<wr.length;i+=2) all.push(wr[i]);
  if(all.length<=ART_NAME_LINES) return all;
  var out=all.slice(0,ART_NAME_LINES-1);
  out.push(all.slice(ART_NAME_LINES-1).join(' '));
  return out;
}
function paintArtistCard(gr,x,y,w,a,hov){
  var cs=w-24, lh=lineH(gr,FONT.card);
  gr.FillRoundRect(x,y,w,artCardH(gr,w),8,8,hov?RGB(40,40,40):COL.elev);
  drawCircle(gr,x+12,y+12,cs,artistCover(a.name,a.handle),a.name);
  var lines=artNameLines(gr,a.name,w-24), i;
  // centre however many lines there are inside the fixed ART_NAME_LINES-tall block
  var ty=y+cs+18+Math.round((ART_NAME_LINES-lines.length)*lh/2);
  for(i=0;i<lines.length;i++) tCE(gr,lines[i],FONT.card,COL.text,x+12,ty+i*lh,w-24,lh);
}
/* The artist grid is the bulk of a home frame -- ~30 cards on a wide window, each an antialiased
   rounded rect, a masked circular cover and two centred labels, all redrawn every paint. Cache
   them like playlist cards. Unlike playlists a library can have thousands of artists, so the
   cache is capped and dropped wholesale when it grows past the cap. */
// 120 could not hold a 269-artist library: measurement showed ~400 misses per 30 frames while
// scrolling home, i.e. a dozen cards re-rendered every frame instead of blitted
var artCardCache={}, artCardN=0, ART_CARD_CAP=400, artTick=0;
/* Least-recently-used eviction. Wiping the whole cache on overflow meant the very next frame had
   to re-render every visible card at once -- the worst possible moment, since overflow happens
   while scrolling. Dropping the oldest half instead keeps what is on screen and costs only the
   newly-revealed row. */
function evictArtCards(){
  var keys=[], k, i;
  for(k in artCardCache) keys.push(k);
  keys.sort(function(p,q){ return artCardCache[p].t-artCardCache[q].t; });
  var n=Math.floor(keys.length/2);
  for(i=0;i<n;i++) delete artCardCache[keys[i]];
  artCardN=keys.length-n;
}
function artCardImg(gr,a,w){
  var key=a.name+'|'+w, e=artCardCache[key];
  if(e){ e.t=++artTick; return e.img; }
  var ah=artistCover(a.name,a.handle);
  if(!artistCoverReady(a.name,a.handle)) return null;   // still choosing a cover -> don't bake a placeholder
  if(ah && !artLoaded(albKey(ah))) return null;         // art still loading -> same
  if(artCardN>=ART_CARD_CAP) evictArtCards();
  var im=null;
  try{
    var ch=artCardH(gr,w);
    im=gdi.CreateImage(w,ch); var g=im.GetGraphics();
    g.SetSmoothingMode(2);
    g.FillSolidRect(0,0,w,ch,COL.base);
    paintArtistCard(g,0,0,w,a,false);
    im.ReleaseGraphics(g);
  }catch(e2){ im=null; }
  artCardCache[key]={img:im,t:++artTick}; artCardN++; return im;
}
function drawArtistCard(gr,x,y,w,a,clipTop,clipBot){
  var h=artCardH(gr,w);
  // clip drawing and the click target to the scroll viewport
  var vy0=(clipTop!==undefined&&y<clipTop)?clipTop:y, vy1=(clipBot!==undefined&&y+h>clipBot)?clipBot:y+h;
  if(vy1<=vy0) return;
  var hov=hv(x,vy0,x+w,vy1);
  var im=hov?null:artCardImg(gr,a,w);               // the one hovered card is painted live
  // angle/alpha omitted on purpose: passing them takes GdiGraphics' transform+colour-matrix path,
  // which is far slower than the plain blit these 1:1 draws need
  if(im) gr.DrawImage(im,x,vy0,w,vy1-vy0,0,vy0-y,w,vy1-vy0);
  else paintArtistCard(gr,x,y,w,a,hov);
  HB_CARD.push({x0:x,y0:vy0,x1:x+w,y1:vy1,kind:'artist',id:a.name});
}
