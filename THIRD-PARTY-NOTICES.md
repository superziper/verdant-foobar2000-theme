# Third-party notices

Verdant itself is MIT licensed (see [LICENSE](LICENSE)). That licence covers Verdant's own work:
everything under `theme/`, `tools/`, `dist-config/` and `docs/`.

That licence also covers **`foo_verdant`**, the Discord presence component — its source is under
`native/` and it is Verdant's own work, not a third party's. It links the **foobar2000 SDK**
(© Peter Pawlowski, used under the SDK's own licence, fetched at build time rather than
redistributed here) and uses no third-party libraries beyond it.

To make the theme install in one step, the repository and the release zip also **redistribute three
foobar2000 components, unmodified**. Those components are not Verdant's work and keep their own
licences and copyright.

They are shipped under `components/` in this repository and under
`profile/user-components-x64/` in the release zip.

---

## Columns UI (`foo_ui_columns`)

- **Copyright** © Reupen Shah
- **Licence:** GNU Lesser General Public License v3.0
- **Source:** https://github.com/reupen/columns_ui
- **Licence texts:** [`components/foo_ui_columns/COPYING.txt`](components/foo_ui_columns/COPYING.txt)
  (GPL-3.0) and [`components/foo_ui_columns/COPYING.LESSER.txt`](components/foo_ui_columns/COPYING.LESSER.txt)
  (LGPL-3.0)

Redistributed as an unmodified binary. The complete corresponding source is available at the URL
above.

## UI Wizard (`foo_ui_wizard`)

- **Copyright** © The Wizardium
- **Licence:** MIT
- **Source:** https://github.com/The-Wizardium/UI-Wizard
- **Licence text:** [`components/foo_ui_wizard/LICENSE.txt`](components/foo_ui_wizard/LICENSE.txt)

Redistributed as an unmodified binary.

## JSplitter (`foo_uie_jsplitter`)

- **Copyright** © LUR
- **Licence:** not stated by the author. The component is distributed publicly by its author via the
  Hydrogenaudio forums, and is redistributed here **unmodified** purely so that Verdant installs in
  one step.
- Includes **SpiderMonkey** (`mozjs-lur-102.dll`), the Mozilla JavaScript engine, licensed under the
  **Mozilla Public License 2.0** — https://www.mozilla.org/MPL/2.0/

If you are the author and would prefer this component not be redistributed here, please open an issue
and it will be removed from the bundle; Verdant will then link to your download instead.

---

## Cover art services

Verdant uploads nothing. To show a cover on the Discord card — which Discord will only display
by URL, never from a local file — `foo_verdant` matches the album against public catalogues and
links to the artwork they already host:

- **Cover Art Archive** / **MusicBrainz** — used only for files already carrying a
  `MUSICBRAINZ_ALBUMID` tag, which needs no request at all
- **iTunes Search API** and **Deezer API** — queried with an artist and album name, the same two
  strings already shown on the card

No account or API key is involved with any of them, results are cached on disk so an album is
asked about once, and artwork remains the property of its respective rights holders.

## Fonts

None are bundled or installed. Verdant uses **Segoe UI** and **Segoe MDL2 Assets**, which ship with
Windows 10 and 11 and remain licensed by Microsoft as part of Windows.

## Trademarks

Not affiliated with or endorsed by Spotify. "Spotify" is a trademark of Spotify AB. Verdant is a
fan-made visual theme for a local music player and does not connect to Spotify's service.
