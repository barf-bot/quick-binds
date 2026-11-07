// Drag-configuration check: StartMoving()/StopMovingOrSizing() are no-ops unless the
// frame is declared movable (FrameXML always pairs `movable="true"` with
// registerForDrag, e.g. Blizzard_MovePad.xml). A left-dragged button must therefore get
// SetMovable(true) in frame setup, before its OnDragStart handler is wired. This check
// parses QuickBinds/*.lua and fails if a file calls :StartMoving() without that, so an
// edit dropping SetMovable(true) — the v0.1.0 bug that made dragging do nothing — fails
// the build. Run: node tools/check-drag.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import luaparse from "luaparse";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const addonDir = join(root, "QuickBinds");

if (!existsSync(addonDir)) {
  console.error("FAIL: QuickBinds/ directory not found");
  process.exit(1);
}

const files = readdirSync(addonDir).filter((f) => f.endsWith(".lua")).sort();
if (files.length === 0) {
  console.error("FAIL: no .lua files found in QuickBinds/");
  process.exit(1);
}

// Collect every CallExpression anywhere in the AST.
function* calls(node) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) yield* calls(n);
    return;
  }
  if (node.type === "CallExpression") yield node;
  for (const key of Object.keys(node)) {
    if (key !== "range") yield* calls(node[key]);
  }
}

// `receiver:name(...)` — the method-call form every frame API uses.
function methodName(call) {
  const base = call.base;
  return base && base.type === "MemberExpression" && base.identifier
    ? base.identifier.name
    : null;
}

// luaparse 0.3.1 leaves StringLiteral.value null; the spelling is in .raw.
function isStringArg(node, value) {
  return (
    !!node &&
    node.type === "StringLiteral" &&
    (node.value === value || node.raw === `"${value}"` || node.raw === `'${value}'`)
  );
}

function isTrueArg(node) {
  return !!node && node.type === "BooleanLiteral" && node.value === true;
}

let failed = false;
for (const file of files) {
  const source = readFileSync(join(addonDir, file), "utf8");
  const lineOf = (offset) => source.slice(0, offset).split("\n").length;
  let ast;
  try {
    ast = luaparse.parse(source, { luaVersion: "5.1", ranges: true });
  } catch (err) {
    failed = true;
    console.error(`FAIL QuickBinds/${file}: unparseable (${err.message})`);
    continue;
  }

  const movable = []; // SetMovable(true)
  const dragStart = []; // SetScript("OnDragStart", ...)
  const startMoving = []; // StartMoving()
  for (const call of calls(ast)) {
    const name = methodName(call);
    const line = lineOf(call.range[0]);
    if (name === "SetMovable" && call.arguments.length === 1 && isTrueArg(call.arguments[0])) {
      movable.push(line);
    } else if (name === "SetScript" && isStringArg(call.arguments[0], "OnDragStart")) {
      dragStart.push(line);
    } else if (name === "StartMoving") {
      startMoving.push(line);
    }
  }

  if (startMoving.length === 0) {
    console.log(`OK   QuickBinds/${file}: no StartMoving calls`);
    continue;
  }
  if (movable.length === 0) {
    failed = true;
    console.error(
      `FAIL QuickBinds/${file}: StartMoving() at line(s) ${startMoving.join(", ")} but the ` +
        "frame is never declared movable — add <frame>:SetMovable(true) in frame setup",
    );
    continue;
  }
  const declaredBefore =
    dragStart.length === 0
      ? Math.min(...movable) < Math.min(...startMoving)
      : Math.min(...movable) < Math.min(...dragStart);
  if (!declaredBefore) {
    failed = true;
    console.error(
      `FAIL QuickBinds/${file}: SetMovable(true) (line ${Math.min(...movable)}) must run in ` +
        `frame setup, before OnDragStart is wired (line ${Math.min(...dragStart)})`,
    );
    continue;
  }
  console.log(
    `OK   QuickBinds/${file}: SetMovable(true) line ${Math.min(...movable)} precedes ` +
      `StartMoving line ${Math.min(...startMoving)}`,
  );
}

if (failed) {
  console.error(`check-drag: ${files.length} file(s) checked, failures above`);
  process.exit(1);
}
console.log(`check-drag: ${files.length} file(s) checked, dragged frames declared movable`);
