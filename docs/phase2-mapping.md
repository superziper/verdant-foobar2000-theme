# Phase 2 — Spotify → foobar mapping (Playlist/Album view)

Target reference: Spotify desktop **Playlist / Album detail** screen. The 3-zone
shell (sidebar · main · now-playing bar) is shared by every Spotify view; this
doc maps the Playlist view because it's the best fit for foobar (playing tracks
from a list) and the first thing we'll build in Phase 3.

**Status:** structural mapping (data/API + components) below is complete. Exact
pixel tokens (colors, spacing, fonts, gradients) are marked `TBD-screenshot` and
get filled from the user's Spotify screenshots.

Legend for the "Source" column:
- **API** = reuse foobar's engine/data via JSplitter (never rebuilt).
- **build** = draw the widget ourselves (pixel-perfect ⇒ almost everything).
- **reuse** = an existing native/other component already matches closely enough.

```
┌─ SIDEBAR ─┬──────────────── MAIN ────────────────┐
│ Home      │  ◀ ▶            (top bar)            │
│ Search    │  ┌────┐  PLAYLIST                     │
│ Library   │  │ART │  Big Title                    │
│  ♥ Liked  │  └────┘  owner · N songs · time       │
│  • pl 1   │  ▶(play)  ⇄  …                         │
│  • pl 2   │  #  Title           Album      ⏱      │
│  • pl 3   │  1  Song – Artist   Album      3:20   │
│           │  2  ...                                │
├───────────┴──── NOW-PLAYING BAR ──────────────────┤
│ [art] Title–Artist ♥   ⇄ ◀ ▶⏸▶ ↻   ⏱──●── ⏱  🔊──│
└───────────────────────────────────────────────────┘
```

## Zone A — Left sidebar
| Spotify element | foobar Source | Component | Interaction |
|---|---|---|---|
| Spotify wordmark / logo | build | `Sidebar` header | — |
| Home nav | build | `Sidebar/NavButton` | → show library root / all music |
| Search nav + box | API (`plman`/library search) + build | `Sidebar/Search` | type → filter library/playlist |
| "Your Library" header + create (+) | API `plman.CreatePlaylist` + build | `Sidebar` | + → new playlist |
| Liked Songs (pinned) | API (rating autoplaylist or a fixed playlist) | `Sidebar/LikedRow` | click → load in main |
| Playlist list (scrollable) | API `plman.PlaylistCount`, `GetPlaylistName(i)`, `ActivePlaylist` | `Sidebar/PlaylistList` (reuse `ScrollList`) | click → `plman.ActivePlaylist=i`; right-click → rename/delete |

## Zone B — Main content (Playlist view)
| Spotify element | foobar Source | Component | Interaction |
|---|---|---|---|
| Back / forward arrows | build (own view-history stack) | `TopBar` | nav between views |
| User avatar / menu | build | `TopBar` | menu (Preferences, etc.) |
| Cover art (large) | API `utils.GetAlbumArtV2` / `GetAlbumArtAsyncV2` | `Header/Art` | click → open art |
| Color gradient wash | API `GdiBitmap.GetColourScheme` / `GetColourSchemeJSON` | `Header/Gradient` | — |
| "PLAYLIST" label + Title | API `plman.GetPlaylistName(active)` | `Header/Text` | dbl-click → rename |
| Meta: owner · N songs · total time | API `plman.PlaylistItemCount` + titleformat `%length_seconds%` sum | `Header/Meta` | — |
| Big green Play button | API `plman.ExecutePlaylistDefaultAction` / `fb.PlayOrPause` | `Header/PlayBtn` | play playlist |
| Shuffle / … actions | API `plman.PlaybackOrder`, context cmds | `Header/Actions` | toggle shuffle etc. |
| Track-list header (#, Title, Album, ⏱) | build | `TrackList/Head` | click → sort (later) |
| Track rows | API `plman.GetPlaylistItems(active)` → `FbMetadbHandleList`; per-row titleformat (`%tracknumber%`,`%title%`,`%artist%`,`%album%`,`%length%`,`%added%`) | `TrackList/Row` (reuse `ScrollList`) | click=select, dbl-click/enter=play (`ExecutePlaylistDefaultAction`), hover=highlight, right-click=context |
| Now-playing row highlight | API `plman.GetPlayingItemLocation` / `playback.GetNowPlaying` | `TrackList/Row` | — |

## Zone C — Now-playing bar (bottom)
| Spotify element | foobar Source | Component | Interaction |
|---|---|---|---|
| Mini cover art | API `utils.GetAlbumArtV2(nowplaying)` | `NowPlaying/Art` | click → scroll to track |
| Title · Artist | API `playback.GetNowPlaying` + titleformat | `NowPlaying/Text` | — |
| Like (heart) | API rating (`%rating%` / foo_playcount) or Liked playlist | `NowPlaying/Like` | toggle like |
| Shuffle | API `plman.PlaybackOrder` | `NowPlaying/Transport` | cycle order |
| Previous / Play-Pause / Next | API `fb.Prev/PlayOrPause/Next`, `fb.IsPlaying/IsPaused` | `NowPlaying/Transport` | click |
| Repeat | API `plman.PlaybackOrder` (repeat/1) | `NowPlaying/Transport` | cycle |
| Seek bar + elapsed/total | API `fb.PlaybackTime`,`fb.PlaybackLength`, `on_playback_time`, `on_playback_seek` | `NowPlaying/Seekbar` | drag/click → set `fb.PlaybackTime` |
| Volume slider | API `fb.Volume` (dB) + `pos2vol`/`vol2pos` (Helpers.js) | `NowPlaying/Volume` | drag; wheel = Up/Down |
| Queue | API `plman` queue commands | `NowPlaying/Queue` | open queue (later) |
| Lyrics | **reuse** ESLyric (`foo_uie_eslyric`, installed) | integrate later | toggle |
| Devices/Connect | n/a (local) → maybe `fb.GetOutputDevices` | skip for now | — |

## Reuse vs build — summary
- **Reused via API (never rebuilt):** playback engine, playlist/library data, album art, ratings, playback order, output device.
- **Reused component:** ESLyric for lyrics (already installed) — optional integration.
- **Native UI widgets reused:** none — Spotify's look can't be hit with foobar's stock panels, so every visible widget is custom-drawn.

## Component tree (drives Phase 3 file layout)
```
App (root, routes paint/size/mouse)
├─ Sidebar        (nav + Your Library playlist list)
├─ Main
│  ├─ TopBar      (nav arrows, avatar/menu)
│  ├─ Header      (art, gradient, title, meta, play/actions)
│  └─ TrackList   (header row + virtualized rows)
└─ NowPlaying     (art+text+like | transport+seekbar | volume+queue)
shared: ScrollList, Button, ImageCache, theme(tokens), TitleFormat cache
```

## Design tokens — `TBD-screenshot`
Filled from the user's Spotify screenshots:
- Colors: base / sidebar / card / hover / text primary+secondary+muted / accent green + hover / gradient behavior.
- Metrics: sidebar width · now-playing height · row height · header art size · paddings · corner radii.
- Typography: family substitute + weight/size per text style (title, row, meta, nav).

## Needed from user (to finish Phase 2 pixel layer)
Screenshots of your Spotify, ideally maximized:
1. A **Playlist** open (sidebar + header + several track rows all visible).
2. A **close-up of the now-playing bar** (bottom strip).
3. Optional: a **track row hover** state and the **sidebar** with a few playlists.
