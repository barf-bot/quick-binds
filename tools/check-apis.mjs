// API cross-check: every API name the addon calls must exist in Blizzard's own UI
// source (Gethe/wow-ui-source, `live` branch — the 12.1.x-era source that WoW: Forever
// 1.60.1 matches, and the dump the design was verified against). Fails if any name is
// missing, or if a name proven *absent* from the client (RegisterMinimapButton) shows up.
// Run: node tools/check-apis.mjs   (downloads a ~6 MB tarball into .cache/ once)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
  "SaveBindings",
  "LoadBindings",
  "GetCurrentBindingSet",
  "InCombatLockdown",
  "SlashCmdList",
  "EventRegistry",
  "Minimap",
  "GameTooltip",
  "SetClampedToScreen",
  "RegisterForDrag",
  "StartMoving",
  "StopMoving",
  "RegisterForClicks",
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

console.log(`check-apis: ${fileCount} dump files scanned`);
process.exit(failed ? 1 : 0);
