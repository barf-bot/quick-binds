// API cross-check: every API name the addon calls must exist in Blizzard's own UI
// source (Gethe/wow-ui-source, `live` branch — the 12.1.x-era source that WoW: Forever
// 1.60.1 matches, and the dump the design was verified against). Fails if any name is
// missing, or if a name proven *absent* from the client (RegisterMinimapButton) shows up.
// It also checks the Quick Keybind entry path against Blizzard's own sequence (below).
// Run: node tools/check-apis.mjs   (downloads a ~6 MB tarball into .cache/ once)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import luaparse from "luaparse";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = join(root, ".cache");
const dumpDir = join(cacheDir, "wow-ui-source-live");
const tarballUrl =
  "https://codeload.github.com/Gethe/wow-ui-source/tar.gz/refs/heads/live";

// Names the addon uses; each must appear in at least one source file.
const REQUIRED = [
  "KeybindFrames_InQuickKeybindMode",
  "KeybindListener.RebindSuccess",
  "Settings.OpenToCategory",
  "Settings.KEYBINDINGS_CATEGORY_ID",
  "C_AddOns.LoadAddOn",
  "ShowUIPanel",
  "SettingsPanel",
  "Close",
  "IsShown",
  "SaveBindings",
  "LoadBindings",
  "GetCurrentBindingSet",
  "InCombatLockdown",
  "SlashCmdList",
  "EventRegistry",
  "Minimap",
  "MinimapCluster",
  "GameTooltip",
  "SetClampedToScreen",
  "RegisterForDrag",
  "StartMoving",
  "StopMoving",
  "SetMovable",
  "GetFrameLevel",
  "SetFrameLevel",
  "StopMovingOrSizing",
  "RegisterForClicks",
  "GetWidth",
  "math.atan2",
  "math.cos",
  "math.sin",
  "math.pi",
];

// Verified absent from this client: C_Minimap has no RegisterMinimapButton, which is
// why the button is a plain frame. If Blizzard ships it, re-evaluate the design.
const FORBIDDEN = ["RegisterMinimapButton"];

function ensureDump() {
  if (existsSync(join(dumpDir, "Interface"))) return;
  mkdirSync(cacheDir, { recursive: true });
  const tgz = join(cacheDir, "wow-ui-source-live.tgz");
  console.log(`fetching ${tarballUrl} ...`);
  execFileSync("curl", ["-sfL", tarballUrl, "-o", tgz], { stdio: "inherit" });
  execFileSync("tar", ["xzf", tgz, "-C", cacheDir], { stdio: "inherit" });
  if (!existsSync(join(dumpDir, "Interface"))) {
    console.error("FAIL: dump did not extract to .cache/wow-ui-source-live/");
    process.exit(1);
  }
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(lua|xml|toc)$/.test(entry.name)) yield p;
  }
}

ensureDump();

const hits = new Map([...REQUIRED, ...FORBIDDEN].map((n) => [n, 0]));
let fileCount = 0;
for (const file of walk(join(dumpDir, "Interface"))) {
  fileCount++;
  const source = readFileSync(file, "latin1");
  for (const name of hits.keys()) {
    if (source.includes(name)) hits.set(name, hits.get(name) + 1);
  }
}

let failed = false;
for (const name of REQUIRED) {
  const count = hits.get(name);
  console.log(`${count > 0 ? "OK  " : "MISS"} ${name} (${count} file(s))`);
  if (count === 0) failed = true;
}
for (const name of FORBIDDEN) {
  const count = hits.get(name);
  console.log(`${count === 0 ? "OK  " : "FAIL"} ${name} absent? (${count} file(s))`);
  if (count !== 0) failed = true;
}

// --- Quick Keybind entry path -------------------------------------------------
// Blizzard's own "Quick keybind" button (Blizzard_SettingsDefinitions_Frame/
// Mainline/KeybindingsOverrides.lua:37-39) dismisses the open Settings window
// before showing the mode:
//
//     local skipTransitionBackToOpeningPanel = true;
//     SettingsPanel:Close(skipTransitionBackToOpeningPanel);
//     QuickKeybindFrame:Show();
//
// Skip that and Interface Options stays open behind the mode: closing the mode
// reveals it and the player pays a second Esc (the bug fixed in 0.1.2). Every
// function in the addon that shows QuickKeybindFrame must therefore close a shown
// SettingsPanel with the skip-back flag first, inside
// `if SettingsPanel and SettingsPanel:IsShown()` — the guard keeps the close safe
// on clients where the Settings addon was never loaded.

const addonDir = join(root, "QuickBinds");
const addonFiles = existsSync(addonDir)
  ? readdirSync(addonDir).filter((f) => f.endsWith(".lua")).sort()
  : [];

// The two spellings of "put Quick Keybind Mode on screen".
const SHOWS_QUICK_KEYBIND = new Set([
  "ShowUIPanel(QuickKeybindFrame)",
  "QuickKeybindFrame.Show()",
]);

// Spellings of "close SettingsPanel with the skip-back flag set". The pcall form
// passes self explicitly; `pcall(SettingsPanel.Close, true)` would hand `true` to
// self instead of the frame.
const CLOSES_SETTINGS_PANEL = new Set([
  "SettingsPanel.Close(true)",
  "SettingsPanel.Close(SettingsPanel, true)",
  "pcall(SettingsPanel.Close, SettingsPanel, true)",
]);

// Dotted name of a reference: `SettingsPanel:Close(...)` and `SettingsPanel.Close`
// both read as "SettingsPanel.Close"; `true`/`false` from a BooleanLiteral.
// luaparse 0.3.1 leaves StringLiteral.value null — the spelling is in .raw.
function refName(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "BooleanLiteral") return String(node.value);
  if (node.type !== "MemberExpression" && node.type !== "IndexExpression") return null;
  const object = refName(node.base);
  const member = refName(node.identifier) ?? stringText(node.index);
  return object && member ? `${object}.${member}` : null;
}

function stringText(node) {
  if (!node || node.type !== "StringLiteral") return null;
  if (node.value != null) return node.value;
  return (node.raw ?? "").replace(/^["']|["']$/gu, "");
}

// Every node under `node` (same traversal as check-drag.mjs's `calls()`).
function* nodes(node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) yield* nodes(item);
    return;
  }
  yield node;
  for (const key of Object.keys(node)) {
    if (key !== "range" && key !== "loc") yield* nodes(node[key]);
  }
}

// "SettingsPanel:Close(true)" -> "SettingsPanel.Close(true)"; null when an argument
// cannot be named (table literal, function literal, nested call).
function callSpelling(call) {
  const callee = refName(call.base);
  if (!callee) return null;
  const args = call.arguments.map((arg) => refName(arg));
  if (args.some((arg) => arg === null)) return null;
  return `${callee}(${args.join(", ")})`;
}

// `if SettingsPanel and SettingsPanel:IsShown() then` — tests both that the
// Settings window exists and that it is up. luaparse 0.3.1 groups if/elseif/else
// into IfStatement.clauses, so every clause of every if in the scope is inspected.
function guardedBodies(scope) {
  const bodies = [];
  for (const node of nodes(scope)) {
    if (node.type !== "IfStatement") continue;
    const clauses = node.clauses ?? [{ condition: node.condition, body: node.body }];
    for (const clause of clauses) {
      if (!clause.condition || !clause.body) continue;
      const refs = new Set();
      for (const inner of nodes(clause.condition)) {
        const name = refName(inner);
        if (name) refs.add(name);
      }
      if (refs.has("SettingsPanel") && refs.has("SettingsPanel.IsShown")) {
        bodies.push(clause.body);
      }
    }
  }
  return bodies;
}

function callLinesWhere(scope, names, lineOf) {
  return [...nodes(scope)]
    .filter((n) => n.type === "CallExpression" && names.has(callSpelling(n)))
    .map(lineOf);
}

function checkEntryPath(file) {
  const source = readFileSync(join(addonDir, file), "utf8");
  const lineOf = (node) => source.slice(0, node.range[0]).split("\n").length;
  let ast;
  try {
    ast = luaparse.parse(source, { luaVersion: "5.1", ranges: true });
  } catch (err) {
    return [`FAIL QuickBinds/${file}: unparseable (${err.message})`];
  }

  const shows = callLinesWhere(ast, SHOWS_QUICK_KEYBIND, lineOf);
  if (shows.length === 0) return [`OK   QuickBinds/${file}: no Quick Keybind entry`];

  // Every function that shows the frame; top-level code counts as its own scope so
  // a show outside a function is still covered.
  const all = [...nodes(ast)];
  const functions = all.filter(
    (n) => n.type === "FunctionDeclaration" || n.type === "FunctionExpression",
  );
  const entryScopes = functions.filter(
    (scope) => callLinesWhere(scope, SHOWS_QUICK_KEYBIND, lineOf).length > 0,
  );
  const targets = entryScopes.length > 0 ? entryScopes : [ast];

  const lines = [];
  for (const scope of targets) {
    const label = refName(scope.identifier) ?? "the top-level chunk";
    const show = Math.min(...callLinesWhere(scope, SHOWS_QUICK_KEYBIND, lineOf));
    const closes = callLinesWhere(scope, CLOSES_SETTINGS_PANEL, lineOf);
    const guarded = guardedBodies(scope).flatMap(
      (body) => callLinesWhere(body, CLOSES_SETTINGS_PANEL, lineOf),
    );
    if (closes.length === 0) {
      lines.push(
        `FAIL QuickBinds/${file}: ${label} shows QuickKeybindFrame (line ${show}) but never ` +
          "closes SettingsPanel — Blizzard's own entry closes it first: SettingsPanel:Close(true)",
      );
    } else if (guarded.length === 0) {
      lines.push(
        `FAIL QuickBinds/${file}: ${label} closes SettingsPanel (line ${Math.min(...closes)}) ` +
          'outside an "if SettingsPanel and SettingsPanel:IsShown()" guard, which errors when ' +
          "the Settings addon is not loaded",
      );
    } else if (Math.min(...guarded) > show) {
      lines.push(
        `FAIL QuickBinds/${file}: ${label} closes SettingsPanel (line ${Math.min(...guarded)}) ` +
          `after showing QuickKeybindFrame (line ${show}); the panel must be dismissed first`,
      );
    } else {
      lines.push(
        `OK   QuickBinds/${file}: ${label} closes a shown SettingsPanel (line ${Math.min(...guarded)}) ` +
          `before showing QuickKeybindFrame (line ${show})`,
      );
    }
  }
  return lines;
}

if (addonFiles.length === 0) {
  console.error("FAIL QuickBinds/: no .lua files to check the Quick Keybind entry path in");
  failed = true;
}
for (const file of addonFiles) {
  for (const line of checkEntryPath(file)) {
    if (line.startsWith("FAIL")) {
      failed = true;
      console.error(line);
    } else {
      console.log(line);
    }
  }
}

console.log(`check-apis: ${fileCount} dump files scanned`);
process.exit(failed ? 1 : 0);
