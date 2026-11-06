# Quick Binds (QuickBinds)

A minimap button for **WoW: Forever** (and Modern) that exposes the built-in
**Quick Keybind Mode**.

- **Right-click** the button (or `/qb`) — straight into Quick Keybind Mode: hover an
  action button, press a key. Esc or Okay keeps your new binds.
- **Left-click** (or `/qbk`) — opens Settings at the Keybindings category.
- **Drag** the button anywhere; position is remembered. `/qbcenter` re-centers it.
- Both clicks refuse during combat (bindings are protected then).

## Install

Copy the `QuickBinds/` folder into:

    <World of Warcraft>/_forever_/Interface/AddOns/

(or unzip the release zip there — it contains `QuickBinds/` as its only root entry) and
`/reload`.

`## Interface: 16001, 120105` — loads in WoW: Forever (1.60.1) and Modern.

## Development

See `AGENTS.md` — this repo has no game client here, so all checks are static
(`tools/` scripts).
