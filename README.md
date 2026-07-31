# Verdant

**A modern Spotify-style theme for foobar2000.**

Drawn from scratch in a **JSplitter** panel (`foo_uie_jsplitter` — SpiderMonkey +
GDI+). It restyles your **local** library and playlists; it does not connect to
Spotify's service and plays nothing you don't already own.

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
- **Normalize volume** — one button in the All Songs header that levels your
  whole library. See [below](#normalize-volume).
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

1. Install foobar2000 as **portable** from the
   [official website](https://www.foobar2000.org/download).
2. Download **`Verdant-vX.Y.Z.zip`** from [Releases](../../releases).
3. Extract the **`profile`** folder from the zip into foobar2000's **root folder**
   (the one containing `foobar2000.exe`).
4. Start foobar2000 and enjoy.

That's it — no components to install separately, and **no fonts to install**:
Verdant uses Segoe UI and Segoe MDL2 Assets, both of which ship with Windows 10
and 11.

For a **standard (non-portable)** install, extract the *contents* of the `profile`
folder into `%APPDATA%\foobar2000` instead, then start foobar2000.

### Already have a foobar2000 you've set up?

**Don't extract over it.** The `profile` folder carries a layout and core settings,
so copying it in would replace your own. Run the installer instead:

1. Close foobar2000.
2. Double-click **`install.bat`**.
3. Start foobar2000.

It checks before it writes: it adds only the components you're missing, and if you
already use Columns UI it replaces **only the panel layout** — your colours, fonts,
playlist columns and filters are left alone, because it uses Columns UI's own layout
import rather than replacing its config file. It backs up whatever it touches and
writes an `uninstall.ps1` beside the backup in `<profile>\verdant-backup\<date>\`.

`extras\verdant-layout.fcl` is that layout on its own, if you'd rather import it
yourself: Preferences → Display → Columns UI → **Import**, ticking **Main Layout**
and **Toolbar Layout**.

> **Empty library?** The Home and All Songs views read foobar's Media Library,
> not your playlists. On a new foobar that library is empty, so add a music folder
> under Preferences → **Media Library**. That's expected, not a broken install.

---

## Tuning

Right-click the panel → **Properties**:

| Property | Default | What it does |
|---|---|---|
| `Display: UI scale (0 = auto)` | `0` | Scales every font and the title bar. `0` follows your display scaling; set `1.0` for compact, higher for a large or 4K screen. |
| `Scrolling: wheel step (px)` | `180` | How far one wheel notch scrolls the lists. |

Both are read when the panel loads, so **reload the panel** (right-click →
Reload) after changing them.

Sidebar and queue-pane widths are still code: `M.navW` / `M.queueW` in
[`theme/verdant/core/tokens.js`](theme/verdant/core/tokens.js).

Lyrics are read from a `.lrc` (synced) or `.txt` (plain) file sitting next to the
audio file with the same name.

---

## Normalize volume

**All Songs → Normalize volume** (the pill next to *Group:*) makes every track in
your library play back at the same loudness, so you stop reaching for the volume
knob between a quiet album and a loud one.

Under the hood this is **ReplayGain**, which is two separate things — and the
button owns both:

1. **A loudness measurement per track**, stored as a `REPLAYGAIN_TRACK_GAIN` tag
   in the file.
2. **Playback applying that measurement** (foobar's ReplayGain source mode).

The pill turns **green only when both are true**, so it can never claim to be on
while doing nothing. The line underneath tells you where you stand — e.g.
`1,204 of 3,000 tracks scanned`.

What happens when you click it:

| State | Click does |
|---|---|
| Some tracks unscanned | Asks for confirmation, then scans them and switches normalizing on |
| All scanned, normalizing off | Switches it on — instant, no rescan |
| Normalizing on (green) | Switches it off. Tags are left alone, so switching back on is instant |

**The scan writes tags into your audio files**, which is why it asks first. The
scan itself is foobar's own — its progress window and its *update file tags*
confirmation — so you can cancel there and nothing is written. Only unscanned
tracks are ever handed to it; rescanning is never repeated work. A large library
takes a while the first time, but it is a one-off.

Nothing here is destructive: no audio is re-encoded and no tag is removed. To
undo it completely, use foobar's own *ReplayGain → Remove ReplayGain information
from files* on your library.

---

## Dev loop

```powershell
.\tools\deploy.ps1 -Watch     # mirrors theme\verdant into the profile on every save
```

Edit under `theme\verdant\`, then **reload the panel** (right-click → Reload). No
foobar restart needed. `console.log` output appears in foobar's Console (View →
Console). Deploy copies the same folder to the same place the installer will, so
there is no separate build and no second code path.

For a different profile: `.\tools\deploy.ps1 -Watch -FoobarProfile 'D:\foobar2000\profile'`.

---

## Layout

```
theme/verdant/        the theme — copied verbatim into <profile>\verdant\
  main.js             entry point: declares the panel, sets the module load order
  core/               props, tokens, utils, title formats, memory caps, job scheduler
  data/               art, library, playback, lyrics, replaygain, dedupe, playlist edit
  ui/                 skeletons + shimmer, window chrome and shared widgets
  views/              nav, playlist, home, artist, songs, search, queue, bar, fullscreen
  app.js              panel state, layout, paint dispatch, input, foobar callbacks
components/           the three foobar components, bundled for the installer
dist-config/          layout + core config harvested from a clean-room foobar
tools/
  deploy.ps1          dev sync into the foobar profile ( -Watch to auto-sync )
  install.ps1/.bat    the shipped installer
  harvest.ps1         pull configuration out of the clean-room rig
  make-release.ps1    build Verdant-vX.Y.Z.zip
```

Every module is evaluated into **one shared global scope**, so a module can call
into any other; `main.js` fixes the order because a few things are computed at
load time (fonts from `UISCALE`, the reveal-gate ceiling from `ART_CAP`).

The whole theme runs on one thread shared with the UI — which is why the code
caches aggressively, slices long builds across timer ticks, and scopes repaints
to the one panel that changed.

---

## Notes

By **superziper**.

Not affiliated with or endorsed by Spotify. "Spotify" is a trademark of Spotify
AB; this is a fan-made visual theme for a local music player.
