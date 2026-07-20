# Spotify for foobar2000

A custom foobar2000 skin that reproduces Spotify's desktop layout, drawn from
scratch in a **JavaScript Panel** (marc2k3's component, SpiderMonkey engine).
It styles your **local** library/playlists — it does not connect to Spotify's
service.

Built in three phases: **1) PoC** (prove the pipeline) → **2) Research/mapping**
(decompose Spotify, map every element to foobar data) → **3) Implement**
(pixel-perfect build). This repo currently contains **Phase 1**.

---

## Requirements

- **foobar2000 v2.25 or later, 64-bit** (yours: `2.25.10.0` ✓)
- **JavaScript Panel** component (see install below)
- Columns UI is optional — the skin runs as a single full-window panel under
  Default UI or Columns UI.

---

## One-time setup

### 1. Install JavaScript Panel
1. Download the component from <https://javascript-panel.github.io/> (Installation page).
2. In foobar2000: **Preferences → Components → Install…**, pick the downloaded
   `foo_jscript_panel*.fb2k-component` (or drag it onto the list), then **Apply**
   and let it restart.

### 2. Deploy our script into the profile
From this repo folder, run:
```powershell
.\deploy.ps1
```
This copies `src\` into `…\foobar2000\profile\scripts\foobar-spotify\`.
(If your foobar profile is elsewhere: `.\deploy.ps1 -FoobarProfile 'X:\path\to\profile'`.)

### 3. Add a full-window JavaScript Panel
- **Default UI:** **View → Layout → Enable Layout Editing Mode**, right-click the
  main area → **Replace UI Element… → JavaScript Panel**. Turn off editing mode.
- **Columns UI:** add a **JavaScript Panel** as the single main panel.

### 4. Paste the bootstrap
Right-click the panel → **Configure**. Delete the sample code, paste the entire
contents of [`bootstrap.txt`](bootstrap.txt), press **Ctrl+S**.

You should immediately see: a **green top band** reading “foobar2000 × Spotify —
Phase 1 PoC”, the **live now-playing** title/artist/album, a green **clock**, and
the **panel size** in the corner.

---

## Dev loop (Phase 2+)

```powershell
.\deploy.ps1 -Watch   # auto-copies on every save
```
Then just edit files in `src\` and **reload the panel** (right-click → Reload, or
Ctrl+S in its config). No foobar restart needed for script changes. The
[`Console`](https://javascript-panel.github.io/) (a second JavaScript Panel using
the Console sample) shows `console.log` output and any errors.

---

## Phase 1 acceptance check

- [ ] Green band + our text render (not a default panel)
- [ ] Play a track → title/artist/album appear and change per track
- [ ] Clock ticks every second while playing
- [ ] Resize the foobar window → panel size text updates and layout reflows
- [ ] Edit `src\main.js` (e.g. change the band text) → deploy → reload → change shows

Passing all five proves the full pipeline: our code draws the window, reads live
playback data, responds to events, and hot-reloads from disk.

---

## Layout

```
src/main.js     Phase 1 PoC test card (single file)
bootstrap.txt   paste-once panel bootstrap (loads helpers.js + main.js)
deploy.ps1      copies src\ into the foobar profile ( -Watch to auto-sync )
```
Phase 3 will grow `src/` into `theme.js`, `lib/`, and `components/`
(sidebar, top bar, header, track list, now-playing bar).
