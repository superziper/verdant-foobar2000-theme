/* verdant/views/home.js -- home view: playlist shelf + artist grid
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

function drawHome(gr,r){
  HB_CARD=[];
  var pad=M.cpad, x0=r.x+pad, w=r.w-pad*2, rightEdge=r.x+r.w, i;
  var gap=16, cardW=176, cols=Math.max(2,Math.floor((w+gap)/(cardW+gap)));
  cardW=Math.floor((w-gap*(cols-1))/cols);
  var cardH=cardW+56;
  // ---- geometry ----
  var shelfTitleY=r.y+18, shelfY=shelfTitleY+42;
  var pls=visiblePlaylists();
  var scardW=(pls.length>cols)?Math.floor((w-cols*gap)/(cols+0.4)):cardW, scardH=scardW+56;
  var artTitleY=shelfY+scardH+(pls.length>cols?26:16), gy=artTitleY+42;   // artist grid top
  var cropY=r.y+r.h, rowStep=cardH+8, viewH=cropY-gy;
  // The artist grid waits on getArtistList (a full-library TF pass); the shelf does not -- playlist
  // names and counts are available immediately, so it renders real cards straight away and its
  // covers fill in as they arrive, which is what Spotify does with data it already has.
  var listReady=ensureBuilt('arts',function(){ return artistList!==null; },
                            function(){ return [function(){ libTF('artistName'); },function(){ getArtistList(); }]; });
  var arts=listReady?artistList:[];
  /* The shelf holds its reveal until its covers are in: a 2x2 mosaic with two of four albums looks
     broken rather than merely unfinished, and it is only ~20 cards, so the wait is about a second.
     The artist grid does NOT wait on artwork -- it is 250+ cards, the wait would be several
     seconds, and its fallback is a seeded colour per artist rather than a grey box. It appears as
     soon as the names are known and fills in, which is also what Spotify does once it has data. */
  var shelfReady=ensureBuilt('shelfh',function(){ return shelfHandles!==null; },function(){ return shelfSteps(pls); })
                 && gateReady('shelf',shelfHandles);
  var artsReady=listReady;
  if(artsReady && !warmed['home']){ warmed['home']=1; startWarmHome(arts,pls); }
  var totalRows=Math.max(1,Math.ceil(arts.length/cols)), contentH=totalRows*rowStep, maxPx=Math.max(0,contentH-viewH);
  HOME_MAXROW=maxPx;
  homeScroll=clampPx(homeScroll,maxPx); homeScrollT=clampPx(homeScrollT,maxPx);

  // ---- 1) artist grid (continuous; the top partial row overflows up, cleared below) ----
  if(!artsReady){
    // once the list is built the wait is on artwork, which is deliberate -- show it immediately
    // rather than applying the flash-avoidance delay meant for a build that may finish in a frame
    if(listReady || skelVisible('arts')){ skelCardsCached(gr,x0,gy,w,cropY-gy,cardW,gap); shimmer(gr,x0,gy,w,cropY-gy); }
  } else {
    for(i=Math.floor(homeScroll/rowStep)*cols; i<arts.length; i++){
      var col=(i%cols), row=Math.floor(i/cols), ay=gy+row*rowStep-homeScroll;
      if(ay>=cropY) break;
      if(ay+cardH<=gy) continue;
      drawArtistCard(gr,x0+col*(cardW+gap),ay,cardW,arts[i],gy,cropY);
    }
  }
  gr.FillSolidRect(r.x,cropY,r.w,M.pad+2,COL.black);   // gutter below the panel

  // ---- 2) shelf + section titles drawn ON TOP (covers the grid's top overflow) ----
  gr.FillSolidRect(r.x,r.y,r.w,gy-r.y,COL.base);
  tL(gr,'Your Playlists',FONT.sect2,COL.text,x0,shelfTitleY,w,28);
  // continuous pixel scroll (same model as the artist grid): start one card left of the viewport
  // so a partially-scrolled card still draws -- drawPlaylistCard clips it to [x0,rightEdge)
  var stride=scardW+gap, shelfW=Math.max(0,pls.length*stride-gap);
  HOME_PLMAX=Math.max(0,shelfW-w); HOME_STRIDE=stride;
  plScroll=clampPx(plScroll,HOME_PLMAX); plScrollT=clampPx(plScrollT,HOME_PLMAX);
  if(!shelfReady){
    skelCardsCached(gr,x0,shelfY,w,scardH,scardW,gap); shimmer(gr,x0,shelfY,w,scardH);
  } else {
    for(i=Math.floor(plScroll/stride);i<pls.length;i++){
      // snap to whole pixels: the eased offset is fractional, and an antialiased card at a
      // sub-pixel x leaves a translucent fringe at the clip seam
      var cx=Math.round(x0+i*stride-plScroll); if(cx>=rightEdge) break;
      drawPlaylistCard(gr,cx,shelfY,scardW,pls[i],x0,rightEdge);
    }
  }
  HOME_SHELF_Y0=shelfY; HOME_SHELF_Y1=shelfY+scardH;
  var sbY=shelfY+scardH+6;
  drawScrollbarH(gr,x0,sbY,w,plScroll,HOME_PLMAX,w,shelfW,hv(x0,shelfY,rightEdge,sbY+10)||drag==='scrollh');
  tL(gr,'Artists in your library',FONT.sect2,COL.text,x0,artTitleY,w,28);

  // ---- 3) artist scrollbar (continuous, pixel) ----
  drawScrollbar(gr,x0+w+8,gy,viewH,homeScroll,maxPx,viewH,contentH,hv(x0,gy,x0+w+16,cropY)||drag==='scroll');
}
