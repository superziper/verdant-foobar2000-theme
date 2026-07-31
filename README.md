# Spotify for foobar2000

A Spotify-styled skin for foobar2000, drawn from scratch in a **JSplitter** panel
(`foo_uie_jsplitter` — SpiderMonkey + GDI+). It restyles your **local** library
and playlists; it does not connect to Spotify's service and plays nothing you
don't already own.

Everything on screen is custom-drawn — sidebar, home, playlist and All Songs
views, search, queue/lyrics pane, player bar, fullscreen mode, and the window
title bar. No stock foobar widgets are involved.

---

## Features

- **Home** — a horizontal shelf of your playlists (2×2 cover mosaics) above a
  grid of every artist in your library.
- **Playlist view** — gradient header tinted from the cover art, sortable track
  list (title / artist / album, asc-desc), inline rename, delete, and drag-and-drop
  import with duplicate detection.
- **All Songs** — the whole library in one virtualised list, optionally grouped
  by artist, album, or both.
- **Search** — instant search across artists and tracks.
- **Queue / Lyrics pane** — what's playing next (real queue and "next from"),
  or synced `.lrc` / plain `.txt` lyrics that roll with the track.
- **Fullscreen mode** — big now-playing art, lyrics, or an FFT audio visualizer
  fed from real PCM.
- **Shuffle that tells the truth** — shuffle plays a hidden shuffled copy of the
  playlist, so the "next up" list is the actual upcoming order.
- **Custom title bar** — frameless window with real File / Library / Help menus
  and window controls (needs `foo_ui_wizard`; degrades gracefully without it).

---

## Requirements

- **foobar2000 v2, 64-bit** (developed and tested on 2.25)
- **Columns UI** (`foo_ui_columns`) — JSplitter is a Columns UI panel
- **JSplitter** (`foo_uie_jsplitter`)
- *Optional:* **UI Wizard** (`foo_ui_wizard`) — enables the frameless window and
  the custom title bar. Without it the skin still runs; you just keep the normal
  Windows title bar.

---

## Install

1. **Switch foobar to Columns UI.**
   Preferences → **Display** → set the interface to **Columns UI** (restart if
   prompted).

2. **Add a full-window JSplitter panel.**
   Preferences → **Display → Columns UI → Layout**. Replace the main content
   with a **JSplitter** panel (right-click → Insert/Replace → Panels →
   *JSplitter*). Apply.

3. **Load the script.**
   Right-click the panel → **Configure**. Select all, delete, paste the entire
   contents of [`src/main.js`](src/main.js). Apply/OK.

That's it — the skin picks up your existing playlists and Media Library.

> **Empty library?** The Home and All Songs views read foobar's Media Library,
> not your playlists. Add a music folder under Preferences → **Media Library**
> if those look bare.

---

## Tuning

Two knobs near the top of [`src/main.js`](src/main.js):

| Setting | Default | What it does |
|---|---|---|
| `UISCALE` | `1.25` | Scales every font. Raise for high-DPI screens, lower toward `1.0` for a compact look. |
| `M.navW` / `M.queueW` | `230` / `400` | Sidebar and queue-pane widths, in pixels. |

Lyrics are read from a `.lrc` (synced) or `.txt` (plain) file sitting next to the
audio file with the same name.

---

## Dev loop

Rather than re-pasting on every change:

```powershell
.\deploy.ps1 -Watch     # copies src\ into the foobar profile on every save
```

Then set the panel's script to the one line in
[`bootstrap.txt`](bootstrap.txt) (it `include()`s the deployed `main.js`), edit
`src\main.js`, and **reload the panel** (right-click → Reload). No foobar restart
needed. `console.log` output appears in foobar's Console (View → Console).

For a portable foobar install, point the script at your profile folder:
`.\deploy.ps1 -Watch -FoobarProfile 'D:\foobar2000\profile'`.

---

## Layout

```
src/main.js     the skin (single self-contained JSplitter script)
bootstrap.txt   one-line include() for the dev loop
deploy.ps1      copies src\ into the foobar profile ( -Watch to auto-sync )
```

The single file is deliberate: a JSplitter panel takes one script, and the whole
skin runs on one thread shared with the UI — which is why the code caches
aggressively, slices long builds across timer ticks, and scopes repaints to the
one panel that changed.

---

## Notes

Not affiliated with or endorsed by Spotify. "Spotify" is a trademark of Spotify
AB; this is a fan-made visual theme for a local music player.
