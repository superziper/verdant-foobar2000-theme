'use strict';

/* =============================================================
 * foobar2000 x Spotify  --  Phase 1 PoC (main.js)
 * -------------------------------------------------------------
 * Purpose: prove our JavaScript actually drives the foobar2000
 * window and can read live playback data. This is NOT the skin;
 * it is a deliberately loud "test card".
 *
 * Loaded by the inline panel bootstrap (see ../bootstrap.txt),
 * which first includes the component's helpers.js (RGB, Scale,
 * CreateFontString, DWRITE_* constants) and then this file.
 *
 * Dev loop: edit this file -> run deploy.ps1 -> reload the panel
 * (right-click > Reload, or Ctrl+S in its config editor).
 * ============================================================= */

// --- Spotify palette (subset, PoC only) ---
const SPOT = {
    base:  RGB(18, 18, 18),   // #121212 background
    green: RGB(29, 185, 84),  // #1DB954 accent
    white: RGB(255, 255, 255),// #FFFFFF primary text
    grey:  RGB(179, 179, 179) // #B3B3B3 secondary text
};

// --- Fonts (Size gets DPI-scaled inside CreateFontString) ---
const FONT = {
    brand: CreateFontString('Segoe UI', 15, true),
    title: CreateFontString('Segoe UI', 26, true),
    sub:   CreateFontString('Segoe UI', 15, false),
    meta:  CreateFontString('Consolas', 12, false)
};

// --- Title-format objects: compiled once, evaluated per paint ---
const TF = {
    title:  fb.TitleFormat('[%title%]'),
    artist: fb.TitleFormat('[%artist%]'),
    album:  fb.TitleFormat('[%album%]'),
    clock:  fb.TitleFormat('[%playback_time%]  /  [%length%]')
};

// Thin wrapper around the (long) WriteTextSimple signature.
function drawText(gr, str, font, colour, x, y, w, h, align) {
    gr.WriteTextSimple(
        str, font, colour, x, y, w, h,
        align,
        DWRITE_PARAGRAPH_ALIGNMENT_CENTER,
        DWRITE_WORD_WRAPPING_NO_WRAP,
        DWRITE_TRIMMING_GRANULARITY_CHARACTER
    );
}

function nowPlaying() {
    const m = playback.GetNowPlaying();
    if (!m) return null;
    return {
        title:  TF.title.EvalWithMetadb(m),
        artist: TF.artist.EvalWithMetadb(m),
        album:  TF.album.EvalWithMetadb(m)
    };
}

// ------------------------- callbacks -------------------------

function on_paint(gr) {
    const w = window.Width;
    const h = window.Height;
    const pad = Scale(24);

    // 1) Base background -- proves we own the whole canvas.
    gr.Clear(SPOT.base);

    // 2) Green brand band across the top -- unmistakably ours.
    const band = Scale(56);
    gr.FillRectangle(0, 0, w, band, SPOT.green);
    drawText(gr, 'foobar2000  x  Spotify   -   Phase 1 PoC',
        FONT.brand, SPOT.base, pad, 0, w - pad * 2, band,
        DWRITE_TEXT_ALIGNMENT_LEADING);

    // 3) Live now-playing data -- proves we can read playback state.
    const np = nowPlaying();
    const cy = Math.round(h / 2) - Scale(40);

    if (np) {
        drawText(gr, np.title, FONT.title, SPOT.white,
            pad, cy, w - pad * 2, Scale(40), DWRITE_TEXT_ALIGNMENT_LEADING);

        const line2 = [np.artist, np.album].filter(s => s.length).join('   -   ');
        drawText(gr, line2, FONT.sub, SPOT.grey,
            pad, cy + Scale(44), w - pad * 2, Scale(28), DWRITE_TEXT_ALIGNMENT_LEADING);

        drawText(gr, TF.clock.Eval(), FONT.sub, SPOT.green,
            pad, cy + Scale(76), w - pad * 2, Scale(28), DWRITE_TEXT_ALIGNMENT_LEADING);
    } else {
        drawText(gr, 'Nothing playing', FONT.title, SPOT.white,
            pad, cy, w - pad * 2, Scale(40), DWRITE_TEXT_ALIGNMENT_LEADING);
        drawText(gr, 'Press play in foobar2000 - this text updates live.',
            FONT.sub, SPOT.grey,
            pad, cy + Scale(44), w - pad * 2, Scale(28), DWRITE_TEXT_ALIGNMENT_LEADING);
    }

    // 4) Live panel size -- proves on_size() triggers a correct repaint.
    drawText(gr, 'panel ' + w + ' x ' + h + ' px', FONT.meta, SPOT.grey,
        pad, h - Scale(28), w - pad * 2, Scale(20), DWRITE_TEXT_ALIGNMENT_TRAILING);
}

function on_size()               { window.Repaint(); }
function on_playback_new_track() { window.Repaint(); }
function on_playback_stop()      { window.Repaint(); }
function on_playback_pause()     { window.Repaint(); }
function on_playback_time()      { window.Repaint(); } // ~1 Hz -> live clock

// Breadcrumb: visible in the JS Panel "Console" so we can confirm reloads.
console.log('[foobar-spotify] PoC main.js loaded');
