# minimap-quick-keybind-button

Status: in progress

## Design

**What you'll see:** a round keycap-icon button on the minimap. Right-click → straight into
Quick Keybind Mode (hover an action button, press a key, Esc/Okay saves). Left click →
Esc → Keybindings panel. Tooltip says which click does what. Chat commands mirror both
clicks.

**How it works:**
- Forever runs the modern API (1.60.1 includes all Modern changes up to 12.1.5), so this is
  the retail path: load `Blizzard_QuickKeybind` on demand, `ShowUIPanel(QuickKeybindFrame)`;
  mode state from `KeybindFrames_InQuickKeybindMode()`.
- Blizzard only writes bindings from that frame's Okay button — so the addon saves on hide
  and at logout, otherwise Esc silently loses your new binds.
- Left click: `LoadAddOn("Blizzard_Settings")` +
  `Settings.OpenToCategory(Settings.KEYBINDINGS_CATEGORY_ID)`; if the client doesn't hand it
  over, one chat line instead of a Lua error (the "don't care" case).
- Both clicks refuse in combat (bindings are protected) with a message.
- `## Interface: 16001, 120105`, folder `QuickBinds/`, plus a zip dropped into
  `_forever_/Interface/AddOns`.

**Not in this round:** in-game config panel, minimap libs (LibDataBroker/LibDBIcon), bind
import/export, drag-to-bind UI.

**How we check it:** there is no WoW client on this machine, so checks are static — Lua
syntax pass, every API name verified against Blizzard's own 12.1.5 UI source, and
folder/zip layout verified. Final proof is the player's own `/reload`.

Answers to the three design questions:
1. Button is **movable**: draggable anywhere, position remembered across sessions
   (SavedVariables), with a slash command to re-center/reset it.
2. Slash commands **`/qb`** (enter Quick Keybind Mode) and **`/qbk`** (open the Keybindings
   panel) are in scope.
3. The repo will be **public** (the bot publishes it; do not create or push a remote).

## Tasks

- [x] T1: Loadable skeleton, repo docs, Lua syntax check
  - files: `QuickBinds/QuickBinds.toc`, `QuickBinds/Core.lua`, `QuickBinds/MinimapButton.lua`,
    `tools/package.json`, `tools/check-lua.mjs`, `AGENTS.md`, `README.md`, `.gitignore`
  - change: TOC with `## Interface: 16001, 120105`, `## Title: Quick Binds`,
    `## SavedVariables: QuickBindsDB`, listing both lua files; the lua files start as stubs
    (namespace table only) so the addon loads clean; `check-lua.mjs` parses `QuickBinds/*.lua`
    with luaparse (Lua 5.1 dialect); AGENTS.md documents that no WoW client exists here — checks are
    `npm --prefix tools install`, `node tools/check-lua.mjs`, `node tools/check-apis.mjs` (T2),
    `bash tools/package.sh` (T7) — and install = copy `QuickBinds/` into
    `<Game>/_forever_/Interface/AddOns/`.
  - done when: both static checks that exist so far exit 0; the TOC lists exactly the files
    present in `QuickBinds/`; AGENTS.md names every command to run.
  - test: `node tools/check-lua.mjs` (new). Visual on player side: `/reload` with the folder
    installed produces no addon-load error (button itself comes in T3).

- [x] T2: API cross-check script against Blizzard UI source dump
  - files: `tools/check-apis.mjs`, `AGENTS.md` (checks section)
  - change: script downloads the `Gethe/wow-ui-source` `live` tarball
    (`codeload.github.com/Gethe/wow-ui-source/tar.gz/refs/heads/live`, ~6 MB) into
    `.cache/` (skip when already extracted), then greps the whole tree for every API name the
    addon uses — `KeybindFrames_InQuickKeybindMode`, `KeybindListener.RebindSuccess`,
    `Settings.OpenToCategory`, `Settings.KEYBINDINGS_CATEGORY_ID`, `C_AddOns.LoadAddOn`,
    `ShowUIPanel`, `SaveBindings`, `LoadBindings`, `GetCurrentBindingSet`, `InCombatLockdown`,
    `SlashCmdList`, `EventRegistry`, `Minimap`, `GameTooltip`, `SetClampedToScreen`,
    `RegisterForDrag`, `StartMoving`, `StopMoving`, `RegisterForClicks` — printing per-name hit
    counts; also asserts `RegisterMinimapButton` appears in **0** files (the manual-button premise).
  - done when: exit 0 with every name ≥ 1 hit and `RegisterMinimapButton` 0; adding a bogus
    name to the list makes it exit non-zero.
  - test: `node tools/check-apis.mjs` (new), plus the bogus-name failure probe (reverted after).

- [x] T3: Draggable minimap button with persisted position and `/qbcenter`
  - files: `QuickBinds/MinimapButton.lua`
  - change: plain circular 32px `CreateFrame("Button")` parented to `Minimap` with own
    backdrop + "KB" text (no external libs — `C_Minimap` has no RegisterMinimapButton in this
    client), `SetClampedToScreen(true)`, `RegisterForDrag("LeftButton")` with
    OnDragStart→`StartMoving`, OnDragStop→store `GetPoint()` into `QuickBindsDB.minimapButton`,
    restore from SavedVariables on `ADDON_LOADED`; default position centered above the minimap;
    tooltip shows name only; `SLASH_QUICKBINDSCENTER1 = "/qbcenter"` resets to default.
    `StartMoving` suppresses the click on release, so drag and left-click coexist (LibDBIcon-style).
  - done when: after `/reload` the button renders as a circle above the minimap; dragging it
    anywhere survives `/reload` and re-login; `/qbcenter` snaps it back;
    `node tools/check-lua.mjs` and `node tools/check-apis.mjs` pass.
  - test: both static checks (existing) + drag API names now exercised by code the T2 list
    already covers. Visual: circle above minimap, drag → `/reload` → still there, `/qbcenter` re-centers.

- [x] T4: Right-click enters Quick Keybind Mode; `/qb`
  - files: `QuickBinds/Core.lua` (`EnterQuickKeybindMode`), `QuickBinds/MinimapButton.lua`
    (register `LeftButton RightButton` clicks, OnClick right branch, tooltip line)
  - change: `Core.EnterQuickKeybindMode()`: refuse with one chat message when
    `InCombatLockdown()`; demand-load via
    `(C_AddOns and C_AddOns.LoadAddOn or LoadAddOn)("Blizzard_QuickKeybind")`
    (Blizzard_QuickKeybind.toc pulls in its `Blizzard_SettingsDefinitions_Frame` dependency);
    on load failure a chat message instead of erroring; then `ShowUIPanel(QuickKeybindFrame)`.
    `SLASH_QUICKBIND1 = "/qb"` calls the same function; tooltip gains
    "Right-click: Quick Keybind Mode".
  - done when: outside combat right-click (or `/qb`) shows the Blizzard QuickKeybind frame and
    hovering action buttons highlights them; in combat both print the refusal and change
    nothing; static checks pass.
  - test: static checks + `/qb` name in T2 list (`ShowUIPanel`, `InCombatLockdown`). Visual:
    mode frame opens from button and chat, key-press rebinds an action button.

- [x] T5: Bindings survive Esc — save on every successful rebind and at logout
  - files: `QuickBinds/Core.lua` (persistence init + event frame)
  - change: `EventRegistry:RegisterCallback("KeybindListener.RebindSuccess", ...)` →
    `SaveBindings(GetCurrentBindingSet())`, plus `PLAYER_LOGOUT` on a hidden frame → same save.
    Save point chosen from source, not guesswork: Esc runs
    `QuickKeybindFrameMixin:OnKeyDown`→`CancelBinding`→`LoadBindings`
    (`Blizzard_QuickKeybind/QuickKeybind.lua` lines 178–205), which reverts unsaved in-memory
    `SetBinding` calls **before** the frame hides, so an OnHide hook would be too late for the
    Esc path; per-`RebindSuccess` saves (fired at `Blizzard_Settings_Shared/Blizzard_Keybindings.lua:117`)
    mean the revert reloads already-saved state.
  - done when: rebind a key via mode, press Esc to leave, `GetBindingAction("<newkey>")` still
    returns the action immediately and after re-login; `/dump KeybindFrames_InQuickKeybindMode()`
    is `nil`/false after leaving; static checks pass.
  - test: static checks (`EventRegistry`, `SaveBindings`, `GetCurrentBindingSet` in T2 list).
    Visual: rebind → Esc → binding kept; Okay path also still works (Blizzard's own
    `KeybindListener:Commit` is idempotent re-save).

- [x] T6: Left-click opens the Keybindings settings panel; `/qbk`
  - files: `QuickBinds/Core.lua` (`OpenKeybindSettings`), `QuickBinds/MinimapButton.lua`
    (OnClick left branch, tooltip line)
  - change: refuse in combat with a message; demand-load `Blizzard_Settings` **and**
    `Blizzard_SettingsDefinitions_Frame` (that addon's `Keybindings.lua:282` is what sets
    `Settings.KEYBINDINGS_CATEGORY_ID`; `Blizzard_Settings.toc` has no dependency on it, so
    both loads are required); if the id is still nil or
    `pcall(Settings.OpenToCategory, Settings.KEYBINDINGS_CATEGORY_ID)` fails, print one chat
    line pointing at Esc > Keybindings — never a Lua error. `SLASH_QUICKBINDK1 = "/qbk"`;
    tooltip gains "Left-click: Keybindings panel".
  - done when: left-click or `/qbk` outside combat opens Settings scrolled to the Keybindings
    category; with the category id temporarily forced nil the fallback prints cleanly; static
    checks pass.
  - test: static checks (`Settings.OpenToCategory`, `Settings.KEYBINDINGS_CATEGORY_ID` in T2
    list). Visual: panel opens on the Keybindings page; forced-nil run shows the chat line.

- [x] T7: Release zip and packaging check
  - files: `tools/package.sh`, `tools/check-package.mjs`, `README.md` (install-from-zip section)
  - change: `package.sh` builds `dist/QuickBinds-v0.1.0.zip` with
    `python3 -m zipfile -c` (no `zip` binary on this machine) containing `QuickBinds/` as the
    single root entry; `check-package.mjs` lists the archive via `python3 -m zipfile -l` and
    asserts: root `QuickBinds/QuickBinds.toc`, every TOC-listed file present in the zip and
    every zip `.lua` listed in the TOC, and the exact `## Interface: 16001, 120105` line;
    README documents unzip into `_forever_/Interface/AddOns`.
  - done when: `bash tools/package.sh` exits 0 after writing the zip and running the layout
    check; deleting a file from the TOC makes the layout check exit non-zero.
  - test: `bash tools/package.sh` (new, bundles `check-package.mjs`). Visual: unzip of the
    artifact yields `QuickBinds/QuickBinds.toc` directly under the drop folder.

- [ ] T8: In-repo addon icon `Media/icon.tga`
  - files: `tools/make-icon.py`, `QuickBinds/Media/icon.tga`, `QuickBinds/QuickBinds.toc`,
    `QuickBinds/MinimapButton.lua`, `tools/check-package.mjs`
  - change: commit `tools/make-icon.py` which writes an uncompressed 32-bit BGRA TGA
    (square, alpha): rounded keycap with "KB" on a dark background, legible at 32x32; run it
    and commit the `.tga`. TOC gains `## IconTexture: Interface\AddOns\QuickBinds\Media\icon.tga`
    (media, so correctly NOT a TOC file entry). The minimap button reuses this texture, with
    the "KB" text kept as the fallback path, no new dependencies.
  - done when: `python3 tools/make-icon.py` rewrites `QuickBinds/Media/icon.tga`
    byte-identically on a second run; `bash tools/package.sh` passes with the added
    assertion that the `.tga` is in the zip; Lua/TOC checks pass.
  - test: `bash tools/package.sh` (existing, extended with the tga assertion). Visual: render
    the keycap pixels to a scratch PNG preview and look at it at 32x32 (preview stays
    uncommitted).
