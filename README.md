# Spotify for foobar2000

A custom foobar2000 skin that reproduces Spotify's desktop layout, drawn from
scratch in a **JSplitter** panel (`foo_uie_jsplitter`, SpiderMonkey engine, GDI+).
It styles your **local** library/playlists — it does not connect to Spotify's
service.

Built in three phases: **1) PoC** (prove the pipeline) → **2) Research/mapping**
(decompose Spotify, map every element to foobar data) → **3) Implement**
(pixel-perfect build). This repo currently contains **Phase 1**.

> **Component note.** We're building on **JSplitter**, which you already have
> installed. The originally-planned *JavaScript Panel* is only distributed via a
> Hydrogenaudio forum thread that was down when we started; we can migrate later
> if desired. The two share a near-identical API.

---

## Requirements

- **foobar2000 v2.25+, 64-bit** (yours: `2.25.10.0` ✓)
- **Columns UI** active (JSplitter is a Columns UI panel) — installed ✓
- **JSplitter** (`foo_uie_jsplitter`) — installed ✓

---

## Phase 1 — get the PoC on screen

### 1. Make sure foobar is running **Columns UI**
Preferences → **Display** → set the interface to **Columns UI** (restart if
prompted). If foobar already looks like Columns UI, skip this.

### 2. Add a full-window **JSplitter** panel
Preferences → **Display → Columns UI → Layout**. In the layout tree, replace the
main content with a **JSplitter** panel (right-click → Insert/Replace → Panels →
*JSplitter*). Apply.

### 3. Load the script (simplest first)
Right-click the JSplitter panel → **Configure** (opens the script editor).
Select-all, delete, then paste the **entire** contents of
[`src/main.js`](src/main.js). Apply/OK.

You should immediately see: a **green top band** reading “foobar2000 × Spotify —
Phase 1 PoC”, the **live now-playing** title/artist/album, a green **clock**, and
the **panel size** in the corner.

---

## Dev loop (optional, after the PoC works)

Rather than re-pasting on every change:
```powershell
.\deploy.ps1 -Watch     # copies src\ into the profile on every save
```
Then set the panel's script to just the one-liner in
[`bootstrap.txt`](bootstrap.txt) (it `include()`s the deployed `main.js`), edit
`src\main.js`, and **reload the panel** (right-click → Reload). No foobar restart
needed. `console.log` output appears in foobar's **Console** (View → Console, or
`fb.ShowConsole()`).

---

## Phase 1 acceptance check

- [ ] Green band + our text render (not a stock panel)
- [ ] Play a track → title/artist/album appear and change per track
- [ ] Clock ticks every second while playing
- [ ] Resize the foobar window → panel-size text updates and layout reflows
- [ ] Edit `src\main.js` (e.g. change the band text) → reload → change shows

Passing all five proves the pipeline: our code draws the window, reads live
playback data, responds to events, and reloads.

---

## Layout

```
src/main.js     Phase 1 PoC test card (self-contained JSplitter script)
bootstrap.txt   optional one-line include() for the fast dev loop
deploy.ps1      copies src\ into the foobar profile ( -Watch to auto-sync )
```
Phase 3 will grow `src/` into `theme.js`, `lib/`, and `components/`
(sidebar, top bar, header, track list, now-playing bar).

*A JavaScript-Panel variant of the Phase 1 script is preserved in git history
(first commit) in case we migrate components later.*
