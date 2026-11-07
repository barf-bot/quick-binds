# Changelog

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
