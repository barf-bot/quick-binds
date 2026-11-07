# AGENTS.md — QuickBinds

World of Warcraft addon for **WoW: Forever** (product `wowf`, client 1.60.1, interface
`16001`; the TOC also lists Modern's `120105`). A minimap button: right-click enters the
built-in Quick Keybind Mode, left-click opens the Esc > Keybindings settings panel.
Commands: `/qb`, `/qbk`, `/qbcenter`.

## Layout

- `QuickBinds/` — the addon itself (folder name is part of the install contract; the TOC
  must list exactly the `.lua` files in this folder, top level).
- `tools/` — Node-based static checks (this machine has no WoW client, no Lua interpreter,
  no `zip` binary; `python3` is available).
- `docs/plans/` — work plans, `docs/CHANGELOG.md` — dated change entries.
- `dist/`, `.cache/`, `tools/node_modules/` — generated, gitignored.

## Run and check

There is **no WoW client on this machine**; every check is static and must pass before a
commit:

    npm --prefix tools install   # once; installs luaparse
    node tools/check-lua.mjs     # Lua syntax pass over QuickBinds/*.lua (Lua 5.1 dialect)
    node tools/check-drag.mjs    # dragged frames are movable (SetMovable(true) precedes OnDragStart) and ride the ring
    node tools/check-apis.mjs    # API names vs Blizzard's own UI source (Gethe/wow-ui-source, live)
    node tools/check-icon.mjs    # icon.tga matches make-icon.py, is a disc, label matches art
    bash tools/package.sh        # builds dist/ zip + verifies folder/zip layout
    python3 tools/make-icon.py   # regenerates QuickBinds/Media/icon.tga (deterministic)

## Install (where a human verifies it)

Copy the `QuickBinds/` folder (or unzip the `dist/` artifact, which contains it as the
single root entry) into:

    <World of Warcraft>/_forever_/Interface/AddOns/QuickBinds/

Then `/reload` in game. The player's own `/reload` is the final proof; nothing here can
run the UI.

## Rules

- No external libraries (no LibDataBroker/LibDBIcon); the minimap button is a plain frame.
- API names must exist in the Blizzard `live` UI source dump — `tools/check-apis.mjs`
  enforces the list; extend the list whenever the addon starts using a new API.
- The repo is public: no names or Discord ids of people in any repo file.
- One commit per plan task, tick the task box in that commit.
