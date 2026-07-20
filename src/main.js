'use strict';

/* =============================================================
 * foobar2000 x Spotify  --  Phase 1 PoC (main.js)  [JSplitter build]
 * -------------------------------------------------------------
 * Purpose: prove our JavaScript actually drives the foobar2000
 * window and can read live playback data. This is NOT the skin;
 * it is a deliberately loud "test card".
 *
 * Runs in a JSplitter (foo_uie_jsplitter) panel under Columns UI,
 * GDI+ draw mode (the default). Classic Spider-Monkey-style API.
 *
 * Two ways to load it:
 *   A) Paste this whole file into the JSplitter panel's config
 *      (simplest -- do this first to prove the pipeline).
 *   B) Dev loop: keep it on disk, deploy.ps1 copies it into the
 *      profile, and a tiny bootstrap include()s it (see bootstrap.txt).
 * ============================================================= */

window.DefineScript('Spotify for foobar2000', { author: 'zulvanavivi', options: { grab_focus: false } });

// --- colour helper: pack r,g,b into an opaque ARGB int ---
function C(r, g, b) { return (0xff000000 | (r << 16) | (g << 8) | b); }

// --- Spotify palette (subset, PoC only) ---
var SPOT = {
    base:  C(18, 18, 18),   // #121212 background
    green: C(29, 185, 84),  // #1DB954 accent
    white: C(255, 255, 255),// #FFFFFF primary text
    grey:  C(179, 179, 179) // #B3B3B3 secondary text
};

// --- GdiDrawText format flags (Win32 DrawText) ---
var DT_LEFT = 0x0, DT_CENTER = 0x1, DT_RIGHT = 0x2, DT_VCENTER = 0x4,
    DT_SINGLELINE = 0x20, DT_NOPREFIX = 0x800, DT_END_ELLIPSIS = 0x8000;
var FMT_L = DT_LEFT  | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX | DT_END_ELLIPSIS;
var FMT_R = DT_RIGHT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX;

// --- menu flag ---
var MF_STRING = 0x0;

// --- fonts: create ONCE (never inside on_paint) ---
var FONT = {
    brand: gdi.Font('Segoe UI', 15, 1), // 1 = bold
    title: gdi.Font('Segoe UI', 26, 1),
    sub:   gdi.Font('Segoe UI', 15, 0), // 0 = regular
    meta:  gdi.Font('Consolas', 12, 0)
};

// --- title-format objects: compile ONCE, evaluate per paint ---
var TF = {
    title:  fb.TitleFormat('[%title%]'),
    artist: fb.TitleFormat('[%artist%]'),
    album:  fb.TitleFormat('[%album%]'),
    clock:  fb.TitleFormat('[%playback_time%]  /  [%length%]')
};

// Panel size -- seed from window now, keep fresh in on_size().
var W = window.Width;
var H = window.Height;

function on_size(width, height) {
    W = width;
    H = height;
}

function on_paint(gr) {
    var pad = 24;

    // 1) base background -- proves we own the whole canvas.
    gr.FillSolidRect(0, 0, W, H, SPOT.base);

    // 2) green brand band -- unmistakably ours.
    var band = 56;
    gr.FillSolidRect(0, 0, W, band, SPOT.green);
    gr.GdiDrawText('foobar2000  x  Spotify   -   Phase 1 PoC',
        FONT.brand, SPOT.base, pad, 0, W - pad * 2, band, FMT_L);

    // 3) live now-playing data -- proves we can read playback state.
    var cy = Math.round(H / 2) - 40;
    if (fb.IsPlaying || fb.IsPaused) {
        var title  = TF.title.Eval();
        var artist = TF.artist.Eval();
        var album  = TF.album.Eval();

        gr.GdiDrawText(title, FONT.title, SPOT.white, pad, cy, W - pad * 2, 40, FMT_L);

        var line2 = [artist, album].filter(function (s) { return s && s.length; }).join('   -   ');
        gr.GdiDrawText(line2, FONT.sub, SPOT.grey, pad, cy + 44, W - pad * 2, 28, FMT_L);

        gr.GdiDrawText(TF.clock.Eval(), FONT.sub, SPOT.green, pad, cy + 76, W - pad * 2, 28, FMT_L);
    } else {
        gr.GdiDrawText('Nothing playing', FONT.title, SPOT.white, pad, cy, W - pad * 2, 40, FMT_L);
        gr.GdiDrawText('Press play in foobar2000 - this text updates live.',
            FONT.sub, SPOT.grey, pad, cy + 44, W - pad * 2, 28, FMT_L);
    }

    // 4) usage hint (bottom-left) + live panel size (bottom-right).
    gr.GdiDrawText('Left-click: controls & Preferences   -   Right-click: panel menu',
        FONT.meta, SPOT.grey, pad, H - 28, W - pad * 2, 20, FMT_L);
    gr.GdiDrawText('panel ' + W + ' x ' + H + ' px', FONT.meta, SPOT.grey,
        pad, H - 28, W - pad * 2, 20, FMT_R);
}

// Left-click anywhere -> a small controls menu (this panel has no toolbar yet).
function on_mouse_lbtn_up(x, y, mask) {
    var m = window.CreatePopupMenu();
    m.AppendMenuItem(MF_STRING, 1, (fb.IsPlaying && !fb.IsPaused) ? 'Pause' : 'Play');
    m.AppendMenuItem(MF_STRING, 2, 'Next');
    m.AppendMenuItem(MF_STRING, 3, 'Previous');
    m.AppendMenuItem(MF_STRING, 4, 'Stop');
    m.AppendMenuSeparator();
    m.AppendMenuItem(MF_STRING, 10, 'Open foobar2000 Preferences…');
    m.AppendMenuItem(MF_STRING, 11, 'Show Console');
    var id = m.TrackPopupMenu(x, y);
    switch (id) {
        case 1:  fb.PlayOrPause(); break;
        case 2:  fb.Next(); break;
        case 3:  fb.Prev(); break;
        case 4:  fb.Stop(); break;
        case 10: fb.ShowPreferences(); break;
        case 11: fb.ShowConsole(); break;
    }
    window.Repaint();
}

function on_playback_new_track(handle) { window.Repaint(); }
function on_playback_stop(reason)      { window.Repaint(); }
function on_playback_pause(state)      { window.Repaint(); }
function on_playback_time(time)        { window.Repaint(); } // ~1 Hz -> live clock

// Breadcrumb: visible in foobar's console so we can confirm reloads.
console.log('[foobar-spotify] JSplitter PoC main.js loaded');
