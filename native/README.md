# native/ — Verdant's own foobar2000 component

Verdant is a JavaScript theme, and almost everything it does belongs in JavaScript. This
folder holds the one thing that cannot be: **`foo_verdant`**, a small component that shows the
playing track on your Discord profile.

```
native/
  foo_verdant/
    foo_verdant.vcxproj     x64 only, v143, no ATL
    src/
      stdafx.h              PCH; takes the plain SDK header, not the ATL one
      discord_ipc.h/.cpp    the pipe client -- Win32 + std only, knows nothing about foobar
      presence.cpp          the foobar2000 glue: playback -> activity, menu toggle, TF field
    scripts/
      get-sdk.ps1           fetches the pinned foobar2000 SDK into native\sdk\ (gitignored)
      build.ps1             finds MSBuild via vswhere, builds, optionally deploys
  sdk/                      fetched, not committed
```

## Why a component at all

Discord's presence is tied to a **persistent duplex connection**: you open
`\\.\pipe\discord-ipc-N`, send a handshake, read `READY`, then push `SET_ACTIVITY` frames on
that same handle. Close the handle and Discord clears your presence.

Nothing available to a JSplitter panel can hold that handle. `utils.WriteBinaryFile` opens and
closes one per call; `ADODB.Stream` is file/memory only; `FileSystemObject` text streams are
read *or* write, never both; `WinHttp` cannot upgrade to the WebSocket transport; and
`MSWinsock` is not present on modern Windows. Hence ~500 lines of C++, and not one line more
than the transport needs.

## Why not a third-party component

[`foo_discord_rich`](https://github.com/TheQwertiest/foo_discord_rich) and its forks do this
already, and bundling one was the plan until two things settled it:

- The maintained fork with progress-bar support still compiles **upstream's** auto-update URL,
  and its version number is *lower* than upstream's. Any user with `foo_acfu` installed gets
  offered an "update" that replaces it with a build having no progress bar — silently breaking
  the feature, and Verdant would get the blame.
- Its artwork pipeline uploads your covers to imgur or catbox. Verdant references art by URL
  instead (see below), so nothing of yours is published anywhere.

Writing it also turned out to be the *lighter* build: the fork needs VS2022 with two
toolchains, CMake, Python, Go and ten submodules including a patched `discord-rpc`. This needs
VS2022 and the SDK, because writing `"type": 2` yourself is what the patch was for.

## What the Discord side actually does

Established by measuring a live Discord client, not read from documentation. These are
properties of the Discord client itself, identical for every user, so they are compiled in
as constants rather than detected at runtime:

| | |
|---|---|
| Activity type | `2` (Listening) is accepted from a third-party app over IPC and echoed back |
| Timestamps | send **seconds** — `1792641436` came back as `1792641436000`, so Discord normalises |
| Progress bar | needs **both** `start` and `end`; it animates itself from them |
| Pause | there is no paused state — drop the timestamps and the bar goes away |
| Updates | only on real change. 9 sends over 2 minutes were all accepted, none dropped |
| Rate limit | **the local pipe has none worth planning around** — 12 updates 300ms apart were all accepted, round trips 5–28ms |

That last row is why `presence.cpp` does **not** register `flag_on_playback_time`: a per-second
update would burn the rate limit re-sending a payload Discord is already animating correctly.

### Why the cover used to appear two seconds late

Worth recording, because the obvious suspect was wrong. A track change sends immediately with
the fallback art, the catalogue lookup lands a few hundred milliseconds later, and the
corrected card goes out as a second send. That second send was being held by **our own rate
floor**, not by the network — `kMinInterval` was 2000 ms, so the placeholder sat there for two
seconds regardless of how fast the lookup was. It is 250 ms now; the 5-per-20s window is what
actually protects the rate limit, and a floor only exists to coalesce bursts.

Two smaller network costs went with it: the WinHTTP session is opened once and reused, so
every album after the first skips DNS and the TLS handshake, and it uses `DEFAULT_PROXY`
rather than `AUTOMATIC_PROXY` — the automatic mode runs WPAD discovery, which costs a
broadcast and a timeout on networks that have no proxy at all.

### Why the card froze while skipping tracks

The same mistake, one layer up. This also carried a budget of 5 sends per 20 seconds, on the
belief that Discord silently drops updates past that. Skipping through tracks spends about
three sends per song — new track, pause, resume — so after two or three songs the budget was
gone and every further update was deferred for up to twenty seconds. The card looked stuck on
an old song, or vanished entirely.

**That limit does not exist on the local pipe.** Measured by sending 12 updates 300ms apart
to a live client: every one accepted, nothing refused, round trips of 5–28ms. The famous
"5 per 20 seconds" is the *gateway* presence limit, which the Discord client applies upstream
by coalescing on our behalf. Enforcing it a second time locally only throttled ourselves.

The budget is gone. What remains is a 250ms floor, purely to collapse a seek-storm.

### Why covers are looked up a song early

With both limiters fixed, what was left was the lookup itself — a network round trip sitting
on the critical path, so the card showed the fallback for as long as iTunes took to answer.
Tuning cannot remove that; only moving it can.

`prefetch_upcoming()` resolves the covers for the **next two items** in the playing playlist
when a track starts. The current track still has minutes left, so the work happens in dead
time, and by the time the user presses next the answer is already cached — the first activity
sent for the new track carries the real art, with no swap at all.

Two ahead rather than one, so a double-skip still lands warm. It costs nothing when the
albums are already known: a cached album returns immediately, a queued one is deduped, and
misses are remembered so an album no catalogue knows is never asked about twice. Shuffle makes
"next" a guess, and a wrong guess costs one request that is then cached anyway.

The first track of a session still pays full price. Everything after it should be instant.

### Why a cover still took ~1s when the request takes 87ms

Timed against the live endpoint: `dns=20ms tls=54ms total=87ms`, with the system on a direct
connection — no proxy, no PAC, no WPAD. So the catalogue was never the cost, and roughly nine
tenths of the delay was ours.

The culprit was the trip home. A resolved cover used to come back through
`fb2k::inMainThread()` so that `refresh()` could rebuild the activity — and a track change is
precisely when foobar's main thread is busiest, with the panel repainting, updating
now-playing and running its own artwork pipeline. The callback queued behind all of it.

Nothing about that hop was necessary: the only thing that changes when a cover lands is one
string. `on_art_resolved()` now takes the last published activity, swaps `large_image`, and
sends it **from the resolver thread**, touching no foobar API. `g_last` is kept under its own
mutex, and every exit from `refresh()` records through `publish()` so a cover arriving just
after a stop cannot put the card back up.

## Album art without uploading anything

Discord will not read a local file, so a cover needs a URL. A track tagged with a MusicBrainz
release id already has one — the Cover Art Archive serves it — so the default image script is
title formatting and nothing else:

```
$if(%musicbrainz_albumid%,https://coverartarchive.org/release/%musicbrainz_albumid%/front-500,foobar2000)
```

Tagged albums get their real cover with zero network calls from the component and zero uploads.
Everything else falls back to the static asset in the Discord application.

## How the theme talks to it

The component is deliberately dumb, and the panel keeps the logic:

| Verdant needs | How |
|---|---|
| Turn it on/off | `fb.RunMainMenuCommand('Library/Discord presence')` |
| Read the toggle | `fb.IsMainMenuCommandChecked(...)` — one source of truth, no second copy |
| Know if Discord is actually connected | `%verdant_drp%` → `off` / `connecting` / `live` |

## Building

```powershell
cd native\foo_verdant
.\scripts\get-sdk.ps1          # once; pinned SDK, prints its sha256
.\scripts\build.ps1            # Release x64 -> build\Release\foo_verdant.dll
.\scripts\build.ps1 -Deploy    # also copies into %VERDANT_PROFILE%\user-components-x64\
```

Requirements: **Visual Studio 2022 or VS BuildTools** with the C++ x64 toolchain, and
**7-Zip** (the SDK ships as `.7z`). ATL/MFC is **not** required — the project references `pfc`,
`foobar2000_SDK` and `foobar2000_component_client`, but deliberately not `helpers` or
`libPPUI`, both of which pull ATL in and neither of which a component with no UI needs.

The SDK is fetched rather than committed: it is not Verdant's to redistribute.

A full build leaves roughly 350 MB of intermediates — MSVC precompiled headers and LTCG
caches, under `native\sdk\**\x64\` and `native\foo_verdant\build\obj\`. Both are gitignored
and entirely regenerable; delete them whenever the disk matters and the next build rebuilds
them.

## Licence

`foo_verdant` is Verdant's own code, MIT, like the rest of `theme/` and `tools/`. It links the
foobar2000 SDK, which keeps its own licence (`native/sdk/sdk-license.txt` once fetched). It
uses no third-party libraries — the JSON it sends and the frames it writes are both hand-rolled,
which is why there is no `submodules/` here to go stale.
