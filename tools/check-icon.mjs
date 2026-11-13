// Icon check: tools/make-icon.py is the single source of truth for the shipped art,
// so artwork regressions fail the build here:
//   1. QuickBinds/Media/icon.tga is byte-for-byte what the generator renders
//      (`python3 tools/make-icon.py --out <temp>`) — a stale or hand-edited binary
//      fails, and the label text cannot be changed without regenerating the art;
//   2. the icon's opaque silhouette is exactly the disc the generator declares
//      (SIZE / SS / DISC_R_PX) and that disc is the canvas inscribed — no
//      transparent margin since v0.1.5 — so art that slides back to a square or
//      rounded-rect plate, or shrinks inside its frame, fails even if the .tga is
//      a faithful render of that;
//   3. the pixels sampled from each ring band carry the declared palette — GOLD
//      rim, SILVER inner ring, dark PLATE — so the art cannot drift off the
//      minimap-button treatment without the generator being updated too;
//   4. the `label` text in QuickBinds/MinimapButton.lua equals the generator's
//      LEGEND_TEXT, so the text fallback never reads something else than the art;
//   5. the button draws its artwork from that shipped path — a Blizzard texture may
//      only appear once it is verified (AGENTS.md), never as an unverified guess.
// Run: node tools/check-icon.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import luaparse from "luaparse";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const genPy = join(root, "tools", "make-icon.py");
const tgaPath = join(root, "QuickBinds", "Media", "icon.tga");
const buttonLua = join(root, "QuickBinds", "MinimapButton.lua");

let checks = 0;
let failed = false;
const need = (cond, msg) => {
  checks += 1;
  console.log(`${cond ? "OK  " : "FAIL"} ${msg}`);
  if (!cond) failed = true;
};

if (!existsSync(genPy)) {
  console.error(`FAIL: tools/make-icon.py not found`);
  process.exit(1);
}
if (!existsSync(buttonLua)) {
  console.error(`FAIL: QuickBinds/MinimapButton.lua not found`);
  process.exit(1);
}

// --- the contract the generator declares ----------------------------------------
// SIZE, SS, DISC_R_PX and LEGEND_TEXT plus the two inner ring radii (SILVER_R_PX,
// PLATE_R_PX) and the palette colours (GOLD, SILVER, PLATE) are plain module
// constants of make-icon.py and are exactly what its renderer uses, so reading
// them costs no second geometry.
const gen = readFileSync(genPy, "utf8");
const intConst = (name) => {
  const found = gen.match(new RegExp(`^${name} += *(\\d+)`, "m"));
  return found === null ? null : Number(found[1]);
};
const colourConst = (name) => {
  const channel = "(0[xX][0-9A-Fa-f]{1,2}|\\d+)";
  const found = gen.match(new RegExp(`^${name} += *\\(${channel}, *${channel}, *${channel}\\)`, "m"));
  return found === null ? null : [Number(found[1]), Number(found[2]), Number(found[3])];
};
const size = intConst("SIZE");
const ss = intConst("SS");
const discRadiusPx = intConst("DISC_R_PX");
const silverRadiusPx = intConst("SILVER_R_PX");
const plateRadiusPx = intConst("PLATE_R_PX");
const legendText = (gen.match(/^LEGEND_TEXT += *"([^"]*)"/m) ?? [])[1] ?? null;
const gold = colourConst("GOLD");
const silver = colourConst("SILVER");
const plate = colourConst("PLATE");

if (
  size === null ||
  ss === null ||
  discRadiusPx === null ||
  silverRadiusPx === null ||
  plateRadiusPx === null ||
  gold === null ||
  silver === null ||
  plate === null ||
  legendText === null
) {
  console.error(
    "FAIL: tools/make-icon.py declares no art contract " +
      `(SIZE: ${size}, SS: ${ss}, DISC_R_PX: ${discRadiusPx}, SILVER_R_PX: ${silverRadiusPx}, ` +
      `PLATE_R_PX: ${plateRadiusPx}, GOLD: ${gold}, SILVER: ${silver}, PLATE: ${plate}, ` +
      `LEGEND_TEXT: ${legendText})`,
  );
  process.exit(1);
}

// --- 1. the committed binary is the generator's output ---------------------------
const outDir = mkdtempSync(join(tmpdir(), "quickbinds-icon-"));
const outTga = join(outDir, "icon.tga");
try {
  execFileSync("python3", [genPy, "--out", outTga]);
} catch (err) {
  console.error(`FAIL: python3 tools/make-icon.py --out <tmp> failed: ${err.message}`);
  process.exit(1);
}
if (!existsSync(outTga)) {
  console.error(`FAIL: make-icon.py ignored --out and wrote no ${outTga}`);
  process.exit(1);
}
const generated = readFileSync(outTga);
if (!existsSync(tgaPath)) {
  console.error("FAIL: QuickBinds/Media/icon.tga not found");
  process.exit(1);
}
const committed = readFileSync(tgaPath);
need(
  Buffer.compare(committed, generated) === 0,
  "QuickBinds/Media/icon.tga matches tools/make-icon.py output byte-for-byte",
);

// --- 2. the shape is the declared disc, not a square plate -----------------------
// Output pixel (px, py) covers high-res pixels (px*SS .. px*SS+SS-1); alpha is 255
// inside the disc and 0 outside, so "any subpixel inside" <=> "pixel opaque".
const highCenter = (size * ss) / 2;
const highRadius = discRadiusPx * ss;
const subpixelsInDisc = (px, py) => {
  let inside = 0;
  for (let dy = 0; dy < ss; dy += 1) {
    for (let dx = 0; dx < ss; dx += 1) {
      const ddx = px * ss + dx - highCenter;
      const ddy = py * ss + dy - highCenter;
      if (ddx * ddx + ddy * ddy <= highRadius * highRadius) inside += 1;
    }
  }
  return inside;
};

const headerOk =
  committed.length === 18 + size * size * 4 &&
  committed.readUInt16LE(12) === size &&
  committed.readUInt16LE(14) === size &&
  committed[16] === 32;
need(headerOk, `QuickBinds/Media/icon.tga is a ${size}x${size} 32-bit TGA`);

// v0.1.5 size contract: the disc is the canvas inscribed — the art fills the
// frame, so the drawn disc is exactly the button's box (v0.1.4's radius left a
// 2 px transparent margin that made it read smaller than its neighbours).
need(
  discRadiusPx * 2 === size,
  `the declared disc is the canvas inscribed: DISC_R_PX ${discRadiusPx} is half of SIZE ${size}`,
);

if (headerOk) {
  const offShape = [];
  for (let py = 0; py < size && offShape.length < 5; py += 1) {
    for (let px = 0; px < size && offShape.length < 5; px += 1) {
      const opaque = committed[18 + (py * size + px) * 4 + 3] > 0;
      if (opaque !== subpixelsInDisc(px, py) > 0) offShape.push(`${px},${py}`);
    }
  }
  need(
    offShape.length === 0,
    `QuickBinds/Media/icon.tga silhouette is the ${discRadiusPx}px-radius disc declared by ` +
      `make-icon.py${offShape.length ? ` (opaque outside it: ${offShape.join(" ")})` : ""}`,
  );
}

// --- 3. the ring palette: gold rim, silver inner ring, dark plate ----------------
// One exact-colour sample per band: the leftmost output pixel on the centre row
// whose whole SS×SS subpixel block lies inside the band's annulus (a block
// clipped by a band border averages with its neighbour in the downsample, so it
// is not sampled).
if (headerOk) {
  const centerRow = size / 2;
  const highSilver = silverRadiusPx * ss;
  const highPlate = plateRadiusPx * ss;
  const pixelAt = (px, py) => {
    const o = 18 + (py * size + px) * 4;
    return [committed[o + 2], committed[o + 1], committed[o]]; // the TGA stores BGRA
  };
  const purePixelOnRow = (innerRadius, outerRadius) => {
    for (let px = 0; px < size; px += 1) {
      let pure = true;
      for (let dx = 0; dx < ss && pure; dx += 1) {
        for (let dy = 0; dy < ss && pure; dy += 1) {
          const ddx = px * ss + dx - highCenter;
          const ddy = centerRow * ss + dy - highCenter;
          const d2 = ddx * ddx + ddy * ddy;
          pure =
            d2 <= outerRadius * outerRadius && (innerRadius === 0 || d2 > innerRadius * innerRadius);
        }
      }
      if (pure) return px;
    }
    return -1;
  };
  const checkBand = (band, px, colour) => {
    const found = px >= 0 ? pixelAt(px, centerRow).join(", ") : null;
    need(
      found !== null && found === colour.join(", "),
      `the ${band} pixel (${px >= 0 ? `${px}, ${centerRow}` : "?"}) is rgb(${colour.join(", ")})` +
        `${found === null ? " — no fully in-band pixel on the centre row" : found === colour.join(", ") ? "" : ` but the art has rgb(${found})`}`,
    );
  };
  checkBand("gold rim", purePixelOnRow(highSilver, highRadius), gold);
  checkBand("silver ring", purePixelOnRow(highPlate, highSilver), silver);
  checkBand("dark plate", purePixelOnRow(0, highPlate), plate);
}

// --- 4./5. what the button shows -------------------------------------------------
// luaparse 0.3.1 leaves StringLiteral.value null — the spelling is in .raw
function stringText(node) {
  if (!node || node.type !== "StringLiteral") return null;
  if (node.value != null) return node.value;
  const raw = (node.raw ?? "").replace(/^["']|["']$/gu, "");
  return raw.replace(/\\\\/gu, "\\"); // Lua writes path separators as \\; values hold one
}

// Every node under `node` (same traversal as check-apis.mjs / check-drag.mjs).
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

// `label:SetText("QB")` reads as base "label.SetText"; `label.SetTexture(...)` likewise.
function refName(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "Identifier") return node.name;
  if (node.type !== "MemberExpression" && node.type !== "IndexExpression") return null;
  const object = refName(node.base);
  const member = refName(node.identifier) ?? stringText(node.index);
  return object && member ? `${object}.${member}` : null;
}

const luaSource = readFileSync(buttonLua, "utf8");
const ast = luaparse.parse(luaSource, { luaVersion: "5.1" });
const calls = [...nodes(ast)].filter((node) => node.type === "CallExpression");

// `local ICON_PATH = "Interface\\..."` — paths are kept in locals, so an argument is
// either a literal or one of those names.
const localStrings = new Map();
for (const node of nodes(ast)) {
  if (node.type !== "LocalStatement") continue;
  (node.variables ?? []).forEach((variable, i) => {
    const text = stringText((node.init ?? [])[i]);
    if (variable?.type === "Identifier" && text !== null && !localStrings.has(variable.name)) {
      localStrings.set(variable.name, text);
    }
  });
}
const stringArg = (node) =>
  node?.type === "Identifier" ? (localStrings.get(node.name) ?? null) : stringText(node);

const labelTexts = calls
  .filter((call) => refName(call.base) === "label.SetText")
  .map((call) => stringArg(call.arguments?.[0]))
  .filter((text) => text !== null);
need(labelTexts.length > 0, "MinimapButton.lua sets text on a `label` font string");
need(
  labelTexts.length > 0 && labelTexts.every((text) => text === legendText),
  `MinimapButton.lua label "${labelTexts.join(", ")}" matches the art legend LEGEND_TEXT "${legendText}"`,
);

const iconPath = `Interface\\AddOns\\QuickBinds\\Media\\icon.tga`;
const texturePaths = calls
  .filter((call) => refName(call.base)?.endsWith(".SetTexture"))
  .map((call) => stringArg(call.arguments?.[0]))
  .filter((path) => path !== null);
need(
  texturePaths.includes(iconPath),
  `MinimapButton.lua sets a texture to the shipped art (${iconPath}) instead of an unverified one`,
);

if (failed) {
  console.error(`check-icon: FAILED (${checks} checks)`);
  process.exit(1);
}
console.log(`check-icon: ${checks} checks, art matches generator`);
