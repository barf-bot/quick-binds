# Quick Binds (QuickBinds)

A minimap button for **WoW: Forever** (and Modern) that exposes the built-in
**Quick Keybind Mode**.

- **Right-click** the button (or `/qb`) — straight into Quick Keybind Mode: hover an
  action button, press a key. Esc or Okay keeps your new binds.
- **Left-click** (or `/qbk`) — opens Settings at the Keybindings category.
- **Drag** the button around the edge of the minimap — it stays on that ring; the angle
  is remembered, and `/qbcenter` puts it back on top.
- Both clicks refuse during combat (bindings are protected then).

## Install

Copy the `QuickBinds/` folder into:

    <World of Warcraft>/_forever_/Interface/AddOns/

**From the release zip:** `bash tools/package.sh` builds `dist/QuickBinds-v<version>.zip`
(verified to contain `QuickBinds/` as its single root entry); unzip it into the `AddOns`
folder above.

Either way, `/reload` in game afterwards.

`## Interface: 16001, 120105` — loads in WoW: Forever (1.60.1) and Modern.

## Development

See `AGENTS.md` — this repo has no game client here, so all checks are static
(`tools/` scripts).
