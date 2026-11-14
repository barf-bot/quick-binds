# Changelog

## 2026-11-14 — minimap-button-parent-and-anchor-maths (v0.1.7)

- v0.1.6's raise worked and cost the layout: `MinimapCluster` inherits `ResizeLayoutFrame`
  (`Blizzard_Minimap/Mainline/Minimap.xml:3`), so it resizes itself to fit every child.
  Two captures of the same screen at the same 578x434 resolution, QuickBinds off versus
  v0.1.6, show the minimap's edit-mode frame going from x 249..450 (201 px wide) to
  x 124..450 (326 px wide) — identical right and bottom edges, with the button's 125 px of
  left overhang absorbed by the cluster, while every other addon button (a child of
  `Minimap`) leaves those bounds alone. `CreateButton` parents the button to `Minimap`
  again and takes the rank v0.1.6 won from a named source instead of from the parent
  (`local raiseSource = MinimapCluster or Minimap;` feeding `SetFrameStrata` and
  `SetFrameLevel(raiseSource:GetFrameLevel() + 10)`, still re-applied on
  `PLAYER_ENTERING_WORLD` and `UI_SCALE_CHANGED`): home and rank are decoupled, so
  clearing the bronze ring no longer means joining the layout frame that stretches.
- The second v0.1.6 regression was the anchor maths. `SetPoint("CENTER", UIParent, ...)`
  reads UIParent units, and v0.1.6's `RingGeometry` divided by `button:GetEffectiveScale()`
  instead of `UIParent:GetEffectiveScale()` — scaling the whole position vector ~2.2x away
  from that origin on that screen and parking the button far outside the ring, which is
  the ground the cluster then grew to cover. `RingGeometry` and `SavePosition` are
  v0.1.5's conversions again (`Minimap:GetEffectiveScale() / UIParent:GetEffectiveScale()`
  and `button:GetEffectiveScale() / UIParent:GetEffectiveScale()`); `SIZE = 24`,
  `SetClampedToScreen(true)` and `Media/icon.tga` are untouched.
- Tooling: `tools/check-drag.mjs` pins the new shape — parent `Minimap`, the level and
  stratum read through `raiseSource`, and three geometry rules for the two scale ratios
  and the `UIParent`/`BOTTOMLEFT` anchor, with every v0.1.6 assertion kept. The changed
  rules were run red against the shipped v0.1.6 file (six failures), green after, and
  re-proven red by seven mutations of the new file (parent, raise-source value, each
  ratio, the anchor, `SetMovable`, `SetFrameStrata`). `check-apis.mjs` needed no new
  names; `bash tools/package.sh` builds `dist/QuickBinds-v0.1.7.zip`.

## 2026-11-13 — minimap-button-parent-and-size (v0.1.6)

- The v0.1.5 raise fixed the number, not the mechanism, so the mechanism changed: the
  button is now created on `MinimapCluster` (`parent = MinimapCluster or Minimap`)
  instead of `Minimap`. A child of `Minimap` cannot outrank the ring by frame level at
  all — the ring is `MinimapCompassTexture` (`atlas="ui-hud-minimap-frame"`) on the
  frame `MinimapBackdrop` (`Blizzard_Minimap/Mainline/Minimap.xml:219-238`); the 175x16
  `BorderTop` the old comment cited is Minimap.xml:18-25, the header plate, not the ring
  — because levels only rank frames inside one stratum. `RaiseAboveBorder` is now the
  one place the frame's level is set, taking `parent:GetFrameLevel() + 10` and copying
  `parent:GetFrameStrata()` (Blizzard's own recipe for the cluster's over-the-border
  ornament `InstanceDifficulty`, `MinimapClusterMixin:OnLoad`,
  `Blizzard_Minimap/Mainline/Minimap.lua:373-374`), called from `CreateButton` and
  re-applied on `PLAYER_ENTERING_WORLD` and `UI_SCALE_CHANGED`, when the client restamps
  cluster levels and rebuilds the cluster layout.
- `RingGeometry` converts minimap space with the button's own effective scale (the ratio
  `SavePosition` already used) instead of assuming the frame's space is `UIParent`'s,
  which stopped being true as soon as the frame moved parents; `SetClampedToScreen(true)`
  and the v0.1.4 ring/drag behaviour (one angle → point helper, the angle in
  `QuickBindsDB.minimapButton`, `/qbcenter`) are unchanged.
- `SIZE` 32 → **24**, derived in the comment next to the constant from the requester's
  screenshot: the neighbouring buttons render 27 px wide at their ~1.1 UI scale (the
  198-unit `Minimap` frame draws as the 215 px terrain circle in the same image), so a
  neighbour is 24 units — 0.75× the old frame. The art is an inscribed disc that scales
  to any frame size, so `Media/icon.tga` is untouched.
- Tooling: `tools/check-drag.mjs` grew the v0.1.6 frame rules — parent expression,
  parent-derived `+ 10` level, stratum copy, the two re-apply events and the exact
  `SetSize` value (asserted as `24`, not "a call containing a number"), every new
  assertion proven red by mutation against the shipped file and green after;
  `SetFrameStrata`, `GetFrameStrata`, `UI_SCALE_CHANGED` and `PLAYER_ENTERING_WORLD`
  joined the `check-apis.mjs` name list.

## 2026-11-13 — minimap-button-frame-level-and-art (v0.1.5)

- The button now renders above the minimap border instead of underneath it: the disc
  was cut in half by the bronze `BorderTop` ring that belongs to `MinimapCluster`.
  `CreateButton` raises the frame with Blizzard's own recipe (`MinimapClusterMixin:OnLoad`,
  `Blizzard_Minimap/Mainline/Minimap.lua:373-374`: the cluster's frame level + 10);
  clients without the `MinimapCluster` global fall back to `Minimap:GetFrameLevel() + 10`.
- `tools/make-icon.py` redraws the art to fill its whole 64 px canvas (v0.1.4's
  radius-30 disc left a 2 px transparent margin, so the visible disc measured 30 of
  the 32-unit frame beside ~33 px neighbours) and restyles it to the treatment the
  other minimap buttons share — gold rim, silver inner ring, dark plate with a gold
  `QB` legend, the gold-on-dark language of the sibling addon RankOne.
  `QuickBinds/Media/icon.tga` is regenerated; the same file is the TOC `## IconTexture`,
  so the addon-list icon gains the ring too. Frame size, ring/drag maths, clicks,
  tooltip, commands and the TOC `## Interface:` line are unchanged.
- Tooling: `tools/check-icon.mjs` now also pins the inscribed-disc margin contract
  (`DISC_R_PX` = half of `SIZE`) and samples the gold/silver/plate palette from the
  rendered TGA; `MinimapCluster`, `GetFrameLevel` and `SetFrameLevel` joined the
  `check-apis.mjs` name list.

## 2026-11-07 — minimap-ring-drag (v0.1.4)

- Dragging no longer parks the button in the middle of the screen: its centre may only
  sit on the circle around the minimap. `OnDragStop` now positions the frame at the ring
  point for the angle under the pointer instead of keeping the raw `GetCenter()` pair
  v0.1.1 stored, so the frame still follows the pointer while dragged and snaps onto the
  ring the moment the drag stops. The orbit radius is the minimap's own —
  `self:GetWidth() / 2`, the way Blizzard measures the minimap circle
  (`Blizzard_Minimap/Mainline/Minimap.lua:164`) — lifted by the 4 points of the old
  `SetPoint("CENTER", Minimap, "TOP", 0, 4)` anchor, so a fresh install and `/qbcenter`
  show exactly the spot the button always used, now as the top of the ring.
- `QuickBindsDB.minimapButton` stores `angle` (radians) instead of free `x`/`y`. An old
  `{ x = ..., y = ... }` entry still loads: the saved viewport point is projected onto
  the ring, and the next save writes the angle. Clicks and the tooltip are unchanged.
- Tooling: `tools/check-drag.mjs` keeps the v0.1.1 movability assertions and gains the
  ring rule — the drag-stop path must reach the file's one angle → point helper
  (`math.cos`/`math.sin`) and `QuickBindsDB.minimapButton` must hold an angle, so a drag
  that persists raw coordinates fails the build. `GetWidth`, `math.atan2`, `math.cos`,
  `math.sin` and `math.pi` joined the `check-apis.mjs` name list.

## 2026-11-07 — minimap-button-art (v0.1.3)

- The minimap button now reads **QB** and is a **round disc** instead of a blocky
  rounded-square keycap. `QuickBinds/Media/icon.tga` was rebuilt around a geometric
  circle — `tools/make-icon.py` fills `in_circle` where it used `in_rounded_rect`,
  giving a dark rim, a lit face and the engraved legend — which meant adding a `Q`
  glyph to the generator's `FONT` table and rendering `LEGEND_TEXT = "QB"`.
  `MinimapButton.lua` now takes its shape from that art: the colour plate it used to
  mask with `Interface\\CharacterFrame\\TempPortraitAlphaMask` rendered square in the
  client, and its `label` fallback text changed `"KB"` → `"QB"`. Size, drag handlers,
  saved position and `/qbcenter` are unchanged.
- Tooling: `tools/check-icon.mjs` fails the build when the committed `icon.tga` is not
  byte-for-byte what `tools/make-icon.py` renders (so the binary can no longer be
  hand-edited or left behind by a legend change), when the art's alpha silhouette stops
  being the disc the generator declares (`SIZE`/`SS`/`DISC_R_PX`), or when
  `MinimapButton.lua` drifts from the art (`label` text vs `LEGEND_TEXT`, artwork
  texture vs the shipped `Media/icon.tga`). `make-icon.py` gained `--out PATH` so the
  check can render without touching the addon folder, `__pycache__/` joined
  `.gitignore`, and the check is listed in `AGENTS.md`.

## 2026-11-07 — quick-keybind-settings-window (v0.1.2)

- Opening Quick Keybind Mode (right-click / `/qb`) left the Interface Options
  window open behind it: closing the mode with Okay or Cancel revealed Settings
  again, so leaving it took a second Esc. `EnterQuickKeybindMode()` now dismisses
  the Settings window first, with Blizzard's own skip-back flag
  (`pcall(SettingsPanel.Close, SettingsPanel, true)`, i.e.
  `SettingsPanel:Close(true)`), the same sequence as the Keybindings panel's own
  "Quick keybind" button
  (`Blizzard_SettingsDefinitions_Frame/Mainline/KeybindingsOverrides.lua:37-39`).
  Clients where the Settings addon is not loaded, or the window is hidden, behave
  exactly as before — no extra `LoadAddOn` call, no new chat lines.
- Tooling: `tools/check-apis.mjs` now also asserts that every function showing
  `QuickKeybindFrame` closes a shown `SettingsPanel` with the skip-back flag
  beforehand (fails on the 0.1.1 source, passes on this fix), and `SettingsPanel`,
  `Close` and `IsShown` joined its API name list.

## 2026-11-07 — minimap-button-drag-fix (v0.1.1)

- Dragging the minimap button did nothing: the frame was never declared movable,
  and `StartMoving`/`StopMovingOrSizing` are no-ops without `SetMovable(true)`
  (FrameXML pairs them, e.g. `movable="true" registerForDrag="LeftButton"` in
  Blizzard_MovePad.xml). `CreateButton()` now sets the frame movable, so the
  drag works and the saved-position path (`SavePosition` →
  `QuickBindsDB.minimapButton` → `RestorePosition`) is finally used.
- Tooling: `tools/check-drag.mjs` fails the build if a file calls `StartMoving()`
  without `SetMovable(true)` in frame setup ahead of `OnDragStart`;
  `SetMovable`/`StopMovingOrSizing` added to the `check-apis.mjs` name list.

## 2026-11-07 — minimap-quick-keybind-button (v0.1.0)

- Minimap button "KB": circular, ships its own generated keycap icon
  (`Media/icon.tga`, see `tools/make-icon.py`) with a text fallback; draggable
  anywhere with the position remembered across sessions; `/qbcenter` re-centers it.
- Right-click or `/qb` enters the built-in Quick Keybind Mode
  (`Blizzard_QuickKeybind` demand-loaded, `ShowUIPanel(QuickKeybindFrame)`).
- Left-click or `/qbk` opens Settings at the Keybindings category
  (`Settings.OpenToCategory(Settings.KEYBINDINGS_CATEGORY_ID)`), with one chat
  line as fallback where the panel isn't handed over.
- Bindings now persist on every successful rebind and at `PLAYER_LOGOUT`, so
  leaving Quick Keybind Mode with Esc no longer silently reverts new binds.
- Both entry points refuse during combat lockdown with a message.
- Tooling: Lua syntax check, API cross-check against Blizzard's live UI source,
  release-zip build + layout verification (`tools/`, see `AGENTS.md`).
