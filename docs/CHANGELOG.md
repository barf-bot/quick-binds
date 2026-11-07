# Changelog

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
