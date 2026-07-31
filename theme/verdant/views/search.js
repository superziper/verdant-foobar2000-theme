/* verdant/views/search.js -- search view: box + artist/song results
   Part of Verdant, a Spotify-style theme for foobar2000. Loaded by main.js;
   every module shares one global scope, so load order is set there. */

// factored out so the blinking caret repaints just this strip (dirtySearch), not the whole view
var SBOX_H=44, SBOX_TOP=26;   // box height + offset below R.main.y
function searchBoxRect(){ var r=R.main, boxW=Math.min(520,r.w-M.cpad*2); return {x:r.x+M.cpad-2,y:r.y+SBOX_TOP-4,w:boxW+8,h:SBOX_H+8}; }
function drawSearchBox(gr,r){
  var x0=r.x+M.cpad, boxH=SBOX_H, boxY=r.y+SBOX_TOP, boxW=Math.min(520,r.w-M.cpad*2);
  gr.FillSolidRect(x0-2,boxY-4,boxW+8,boxH+8,COL.base);   // clean bg for partial repaints
  gr.FillRoundRect(x0,boxY,boxW,boxH,boxH/2,boxH/2,RGB(42,42,42));
  var txtX=x0+48, txtW=boxW-(txtX-x0)-18;
  drawIcon(gr,'search',COL.text2,x0+16,boxY,22,boxH,18);
  var empty=!searchQuery.length, caretH=20, caretY=boxY+(boxH-caretH)/2, caretX;
  if(empty){
    caretX=txtX;
    tL(gr,'What do you want to play?',FONT.searchTxt,COL.text3,txtX+12,boxY,txtW-12,boxH);
  } else {
    tL(gr,searchQuery,FONT.searchTxt,COL.text,txtX,boxY,txtW,boxH);
    caretX=txtX+Math.min(txtW,gr.CalcTextWidth(searchQuery,FONT.searchTxt))+2;
  }
  if(caretOn) gr.FillSolidRect(caretX,caretY,2,caretH,empty?COL.text2:COL.text);
}
/* Artists + Songs are one continuously-scrolled document (same model as the home artist grid).
   The search box stays pinned: content is drawn first and allowed to overflow upward, then the
   band above the viewport is painted over and the box redrawn on top. */
function drawSearch(gr,r){
  HB_CARD=[]; HB_TR=[];
  computeSearch();
  var pad=M.cpad, x0=r.x+pad, w=r.w-pad*2, i;
  var boxH=SBOX_H, boxY=r.y+SBOX_TOP;
  if(!searchQuery.length){
    drawSearchBox(gr,r);
    tL(gr,'Search your playlists and library.',FONT.qArtist,COL.text3,x0+2,boxY+boxH+18,w,18);
    return;
  }
  if(!searchArts.length && !searchTrks.length){
    drawSearchBox(gr,r);
    tC(gr,'No results found for "'+searchQuery+'"',FONT.sect,COL.text2,r.x,r.y+Math.round(r.h/2),r.w,24);
    return;
  }
  var top=boxY+boxH+26, cropY=r.y+r.h, viewH=cropY-top;
  // ---- measure the document, then clamp the scroll to it ----
  var gap=16, cardW=176, cols=Math.max(2,Math.floor((w+gap)/(cardW+gap)));
  cardW=Math.floor((w-gap*(cols-1))/cols);
  var cardH=cardW+56, rh=56, durW=64;
  var artsH=searchArts.length?(42+Math.ceil(searchArts.length/cols)*(cardH+8)+18):0;
  var contentH=artsH+(searchTrks.length?(38+searchTrks.length*rh):0);
  var maxPx=Math.max(0,contentH-viewH);
  SEARCH_MAXPX=maxPx;
  searchScroll=clampPx(searchScroll,maxPx); searchScrollT=clampPx(searchScrollT,maxPx);
  var cy=top-searchScroll;
  // ---- artists ----
  if(searchArts.length){
    tL(gr,'Artists',FONT.sect2,COL.text,x0,cy,w,28);
    var gy=cy+42;
    for(i=0;i<searchArts.length;i++){
      var ay=gy+Math.floor(i/cols)*(cardH+8);
      if(ay>=cropY) break;
      if(ay+cardH<=top) continue;
      drawArtistCard(gr,x0+(i%cols)*(cardW+gap),ay,cardW,searchArts[i],top,cropY);
    }
    cy+=artsH;
  }
  // ---- songs ----
  if(searchTrks.length){
    tL(gr,'Songs',FONT.sect2,COL.text,x0,cy,w,28);
    var ry0=cy+38;
    for(i=0;i<searchTrks.length;i++){
      var ry=ry0+i*rh;
      if(ry>=cropY) break;
      if(ry+rh<=top) continue;
      var tr=searchTrks[i];
      if(hv(r.x,Math.max(ry,top),r.x+r.w,Math.min(ry+rh,cropY))) gr.FillRoundRect(x0-8,ry,w+16,rh,4,4,COL.rowHover);
      drawCover(gr,x0,ry+8,40,4,tr.h,tr.album||tr.title);
      tL(gr,tr.title,FONT.rowTitle,COL.text,x0+52,ry+8,w-52-durW,20);
      tL(gr,tr.artist+(tr.album?('  '+CH_BULL+'  '+tr.album):''),FONT.rowArtist,COL.text2,x0+52,ry+30,w-52-durW,16);
      tR(gr,tr.len,FONT.rowCell,COL.text2,r.x+r.w-pad-durW,ry,durW,rh);
      var hy0=Math.max(ry,top), hy1=Math.min(ry+rh,cropY);   // clip the click target to the viewport
      if(hy1>hy0) HB_TR.push({x0:x0-8,y0:hy0,x1:r.x+r.w-pad+8,y1:hy1,srch:true,idx:i});
    }
  }
  // ---- mask the overflow, re-pin the search box, then the scrollbar ----
  gr.FillSolidRect(r.x,r.y,r.w,top-r.y,COL.base);
  gr.FillSolidRect(r.x,cropY,r.w,M.pad+2,COL.black);
  drawSearchBox(gr,r);
  drawScrollbar(gr,x0+w+8,top,viewH,searchScroll,maxPx,viewH,contentH,hv(x0,top,x0+w+16,cropY)||drag==='scroll');
}
